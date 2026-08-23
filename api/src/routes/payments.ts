import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { authRequired, wrap } from "../auth.js";
import { createPayment, markPaymentSucceeded } from "../services/payments.js";
import { config } from "../config.js";
import Stripe from "stripe";

export const paymentsRouter = Router();

paymentsRouter.post(
  "/checkout",
  authRequired,
  wrap(async (req, res) => {
    const body = z
      .object({
        kind: z.enum(["appointment", "oversight"]),
        appointmentId: z.string().optional(),
        consultId: z.string().optional(),
      })
      .parse(req.body);
    const db = await getDb();
    const doctorId = body.appointmentId
      ? (await db.query<{ doctor_id: string }>(`SELECT doctor_id FROM appointments WHERE id = $1`, [body.appointmentId]))
          .rows[0]?.doctor_id
      : (await db.query<{ doctor_id: string }>(`SELECT doctor_id FROM ai_consults WHERE id = $1`, [body.consultId]))
          .rows[0]?.doctor_id;
    if (!doctorId) return res.status(404).json({ error: "Target not found" });
    const { rows } = await db.query<{
      consult_fee_cents: number;
      oversight_fee_cents: number;
      stripe_account_id: string | null;
      razorpay_account_id: string | null;
    }>(`SELECT consult_fee_cents, oversight_fee_cents, stripe_account_id, razorpay_account_id FROM doctors WHERE id = $1`, [
      doctorId,
    ]);
    const doctor = rows[0];
    const result = await createPayment({
      patientId: req.user!.patient_id!,
      doctorId,
      kind: body.kind,
      appointmentId: body.appointmentId,
      aiConsultId: body.consultId,
      consultFeeCents: doctor.consult_fee_cents,
      oversightFeeCents: doctor.oversight_fee_cents,
      doctorStripeAccount: doctor.stripe_account_id,
      doctorRazorpayAccount: doctor.razorpay_account_id,
    });
    res.json(result);
  }),
);

paymentsRouter.post(
  "/stripe/webhook",
  wrap(async (req, res) => {
    if (!config.stripeSecret || !config.stripeWebhook) {
      return res.status(400).json({ error: "Stripe webhooks not configured" });
    }
    const stripe = new Stripe(config.stripeSecret);
    const sig = req.headers["stripe-signature"];
    if (!sig || typeof sig !== "string") return res.status(400).json({ error: "Missing signature" });
    const event = stripe.webhooks.constructEvent((req as unknown as { rawBody: Buffer }).rawBody, sig, config.stripeWebhook);
    if (event.type === "payment_intent.succeeded") {
      const intent = event.data.object as Stripe.PaymentIntent;
      await markPaymentSucceeded(intent.id);
    }
    res.json({ received: true });
  }),
);
