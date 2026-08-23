"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, when } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { EmptyState, SeverityChip, StatusChip } from "@/components/ui";
import { IconAlert, IconCalendar, IconChat } from "@/components/icons";
import type { Appointment, TriageSession } from "@/lib/types";

export default function PatientHome() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [sessions, setSessions] = useState<TriageSession[]>([]);

  useEffect(() => {
    api<{ appointments: Appointment[] }>("/api/appointments").then((d) => setAppointments(d.appointments)).catch(() => {});
    api<{ sessions: TriageSession[] }>("/api/triage/sessions").then((d) => setSessions(d.sessions)).catch(() => {});
  }, []);

  const next = appointments.find((a) => a.status === "scheduled" || a.status === "pending_payment");
  const firstName = user?.full_name.split(" ")[0] || "there";

  return (
    <div className="space-y-6">
      <section className="card overflow-hidden">
        <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.3fr_0.7fr]">
          <div>
            <p className="text-sm font-medium text-teal">Good to see you, {firstName}</p>
            <h1 className="mt-1 font-serif text-3xl tracking-tight sm:text-4xl">How can Ava help today?</h1>
            <p className="mt-3 max-w-xl leading-relaxed text-muted">
              Describe your symptoms. If Ava can help online, you will not take a doctor slot. Only people who need a
              clinician join the first-come clinic list. If you are high risk and wait, hospital staff stay with you.
            </p>
            <Link href="/patient/triage" className="btn btn-primary focus-ring mt-6 h-12 px-6">
              <IconChat className="h-4 w-4" />
              Start symptom triage
            </Link>
          </div>
          <div className="rounded-2xl bg-slate-50 p-5 ring-1 ring-line">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">Care snapshot</p>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Upcoming visits</dt>
                <dd className="font-semibold">{appointments.filter((a) => a.status === "scheduled").length}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Triage sessions</dt>
                <dd className="font-semibold">{sessions.length}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Signed in as</dt>
                <dd className="truncate font-semibold">{user?.full_name}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {next ? (
        <article className="card p-5 sm:p-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted">
            <IconCalendar className="h-4 w-4 text-teal" />
            Next visit
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">{when(next.scheduled_at)}</h2>
              <p className="text-muted">
                {next.doctor_name} · {next.reason}
              </p>
              {next.staff_care_now ? (
                <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-100">
                  You can arrive now for staff care. This slot is after
                  {next.preceding_patient_name ? ` ${next.preceding_patient_name}'s` : " the current"} visit with{" "}
                  {next.doctor_name}.
                </p>
              ) : null}
            </div>
            <div className="flex gap-2">
              <SeverityChip severity={next.severity} />
              <StatusChip status={next.status} />
            </div>
          </div>
        </article>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2">
        <div className="card p-5 sm:p-6">
          <h2 className="font-semibold">Recent triage</h2>
          <ul className="mt-3 space-y-3">
            {sessions.slice(0, 4).map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
                <span className="text-ink/80">{s.chief_complaint || "Open session"}</span>
                {s.severity ? <SeverityChip severity={s.severity} /> : <StatusChip status={s.status} />}
              </li>
            ))}
            {!sessions.length ? <li><EmptyState title="No sessions yet" hint="Start a triage to see history here." /></li> : null}
          </ul>
        </div>
        <div className="card border-rose-100 p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-rose-50 text-rose-600">
              <IconAlert className="h-4 w-4" />
            </span>
            <h2 className="font-semibold">If this is an emergency</h2>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Chest pain, trouble breathing, stroke signs, severe bleeding, or suicidal thoughts: call local emergency
            services. Ava will still flag you as high risk so a doctor follows up.
          </p>
        </div>
      </section>
    </div>
  );
}
