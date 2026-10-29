import { z } from "zod";
import { can, type AccessHolder, type AccessRole } from "@/features/access/permissions";
import { DomainError } from "@/features/shared/errors";
import { PG_UNIQUE_VIOLATION, pgError } from "@/features/shared/db-errors";
import { isUuid } from "@/features/shared/validation";
import type { StaffDTO } from "@/features/staff/staff.dto";
import { NotConfigured, type Sender } from "@/features/workflows/workflows.dto";
import { dayLabel } from "@/lib/format";
import { NOTE_DUE_HOURS, type CaseListFilters, type CaseListRow, type CaseRecordDTO, type Delivery, type PendingNoteDTO } from "./case-history.dto";
import type { CaseHistoryRepository, NoteRow } from "./case-history.repository";
import { addendumInput, followUpInput, intakeSteps, noteEditInput, noteInput, type IntakeStep } from "./case-history.schemas";
import { LABEL, overallRisk, type Risk } from "./choices";

/** Who is asking: a signed-in staff member. */
export type Reader = Pick<StaffDTO, "id" | "clinicalAdmin"> & AccessHolder & { name?: string };

/** Case history (and its notes) open to everyone's clients: a clinical admin, or a role allowed to read them all. */
const readsAll = (r: Reader) => r.clinicalAdmin || can(r, "casenotes.read_all");

/** Session notes are expected from this date on; older sessions (before case history moved here) are not chased. */
export const CASE_NOTES_REQUIRED_FROM = new Date("2026-10-25T00:00:00+05:30");

/** The WhatsApp template Meta must approve for follow-ups (see docs/whatsapp-templates.md). */
export const FOLLOW_UP_TEMPLATE = "follow_up_suggestion";

const noSender: Sender = async () => {
  throw new NotConfigured("not wired");
};

export function createCaseHistoryService({ caseRepo, senders = { email: noSender, whatsapp: noSender }, firmName = async () => "", writerRoles = async () => ["psychologist"] }: {
  caseRepo: CaseHistoryRepository;
  /** The roles that write case notes ("casenotes.write"); their sessions are the ones chased for a note. */
  writerRoles?: () => Promise<AccessRole[]>;
  senders?: { email: Sender; whatsapp: Sender };
  firmName?: () => Promise<string>;
}) {
  async function canRead(reader: Reader, clientId: string): Promise<boolean> {
    if (readsAll(reader)) return true;
    return can(reader, "casenotes.write") && (await caseRepo.currentTherapistId(clientId)) === reader.id;
  }

  async function canWrite(reader: Reader, clientId: string): Promise<boolean> {
    if (reader.clinicalAdmin || reader.accessRole === "admin") return true;
    return can(reader, "casenotes.write") && (await caseRepo.currentTherapistId(clientId)) === reader.id;
  }

  async function openForWriting(reader: Reader, clientId: string): Promise<CaseRecordDTO> {
    if (!(await canWrite(reader, clientId))) throw new DomainError("forbidden", "Only the client's permitted therapist or a clinical admin can change this case history");
    return open(reader, clientId);
  }

  /** Opens the record for an allowed reader; everyone else is refused before anything is read. */
  async function open(reader: Reader, clientId: string): Promise<CaseRecordDTO> {
    if (!isUuid(clientId) || !(await caseRepo.clientExists(clientId))) throw new DomainError("not_found", `Client ${clientId} not found`);
    if (!(await canRead(reader, clientId))) {
      throw new DomainError("forbidden", `Only client ${clientId}'s therapist or a clinical admin can open this case history`);
    }
    return caseRepo.findOrCreate(clientId);
  }

  async function note(reader: Reader, noteId: string): Promise<NoteRow> {
    const row = isUuid(noteId) ? await caseRepo.findNote(noteId) : null;
    if (!row) throw new DomainError("not_found", `Session note ${noteId} not found`);
    if (!(await canWrite(reader, row.clientId))) throw new DomainError("forbidden", `You can't change session note ${noteId}`);
    return row;
  }

  function ownDraft(reader: Reader, n: NoteRow) {
    if (n.signedAt) throw new DomainError("conflict", `Session note ${n.id} is signed; add an addendum instead`);
    if (n.authorId !== reader.id) throw new DomainError("forbidden", `Only the author can change draft note ${n.id}`);
  }

  // Audit rows name the fields that changed and never the clinical text itself.
  const audit = (reader: Reader, action: string, entity: string, entityId: string, details?: Record<string, unknown>) =>
    ({ actor: { staffId: reader.id }, action, entity, entityId, details });

  /** Sessions still without a note, each with when the note was due (24 hours after the session ended). */
  async function pending(staffId: string | undefined, now: Date): Promise<PendingNoteDTO[]> {
    const rows = await caseRepo.pendingNotes({ now, from: CASE_NOTES_REQUIRED_FROM, roles: await writerRoles(), staffId });
    return rows.map((r) => {
      const dueAt = new Date(r.endsAt.getTime() + NOTE_DUE_HOURS * 3600_000);
      return { ...r, dueAt, overdue: dueAt <= now };
    });
  }

  const needsApproval = (reader: Reader) => reader.accessRole === "psychologist" && !reader.clinicalAdmin;
  const reviewsEdits = (reader: Reader) => reader.accessRole === "manager" || reader.accessRole === "admin";
  async function intakeEditSteps(reader: Reader, clientId: string, now = new Date()) {
    if (!(await canWrite(reader, clientId))) return [];
    const r = await caseRepo.intakeState(clientId);
    if (!needsApproval(reader) || !r || (!r.intakeCompletedAt && r.status === "intake_pending")) return [1, 2, 3, 4, 5, 6];
    return caseRepo.approvedEditSteps(r.id, reader.id, r.revision, now);
  }

  return {
    /**
     * Pending case notes. Whoever may see pending notes (managers) gets everyone's; a psychologist only their own. No clinical
     * content: just which session, with whom, and since when.
     */
    async pendingNotes(viewer: Reader, opts: { staffId?: string } = {}, now = new Date()): Promise<PendingNoteDTO[]> {
      if (can(viewer, "casenotes.pending") || readsAll(viewer)) return pending(opts.staffId, now);
      if (can(viewer, "casenotes.write")) return pending(viewer.id, now);
      throw new DomainError("forbidden", "Only managers and psychologists can see pending case notes");
    },

    /** For the menu badge: notes now more than 24 hours late, across the practice. */
    countOverdueNotes: async (now = new Date()) => (await pending(undefined, now)).filter((p) => p.overdue).length,

    canRead,
    canWrite,
    intakeEditSteps,
    canReviewEdits: reviewsEdits,
    pendingEditCount: (reader: Reader) => reviewsEdits(reader) ? caseRepo.pendingEditCount() : Promise.resolve(0),
    async editRequests(reader: Reader, clientId?: string) {
      if (!reviewsEdits(reader) && (reader.accessRole !== "psychologist" || !can(reader, "casenotes.write"))) throw new DomainError("forbidden", "Edit requests are for psychologists, managers and admins");
      if (clientId && !isUuid(clientId)) throw new DomainError("invalid", "Invalid client");
      return caseRepo.editRequests(reviewsEdits(reader) ? undefined : reader.id, clientId);
    },
    async requestIntakeEdit(reader: Reader, clientId: string, input: unknown, now = new Date()) {
      if (!needsApproval(reader)) throw new DomainError("forbidden", "Only psychologists request these corrections");
      const data = z.object({ step: z.coerce.number().int().min(2).max(6), reason: z.string().trim().min(10, "Explain why the correction is needed").max(1000) }).parse(input);
      const r = await openForWriting(reader, clientId);
      const id = await caseRepo.createEditRequest({ caseHistoryId: r.id, requesterId: reader.id, ...data, now }, audit(reader, "request_intake_edit", "case_edit_request", r.id, { step: data.step }));
      if (!id) throw new DomainError("conflict", "A request is already open, the intake is unfinished, or the client has been reassigned");
      return id;
    },
    async reviewIntakeEdit(reader: Reader, id: string, input: unknown, now = new Date()) {
      if (!reviewsEdits(reader)) throw new DomainError("forbidden", "Only managers and admins review edit requests");
      if (!isUuid(id)) throw new DomainError("not_found", "Edit request not found");
      const data = z.object({ decision: z.enum(["approve", "reject"]), reason: z.string().trim().min(1, "Give a decision reason").max(1000) }).parse(input);
      if (!(await caseRepo.reviewEditRequest(id, reader.id, data.decision === "approve", data.reason, now, audit(reader, "review_intake_edit", "case_edit_request", id, { decision: data.decision })))) throw new DomainError("conflict", "This request was already reviewed, is stale, belongs to you, or the client was reassigned");
    },
    open,

    async saveIntake(reader: Reader, clientId: string, step: number, input: unknown) {
      if (!(step in intakeSteps)) throw new DomainError("invalid", `Intake step ${step} does not exist`);
      const data = intakeSteps[step as IntakeStep].parse(input);
      const record = await openForWriting(reader, clientId);
      const completed = Boolean(record.intakeCompletedAt) || record.status !== "intake_pending";
      if (completed && ((step === 2 && "presentingComplaints" in data && !data.presentingComplaints) || (step === 6 && "diagnosisLabel" in data && !data.diagnosisLabel))) throw new DomainError("invalid", "A completed intake must keep its complaints and primary diagnosis");
      const saved = await caseRepo.updateIntake(record.id, { ...data, updatedBy: reader.id }, audit(reader, "update_intake", "case_history", record.id, { step, fields: Object.keys(data) }), { ownerId: needsApproval(reader) ? reader.id : null, step, now: new Date() });
      if (!saved) throw new DomainError("forbidden", "A completed case history needs an unused manager approval for this section, or the client was reassigned");
    },

    async completeIntake(reader: Reader, clientId: string, now = new Date()) {
      const record = await openForWriting(reader, clientId);
      if (!record.presentingComplaints) throw new DomainError("invalid", `Write the presenting complaints for client ${clientId} before completing the intake`);
      // As in MCH: the chief complaints and a primary diagnosis are the two things a completed intake must have.
      if (!record.diagnosisLabel) throw new DomainError("invalid", `Write the primary diagnosis for client ${clientId} before completing the intake`);
      const completed = await caseRepo.updateIntake(record.id, { status: "in_treatment", intakeCompletedAt: now, intakeCompletedBy: reader.id, updatedBy: reader.id },
        audit(reader, "complete_intake", "case_history", record.id), { ownerId: needsApproval(reader) ? reader.id : null, step: null, now });
      if (!completed) throw new DomainError("forbidden", "This intake is already completed or the client was reassigned");
    },

    async addNote(reader: Reader, clientId: string, input: unknown): Promise<string> {
      const data = noteInput.parse(input);
      const record = await openForWriting(reader, clientId);
      let sessionAt: Date;
      if (data.bookingId) {
        const b = await caseRepo.bookingClient(data.bookingId);
        if (!b || b.clientId !== clientId) throw new DomainError("invalid", `Booking ${data.bookingId} is not one of client ${clientId}'s sessions`);
        sessionAt = b.startsAt;
      } else if (data.sessionOn) {
        // Midday UTC keeps the chosen date the same in every Indian and nearby time zone.
        sessionAt = new Date(`${data.sessionOn}T12:00:00Z`);
      } else {
        throw new DomainError("invalid", "Choose the booked session, or give the date of a session that wasn't booked");
      }
      const { bookingId, sessionOn: _, ...fields } = data;
      // Two notes saved at the same instant can pick the same number; the unique index catches it and the second simply tries again.
      for (let attempt = 0; ; attempt++) {
        try {
          return await caseRepo.insertNote(record.id, { ...fields, bookingId, sessionAt, authorId: reader.id },
            { actor: { staffId: reader.id }, action: "create", entity: "session_note", details: { caseHistoryId: record.id } });
        } catch (err) {
          const e = pgError(err);
          if (e.code !== PG_UNIQUE_VIOLATION) throw err;
          if (e.constraint?.includes("booking")) throw new DomainError("conflict", `Booking ${bookingId} already has a session note`);
          if (attempt >= 3) throw err;
        }
      }
    },

    async updateDraft(reader: Reader, noteId: string, input: unknown) {
      const data = noteEditInput.parse(input);
      const n = await note(reader, noteId);
      ownDraft(reader, n);
      if (!(await caseRepo.updateNote(noteId, data, audit(reader, "update", "session_note", noteId, { fields: Object.keys(data) })))) {
        throw new DomainError("conflict", `Session note ${noteId} was signed meanwhile; add an addendum instead`);
      }
    },

    async signNote(reader: Reader, noteId: string, now = new Date()) {
      const n = await note(reader, noteId);
      ownDraft(reader, n);
      if (!(await caseRepo.updateNote(noteId, { signedAt: now }, audit(reader, "sign", "session_note", noteId)))) {
        throw new DomainError("conflict", `Session note ${noteId} is already signed`);
      }
    },

    async deleteDraft(reader: Reader, noteId: string) {
      const n = await note(reader, noteId);
      ownDraft(reader, n);
      if (!(await caseRepo.deleteDraft(noteId, audit(reader, "delete", "session_note", noteId)))) {
        throw new DomainError("conflict", `Session note ${noteId} was signed meanwhile and can't be deleted`);
      }
    },

    async addAddendum(reader: Reader, noteId: string, input: unknown) {
      const { text } = addendumInput.parse(input);
      const n = await note(reader, noteId);
      if (!n.signedAt) throw new DomainError("invalid", `Session note ${noteId} is still a draft; edit it instead`);
      await caseRepo.addAddendum(noteId, reader.id, text, audit(reader, "addendum", "session_note", noteId));
    },

    /**
     * What the client page shows: the record for an allowed reader (without creating one), otherwise status and risk only.
     */
    async overview(reader: Reader, clientId: string): Promise<{ restricted: true; status: CaseRecordDTO["status"] | null; risk: Risk | null } | { restricted: false; record: CaseRecordDTO | null }> {
      if (await canRead(reader, clientId)) {
        const head = await caseRepo.headline(clientId);
        return { restricted: false, record: head ? await caseRepo.findOrCreate(clientId) : null };
      }
      const head = await caseRepo.headline(clientId);
      // No record yet is said plainly, not shown as a status nobody set.
      return { restricted: true, status: head?.status ?? null, risk: head?.risk ?? null };
    },

    /**
     * Suggests the client's next session by WhatsApp and/or email. Nothing is booked or held: the client arranges the
     * actual time. Each channel's outcome is recorded; one not set up or failing never stops the other.
     */
    async sendFollowUp(reader: Reader, clientId: string, input: unknown, now = new Date()) {
      const data = followUpInput.parse(input);
      if (data.suggestedOn < now.toISOString().slice(0, 10)) throw new DomainError("invalid", "The suggested date has already passed");
      const record = await openForWriting(reader, clientId);
      const c = await caseRepo.clientContact(clientId);
      if (!c) throw new DomainError("not_found", `Client ${clientId} not found`);
      const firm = await firmName();
      const therapist = reader.name ?? "Your therapist";
      const when = `${dayLabel(new Date(`${data.suggestedOn}T12:00:00Z`), "UTC")}${data.partOfDay ? ` (${LABEL[data.partOfDay].toLowerCase()})` : ""}`;
      const first = c.name.split(/\s+/)[0] ?? c.name;

      const attempt = async (chosen: boolean, has: boolean, send: () => Promise<unknown>): Promise<Delivery> => {
        if (!chosen) return "not_chosen";
        if (!has) return "no_contact";
        try {
          await send();
          return "sent";
        } catch (err) {
          return err instanceof NotConfigured ? "not_set_up" : "failed";
        }
      };
      const whatsapp = await attempt(data.whatsapp, true, () =>
        senders.whatsapp({ channel: "whatsapp", to: c.phoneE164, templateName: FOLLOW_UP_TEMPLATE, language: "en", params: [first, therapist, when] }));
      const email = await attempt(data.email, Boolean(c.email), () =>
        senders.email({
          channel: "email",
          to: c.email!,
          subject: `Your next session with ${therapist}`,
          body: [`Hi ${first},`, "", `${therapist} suggests your next session around ${when}.`, ...(data.note ? ["", data.note] : []), "",
            "Reply to this email or call us to fix a time that suits you.", "", firm ? `– ${firm}` : ""].join("\n").trim(),
        }));

      await caseRepo.insertFollowUp(
        { caseHistoryId: record.id, suggestedOn: data.suggestedOn, partOfDay: data.partOfDay, note: data.note, sentBy: reader.id, whatsapp, email },
        // The message text is not kept in the audit row, only what was sent where.
        { actor: { staffId: reader.id }, action: "create", entity: "follow_up", details: { suggestedOn: data.suggestedOn, whatsapp, email } },
      );
      return { whatsapp, email };
    },

    async noteableBookings(reader: Reader, clientId: string, now = new Date()) {
      await open(reader, clientId);
      return caseRepo.noteableBookings(clientId, now);
    },

    /**
     * The list. Someone allowed to read every case history sees all clients; a psychologist sees only their own clients.
     */
    async list(reader: Reader, f: CaseListFilters = {}): Promise<CaseListRow[]> {
      const seesEveryone = readsAll(reader);
      if (!seesEveryone && !can(reader, "casenotes.write")) throw new DomainError("forbidden", "Clinical permission is required to list case histories");
      const rows = (await caseRepo.list(f.q?.trim() || undefined))
        .filter((r) => seesEveryone || r.therapistId === reader.id)
        .map((r): CaseListRow => {
          const restricted = !(readsAll(reader) || r.therapistId === reader.id);
          return {
            clientId: r.clientId, clientName: r.clientName, clientNumber: r.clientNumber, clientPhone: r.clientPhone,
            status: r.status ?? "intake_pending",
            risk: overallRisk([r.riskSuicide, r.riskSelfHarm, r.riskOthers]),
            restricted,
            diagnosisCode: restricted ? null : r.diagnosisCode,
            diagnosisLabel: restricted ? null : r.diagnosisLabel,
            therapistId: r.therapistId, therapistName: r.therapistName, therapistActive: r.therapistActive ?? true,
            notes: r.notes, lastNoteAt: r.lastNoteAt, lastNoteAuthor: restricted ? null : r.lastNoteAuthor,
          };
        });
      return rows.filter((r) =>
        (!f.status || (f.status === "high_risk" ? r.risk === "high" || r.risk === "severe" : r.status === f.status)) &&
        (!f.therapist || (f.therapist === "unassigned" ? !r.therapistId : r.therapistId === f.therapist)) &&
        (!f.risk || r.risk === f.risk) &&
        (!f.from || (r.lastNoteAt !== null && r.lastNoteAt >= f.from)) &&
        (!f.to || (r.lastNoteAt !== null && r.lastNoteAt < f.to)));
    },
  };
}

export type CaseHistoryService = ReturnType<typeof createCaseHistoryService>;
