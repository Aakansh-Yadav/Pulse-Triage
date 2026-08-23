import { getDb } from "../db/client.js";
import { getLiveStore, queueKey, queueScore, SCHEDULE_CHANNEL } from "../redis.js";

const LOCK_WINDOW_MS = 10 * 60 * 1000;
export const SLOT_GAP_MINUTES = 30;

export type AppointmentRow = {
  id: string;
  patient_id: string;
  doctor_id: string;
  triage_session_id: string | null;
  scheduled_at: string;
  duration_minutes: number;
  severity: "high" | "low";
  status: string;
  reason: string | null;
  bump_count: number;
  created_at: string;
  patient_name?: string;
  risk_score?: number | null;
};

export type DoctorRow = {
  id: string;
  specialty: string;
  consult_fee_cents: number;
  oversight_fee_cents: number;
  clinic_start: string;
  clinic_end: string;
  slot_minutes: number;
  full_name?: string;
};

export type ClinicPlacement = {
  position: number;
  staff_care_now: boolean;
  doctor_name: string;
  scheduled_at: string;
  duration_minutes: number;
  preceding: { patient_name: string; scheduled_at: string } | null;
};

function parseHm(hm: string, day: Date) {
  const [h, m] = hm.split(":").map(Number);
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d;
}

function slotMs() {
  return SLOT_GAP_MINUTES * 60_000;
}

function dayStart(d: Date) {
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  return day;
}

/** Next 30-minute clinic slot at or after `from`, staying on the same doctor. */
function nextClinicSlot(from: Date, doctor: DoctorRow) {
  const day = dayStart(from);
  const start = parseHm(doctor.clinic_start, day);
  const end = parseHm(doctor.clinic_end, day);
  const step = slotMs();
  if (from < start) return start;
  let t = start.getTime();
  while (t < from.getTime()) t += step;
  if (t < end.getTime()) return new Date(t);
  const next = dayStart(from);
  next.setDate(next.getDate() + 1);
  return parseHm(doctor.clinic_start, next);
}

/** Book the next consecutive case 30 minutes after the previous visit starts (when that visit ends). */
function slotAfterVisit(previousStart: Date) {
  return new Date(previousStart.getTime() + slotMs());
}

async function hydrateQueue(doctorId: string) {
  const db = await getDb();
  const store = await getLiveStore();
  const key = queueKey(doctorId);
  await store.del(key);
  const { rows } = await db.query<AppointmentRow>(
    `SELECT a.*, t.risk_score
     FROM appointments a
     LEFT JOIN triage_sessions t ON t.id = a.triage_session_id
     WHERE a.doctor_id = $1 AND a.severity = 'high' AND a.status IN ('scheduled', 'pending_payment', 'waitlisted')
     ORDER BY a.created_at ASC`,
    [doctorId],
  );
  for (const row of rows) {
    await store.zadd(key, queueScore(row.severity, new Date(row.created_at), Number(row.risk_score || 0)), row.id);
  }
}

function doctorRankSql() {
  return `CASE WHEN lower(u.email) IN ('doctor@demo.com', 'doctor2@demo.com') THEN 1 ELSE 0 END ASC, u.created_at DESC, d.id ASC`;
}

export async function listDoctors(): Promise<Array<DoctorRow & { full_name?: string }>> {
  const db = await getDb();
  const { rows } = await db.query<DoctorRow>(
    `SELECT d.*, u.full_name, u.email
     FROM doctors d JOIN users u ON u.id = d.user_id
     ORDER BY ${doctorRankSql()}`,
  );
  return rows;
}

/**
 * Book with the doctor the patient chose.
 * If none is chosen, use the newest registered clinician — not the seeded demo
 * doctor who already has the longest queue (that was sending everyone to Dr. Ananya Rao).
 */
export async function pickDoctor(preferredId?: string | null): Promise<DoctorRow> {
  const db = await getDb();
  if (preferredId) {
    const { rows } = await db.query<DoctorRow>(
      `SELECT d.*, u.full_name
       FROM doctors d JOIN users u ON u.id = d.user_id
       WHERE d.id = $1`,
      [preferredId],
    );
    if (rows[0]) return rows[0];
  }
  const doctors = await listDoctors();
  if (!doctors[0]) throw new Error("No doctors available");
  return doctors[0];
}

/**
 * Rebuild one doctor's board in registration order.
 * First high-risk patient keeps a direct slot. Each next consecutive high-risk
 * case is booked 30 minutes after the previous visit, same doctor.
 */
export async function rebuildDoctorSchedule(doctorId: string) {
  const db = await getDb();
  const { rows: doctors } = await db.query<DoctorRow>(`SELECT * FROM doctors WHERE id = $1`, [doctorId]);
  const doctor = doctors[0];
  if (!doctor) throw new Error("Doctor not found");

  const now = new Date();
  await db.query(
    `UPDATE appointments
     SET status = 'online_only'
     WHERE doctor_id = $1 AND severity = 'low' AND status IN ('scheduled', 'pending_payment', 'waitlisted')`,
    [doctorId],
  );
  const { rows } = await db.query<AppointmentRow>(
    `SELECT a.*, u.full_name AS patient_name, t.risk_score
     FROM appointments a
     JOIN patients p ON p.id = a.patient_id
     JOIN users u ON u.id = p.user_id
     LEFT JOIN triage_sessions t ON t.id = a.triage_session_id
     WHERE a.doctor_id = $1 AND a.severity = 'high' AND a.status IN ('scheduled', 'pending_payment', 'waitlisted')
     ORDER BY a.created_at ASC`,
    [doctorId],
  );

  const changes: { id: string; from: string; to: string; status: string }[] = [];
  let previousStart: Date | null = null;

  for (const appt of rows) {
    const existing = new Date(appt.scheduled_at);
    const duration = slotMs();
    const stillInVisit = existing.getTime() + duration > now.getTime();
    const imminent =
      appt.status !== "waitlisted" &&
      existing >= now &&
      existing.getTime() - now.getTime() <= LOCK_WINDOW_MS;

    let assigned: Date;
    if (previousStart) {
      assigned = slotAfterVisit(previousStart);
      if (assigned < now) assigned = nextClinicSlot(now, doctor);
    } else if (imminent || stillInVisit) {
      assigned = existing;
    } else {
      assigned = nextClinicSlot(now, doctor);
    }

    const nextIso = assigned.toISOString();
    const prev = existing.toISOString();
    await db.query(
      `UPDATE appointments
       SET scheduled_at = $1, status = 'scheduled', duration_minutes = $2
       WHERE id = $3`,
      [nextIso, SLOT_GAP_MINUTES, appt.id],
    );
    if (prev !== nextIso) {
      changes.push({ id: appt.id, from: prev, to: nextIso, status: "scheduled" });
    }
    previousStart = assigned;
  }

  await hydrateQueue(doctorId);
  await ensureBridgeCareForDoctor(doctorId);
  const snapshot = await getDoctorQueue(doctorId);
  const store = await getLiveStore();
  await store.publish(
    SCHEDULE_CHANNEL,
    JSON.stringify({
      type: "schedule.updated",
      doctorId,
      changes,
      queue: snapshot,
      at: new Date().toISOString(),
    }),
  );
  return { doctor, queue: snapshot, changes };
}

export async function enqueueAppointment(input: {
  patientId: string;
  doctorId: string;
  triageSessionId: string;
  severity: "high" | "low";
  reason: string;
  durationMinutes?: number;
}) {
  if (input.severity !== "high") {
    throw new Error("Online-assist patients do not take clinic slots");
  }
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.query(
    `INSERT INTO appointments
      (id, patient_id, doctor_id, triage_session_id, scheduled_at, duration_minutes, severity, status, reason)
     VALUES ($1,$2,$3,$4,'1970-01-01T00:00:00Z',$5,$6,'pending_payment',$7)`,
    [
      id,
      input.patientId,
      input.doctorId,
      input.triageSessionId,
      input.durationMinutes ?? SLOT_GAP_MINUTES,
      input.severity,
      input.reason,
    ],
  );
  await rebuildDoctorSchedule(input.doctorId);
  const { rows } = await db.query(`SELECT * FROM appointments WHERE id = $1`, [id]);
  const placement = await getClinicPlacement(id);
  return { ...rows[0], placement };
}

export async function getClinicPlacement(appointmentId: string): Promise<ClinicPlacement | null> {
  const db = await getDb();
  const { rows } = await db.query<{
    id: string;
    doctor_id: string;
    scheduled_at: string;
    duration_minutes: number;
    doctor_name: string;
  }>(
    `SELECT a.id, a.doctor_id, a.scheduled_at, a.duration_minutes, u.full_name AS doctor_name
     FROM appointments a
     JOIN doctors d ON d.id = a.doctor_id
     JOIN users u ON u.id = d.user_id
     WHERE a.id = $1`,
    [appointmentId],
  );
  const appt = rows[0];
  if (!appt) return null;
  const queue = (await getDoctorQueue(appt.doctor_id)) as Array<{
    id: string;
    patient_name?: string;
    scheduled_at: string;
  }>;
  const index = queue.findIndex((row) => row.id === appt.id);
  const position = index >= 0 ? index + 1 : 1;
  const preceding = index > 0 ? queue[index - 1] : null;
  return {
    position,
    staff_care_now: position > 1,
    doctor_name: appt.doctor_name,
    scheduled_at: appt.scheduled_at,
    duration_minutes: appt.duration_minutes,
    preceding: preceding
      ? { patient_name: preceding.patient_name || "the previous patient", scheduled_at: preceding.scheduled_at }
      : null,
  };
}

async function ensureBridgeCareForDoctor(doctorId: string) {
  const { ensureBridgeCareForDoctor: run } = await import("./staffAssist.js");
  await run(doctorId);
}

export async function getDoctorQueue(doctorId: string) {
  const db = await getDb();
  const { rows } = await db.query(
    `SELECT a.*, u.full_name AS patient_name, t.risk_score, t.ai_summary, t.red_flags, t.chief_complaint,
            pay.amount_cents, pay.doctor_payout_cents, pay.platform_fee_cents, pay.status AS payment_status,
            pay.currency, pay.kind AS payment_kind
     FROM appointments a
     JOIN patients p ON p.id = a.patient_id
     JOIN users u ON u.id = p.user_id
     LEFT JOIN triage_sessions t ON t.id = a.triage_session_id
     LEFT JOIN payments pay ON pay.appointment_id = a.id
     WHERE a.doctor_id = $1
       AND a.severity = 'high'
       AND a.status IN ('scheduled', 'pending_payment', 'waitlisted')
     ORDER BY a.scheduled_at ASC, a.created_at ASC`,
    [doctorId],
  );
  return rows;
}

export async function hydrateAllQueues() {
  const db = await getDb();
  const { rows } = await db.query<{ id: string }>(`SELECT id FROM doctors`);
  for (const d of rows) {
    await rebuildDoctorSchedule(d.id);
  }
}
