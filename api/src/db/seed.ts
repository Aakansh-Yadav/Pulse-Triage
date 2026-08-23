import bcrypt from "bcryptjs";
import { getDb, asJson } from "./client.js";

const DEMO_PASSWORD = "demo1234";

function hoursFromNow(h: number, m = 0) {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + h, m, 0, 0);
  return d.toISOString();
}

export async function seedIfEmpty() {
  const db = await getDb();
  const existing = await db.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM users`);
  if (Number(existing.rows[0]?.n) > 0) return;

  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const patientUser = crypto.randomUUID();
  const patientUser2 = crypto.randomUUID();
  const doctorUser = crypto.randomUUID();
  const doctorUser2 = crypto.randomUUID();
  const patientId = crypto.randomUUID();
  const patientId2 = crypto.randomUUID();
  const doctorId = crypto.randomUUID();
  const doctorId2 = crypto.randomUUID();

  await db.query(
    `INSERT INTO users (id, email, password_hash, full_name, role, phone) VALUES
     ($1,'patient@demo.com',$5,'Priya Sharma','patient','+1-555-0101'),
     ($2,'patient2@demo.com',$5,'James Chen','patient','+1-555-0102'),
     ($3,'doctor@demo.com',$5,'Dr. Ananya Rao','doctor','+1-555-0201'),
     ($4,'doctor2@demo.com',$5,'Dr. Marcus Hale','doctor','+1-555-0202')`,
    [patientUser, patientUser2, doctorUser, doctorUser2, hash],
  );

  await db.query(
    `INSERT INTO patients (id, user_id, date_of_birth, sex, medical_history, allergies) VALUES
     ($1,$2,'1994-03-12','female','Migraine, seasonal allergies','Penicillin'),
     ($3,$4,'1988-11-02','male','Mild asthma','None known')`,
    [patientId, patientUser, patientId2, patientUser2],
  );

  await db.query(
    `INSERT INTO doctors
      (id, user_id, specialty, license_number, bio, stripe_account_id, razorpay_account_id,
       consult_fee_cents, oversight_fee_cents)
     VALUES
     ($1,$2,'Family Medicine','FM-48291','Same-day triage and chronic care. Oversees Ava, the AI health agent.','acct_demo_rao','acc_demo_rao',8000,800),
     ($3,$4,'Internal Medicine','IM-77310','High-acuity adult medicine and hospital follow-up.','acct_demo_hale','acc_demo_hale',9500,900)`,
    [doctorId, doctorUser, doctorId2, doctorUser2],
  );

  const tHigh = crypto.randomUUID();
  const tLow = crypto.randomUUID();
  await db.query(
    `INSERT INTO triage_sessions
      (id, patient_id, chief_complaint, messages, severity, risk_score, red_flags, ai_summary,
       recommended_action, care_plan, status, completed_at)
     VALUES
     ($1,$2,'Chest tightness after climbing stairs',$5,'high',86,$6,
      'Possible cardiac ischemia. Needs same-day clinician.','same_day_doctor',
      'Keep the patient at rest. Priority appointment booked.','completed', NOW()),
     ($3,$4,'Runny nose and mild sore throat for 2 days',$7,'low',16,'[]',
      'Viral upper respiratory pattern. AI self-care with doctor oversight.','ai_self_care',
      'Hydration, rest, saline rinses. Escalate if dyspnea or high fever.','completed', NOW())`,
    [
      tHigh,
      patientId2,
      tLow,
      patientId,
      asJson([
        { role: "user", content: "I get chest tightness after climbing stairs" },
        { role: "assistant", content: "This needs a doctor today. Booking a priority slot." },
      ]),
      asJson(["Chest pain / possible ACS"]),
      asJson([
        { role: "user", content: "Runny nose and mild sore throat" },
        { role: "assistant", content: "This looks low risk. I can manage this with a doctor reviewing my plan." },
      ]),
    ],
  );

  const apptHigh = crypto.randomUUID();
  await db.query(
    `INSERT INTO appointments
      (id, patient_id, doctor_id, triage_session_id, scheduled_at, duration_minutes, severity, status, reason)
     VALUES
     ($1,$2,$3,$4,$5,30,'high','scheduled','Chest tightness on exertion')`,
    [apptHigh, patientId2, doctorId, tHigh, hoursFromNow(1)],
  );

  const consultId = crypto.randomUUID();
  await db.query(
    `INSERT INTO ai_consults (id, patient_id, doctor_id, triage_session_id, advice, status)
     VALUES ($1,$2,$3,$4,$5,'pending_oversight')`,
    [
      consultId,
      patientId,
      doctorId,
      tLow,
      "Supportive care for likely viral URI. Doctor oversight requested. Patient advised to escalate if red flags appear.",
    ],
  );

  await db.query(
    `INSERT INTO payments
      (id, patient_id, doctor_id, appointment_id, ai_consult_id, kind, amount_cents, platform_fee_cents,
       doctor_payout_cents, currency, provider, provider_ref, transfer_ref, status)
     VALUES
     ($1,$2,$3,$4,NULL,'appointment',8000,1600,6400,'usd','mock','mock_seed1','xfer_seed1','succeeded'),
     ($5,$6,$3,NULL,$7,'oversight',1500,700,800,'usd','mock','mock_seed2','xfer_seed2','succeeded')`,
    [crypto.randomUUID(), patientId2, doctorId, apptHigh, crypto.randomUUID(), patientId, consultId],
  );

  console.log("[seed] demo accounts ready");
  console.log("  patient@demo.com / demo1234");
  console.log("  doctor@demo.com  / demo1234");
}

export async function seedStaffIfMissing() {
  const db = await getDb();
  const existing = await db.query(`SELECT 1 FROM users WHERE lower(email) = 'staff@demo.com'`);
  if (existing.rows.length) return;
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  await db.query(
    `INSERT INTO users (id, email, password_hash, full_name, role, phone)
     VALUES ($1,'staff@demo.com',$2,'Nurse Kavya Mehta','staff','+1-555-0301')`,
    [crypto.randomUUID(), hash],
  );
  console.log("[seed] staff@demo.com / demo1234");
}

if (process.argv[1]?.includes("seed")) {
  const { migrate } = await import("./client.js");
  await migrate();
  await seedIfEmpty();
  await seedStaffIfMissing();
  process.exit(0);
}
