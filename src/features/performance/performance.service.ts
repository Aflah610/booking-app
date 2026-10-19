import { DomainError } from "@/features/shared/errors";
import { isUuid } from "@/features/shared/validation";
import { buildJourneys, describeJourney, inWindow, isHeld } from "./performance.engine";
import { noAttendanceSource } from "./attendance";
import { punctualityKpi, retentionKpi, conclusionKpi, volumeKpi } from "./kpis";
import type { AttendanceSource, ClientRow, Journey, PerformanceReport, PeriodKey, SessionRow, TherapistDetail, TherapistReport } from "./performance.dto";
import { DEFAULT_PERIOD } from "./performance.dto";
import { isPeriodKey, periodWindow } from "./performance.periods";
import type { KpiContext } from "./kpis/kpi";
import type { PerformanceRepository, TherapistRow } from "./performance.repository";

/** A client who has not booked again this many days after a session is counted as lost (or concluded). */
export const DEFAULT_GRACE_DAYS = 30;

/**
 * The Therapist Performance Calculator. It loads the sessions once, builds one journey per therapist and client, and
 * hands each therapist's journeys to each KPI. The service holds no metric logic of its own.
 */
export function createPerformanceService({
  performanceRepo,
  attendance = noAttendanceSource,
  graceDays = DEFAULT_GRACE_DAYS,
}: {
  performanceRepo: PerformanceRepository;
  attendance?: AttendanceSource;
  graceDays?: number;
}) {
  /** Every KPI for one therapist from their journeys. */
  function reportFor(p: TherapistRow, ctx: KpiContext): TherapistReport {
    return {
      staffId: p.id,
      name: p.name,
      designation: p.designation,
      volume: volumeKpi.compute(ctx),
      retention: retentionKpi.compute(ctx),
      conclusion: conclusionKpi.compute(ctx),
      punctuality: punctualityKpi.compute(ctx),
    };
  }

  return {
    async report(input: { period?: string } = {}, now = new Date()): Promise<PerformanceReport> {
      const period: PeriodKey = isPeriodKey(input.period) ? input.period : DEFAULT_PERIOD;
      const { from, to, label } = periodWindow(period, now);
      const window = { from, to };

      const journeys = buildJourneys(await performanceRepo.sessionFacts());
      const byTherapist = new Map<string, Journey[]>();
      for (const j of journeys) byTherapist.set(j.staffId, [...(byTherapist.get(j.staffId) ?? []), j]);

      // Ask the attendance source only about sessions that matter: held, and inside the window.
      const bookingIds = journeys.flatMap((j) => j.sessions.filter((s) => isHeld(s, now) && s.startsAt >= from && s.startsAt < to).map((s) => s.id));
      const known = bookingIds.length ? await attendance.forBookings(bookingIds) : new Map();

      const people = await performanceRepo.therapists([...byTherapist.keys()]);
      const therapists = people.map((p) => reportFor(p, { journeys: byTherapist.get(p.id) ?? [], window, now, graceDays, attendance: known }));
      // The busiest therapist first; ties by name so the order is stable.
      therapists.sort((a, b) => b.volume.sessions - a.volume.sessions || a.name.localeCompare(b.name));
      return { period, label, from, to, graceDays, therapists };
    },

    /** One therapist on their own: the same numbers, plus each client's story and each session, for the page and its download. */
    async therapist(input: { staffId: string; period?: string }, now = new Date()): Promise<TherapistDetail> {
      const [person] = isUuid(input.staffId) ? await performanceRepo.therapists([input.staffId]) : [];
      if (!person) throw new DomainError("not_found", `Therapist ${input.staffId} not found`);
      const period: PeriodKey = isPeriodKey(input.period) ? input.period : DEFAULT_PERIOD;
      const { from, to, label } = periodWindow(period, now);
      const window = { from, to };

      const journeys = buildJourneys(await performanceRepo.sessionFacts(person.id));
      const sessionsInWindow = journeys.flatMap((j) => j.sessions.filter((s) => isHeld(s, now) && inWindow(s.startsAt, window)).map((s) => s.id));
      const known = sessionsInWindow.length ? await attendance.forBookings(sessionsInWindow) : new Map();
      const therapist = reportFor(person, { journeys, window, now, graceDays, attendance: known });

      const described = journeys.map((j) => ({ j, d: describeJourney(j, window, now, graceDays) }));
      // Sessions held in the period, plus whatever is booked ahead.
      const shown = described.flatMap(({ d }) => d.sessions.filter((s) => !s.held || inWindow(s.fact.startsAt, window)));
      const labels = await performanceRepo.sessionLabels([...new Set([...shown.map((s) => s.fact.id), ...described.filter(({ d }) => d.client.sessionsInPeriod > 0 || d.client.nextAt).map(({ j }) => j.sessions[0].id)])]);

      const sessions: SessionRow[] = shown
        .flatMap((s) => {
          const l = labels.get(s.fact.id);
          return l ? [{ id: s.fact.id, number: l.number, startsAt: s.fact.startsAt, endsAt: s.fact.endsAt, clientId: l.clientId, clientName: l.clientName, clientPhone: l.clientPhone, serviceName: l.serviceName, held: s.held, ordinal: s.ordinal, outcome: s.outcome }] : [];
        })
        .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
        .slice(0, 500);

      const clients: ClientRow[] = described
        .filter(({ d }) => d.client.sessionsInPeriod > 0 || d.client.nextAt)
        .flatMap(({ j, d }) => {
          const l = labels.get(j.sessions[0].id);
          return l ? [{ clientId: j.clientId, name: l.clientName, phone: l.clientPhone, ...d.client }] : [];
        })
        .sort((a, b) => (b.lastAt?.getTime() ?? b.firstAt.getTime()) - (a.lastAt?.getTime() ?? a.firstAt.getTime()));

      return { therapist, period, label, from, to, graceDays, clients, sessions };
    },
  };
}

export type PerformanceService = ReturnType<typeof createPerformanceService>;
