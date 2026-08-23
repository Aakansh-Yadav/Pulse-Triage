import Stripe from "stripe";
import { config, resolvePaymentProvider } from "../config.js";
import { getDb } from "../db/client.js";

export type PaymentKind = "appointment" | "oversight";

function split(kind: PaymentKind, consultFee: number, oversightFee: number) {
  if (kind === "appointment") {
    const amount = consultFee;
    const platform = Math.round(amount * 0.2);
    return { amount, platform, doctor: amount - platform, currency: "usd" };
  }
  const amount = 1500;
  const doctor = oversightFee;
  const platform = Math.max(0, amount - doctor);
  return { amount, platform, doctor, currency: "usd" };
}

async function stripeClient() {
  return new Stripe(config.stripeSecret);
}

export async function createPayment(input: {
  patientId: string;
  doctorId: string;
  kind: PaymentKind;
  appointmentId?: string;
  aiConsultId?: string;
  consultFeeCents: number;
  oversightFeeCents: number;
  doctorStripeAccount?: string | null;
  doctorRazorpayAccount?: string | null;
}) {
  const db = await getDb();
  const provider = resolvePaymentProvider();
  const parts = split(input.kind, input.consultFeeCents, input.oversightFeeCents);
  const id = crypto.randomUUID();
  let currency = parts.currency;
  let clientSecret: string | undefined;

  let providerRef: string | null = null;
  let transferRef: string | null = null;
  let status = "pending";

  if (provider === "stripe") {
    const stripe = await stripeClient();
    const intent = await stripe.paymentIntents.create({
      amount: parts.amount,
      currency,
      automatic_payment_methods: { enabled: true },
      application_fee_amount: parts.platform,
      ...(input.doctorStripeAccount
        ? { transfer_data: { destination: input.doctorStripeAccount } }
        : {}),
      metadata: {
        payment_id: id,
        kind: input.kind,
        doctor_id: input.doctorId,
        patient_id: input.patientId,
      },
    });
    providerRef = intent.id;
    clientSecret = intent.client_secret ?? undefined;
  } else if (provider === "razorpay") {
    const auth = Buffer.from(`${config.razorpayKey}:${config.razorpaySecret}`).toString("base64");
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: parts.amount,
        currency: "INR",
        notes: { payment_id: id, kind: input.kind },
        transfers: input.doctorRazorpayAccount
          ? [
              {
                account: input.doctorRazorpayAccount,
                amount: parts.doctor,
                currency: "INR",
                notes: { kind: input.kind },
              },
            ]
          : undefined,
      }),
    });
    if (!res.ok) {
      throw new Error(`Razorpay order failed: ${await res.text()}`);
    }
    const order = (await res.json()) as { id: string };
    providerRef = order.id;
    currency = "inr";
  } else {
    status = "succeeded";
    providerRef = `mock_${id.slice(0, 8)}`;
    transferRef = `xfer_${id.slice(0, 8)}`;
  }

  await db.query(
    `INSERT INTO payments
      (id, patient_id, doctor_id, appointment_id, ai_consult_id, kind, amount_cents, platform_fee_cents,
       doctor_payout_cents, currency, provider, provider_ref, transfer_ref, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      id,
      input.patientId,
      input.doctorId,
      input.appointmentId ?? null,
      input.aiConsultId ?? null,
      input.kind,
      parts.amount,
      parts.platform,
      parts.doctor,
      currency,
      provider,
      providerRef,
      transferRef,
      status,
    ],
  );

  if (status === "succeeded" && input.appointmentId) {
    await db.query(`UPDATE appointments SET status = 'scheduled' WHERE id = $1`, [input.appointmentId]);
  }

  const { rows } = await db.query(`SELECT * FROM payments WHERE id = $1`, [id]);
  return {
    payment: rows[0],
    client: {
      provider,
      clientSecret,
      razorpayOrderId: provider === "razorpay" ? providerRef : undefined,
      razorpayKey: provider === "razorpay" ? config.razorpayKey : undefined,
      demo: provider === "mock",
    },
  };
}

export async function markPaymentSucceeded(providerRef: string) {
  const db = await getDb();
  const { rows } = await db.query<{ appointment_id: string | null; id: string }>(
    `UPDATE payments SET status = 'succeeded' WHERE provider_ref = $1 RETURNING id, appointment_id`,
    [providerRef],
  );
  const row = rows[0];
  if (row?.appointment_id) {
    await db.query(`UPDATE appointments SET status = 'scheduled' WHERE id = $1`, [row.appointment_id]);
  }
  return row;
}

export async function doctorEarnings(doctorId: string) {
  const db = await getDb();
  const { rows } = await db.query<{
    kind: string;
    status: string;
    total_payout: string;
    total_volume: string;
    count: string;
  }>(
    `SELECT kind, status,
            COALESCE(SUM(doctor_payout_cents),0) AS total_payout,
            COALESCE(SUM(amount_cents),0) AS total_volume,
            COUNT(*)::text AS count
     FROM payments WHERE doctor_id = $1
     GROUP BY kind, status`,
    [doctorId],
  );
  const { rows: recent } = await db.query(
    `SELECT pay.*, u.full_name AS patient_name, a.scheduled_at,
            CASE WHEN pay.kind = 'appointment' THEN 'in_person' ELSE 'online' END AS care_mode
     FROM payments pay
     JOIN patients p ON p.id = pay.patient_id
     JOIN users u ON u.id = p.user_id
     LEFT JOIN appointments a ON a.id = pay.appointment_id
     WHERE pay.doctor_id = $1
     ORDER BY pay.created_at DESC
     LIMIT 40`,
    [doctorId],
  );
  return { breakdown: rows, recent };
}
