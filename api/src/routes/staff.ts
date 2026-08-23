import { Router } from "express";
import { z } from "zod";
import { authRequired, requireRole, wrap } from "../auth.js";
import { claimAssist, listStaffBoard, requestAssist, updateAssist } from "../services/staffAssist.js";

export const staffRouter = Router();

staffRouter.get(
  "/board",
  authRequired,
  requireRole("staff", "doctor"),
  wrap(async (_req, res) => {
    res.json(await listStaffBoard());
  }),
);

staffRouter.post(
  "/assists/:id/claim",
  authRequired,
  requireRole("staff"),
  wrap(async (req, res) => {
    const assist = await claimAssist(req.params.id, req.user!.id);
    res.json({ assist });
  }),
);

staffRouter.post(
  "/assists/:id/update",
  authRequired,
  requireRole("staff"),
  wrap(async (req, res) => {
    const body = z
      .object({
        notes: z.string().optional(),
        vitals: z.record(z.string()).optional(),
        action: z.enum(["stable", "escalate"]),
      })
      .parse(req.body);
    const assist = await updateAssist(req.params.id, req.user!.id, body);
    res.json({ assist });
  }),
);

export const patientAssistRouter = Router();
patientAssistRouter.use(authRequired, requireRole("patient"));

patientAssistRouter.post(
  "/appointments/:id/staff-assist",
  wrap(async (req, res) => {
    const assist = await requestAssist({ appointmentId: req.params.id, patientId: req.user!.patient_id! });
    res.status(201).json({ assist });
  }),
);
