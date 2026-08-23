"use client";

import { useEffect, useState } from "react";
import { api, clock, WS_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, EmptyState, PageHeader, SeverityChip, StatusChip } from "@/components/ui";

type Waiting = {
  id: string;
  patient_name: string;
  doctor_name: string;
  scheduled_at: string;
  status: string;
  reason: string | null;
  chief_complaint?: string;
  risk_score?: number | null;
  bump_count?: number;
};

type Assist = {
  id: string;
  appointment_id: string;
  status: string;
  notes: string | null;
  staff_name?: string | null;
  patient_name?: string;
};

export default function StaffBoardPage() {
  const { token } = useAuth();
  const [waiting, setWaiting] = useState<Waiting[]>([]);
  const [assists, setAssists] = useState<Assist[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [spo2, setSpo2] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  async function load() {
    const data = await api<{ waiting: Waiting[]; assists: Assist[] }>("/api/staff/board");
    setWaiting(data.waiting);
    setAssists(data.assists);
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  useEffect(() => {
    if (!token) return;
    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "staff.assist" || msg.type === "schedule.updated") load().catch(() => {});
      } catch {
        /* ignore */
      }
    };
    return () => ws.close();
  }, [token]);

  async function claim(id: string) {
    setError("");
    try {
      await api(`/api/staff/assists/${id}/claim`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not claim");
    }
  }

  async function finish(id: string, action: "stable" | "escalate") {
    setError("");
    try {
      await api(`/api/staff/assists/${id}/update`, {
        method: "POST",
        body: {
          action,
          notes: notes[id],
          vitals: spo2[id] ? { spo2: spo2[id] } : {},
        },
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Hospital staff"
        title="Bridge care while the doctor is occupied"
        description="Doctor slots stay on the same clinician, 30 minutes apart. You cover high-risk patients whose visit is later — they may arrive now for vitals and monitoring until their booked slot. If they worsen, stay with them; do not jump the doctor queue."
      />
      {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Open staff assists</h2>
        {assists.map((a) => (
          <article key={a.id} className="card space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{a.patient_name}</p>
              <StatusChip status={a.status} />
            </div>
            <p className="text-sm text-muted">{a.notes}</p>
            {a.status === "requested" ? (
              <Button variant="amber" onClick={() => claim(a.id)}>
                I am with this patient
              </Button>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs font-medium text-muted">
                  SpO2 %
                  <input
                    className="field mt-1 text-sm"
                    value={spo2[a.id] || ""}
                    onChange={(e) => setSpo2((s) => ({ ...s, [a.id]: e.target.value }))}
                  />
                </label>
                <label className="text-xs font-medium text-muted">
                  Notes
                  <input
                    className="field mt-1 text-sm"
                    value={notes[a.id] || ""}
                    onChange={(e) => setNotes((s) => ({ ...s, [a.id]: e.target.value }))}
                  />
                </label>
                <Button onClick={() => finish(a.id, "stable")} className="h-11">
                  Stable until doctor slot
                </Button>
                <Button variant="secondary" onClick={() => finish(a.id, "escalate")} className="h-11 text-rose-700">
                  Worsening · stay with them until their slot
                </Button>
              </div>
            )}
          </article>
        ))}
        {!assists.length ? <EmptyState title="No active staff-assist requests." hint="When a high-risk patient asks for cover, the request lands here." /> : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">High-risk patients waiting for their registered turn</h2>
        {waiting.map((w) => (
          <article key={w.id} className="card flex flex-wrap items-start justify-between gap-3 p-5">
            <div>
              <p className="font-medium">{w.patient_name}</p>
              <p className="text-sm text-muted">
                {w.chief_complaint || w.reason} · {w.doctor_name} · {w.status === "waitlisted" ? "Waitlisted" : clock(w.scheduled_at)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <SeverityChip severity="high" />
              <span className="rounded-full bg-amber-50 px-2.5 py-1 font-mono text-sm text-amber-900 ring-1 ring-amber-100">
                score {w.risk_score ?? "—"}
              </span>
            </div>
          </article>
        ))}
        {!waiting.length ? (
          <EmptyState title="No high-risk patients are currently waiting behind a more acute case." />
        ) : null}
      </section>
    </div>
  );
}
