"use client";

import { useEffect, useState } from "react";
import { api, money, when } from "@/lib/api";
import { EmptyState, PageHeader, StatusChip } from "@/components/ui";
import type { Payment } from "@/lib/types";

type Earnings = {
  breakdown: { kind: string; status: string; total_payout: string; total_volume: string; count: string }[];
  recent: Payment[];
};

export default function EarningsPage() {
  const [data, setData] = useState<Earnings | null>(null);

  useEffect(() => {
    api<Earnings>("/api/doctors/me/earnings").then(setData).catch(() => {});
  }, []);

  const paid = (data?.breakdown || []).filter((b) => b.status === "succeeded");
  const oversight = paid.find((b) => b.kind === "oversight");
  const visits = paid.find((b) => b.kind === "appointment");
  const total = paid.reduce((s, b) => s + Number(b.total_payout), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Split payouts"
        description="Clinic visits: 80% to you, 20% platform. Low-severity Ava cases still pay an oversight fee via Stripe Connect or Razorpay Route (demo ledger if no keys)."
      />
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wider text-muted">Your take-home</p>
          <p className="mt-1 font-mono text-3xl tracking-tight text-teal">{money(total)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wider text-muted">Clinic visits</p>
          <p className="mt-1 font-mono text-3xl tracking-tight text-navy">{money(Number(visits?.total_payout || 0))}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wider text-muted">AI oversight</p>
          <p className="mt-1 font-mono text-3xl tracking-tight text-navy">{money(Number(oversight?.total_payout || 0))}</p>
        </div>
      </section>
      <section className="card overflow-hidden">
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Ledger</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">When</th>
                <th className="px-4 py-2.5 font-medium">Patient</th>
                <th className="px-4 py-2.5 font-medium">Mode</th>
                <th className="px-4 py-2.5 font-medium">Kind</th>
                <th className="px-4 py-2.5 font-medium">Patient paid</th>
                <th className="px-4 py-2.5 font-medium">You</th>
                <th className="px-4 py-2.5 font-medium">Platform</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recent || []).map((p) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="px-4 py-3 text-muted">
                    <p>{when(p.created_at)}</p>
                    {p.scheduled_at ? <p className="text-xs">slot {when(p.scheduled_at)}</p> : null}
                  </td>
                  <td className="px-4 py-3">{p.patient_name || "—"}</td>
                  <td className="px-4 py-3 capitalize">
                    {p.care_mode === "online" || p.kind === "oversight" ? "Online" : "In-person"}
                  </td>
                  <td className="px-4 py-3 capitalize">{p.kind === "appointment" ? "Clinic visit" : "Ava oversight"}</td>
                  <td className="px-4 py-3 font-mono">{money(p.amount_cents, p.currency)}</td>
                  <td className="px-4 py-3 font-mono text-teal">{money(p.doctor_payout_cents, p.currency)}</td>
                  <td className="px-4 py-3 font-mono">{money(p.platform_fee_cents, p.currency)}</td>
                  <td className="px-4 py-3">
                    <StatusChip status={p.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && !data.recent.length ? (
          <div className="p-4">
            <EmptyState title="No payouts yet" hint="Completed visits and approved Ava plans will land in this ledger." />
          </div>
        ) : null}
      </section>
    </div>
  );
}
