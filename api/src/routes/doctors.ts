import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { authRequired, requireRole, wrap } from "../auth.js";
import { getDoctorQueue, rebuildDoctorSchedule } from "../services/scheduler.js";
import { doctorEarnings } from "../services/payments.js";
import { getLiveStore, SCHEDULE_CHANNEL } from "../redis.js";

export const doctorRouter = Router();
doctorRouter.use(authRequired, requireRole("doctor"));

async function notifyOversight(doctorId: string) {
  const store = await getLiveStore();
  await store.publish(
    SCHEDULE_CHANNEL,
    JSON.stringify({ type: "oversight.updated", doctorId, at: new Date().toISOString() }),
  );
}

doctorRouter.get(
  "/me/queue",
  wrap(async (req, res) => {
    const queue = await getDoctorQueue(req.user!.doctor_id!);
    res.json({ queue });
  }),
);

doctorRouter.get(
  "/me/oversight",
  wrap(async (req, res) => {
    const db = await getDb();
    const { rows } = await db.query(
      `SELECT c.*, u.full_name AS patient_name, t.chief_complaint, t.severity, t.risk_score, t.care_plan, t.red_flags,
              pay.amount_cents, pay.doctor_payout_cents, pay.platform_fee_cents, pay.status AS payment_status, pay.currency
       FROM ai_consults c
       JOIN patients p ON p.id = c.patient_id
       JOIN users u ON u.id = p.user_id
       LEFT JOIN triage_sessions t ON t.id = c.triage_session_id
       LEFT JOIN payments pay ON pay.ai_consult_id = c.id
       WHERE c.doctor_id = $1
       ORDER BY CASE c.status WHEN 'pending_oversight' THEN 0 ELSE 1 END, c.created_at DESC`,
      [req.user!.doctor_id],
    );
    res.json({ consults: rows });
  }),
);

doctorRouter.post(
  "/me/oversight/:id/review",
  wrap(async (req, res) => {
    const body = z
      .object({ notes: z.string().optional(), action: z.enum(["approve", "escalate"]).default("approve") })
      .parse(req.body);
    const db = await getDb();
    const { rows } = await db.query<{ id: string; triage_session_id: string; patient_id: string }>(
      `SELECT * FROM ai_consults WHERE id = $1 AND doctor_id = $2`,
      [req.params.id, req.user!.doctor_id],
    );
    const consult = rows[0];
    if (!consult) return res.status(404).json({ error: "Consult not found" });

    if (body.action === "approve") {
      await db.query(
        `UPDATE ai_consults SET status = 'reviewed', doctor_notes = $1, reviewed_at = NOW() WHERE id = $2`,
        [body.notes || "Plan approved", consult.id],
      );
    } else {
      await db.query(
        `UPDATE ai_consults SET status = 'escalated', doctor_notes = $1, reviewed_at = NOW() WHERE id = $2`,
        [body.notes || "Escalated to clinic visit", consult.id],
      );
      await db.query(`UPDATE triage_sessions SET severity = 'high', status = 'escalated' WHERE id = $1`, [
        consult.triage_session_id,
      ]);
      const id = crypto.randomUUID();
      await db.query(
        `INSERT INTO appointments
          (id, patient_id, doctor_id, triage_session_id, scheduled_at, duration_minutes, severity, status, reason)
         VALUES ($1,$2,$3,$4, NOW() + INTERVAL '2 hours', 30, 'high', 'scheduled', 'Doctor-escalated from AI consult')`,
        [id, consult.patient_id, req.user!.doctor_id, consult.triage_session_id],
      );
      await rebuildDoctorSchedule(req.user!.doctor_id!);
    }
    const { rows: next } = await db.query(`SELECT * FROM ai_consults WHERE id = $1`, [consult.id]);
    await notifyOversight(req.user!.doctor_id!);
    res.json({ consult: next[0] });
  }),
);

doctorRouter.patch(
  "/appointments/:id",
  wrap(async (req, res) => {
    const body = z.object({ status: z.enum(["completed", "cancelled"]) }).parse(req.body);
    const db = await getDb();
    await db.query(`UPDATE appointments SET status = $1 WHERE id = $2 AND doctor_id = $3`, [
      body.status,
      req.params.id,
      req.user!.doctor_id,
    ]);
    await rebuildDoctorSchedule(req.user!.doctor_id!);
    res.json({ ok: true });
  }),
);

doctorRouter.get(
  "/me/earnings",
  wrap(async (req, res) => {
    const earnings = await doctorEarnings(req.user!.doctor_id!);
    res.json(earnings);
  }),
);

doctorRouter.get(
  "/me",
  wrap(async (req, res) => {
    const db = await getDb();
    const { rows } = await db.query(
      `SELECT d.*, u.full_name, u.email FROM doctors d JOIN users u ON u.id = d.user_id WHERE d.id = $1`,
      [req.user!.doctor_id],
    );
    res.json({ doctor: rows[0] });
  }),
);
