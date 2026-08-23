"use client";

import { useEffect, useState } from "react";
import { api, when } from "@/lib/api";
import { Button, EmptyState, PageHeader, SeverityChip, StatusChip } from "@/components/ui";
import type { Appointment } from "@/lib/types";

type Consult = {
  id: string;
  advice: string;
  status: string;
  doctor_name: string;
  care_plan?: string;
  created_at: string;
};

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [consults, setConsults] = useState<Consult[]>([]);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [a, c] = await Promise.all([
      api<{ appointments: Appointment[] }>("/api/appointments"),
      api<{ consults: Consult[] }>("/api/appointments/consults"),
    ]);
    setAppointments(a.appointments);
    setConsults(c.consults);
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  async function requestStaff(id: string) {
    setBusyId(id);
    setError("");
    try {
      await api(`/api/appointments/${id}/staff-assist`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach hospital staff");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Your care"
        description="In-person visits are first-come, first-served among patients Ava cannot finish online. Mild cases stay with Ava."
      />
      {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">Appointments</h2>
        {appointments.map((a) => (
          <article key={a.id} className="card space-y-3 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{when(a.scheduled_at)}</p>
                <p className="text-sm text-muted">
                  {a.doctor_name} · {a.reason}
                </p>
              </div>
              <div className="flex gap-2">
                <SeverityChip severity={a.severity} />
                <StatusChip status={a.status} />
              </div>
            </div>
            {a.staff_care_now || a.staff_assist_eligible ? (
              <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-100">
                <p className="font-semibold">You can arrive at the hospital now for staff care</p>
                <p className="mt-1 leading-relaxed text-amber-900/80">
                  Your slot with {a.doctor_name} is booked at {when(a.scheduled_at)}
                  {a.preceding_patient_name
                    ? `, after ${a.preceding_patient_name}'s appointment is done`
                    : ", after the current patient's appointment is done"}
                  . Hospital staff will stay with you until then.
                </p>
                {a.staff_assist ? (
                  <p className="mt-2 font-medium">
                    Staff {a.staff_assist.status === "in_progress" ? "are with you now" : "have been notified"}
                    {a.staff_assist.staff_name ? ` · ${a.staff_assist.staff_name}` : ""}.
                  </p>
                ) : (
                  <Button
                    variant="amber"
                    onClick={() => requestStaff(a.id)}
                    disabled={busyId === a.id}
                    className="mt-3 h-10"
                  >
                    {busyId === a.id ? "Notifying staff…" : "Get staff help now"}
                  </Button>
                )}
              </div>
            ) : null}
          </article>
        ))}
        {!appointments.length ? <EmptyState title="No clinic visits yet" hint="High-risk cases that need a doctor will appear here." /> : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">Ava consults (doctor oversight)</h2>
        {consults.map((c) => (
          <article key={c.id} className="card p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">{c.doctor_name}</p>
              <StatusChip status={c.status} />
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted">{c.care_plan || c.advice}</p>
          </article>
        ))}
        {!consults.length ? <EmptyState title="No AI consults yet" hint="Low-risk plans Ava can handle online show up here." /> : null}
      </section>
    </div>
  );
}
