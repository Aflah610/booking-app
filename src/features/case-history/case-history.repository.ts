import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db, DbOrTx } from "@/db";
import { booking, caseEditRequest, caseHistory, client, clientTherapist, followUp, service, sessionNote, sessionNoteAddendum, staff } from "@/db/schema";
import { writeAudit } from "@/features/audit/audit.repository";
import type { AuditEntry } from "@/features/audit/audit.types";
import type { CaseEditRequestDTO, CaseRecordDTO, Delivery, FollowUpDTO, IntakeFields, NoteableBooking, PendingNoteRow, SessionNoteDTO } from "./case-history.dto";
import { overallRisk, type Risk } from "./choices";

const completedBy = alias(staff, "completed_by");

const intakeColumns = {
  presentingComplaints: caseHistory.presentingComplaints, onset: caseHistory.onset, duration: caseHistory.duration, severity: caseHistory.severity,
  historyPresent: caseHistory.historyPresent, pastPsychiatric: caseHistory.pastPsychiatric, medicalHistory: caseHistory.medicalHistory,
  medication: caseHistory.medication, familyHistory: caseHistory.familyHistory, personalHistory: caseHistory.personalHistory,
  substanceUse: caseHistory.substanceUse, premorbidPersonality: caseHistory.premorbidPersonality, mseAppearance: caseHistory.mseAppearance,
  mseCooperation: caseHistory.mseCooperation, mseRapport: caseHistory.mseRapport, mseSpeech: caseHistory.mseSpeech, mseMood: caseHistory.mseMood,
  mseAffect: caseHistory.mseAffect, mseThought: caseHistory.mseThought, msePerception: caseHistory.msePerception, mseCognition: caseHistory.mseCognition,
  mseInsight: caseHistory.mseInsight, mseJudgement: caseHistory.mseJudgement, riskSuicide: caseHistory.riskSuicide, riskSelfHarm: caseHistory.riskSelfHarm,
  riskOthers: caseHistory.riskOthers, diagnosisCode: caseHistory.diagnosisCode, diagnosisLabel: caseHistory.diagnosisLabel,
  diagnosisSecondary: caseHistory.diagnosisSecondary, diagnosisSpecifiers: caseHistory.diagnosisSpecifiers, formulation: caseHistory.formulation,
  goalsShort: caseHistory.goalsShort, goalsLong: caseHistory.goalsLong, approach: caseHistory.approach, frequency: caseHistory.frequency,
  planNotes: caseHistory.planNotes, educationalHistory: caseHistory.educationalHistory, occupationalHistory: caseHistory.occupationalHistory,
  relationshipHistory: caseHistory.relationshipHistory, socialHistory: caseHistory.socialHistory, mseBehaviour: caseHistory.mseBehaviour,
  mseEyeContact: caseHistory.mseEyeContact, mseMoodAffect: caseHistory.mseMoodAffect, mseThoughtProcess: caseHistory.mseThoughtProcess,
  mseThoughtContent: caseHistory.mseThoughtContent, mseInsightJudgement: caseHistory.mseInsightJudgement, clinicalObservation: caseHistory.clinicalObservation,
  riskNotes: caseHistory.riskNotes, therapistNotes: caseHistory.therapistNotes, remarks: caseHistory.remarks,
};

const noteColumns = {
  id: sessionNote.id, number: sessionNote.number, bookingId: sessionNote.bookingId, sessionAt: sessionNote.sessionAt, authorId: sessionNote.authorId,
  authorName: staff.name, summary: sessionNote.summary, risk: sessionNote.risk, response: sessionNote.response, progress: sessionNote.progress,
  nextPlan: sessionNote.nextPlan, homework: sessionNote.homework, followUpOn: sessionNote.followUpOn, signedAt: sessionNote.signedAt,
  durationText: sessionNote.durationText, clinicalObservation: sessionNote.clinicalObservation, progressNotes: sessionNote.progressNotes,
  therapistSignature: sessionNote.therapistSignature,
  createdAt: sessionNote.createdAt, updatedAt: sessionNote.updatedAt,
};

export type NoteRow = Omit<SessionNoteDTO, "addenda" | "authorName"> & { caseHistoryId: string; clientId: string };
export type NoteData = Pick<SessionNoteDTO, "summary" | "risk" | "response" | "progress" | "nextPlan" | "homework" | "followUpOn" | "durationText" | "clinicalObservation" | "progressNotes" | "therapistSignature">;

/** One row per client, before the reader's access is applied. */
export type RawListRow = {
  clientId: string; clientName: string; clientNumber: number; clientPhone: string; status: CaseRecordDTO["status"] | null;
  riskSuicide: Risk | null; riskSelfHarm: Risk | null; riskOthers: Risk | null; diagnosisCode: string | null; diagnosisLabel: string | null;
  therapistId: string | null; therapistName: string | null; therapistActive: boolean | null; notes: number; lastNoteAt: Date | null; lastNoteAuthor: string | null;
};

export function createCaseHistoryRepository(db: Db) {
  // Assignment changes lock the client too: an approved edit must not outlive reassignment.
  async function lockIntake(tx: DbOrTx, id: string) {
    const [head] = await tx.select({ clientId: caseHistory.clientId }).from(caseHistory).where(eq(caseHistory.id, id));
    if (!head) return null;
    await tx.select({ id: client.id }).from(client).where(eq(client.id, head.clientId)).for("update");
    const [row] = await tx.select({ id: caseHistory.id, clientId: caseHistory.clientId, status: caseHistory.status,
      intakeCompletedAt: caseHistory.intakeCompletedAt, intakeRevision: caseHistory.intakeRevision }).from(caseHistory).where(eq(caseHistory.id, id)).for("update");
    return row;
  }
  async function owns(tx: DbOrTx, clientId: string, staffId: string) {
    const [row] = await tx.select({ id: clientTherapist.id }).from(clientTherapist).where(and(eq(clientTherapist.clientId, clientId), eq(clientTherapist.staffId, staffId), isNull(clientTherapist.endsAt)));
    return Boolean(row);
  }
  const finished = (r: { intakeCompletedAt: Date | null; status: string }) => Boolean(r.intakeCompletedAt) || r.status !== "intake_pending";

  async function notesFor(caseHistoryId: string): Promise<SessionNoteDTO[]> {
    const notes = await db
      .select(noteColumns)
      .from(sessionNote)
      .innerJoin(staff, eq(staff.id, sessionNote.authorId))
      .where(eq(sessionNote.caseHistoryId, caseHistoryId))
      .orderBy(desc(sessionNote.number));
    if (notes.length === 0) return [];
    const addenda = await db
      .select({ id: sessionNoteAddendum.id, noteId: sessionNoteAddendum.noteId, authorName: staff.name, text: sessionNoteAddendum.text, createdAt: sessionNoteAddendum.createdAt })
      .from(sessionNoteAddendum)
      .innerJoin(staff, eq(staff.id, sessionNoteAddendum.authorId))
      .where(inArray(sessionNoteAddendum.noteId, notes.map((n) => n.id)))
      .orderBy(asc(sessionNoteAddendum.createdAt));
    return notes.map((n) => ({ ...n, addenda: addenda.filter((a) => a.noteId === n.id).map(({ noteId: _, ...a }) => a) }));
  }

  function followUpsFor(caseHistoryId: string): Promise<FollowUpDTO[]> {
    return db
      .select({ id: followUp.id, suggestedOn: followUp.suggestedOn, partOfDay: followUp.partOfDay, note: followUp.note, sentByName: staff.name,
        whatsapp: followUp.whatsapp, email: followUp.email, createdAt: followUp.createdAt })
      .from(followUp)
      .innerJoin(staff, eq(staff.id, followUp.sentBy))
      .where(eq(followUp.caseHistoryId, caseHistoryId))
      .orderBy(desc(followUp.createdAt));
  }

  return {
    async clientContact(clientId: string): Promise<{ name: string; phoneE164: string; email: string | null } | null> {
      const [row] = await db.select({ name: client.name, phoneE164: client.phoneE164, email: client.email }).from(client).where(eq(client.id, clientId));
      return row ?? null;
    },

    insertFollowUp(data: { caseHistoryId: string; suggestedOn: string; partOfDay: FollowUpDTO["partOfDay"]; note: string | null; sentBy: string; whatsapp: Delivery; email: Delivery }, audit: Omit<AuditEntry, "entityId">) {
      return db.transaction(async (tx) => {
        const [row] = await tx.insert(followUp).values(data).returning({ id: followUp.id });
        await writeAudit(tx, { ...audit, entityId: row.id });
        return row.id;
      });
    },

    async currentTherapistId(clientId: string): Promise<string | null> {
      const [row] = await db.select({ staffId: clientTherapist.staffId }).from(clientTherapist)
        .where(and(eq(clientTherapist.clientId, clientId), isNull(clientTherapist.endsAt)));
      return row?.staffId ?? null;
    },

    /** Status and risk only, for readers who may not open the record. */
    async headline(clientId: string): Promise<{ status: CaseRecordDTO["status"]; risk: Risk | null } | null> {
      const [row] = await db.select({ status: caseHistory.status, a: caseHistory.riskSuicide, b: caseHistory.riskSelfHarm, c: caseHistory.riskOthers })
        .from(caseHistory).where(eq(caseHistory.clientId, clientId));
      return row ? { status: row.status, risk: overallRisk([row.a, row.b, row.c]) } : null;
    },

    async clientExists(clientId: string): Promise<boolean> {
      const [row] = await db.select({ id: client.id }).from(client).where(eq(client.id, clientId));
      return Boolean(row);
    },

    /** The record, created empty the first time anyone allowed opens it. */
    async findOrCreate(clientId: string): Promise<CaseRecordDTO> {
      await db.insert(caseHistory).values({ clientId }).onConflictDoNothing({ target: caseHistory.clientId });
      const [row] = await db
        .select({ id: caseHistory.id, clientId: caseHistory.clientId, status: caseHistory.status, ...intakeColumns,
          intakeCompletedAt: caseHistory.intakeCompletedAt, intakeCompletedByName: completedBy.name, updatedAt: caseHistory.updatedAt })
        .from(caseHistory)
        .leftJoin(completedBy, eq(completedBy.id, caseHistory.intakeCompletedBy))
        .where(eq(caseHistory.clientId, clientId));
      return { ...row, risk: overallRisk([row.riskSuicide, row.riskSelfHarm, row.riskOthers]), notes: await notesFor(row.id), followUps: await followUpsFor(row.id) };
    },

    async intakeState(clientId: string) {
      const [r] = await db.select({ id: caseHistory.id, status: caseHistory.status, intakeCompletedAt: caseHistory.intakeCompletedAt, revision: caseHistory.intakeRevision }).from(caseHistory).where(eq(caseHistory.clientId, clientId));
      return r ?? null;
    },
    async approvedEditSteps(caseHistoryId: string, requesterId: string, revision: number, now: Date) {
      const rows = await db.select({ step: caseEditRequest.step }).from(caseEditRequest).where(and(eq(caseEditRequest.caseHistoryId, caseHistoryId), eq(caseEditRequest.requesterId, requesterId), eq(caseEditRequest.revision, revision), eq(caseEditRequest.status, "approved"), sql`${caseEditRequest.expiresAt} > ${now}`));
      return rows.map((r) => r.step);
    },
    createEditRequest(data: { caseHistoryId: string; requesterId: string; step: number; reason: string; now: Date }, audit: AuditEntry) {
      return db.transaction(async (tx) => {
        const r = await lockIntake(tx, data.caseHistoryId);
        if (!r || !finished(r) || !(await owns(tx, r.clientId, data.requesterId))) return null;
        await tx.update(caseEditRequest).set({ status: "expired" }).where(and(eq(caseEditRequest.caseHistoryId, r.id), eq(caseEditRequest.requesterId, data.requesterId), inArray(caseEditRequest.status, ["pending", "approved"]), sql`(${caseEditRequest.revision} <> ${r.intakeRevision} or ${caseEditRequest.expiresAt} <= ${data.now})`));
        const [existing] = await tx.select({ id: caseEditRequest.id }).from(caseEditRequest).where(and(eq(caseEditRequest.caseHistoryId, r.id), eq(caseEditRequest.requesterId, data.requesterId), inArray(caseEditRequest.status, ["pending", "approved"])));
        if (existing) return null;
        const [created] = await tx.insert(caseEditRequest).values({ caseHistoryId: r.id, requesterId: data.requesterId, step: data.step, reason: data.reason, revision: r.intakeRevision, createdAt: data.now }).returning({ id: caseEditRequest.id });
        await writeAudit(tx, { ...audit, entityId: created.id });
        return created.id;
      });
    },
    reviewEditRequest(id: string, reviewerId: string, approved: boolean, decisionReason: string, now: Date, audit: AuditEntry) {
      return db.transaction(async (tx) => {
        const [head] = await tx.select({ caseHistoryId: caseEditRequest.caseHistoryId }).from(caseEditRequest).where(eq(caseEditRequest.id, id));
        if (!head) return false;
        const r = await lockIntake(tx, head.caseHistoryId);
        const [request] = await tx.select().from(caseEditRequest).where(eq(caseEditRequest.id, id)).for("update");
        if (!r || !request || request.status !== "pending" || request.requesterId === reviewerId) return false;
        if (approved && (request.revision !== r.intakeRevision || !(await owns(tx, r.clientId, request.requesterId)))) return false;
        await tx.update(caseEditRequest).set({ status: approved ? "approved" : "rejected", reviewerId, decisionReason, reviewedAt: now, expiresAt: approved ? new Date(now.getTime() + 24 * 3600_000) : null }).where(eq(caseEditRequest.id, id));
        await writeAudit(tx, audit);
        return true;
      });
    },
    async editRequests(requesterId?: string, clientId?: string, now = new Date()): Promise<CaseEditRequestDTO[]> {
      const requester = alias(staff, "edit_requester"), reviewer = alias(staff, "edit_reviewer");
      const rows = await db.select({ id: caseEditRequest.id, clientId: client.id, clientName: client.name, clientNumber: client.number,
        requesterId: caseEditRequest.requesterId, requesterName: requester.name, step: caseEditRequest.step, reason: caseEditRequest.reason,
        status: caseEditRequest.status, decisionReason: caseEditRequest.decisionReason, reviewerName: reviewer.name,
        createdAt: caseEditRequest.createdAt, reviewedAt: caseEditRequest.reviewedAt, expiresAt: caseEditRequest.expiresAt, usedAt: caseEditRequest.usedAt,
        revision: caseEditRequest.revision, currentRevision: caseHistory.intakeRevision,
      }).from(caseEditRequest).innerJoin(caseHistory, eq(caseHistory.id, caseEditRequest.caseHistoryId)).innerJoin(client, eq(client.id, caseHistory.clientId))
        .innerJoin(requester, eq(requester.id, caseEditRequest.requesterId)).leftJoin(reviewer, eq(reviewer.id, caseEditRequest.reviewerId))
        .where(and(requesterId ? eq(caseEditRequest.requesterId, requesterId) : undefined, clientId ? eq(client.id, clientId) : undefined)).orderBy(sql`case when ${caseEditRequest.status} = 'pending' then 0 when ${caseEditRequest.status} = 'approved' then 1 else 2 end`, desc(caseEditRequest.createdAt)).limit(200);
      return rows.map(({ revision, currentRevision, ...r }) => ({ ...r, status: ["pending", "approved"].includes(r.status) && (revision !== currentRevision || Boolean(r.expiresAt && r.expiresAt <= now)) ? "expired" : r.status }));
    },
    async pendingEditCount() {
      const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(caseEditRequest).innerJoin(caseHistory, eq(caseHistory.id, caseEditRequest.caseHistoryId)).where(and(eq(caseEditRequest.status, "pending"), eq(caseEditRequest.revision, caseHistory.intakeRevision)));
      return r.n;
    },
    updateIntake(caseHistoryId: string, data: Partial<IntakeFields> & { updatedBy: string | null; status?: CaseRecordDTO["status"]; intakeCompletedAt?: Date; intakeCompletedBy?: string | null }, audit: AuditEntry, guard: { ownerId: string | null; step: number | null; now: Date }) {
      return db.transaction(async (tx) => {
        const r = await lockIntake(tx, caseHistoryId);
        if (!r || (guard.ownerId && !(await owns(tx, r.clientId, guard.ownerId)))) return false;
        let approvedId: string | null = null;
        if (guard.ownerId && finished(r)) {
          if (!guard.step) return false;
          const [grant] = await tx.select({ id: caseEditRequest.id }).from(caseEditRequest).where(and(eq(caseEditRequest.caseHistoryId, r.id), eq(caseEditRequest.requesterId, guard.ownerId), eq(caseEditRequest.step, guard.step), eq(caseEditRequest.status, "approved"), eq(caseEditRequest.revision, r.intakeRevision), sql`${caseEditRequest.expiresAt} > ${guard.now}`)).for("update");
          if (!grant) return false;
          approvedId = grant.id;
          const [previous] = await tx.select(intakeColumns).from(caseHistory).where(eq(caseHistory.id, r.id));
          await tx.update(caseEditRequest).set({ status: "used", usedAt: guard.now, previousValues: Object.fromEntries(Object.entries(previous).filter(([key]) => key in data)) }).where(eq(caseEditRequest.id, grant.id));
        }
        await tx.update(caseHistory).set({ ...data, intakeRevision: sql`${caseHistory.intakeRevision} + 1` }).where(eq(caseHistory.id, caseHistoryId));
        await writeAudit(tx, { ...audit, details: { ...audit.details, ...(approvedId ? { approvalId: approvedId } : {}) } });
        return true;
      });
    },

    /** Gives the note the next number for its case; a clash with a note saved at the same moment fails on the unique index. */
    insertNote(caseHistoryId: string, data: NoteData & { bookingId: string | null; sessionAt: Date; authorId: string }, audit: Omit<AuditEntry, "entityId">) {
      return db.transaction(async (tx) => {
        const [{ next }] = await tx.select({ next: sql<number>`coalesce(max(${sessionNote.number}), 0) + 1` }).from(sessionNote)
          .where(eq(sessionNote.caseHistoryId, caseHistoryId));
        const [row] = await tx.insert(sessionNote).values({ ...data, caseHistoryId, number: next }).returning({ id: sessionNote.id });
        await writeAudit(tx, { ...audit, entityId: row.id, details: { ...audit.details, number: next } });
        return row.id;
      });
    },

    async findNote(noteId: string): Promise<NoteRow | null> {
      const [row] = await db
        .select({ ...noteColumns, caseHistoryId: sessionNote.caseHistoryId, clientId: caseHistory.clientId })
        .from(sessionNote)
        .innerJoin(caseHistory, eq(caseHistory.id, sessionNote.caseHistoryId))
        .innerJoin(staff, eq(staff.id, sessionNote.authorId))
        .where(eq(sessionNote.id, noteId));
      if (!row) return null;
      const { authorName: _, ...rest } = row;
      return rest;
    },

    updateNote(noteId: string, data: Partial<NoteData> & { signedAt?: Date }, audit: AuditEntry) {
      return db.transaction(async (tx) => {
        // Only a draft changes: a note signed in the meantime is left alone and the caller is told.
        const rows = await tx.update(sessionNote).set(data).where(and(eq(sessionNote.id, noteId), isNull(sessionNote.signedAt))).returning({ id: sessionNote.id });
        if (rows.length) await writeAudit(tx, audit);
        return rows.length > 0;
      });
    },

    deleteDraft(noteId: string, audit: AuditEntry) {
      return db.transaction(async (tx) => {
        const rows = await tx.delete(sessionNote).where(and(eq(sessionNote.id, noteId), isNull(sessionNote.signedAt))).returning({ id: sessionNote.id });
        if (rows.length) await writeAudit(tx, audit);
        return rows.length > 0;
      });
    },

    addAddendum(noteId: string, authorId: string, text: string, audit: AuditEntry) {
      return db.transaction(async (tx) => {
        await tx.insert(sessionNoteAddendum).values({ noteId, authorId, text });
        await writeAudit(tx, audit);
      });
    },

    async bookingClient(bookingId: string): Promise<{ clientId: string; startsAt: Date } | null> {
      const [row] = await db.select({ clientId: booking.clientId, startsAt: booking.startsAt }).from(booking).where(and(eq(booking.id, bookingId), eq(booking.slotReleased, false), sql`${booking.status} <> 'cancelled'`, sql`(${booking.paymentStatus} in ('paid', 'not_required') or ${booking.paymentDueAt} is null)`));
      return row ?? null;
    },

    /** The client's sessions that have started and have no note yet, newest first. */
    noteableBookings(clientId: string, now: Date): Promise<NoteableBooking[]> {
      return db
        .select({ id: booking.id, startsAt: booking.startsAt, serviceName: service.name, staffName: staff.name })
        .from(booking)
        .innerJoin(service, eq(service.id, booking.serviceId))
        .innerJoin(staff, eq(staff.id, booking.staffId))
        .leftJoin(sessionNote, eq(sessionNote.bookingId, booking.id))
        .where(and(eq(booking.slotReleased, false), sql`(${booking.paymentStatus} in ('paid', 'not_required') or ${booking.paymentDueAt} is null)`, eq(booking.clientId, clientId), isNull(sessionNote.id), sql`${booking.status} <> 'cancelled'`, sql`${booking.startsAt} <= ${now}`))
        .orderBy(desc(booking.startsAt))
        .limit(50);
    },

    /**
     * Held sessions that still have no session note, oldest first: past sessions not cancelled or missed, with someone in a
     * role that writes case notes, since `from`. `staffId` limits to one psychologist.
     */
    pendingNotes({ now, from, roles, staffId }: { now: Date; from: Date; roles: readonly string[]; staffId?: string }): Promise<PendingNoteRow[]> {
      if (!roles.length) return Promise.resolve([]);
      return db
        .select({ bookingId: booking.id, clientId: booking.clientId, clientName: client.name, staffId: booking.staffId, staffName: staff.name, serviceName: service.name, startsAt: booking.startsAt, endsAt: booking.endsAt })
        .from(booking)
        .innerJoin(client, eq(client.id, booking.clientId))
        .innerJoin(staff, eq(staff.id, booking.staffId))
        .innerJoin(service, eq(service.id, booking.serviceId))
        .leftJoin(sessionNote, eq(sessionNote.bookingId, booking.id))
        .where(and(
          isNull(sessionNote.id),
          eq(booking.slotReleased, false),
          sql`(${booking.paymentStatus} in ('paid', 'not_required') or ${booking.paymentDueAt} is null)`,
          inArray(booking.status, ["upcoming", "completed"]),
          sql`${booking.endsAt} <= ${now}`,
          sql`${booking.startsAt} >= ${from}`,
          inArray(staff.accessRole, [...roles] as ("admin" | "manager" | "psychologist" | "bde" | "ccd")[]),
          staffId ? eq(booking.staffId, staffId) : undefined,
        ))
        .orderBy(asc(booking.endsAt))
        .limit(500);
    },

    /** Every client with their record's headline facts, newest client first; `q` matches name, phone or client number. */
    async list(q?: string): Promise<RawListRow[]> {
      const like = q ? `%${q.replace(/[%_\\]/g, "\\$&")}%` : null;
      const digits = q?.replace(/\D/g, "") ?? "";
      const rows = await db.execute(sql`
        select c.id as "clientId", c.name as "clientName", c.number as "clientNumber", c.phone_e164 as "clientPhone",
          ch.status, ch.risk_suicide as "riskSuicide", ch.risk_self_harm as "riskSelfHarm", ch.risk_others as "riskOthers",
          ch.diagnosis_code as "diagnosisCode", ch.diagnosis_label as "diagnosisLabel",
          t.staff_id as "therapistId", ts.name as "therapistName", ts.active as "therapistActive",
          coalesce(n.notes, 0)::int as notes, n.last_at as "lastNoteAt", la.name as "lastNoteAuthor"
        from client c
        left join case_history ch on ch.client_id = c.id
        left join client_therapist t on t.client_id = c.id and t.ends_at is null
        left join staff ts on ts.id = t.staff_id
        left join lateral (
          select count(*) as notes, max(sn.session_at) as last_at,
            (select sn2.author_id from session_note sn2 where sn2.case_history_id = ch.id order by sn2.session_at desc limit 1) as last_author
          from session_note sn where sn.case_history_id = ch.id
        ) n on true
        left join staff la on la.id = n.last_author
        where ${like ? sql`(c.name ilike ${like} or c.phone_e164 ilike ${like} ${digits.length >= 3 ? sql`or c.phone_e164 like ${`%${digits}%`} or c.number::text = ${digits}` : sql``})` : sql`true`}
          -- Only people in treatment: a confirmed or paid session, a psychologist, or clinical writing. Someone who only started
          -- a website booking and never paid stays in Bookings; sales-only contacts stay in Leads.
          and (
            t.staff_id is not null
            or coalesce(n.notes, 0) > 0
            or (ch.id is not null and (ch.status <> 'intake_pending' or ch.presenting_complaints is not null or ch.diagnosis_label is not null))
            or exists (
              select 1 from booking b
              where b.client_id = c.id and b.status <> 'cancelled' and not b.slot_released
                and (b.payment_status in ('paid', 'not_required') or b.payment_due_at is null)
            )
          )
        order by c.created_at desc
        limit 1000`);
      return (rows.rows as RawListRow[]).map((r) => ({ ...r, lastNoteAt: r.lastNoteAt ? new Date(r.lastNoteAt) : null }));
    },
  };
}

export type CaseHistoryRepository = ReturnType<typeof createCaseHistoryRepository>;
