"use client";

import { useEffect, useState } from "react";
import { api, money, when } from "@/lib/api";
import { Button, EmptyState, PageHeader, StatusChip } from "@/components/ui";

type Consult = {
  id: string;
  patient_name: string;
  advice: string;
  care_plan?: string;
  status: string;
  chief_complaint?: string;
  risk_score?: number;
  doctor_notes?: string | null;
  created_at?: string;
  amount_cents?: number | string | null;
  doctor_payout_cents?: number | string | null;
  platform_fee_cents?: number | string | null;
  payment_status?: string | null;
  currency?: string | null;
};

export default function OversightPage() {
  const [consults, setConsults] = useState<Consult[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function load() {
    const d = await api<{ consults: Consult[] }>("/api/doctors/me/oversight");
    setConsults(d.consults);
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  async function review(id: string, action: "approve" | "escalate") {
    await api(`/api/doctors/me/oversight/${id}/review`, {
      method: "POST",
      body: { action, notes: notes[id] },
    });
    await load();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI oversight inbox"
        description="Ava handles low-severity cases. You are compensated for reviewing each plan. Escalate anything that should skip the line."
      />
      <div className="space-y-3">
        {consults.map((c) => (
          <article key={c.id} className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{c.patient_name}</p>
                <p className="text-xs text-muted">
                  Online · {when(c.created_at)} · {c.chief_complaint} · risk {c.risk_score ?? "—"}
                </p>
                {c.amount_cents != null ? (
                  <p className="mt-1 font-mono text-xs text-teal">
                    {money(Number(c.amount_cents), c.currency || "usd")} paid · you{" "}
                    {money(Number(c.doctor_payout_cents || 0), c.currency || "usd")}
                    {c.payment_status ? ` · ${c.payment_status}` : ""}
                  </p>
                ) : null}
              </div>
              <StatusChip status={c.status} />
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink/80">{c.care_plan || c.advice}</p>
            {c.status === "pending_oversight" ? (
              <div className="mt-4 space-y-2">
                <label className="block text-xs font-medium text-muted">
                  Notes
                  <input
                    className="field mt-1 text-sm"
                    value={notes[c.id] || ""}
                    onChange={(e) => setNotes((s) => ({ ...s, [c.id]: e.target.value }))}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => review(c.id, "approve")} className="h-10 text-sm">
                    Approve · collect oversight fee
                  </Button>
                  <Button variant="secondary" onClick={() => review(c.id, "escalate")} className="h-10 text-sm text-rose-700">
                    Book same-day visit (registration order)
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted">{c.doctor_notes}</p>
            )}
          </article>
        ))}
        {!consults.length ? <EmptyState title="No AI cases assigned." hint="Low-risk Ava plans that need your review appear here." /> : null}
      </div>
    </div>
  );
}
