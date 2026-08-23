"use client";

import { Children, isValidElement, type ReactNode, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, clock, money, when, WS_URL } from "@/lib/api";
import { useDoctorQueue } from "@/lib/use-queue";
import { PageHeader, SeverityChip, StatusChip } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import type { Appointment } from "@/lib/types";

type Consult = {
  id: string;
  patient_name: string;
  advice: string;
  care_plan?: string;
  status: string;
  chief_complaint?: string;
  risk_score?: number;
  created_at?: string;
  amount_cents?: number | string | null;
  doctor_payout_cents?: number | string | null;
  platform_fee_cents?: number | string | null;
  payment_status?: string | null;
  currency?: string | null;
};

function PayCell({
  amount,
  doctor,
  platform,
  status,
  currency,
}: {
  amount?: number | string | null;
  doctor?: number | string | null;
  platform?: number | string | null;
  status?: string | null;
  currency?: string | null;
}) {
  if (amount == null || amount === "") return <span className="text-muted">—</span>;
  const cur = currency || "usd";
  return (
    <div className="font-mono text-xs leading-relaxed">
      <p>{money(Number(amount), cur)} paid</p>
      <p className="text-teal">you {money(Number(doctor || 0), cur)}</p>
      <p className="text-muted">platform {money(Number(platform || 0), cur)}</p>
      {status ? <p className="capitalize text-muted">{status}</p> : null}
    </div>
  );
}

export default function DoctorBoard() {
  const { user, token } = useAuth();
  const { queue, lastEvent } = useDoctorQueue();
  const [consults, setConsults] = useState<Consult[]>([]);
  const [busyId, setBusyId] = useState("");

  const loadOnline = useCallback(async () => {
    const d = await api<{ consults: Consult[] }>("/api/doctors/me/oversight");
    setConsults(d.consults);
  }, []);

  useEffect(() => {
    loadOnline().catch(() => {});
  }, [loadOnline, lastEvent]);

  useEffect(() => {
    if (!token) return;
    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "oversight.updated") {
          if (msg.doctorId && user?.doctor_id && msg.doctorId !== user.doctor_id) return;
          loadOnline().catch(() => {});
        }
      } catch {
        /* ignore */
      }
    };
    return () => ws.close();
  }, [token, user?.doctor_id, loadOnline]);

  const pendingOnline = consults.filter((c) => c.status === "pending_oversight");

  async function mark(id: string, status: "completed" | "cancelled") {
    await api(`/api/doctors/appointments/${id}`, { method: "PATCH", body: { status } });
  }

  async function review(id: string, action: "approve" | "escalate") {
    setBusyId(id);
    try {
      await api(`/api/doctors/me/oversight/${id}/review`, { method: "POST", body: { action } });
      await loadOnline();
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Clinical board"
        title={user?.full_name || "Clinician"}
        action={
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-muted">
            <span className="live-dot h-2 w-2 rounded-full bg-teal" />
            Queue streaming{lastEvent ? ` · updated ${clock(lastEvent)}` : ""}
          </p>
        }
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <Kpi label="In-person clinic" value={String(queue.length)} />
        <Kpi label="Staff covering waits" value={String(queue.length > 1 ? queue.length - 1 : 0)} accent />
        <Kpi label="Online with Ava" value={String(pendingOnline.length)} />
      </section>

      <BoardTable
        title="In-person clinic"
        hint="High-risk visits · 30 minutes apart · same doctor"
        empty="No in-person visits yet. High-risk bookings for you appear here with time and payment."
        columns={["When", "Mode", "Patient", "Complaint", "Acuity", "Payment", "Status", ""]}
      >
        {queue.map((row, i) => (
          <tr key={row.id} className="border-t border-line bg-rose-50/40">
            <td className="px-4 py-3">
              <p className="font-mono text-sm text-navy">{row.status === "waitlisted" ? "Waitlisted" : when(row.scheduled_at)}</p>
              <p className="mt-1 text-[11px] text-muted">{row.duration_minutes || 30} min slot</p>
              {i > 0 ? (
                <p className="mt-1 text-[11px] text-amber-800">
                  After {(queue[i - 1] as Appointment).patient_name} · staff covering
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-teal">Next in · direct slot</p>
              )}
            </td>
            <td className="px-4 py-3 text-sm font-medium text-rose-700">In-person</td>
            <td className="px-4 py-3 font-medium">{row.patient_name}</td>
            <td className="max-w-xs truncate px-4 py-3 text-muted">{row.chief_complaint || row.reason}</td>
            <td className="px-4 py-3">
              <SeverityChip severity={row.severity} />
            </td>
            <td className="px-4 py-3">
              <PayCell
                amount={row.amount_cents}
                doctor={row.doctor_payout_cents}
                platform={row.platform_fee_cents}
                status={row.payment_status}
                currency={row.currency}
              />
            </td>
            <td className="px-4 py-3 capitalize text-muted">{row.status.replaceAll("_", " ")}</td>
            <td className="px-4 py-3 text-right">
              <button onClick={() => mark(row.id, "completed")} className="text-xs font-semibold text-teal hover:text-navy">
                Complete
              </button>
            </td>
          </tr>
        ))}
      </BoardTable>

      <BoardTable
        title="Online with Ava"
        hint="Low-risk plans. No clinic slot. Oversight fee is shown per case."
        empty="No online Ava cases yet."
        columns={["When", "Mode", "Patient", "Complaint", "Acuity", "Payment", "Status", ""]}
      >
        {consults.map((c) => (
          <tr key={c.id} className="border-t border-line bg-teal-50/30">
            <td className="px-4 py-3 font-mono text-sm text-navy">{when(c.created_at)}</td>
            <td className="px-4 py-3 text-sm font-medium text-teal">Online</td>
            <td className="px-4 py-3 font-medium">{c.patient_name}</td>
            <td className="max-w-xs px-4 py-3 text-muted">
              <p className="truncate">{c.chief_complaint || "Ava consult"}</p>
              <p className="mt-1 line-clamp-2 text-xs">{c.care_plan || c.advice}</p>
            </td>
            <td className="px-4 py-3">
              <SeverityChip severity="low" />
            </td>
            <td className="px-4 py-3">
              <PayCell
                amount={c.amount_cents}
                doctor={c.doctor_payout_cents}
                platform={c.platform_fee_cents}
                status={c.payment_status}
                currency={c.currency}
              />
            </td>
            <td className="px-4 py-3">
              <StatusChip status={c.status} />
            </td>
            <td className="px-4 py-3 text-right">
              {c.status === "pending_oversight" ? (
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    disabled={busyId === c.id}
                    onClick={() => review(c.id, "approve")}
                    className="text-xs font-semibold text-teal hover:text-navy disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    disabled={busyId === c.id}
                    onClick={() => review(c.id, "escalate")}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-800 disabled:opacity-50"
                  >
                    Book visit
                  </button>
                </div>
              ) : (
                <Link href="/doctor/oversight" className="text-xs font-semibold text-muted hover:text-ink">
                  Inbox
                </Link>
              )}
            </td>
          </tr>
        ))}
      </BoardTable>
    </div>
  );
}

function BoardTable({
  title,
  hint,
  empty,
  columns,
  children,
}: {
  title: string;
  hint: string;
  empty: string;
  columns: string[];
  children: ReactNode;
}) {
  const hasRows = Children.toArray(children).some(isValidElement);
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-muted">
            <tr>
              {columns.map((col) => (
                <th key={col || "actions"} className="px-4 py-2.5 font-medium">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {children}
            {!hasRows ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-muted">
                  {empty}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`card p-4 ${accent ? "ring-1 ring-rose-200" : ""}`}>
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 font-mono text-3xl tracking-tight text-navy">{value}</p>
    </div>
  );
}
