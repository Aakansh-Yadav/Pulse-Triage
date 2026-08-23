export type Severity = "high" | "low";

export type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

export type TriageSession = {
  id: string;
  chief_complaint: string | null;
  messages: ChatMessage[];
  severity: Severity | null;
  risk_score: number | null;
  red_flags: string[];
  ai_summary: string | null;
  recommended_action: string | null;
  care_plan: string | null;
  status: string;
  created_at: string;
};

export function parseSession(session: TriageSession): TriageSession {
  const messages = Array.isArray(session.messages)
    ? session.messages
    : typeof session.messages === "string"
      ? (JSON.parse(session.messages) as ChatMessage[])
      : [];
  const red_flags = Array.isArray(session.red_flags)
    ? session.red_flags
    : typeof session.red_flags === "string"
      ? (JSON.parse(session.red_flags) as string[])
      : [];
  return { ...session, messages, red_flags };
}

export type Appointment = {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  severity: Severity;
  status: string;
  reason: string | null;
  bump_count: number;
  patient_name?: string;
  doctor_name?: string;
  specialty?: string;
  risk_score?: number | null;
  ai_summary?: string | null;
  red_flags?: string[];
  chief_complaint?: string | null;
  staff_assist_eligible?: boolean;
  staff_care_now?: boolean;
  queue_position?: number;
  preceding_patient_name?: string | null;
  preceding_scheduled_at?: string | null;
  staff_assist?: {
    id: string;
    status: string;
    staff_name?: string | null;
    notes?: string | null;
  } | null;
  amount_cents?: number | string | null;
  doctor_payout_cents?: number | string | null;
  platform_fee_cents?: number | string | null;
  payment_status?: string | null;
  currency?: string | null;
};

export type Payment = {
  id: string;
  kind: "appointment" | "oversight";
  amount_cents: number;
  platform_fee_cents: number;
  doctor_payout_cents: number;
  currency: string;
  provider: string;
  status: string;
  created_at: string;
  patient_name?: string;
  scheduled_at?: string | null;
  care_mode?: "in_person" | "online";
};
