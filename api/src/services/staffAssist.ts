import { getDb, asJson } from "../db/client.js";
import { getLiveStore, SCHEDULE_CHANNEL } from "../redis.js";

export type StaffAssist = Record<string, unknown>;

async function publishAssist(payload: unknown) {
  const store = await getLiveStore();
  await store.publish(SCHEDULE_CHANNEL, JSON.stringify({ type: "staff.assist", ...((payload as object) || {}), at: new Date().toISOString() }));
}

export function isBridgeCareEligible(appt: {
  id: string;
  doctor_id: string;
  severity: string;
  status: string;
  scheduled_at: string;
}, queue: Array<{ id: string; doctor_id: string; severity?: string; status: string; scheduled_at: string }>) {
  if (appt.severity !== "high") return false;
  if (!["scheduled", "pending_payment", "waitlisted"].includes(appt.status)) return false;
  if (appt.status === "waitlisted") return true;
  return queue.some(
    (q) =>
      q.id !== appt.id &&
      q.doctor_id === appt.doctor_id &&
      q.severity === "high" &&
      ["scheduled", "pending_payment"].includes(q.status) &&
      new Date(q.scheduled_at).getTime() < new Date(appt.scheduled_at).getTime(),
  );
}

export async function getOpenAssist(appointmentId: string) {
  const db = await getDb();
  const { rows } = await db.query(
    `SELECT s.*, u.full_name AS staff_name
     FROM staff_assists s
     LEFT JOIN users u ON u.id = s.staff_user_id
     WHERE s.appointment_id = $1 AND s.status IN ('requested', 'in_progress', 'worsening')
     ORDER BY s.created_at DESC LIMIT 1`,
    [appointmentId],
  );
  return rows[0] ?? null;
}

export async function requestAssist(input: { appointmentId: string; patientId: string }) {
  const db = await getDb();
  const { rows: appts } = await db.query<{
    id: string;
    patient_id: string;
    doctor_id: string;
    severity: string;
    status: string;
    scheduled_at: string;
    bump_count: number;
    risk_score: number | null;
  }>(
    `SELECT a.*, t.risk_score
     FROM appointments a
     LEFT JOIN triage_sessions t ON t.id = a.triage_session_id
     WHERE a.id = $1 AND a.patient_id = $2`,
    [input.appointmentId, input.patientId],
  );
  const appt = appts[0];
  if (!appt) throw new Error("Appointment not found");
  if (appt.severity !== "high") throw new Error("Staff bridge care is for high-risk waits");

  const existing = await getOpenAssist(appt.id);
  if (existing) return existing;

  const id = crypto.randomUUID();
  await db.query(
    `INSERT INTO staff_assists (id, appointment_id, patient_id, doctor_id, status, notes)
     VALUES ($1,$2,$3,$4,'requested',$5)`,
    [
      id,
      appt.id,
      appt.patient_id,
      appt.doctor_id,
      "High-risk patient can arrive now for hospital staff care. Their doctor slot is booked after the current patient's visit, same clinician.",
    ],
  );
  const { rows } = await db.query(`SELECT * FROM staff_assists WHERE id = $1`, [id]);
  await publishAssist({ assist: rows[0] });
  return rows[0];
}

export async function listStaffBoard() {
  const db = await getDb();
  const { rows: queue } = await db.query(
    `SELECT a.*, u.full_name AS patient_name, du.full_name AS doctor_name, t.risk_score, t.chief_complaint, t.red_flags, t.ai_summary
     FROM appointments a
     JOIN patients p ON p.id = a.patient_id
     JOIN users u ON u.id = p.user_id
     JOIN doctors d ON d.id = a.doctor_id
     JOIN users du ON du.id = d.user_id
     LEFT JOIN triage_sessions t ON t.id = a.triage_session_id
     WHERE a.status IN ('scheduled', 'pending_payment', 'waitlisted')
     ORDER BY a.scheduled_at ASC, a.created_at ASC`,
  );
  const { rows: assists } = await db.query(
    `SELECT s.*, u.full_name AS staff_name, pu.full_name AS patient_name
     FROM staff_assists s
     LEFT JOIN users u ON u.id = s.staff_user_id
     JOIN patients p ON p.id = s.patient_id
     JOIN users pu ON pu.id = p.user_id
     WHERE s.status IN ('requested', 'in_progress', 'worsening')
     ORDER BY s.created_at ASC`,
  );
  const eligible = (queue as Array<{
    id: string;
    doctor_id: string;
    severity: string;
    status: string;
    scheduled_at: string;
  }>).filter((appt) => isBridgeCareEligible(appt, queue as never));

  return { waiting: eligible, assists };
}

export async function ensureBridgeCareForDoctor(doctorId: string) {
  const db = await getDb();
  const { rows: queue } = await db.query<{
    id: string;
    patient_id: string;
    doctor_id: string;
    severity: string;
    status: string;
    scheduled_at: string;
  }>(
    `SELECT * FROM appointments
     WHERE doctor_id = $1 AND status IN ('scheduled', 'pending_payment', 'waitlisted')
     ORDER BY created_at ASC`,
    [doctorId],
  );
  for (const appt of queue) {
    if (!isBridgeCareEligible(appt, queue)) continue;
    const existing = await getOpenAssist(appt.id);
    if (existing) continue;
    await requestAssist({ appointmentId: appt.id, patientId: appt.patient_id });
  }
}

export async function claimAssist(assistId: string, staffUserId: string) {
  const db = await getDb();
  await db.query(
    `UPDATE staff_assists
     SET status = 'in_progress', staff_user_id = $1, started_at = COALESCE(started_at, NOW())
     WHERE id = $2 AND status IN ('requested', 'in_progress', 'worsening')`,
    [staffUserId, assistId],
  );
  const { rows } = await db.query(`SELECT * FROM staff_assists WHERE id = $1`, [assistId]);
  await publishAssist({ assist: rows[0] });
  return rows[0];
}

export async function updateAssist(
  assistId: string,
  staffUserId: string,
  input: { notes?: string; vitals?: Record<string, string>; action: "stable" | "escalate" },
) {
  const db = await getDb();
  const { rows } = await db.query<{ id: string; appointment_id: string; doctor_id: string; notes: string | null }>(
    `SELECT * FROM staff_assists WHERE id = $1`,
    [assistId],
  );
  const assist = rows[0];
  if (!assist) throw new Error("Assist not found");

  const notes = [assist.notes, input.notes].filter(Boolean).join("\n");
  if (input.action === "stable") {
    await db.query(
      `UPDATE staff_assists
       SET status = 'stable', notes = $1, vitals = $2, staff_user_id = $3, resolved_at = NOW()
       WHERE id = $4`,
      [notes, asJson(input.vitals || {}), staffUserId, assistId],
    );
  } else {
    await db.query(
      `UPDATE staff_assists
       SET status = 'worsening', notes = $1, vitals = $2, staff_user_id = $3
       WHERE id = $4`,
      [
        notes || "Condition worsening. Continue bedside monitoring until their first-come doctor slot. Do not leave unattended.",
        asJson(input.vitals || {}),
        staffUserId,
        assistId,
      ],
    );
  }
  const { rows: next } = await db.query(`SELECT * FROM staff_assists WHERE id = $1`, [assistId]);
  await publishAssist({ assist: next[0], action: input.action });
  return next[0];
}

export async function decorateAppointments<T extends { id: string; doctor_id: string; severity: string; status: string; scheduled_at: string; bump_count?: number; risk_score?: number | null }>(
  appointments: T[],
) {
  const db = await getDb();
  const doctorIds = [...new Set(appointments.map((a) => a.doctor_id))];
  let queue: Array<T & { patient_name?: string }> = [];
  if (doctorIds.length) {
    const { rows } = await db.query<T & { patient_name?: string }>(
      `SELECT a.*, t.risk_score, u.full_name AS patient_name
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       JOIN users u ON u.id = p.user_id
       LEFT JOIN triage_sessions t ON t.id = a.triage_session_id
       WHERE a.status IN ('scheduled', 'pending_payment', 'waitlisted')
       ORDER BY a.scheduled_at ASC, a.created_at ASC`,
    );
    queue = rows.filter((row) => doctorIds.includes(row.doctor_id));
  }
  const out = [];
  for (const appt of appointments) {
    const assist = await getOpenAssist(appt.id);
    const sameDoctor = queue
      .filter((row) => row.doctor_id === appt.doctor_id)
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
    const index = sameDoctor.findIndex((row) => row.id === appt.id);
    const position = index >= 0 ? index + 1 : 1;
    const preceding = index > 0 ? sameDoctor[index - 1] : null;
    out.push({
      ...appt,
      queue_position: position,
      staff_assist_eligible: isBridgeCareEligible(appt, queue),
      staff_care_now: position > 1,
      preceding_patient_name: preceding?.patient_name || null,
      preceding_scheduled_at: preceding?.scheduled_at || null,
      staff_assist: assist,
    });
  }
  return out;
}
