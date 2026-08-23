import { Router } from "express";
import { z } from "zod";
import { getDb, asJson, parseJson } from "../db/client.js";
import { authRequired, requireRole, wrap } from "../auth.js";
import { agentReply, detectRedFlags, type ChatMessage } from "../services/triage.js";
import { enqueueAppointment, getClinicPlacement, listDoctors, pickDoctor, rebuildDoctorSchedule } from "../services/scheduler.js";
import { createPayment } from "../services/payments.js";
import { getLiveStore, SCHEDULE_CHANNEL } from "../redis.js";

export const triageRouter = Router();
triageRouter.use(authRequired, requireRole("patient"));

async function sessionForPatient(sessionId: string, patientId: string) {
  const db = await getDb();
  const { rows } = await db.query(`SELECT * FROM triage_sessions WHERE id = $1 AND patient_id = $2`, [
    sessionId,
    patientId,
  ]);
  return rows[0] as Record<string, unknown> | undefined;
}

triageRouter.get(
  "/doctors",
  wrap(async (_req, res) => {
    const doctors = await listDoctors();
    res.json({
      doctors: doctors.map((d) => ({
        id: d.id,
        name: d.full_name,
        specialty: d.specialty,
      })),
    });
  }),
);

triageRouter.post(
  "/sessions",
  wrap(async (req, res) => {
    if (!req.user?.patient_id) {
      return res.status(400).json({ error: "Patient profile missing. Sign out and register as a patient." });
    }
    const db = await getDb();
    const id = crypto.randomUUID();
    const greeting =
      "I'm Ava, your PulseTriage health agent. Tell me what feels wrong — I'll check for danger signs, then either keep helping you or book a doctor visit. Slots are first-come, first-served. If you are high risk and have to wait, hospital staff stay with you until your turn.";
    await db.query(
      `INSERT INTO triage_sessions (id, patient_id, messages, status) VALUES ($1,$2,$3,'in_progress')`,
      [id, req.user!.patient_id, asJson([{ role: "assistant", content: greeting }])],
    );
    const { rows } = await db.query(`SELECT * FROM triage_sessions WHERE id = $1`, [id]);
    res.status(201).json({ session: rows[0] });
  }),
);

triageRouter.get(
  "/sessions",
  wrap(async (req, res) => {
    const db = await getDb();
    const { rows } = await db.query(
      `SELECT * FROM triage_sessions WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [req.user!.patient_id],
    );
    res.json({ sessions: rows });
  }),
);

triageRouter.get(
  "/sessions/:id",
  wrap(async (req, res) => {
    const session = await sessionForPatient(req.params.id, req.user!.patient_id!);
    if (!session) return res.status(404).json({ error: "Session not found" });
    res.json({ session });
  }),
);

triageRouter.post(
  "/sessions/:id/message",
  wrap(async (req, res) => {
    const body = z.object({ content: z.string().min(1).max(4000) }).parse(req.body);
    const session = await sessionForPatient(req.params.id, req.user!.patient_id!);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.status !== "in_progress") return res.status(409).json({ error: "Session already closed" });

    const messages = parseJson<ChatMessage[]>(session.messages, []);
    if (!session.chief_complaint) {
      const db = await getDb();
      await db.query(`UPDATE triage_sessions SET chief_complaint = $1 WHERE id = $2`, [body.content, session.id]);
    }
    messages.push({ role: "user", content: body.content });
    const already =
      session.severity === "high" || session.severity === "low" ? session.severity : null;
    const { reply, result } = await agentReply(messages, { alreadyClassified: already });
    const previous = messages.filter((m) => m.role === "assistant").at(-1)?.content.trim();
    messages.push({ role: "assistant", content: reply.trim() === previous ? `${reply} What else should I know?` : reply });

    const db = await getDb();
    if (result) {
      await db.query(
        `UPDATE triage_sessions
         SET messages = $1, severity = $2, risk_score = $3, red_flags = $4, ai_summary = $5,
             recommended_action = $6, care_plan = $7
         WHERE id = $8`,
        [
          asJson(messages),
          result.severity,
          result.risk_score,
          asJson(result.red_flags),
          result.summary,
          result.recommended_action,
          result.care_plan,
          session.id,
        ],
      );
    } else {
      await db.query(`UPDATE triage_sessions SET messages = $1, red_flags = $2 WHERE id = $3`, [
        asJson(messages),
        asJson(detectRedFlags(messages.filter((m) => m.role === "user").map((m) => m.content).join("\n"))),
        session.id,
      ]);
    }
    const { rows } = await db.query(`SELECT * FROM triage_sessions WHERE id = $1`, [session.id]);
    res.json({ session: rows[0], classified: Boolean(result) });
  }),
);

triageRouter.post(
  "/sessions/:id/finalize",
  wrap(async (req, res) => {
    const body = z.object({ doctorId: z.string().uuid().optional() }).parse(req.body ?? {});
    const session = await sessionForPatient(req.params.id, req.user!.patient_id!);
    if (!session) return res.status(404).json({ error: "Session not found" });

    const messages = parseJson<ChatMessage[]>(session.messages, []);
    const { reply, result } = await agentReply(
      [...messages, { role: "user", content: "Please classify my risk now and route me." }],
      { classify: true },
    );
    const outcome = result;
    if (!outcome) return res.status(500).json({ error: "Could not classify risk" });
    messages.push({ role: "assistant", content: reply });

    const db = await getDb();
    await db.query(
      `UPDATE triage_sessions
       SET messages = $1, severity = $2, risk_score = $3, red_flags = $4, ai_summary = $5,
           recommended_action = $6, care_plan = $7, status = 'completed', completed_at = NOW()
       WHERE id = $8`,
      [
        asJson(messages),
        outcome.severity,
        outcome.risk_score,
        asJson(outcome.red_flags),
        outcome.summary,
        outcome.recommended_action,
        outcome.care_plan,
        session.id,
      ],
    );

    const doctor = await pickDoctor(body.doctorId);
    let appointment = null;
    let consult = null;
    let payment = null;

    if (outcome.severity === "high") {
      appointment = await enqueueAppointment({
        patientId: req.user!.patient_id!,
        doctorId: doctor.id,
        triageSessionId: String(session.id),
        severity: "high",
        reason: String(session.chief_complaint || outcome.summary),
      });
      payment = await createPayment({
        patientId: req.user!.patient_id!,
        doctorId: doctor.id,
        kind: "appointment",
        appointmentId: String((appointment as { id: string }).id),
        consultFeeCents: doctor.consult_fee_cents,
        oversightFeeCents: doctor.oversight_fee_cents,
        doctorStripeAccount: (doctor as { stripe_account_id?: string }).stripe_account_id,
        doctorRazorpayAccount: (doctor as { razorpay_account_id?: string }).razorpay_account_id,
      });
    } else {
      const consultId = crypto.randomUUID();
      await db.query(
        `INSERT INTO ai_consults (id, patient_id, doctor_id, triage_session_id, advice, status)
         VALUES ($1,$2,$3,$4,$5,'pending_oversight')`,
        [consultId, req.user!.patient_id, doctor.id, session.id, outcome.care_plan],
      );
      const { rows } = await db.query(`SELECT * FROM ai_consults WHERE id = $1`, [consultId]);
      consult = rows[0];
      payment = await createPayment({
        patientId: req.user!.patient_id!,
        doctorId: doctor.id,
        kind: "oversight",
        aiConsultId: consultId,
        consultFeeCents: doctor.consult_fee_cents,
        oversightFeeCents: doctor.oversight_fee_cents,
        doctorStripeAccount: (doctor as { stripe_account_id?: string }).stripe_account_id,
        doctorRazorpayAccount: (doctor as { razorpay_account_id?: string }).razorpay_account_id,
      });
      const store = await getLiveStore();
      await store.publish(
        SCHEDULE_CHANNEL,
        JSON.stringify({ type: "oversight.updated", doctorId: doctor.id, at: new Date().toISOString() }),
      );
    }

    const { rows } = await db.query(`SELECT * FROM triage_sessions WHERE id = $1`, [session.id]);
    const placement =
      appointment && typeof appointment === "object" && "placement" in appointment
        ? (appointment as { placement?: unknown }).placement
        : null;
    res.json({
      session: rows[0],
      doctor: { id: doctor.id, name: doctor.full_name, specialty: doctor.specialty },
      appointment,
      placement,
      consult,
      payment,
    });
  }),
);

triageRouter.post(
  "/sessions/:id/escalate",
  wrap(async (req, res) => {
    const body = z.object({ doctorId: z.string().uuid().optional() }).parse(req.body ?? {});
    const session = await sessionForPatient(req.params.id, req.user!.patient_id!);
    if (!session) return res.status(404).json({ error: "Session not found" });
    const db = await getDb();
    await db.query(
      `UPDATE triage_sessions SET severity = 'high', status = 'escalated', recommended_action = 'same_day_doctor' WHERE id = $1`,
      [session.id],
    );
    await db.query(`UPDATE ai_consults SET status = 'escalated' WHERE triage_session_id = $1`, [session.id]);
    const doctor = await pickDoctor(body.doctorId);
    const appointment = await enqueueAppointment({
      patientId: req.user!.patient_id!,
      doctorId: doctor.id,
      triageSessionId: String(session.id),
      severity: "high",
      reason: "Escalated from AI consult",
    });
    await rebuildDoctorSchedule(doctor.id);
    const placement = await getClinicPlacement(String((appointment as { id: string }).id));
    res.json({ appointment, doctor, placement });
  }),
);
