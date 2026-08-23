"use client";

import { api, clock, money, when } from "@/lib/api";
import { useDoctorQueue } from "@/lib/use-queue";
import { EmptyState, PageHeader, SeverityChip } from "@/components/ui";
import { useCallback, useEffect, useState } from "react";

type Consult = {
  id: string;
  patient_name: string;
  status: string;
  chief_complaint?: string;
  care_plan?: string;
  advice?: string;
  created_at?: string;
  amount_cents?: number | string | null;
  doctor_payout_cents?: number | string | null;
  currency?: string | null;
};

export default function SchedulePage() {
  const { queue, lastEvent } = useDoctorQueue();
  const [consults, setConsults] = useState<Consult[]>([]);

  const loadOnline = useCallback(async () => {
    const d = await api<{ consults: Consult[] }>("/api/doctors/me/oversight");
    setConsults(d.consults.filter((c) => c.status === "pending_oversight"));
  }, []);

  useEffect(() => {
    loadOnline().catch(() => {});
  }, [loadOnline, lastEvent]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Live schedule"
        description={`In-person slots are 30 minutes apart on your board. Online Ava cases do not take a clinic time.${lastEvent ? ` Last clinic update ${clock(lastEvent)}.` : ""}`}
      />

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted">In-person</h2>
        <ol className="relative space-y-3 border-l-2 border-rose-100 pl-6">
          {queue.map((row, i) => (
            <li key={row.id} className="relative">
              <span className="absolute -left-[29px] top-5 h-3 w-3 rounded-full bg-rose-500 ring-4 ring-rose-50" />
              <div className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-sm text-navy">
                    {row.status === "waitlisted" ? "Waitlisted" : when(row.scheduled_at)}
                  </p>
                  <SeverityChip severity={row.severity} />
                </div>
                <p className="mt-1 text-lg font-medium">{row.patient_name}</p>
                <p className="text-sm text-muted">{row.chief_complaint || row.ai_summary || row.reason}</p>
                <p className="mt-2 text-xs font-medium text-rose-700">In-person · {row.duration_minutes || 30} min</p>
                {i === 0 ? (
                  <p className="mt-1 text-xs font-medium text-teal">Next in — direct slot</p>
                ) : (
                  <p className="mt-1 text-xs font-medium text-amber-800">
                    After {queue[i - 1]?.patient_name} · staff covering until this slot
                  </p>
                )}
                {row.amount_cents != null ? (
                  <p className="mt-2 font-mono text-xs text-muted">
                    {money(Number(row.amount_cents), row.currency || "usd")} paid · you{" "}
                    {money(Number(row.doctor_payout_cents || 0), row.currency || "usd")}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
          {!queue.length ? <li><EmptyState title="No in-person slots on your board yet." /></li> : null}
        </ol>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted">Online with Ava</h2>
        <ol className="relative space-y-3 border-l-2 border-teal-100 pl-6">
          {consults.map((c) => (
            <li key={c.id} className="relative">
              <span className="absolute -left-[29px] top-5 h-3 w-3 rounded-full bg-teal ring-4 ring-teal-50" />
              <div className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-sm text-navy">{when(c.created_at)}</p>
                  <SeverityChip severity="low" />
                </div>
                <p className="mt-1 text-lg font-medium">{c.patient_name}</p>
                <p className="text-sm text-muted">{c.chief_complaint || c.care_plan || c.advice}</p>
                <p className="mt-2 text-xs font-medium text-teal">Online · no clinic slot</p>
                {c.amount_cents != null ? (
                  <p className="mt-2 font-mono text-xs text-muted">
                    {money(Number(c.amount_cents), c.currency || "usd")} paid · you{" "}
                    {money(Number(c.doctor_payout_cents || 0), c.currency || "usd")}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
          {!consults.length ? <li><EmptyState title="No pending online cases." /></li> : null}
        </ol>
      </section>
    </div>
  );
}
