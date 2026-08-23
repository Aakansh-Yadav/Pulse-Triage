import { Router } from "express";
import { getDb } from "../db/client.js";
import { authRequired, wrap } from "../auth.js";
import { getDoctorQueue } from "../services/scheduler.js";
import { decorateAppointments } from "../services/staffAssist.js";

export const appointmentRouter = Router();
appointmentRouter.use(authRequired);

appointmentRouter.get(
  "/",
  wrap(async (req, res) => {
    const db = await getDb();
    if (req.user!.role === "doctor") {
      const queue = await getDoctorQueue(req.user!.doctor_id!);
      return res.json({ appointments: queue });
    }
    const { rows } = await db.query(
      `SELECT a.*, u.full_name AS doctor_name, d.specialty, t.risk_score
       FROM appointments a
       JOIN doctors d ON d.id = a.doctor_id
       JOIN users u ON u.id = d.user_id
       LEFT JOIN triage_sessions t ON t.id = a.triage_session_id
       WHERE a.patient_id = $1
       ORDER BY a.scheduled_at DESC`,
      [req.user!.patient_id],
    );
    res.json({ appointments: await decorateAppointments(rows as never) });
  }),
);

appointmentRouter.get(
  "/consults",
  wrap(async (req, res) => {
    const db = await getDb();
    const { rows } = await db.query(
      `SELECT c.*, u.full_name AS doctor_name, t.care_plan, t.severity, t.risk_score
       FROM ai_consults c
       JOIN doctors d ON d.id = c.doctor_id
       JOIN users u ON u.id = d.user_id
       LEFT JOIN triage_sessions t ON t.id = c.triage_session_id
       WHERE c.patient_id = $1
       ORDER BY c.created_at DESC`,
      [req.user!.patient_id],
    );
    res.json({ consults: rows });
  }),
);
