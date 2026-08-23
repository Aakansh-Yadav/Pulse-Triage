"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, money, when } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, SeverityChip } from "@/components/ui";
import { IconSend, IconSpark } from "@/components/icons";
import { parseSession, type ChatMessage, type TriageSession } from "@/lib/types";

type Finalize = {
  session: TriageSession;
  doctor: { id: string; name?: string; specialty: string };
  appointment?: { id: string; scheduled_at: string; severity: string; status: string } | null;
  placement?: {
    position: number;
    staff_care_now: boolean;
    doctor_name: string;
    scheduled_at: string;
    preceding: { patient_name: string; scheduled_at: string } | null;
  } | null;
  consult?: { id: string; advice: string } | null;
  payment?: {
    payment: {
      amount_cents: number;
      doctor_payout_cents: number;
      platform_fee_cents: number;
      provider: string;
      status: string;
    };
    client: { demo: boolean };
  };
};

export default function TriagePage() {
  const { token, ready } = useAuth();
  const [session, setSession] = useState<TriageSession | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [awaitingReply, setAwaitingReply] = useState(false);
  const [starting, setStarting] = useState(true);
  const [result, setResult] = useState<Finalize | null>(null);
  const [error, setError] = useState("");
  const [doctors, setDoctors] = useState<Array<{ id: string; name?: string; specialty: string }>>([]);
  const [doctorId, setDoctorId] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const applySession = (raw: TriageSession) => {
    const next = parseSession(raw);
    setSession(next);
    return next;
  };

  const startSession = useCallback(async () => {
    const data = await api<{ session: TriageSession }>("/api/triage/sessions", { method: "POST", token });
    return applySession(data.session);
  }, [token]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setStarting(true);
    startSession()
      .then(() => {
        if (!cancelled) setError("");
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not start triage");
      })
      .finally(() => {
        if (!cancelled) setStarting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, startSession]);

  useEffect(() => {
    api<{ doctors: Array<{ id: string; name?: string; specialty: string }> }>("/api/triage/doctors", { token })
      .then((d) => {
        setDoctors(d.doctors);
        setDoctorId((current) => current || d.doctors[0]?.id || "");
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [session?.messages.length, awaitingReply]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sending = useRef(false);
  const messages: ChatMessage[] = (session?.messages || []).filter((m, i, arr) => {
    if (m.role !== "assistant") return true;
    return m.content !== arr[i - 1]?.content;
  });
  const closed = Boolean(session && session.status !== "in_progress");

  async function send(e?: FormEvent) {
    e?.preventDefault();
    if (!text.trim() || busy || closed || sending.current) return;
    const content = text.trim();
    setText("");
    setBusy(true);
    setAwaitingReply(true);
    sending.current = true;
    setError("");
    try {
      let current = session;
      if (!current) current = await startSession();
      const data = await api<{ session: TriageSession }>("/api/triage/sessions/" + current.id + "/message", {
        method: "POST",
        body: { content },
        token,
      });
      applySession(data.session);
    } catch (err) {
      setText(content);
      setError(err instanceof Error ? err.message : "Could not send");
    } finally {
      sending.current = false;
      setBusy(false);
      setAwaitingReply(false);
      inputRef.current?.focus();
    }
  }

  async function finalize() {
    if (busy || closed) return;
    setBusy(true);
    setError("");
    try {
      let current = session;
      if (!current) current = await startSession();
      const data = await api<Finalize>("/api/triage/sessions/" + current.id + "/finalize", {
        method: "POST",
        token,
        body: doctorId ? { doctorId } : {},
      });
      applySession(data.session);
      setResult({
        ...data,
        session: parseSession(data.session),
        placement: data.placement ?? (data.appointment as { placement?: Finalize["placement"] } | null)?.placement ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not classify");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="card flex min-h-[70vh] flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-teal text-white">
            <IconSpark className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold">Ava</h1>
            <p className="text-sm text-muted">AI health agent · not emergency care</p>
          </div>
        </div>
        <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto bg-slate-50/70 px-4 py-4" aria-live="polite">
          {starting && !messages.length ? (
            <p className="text-sm text-muted">Starting Ava…</p>
          ) : null}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <p
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed shadow-sm ${
                  m.role === "user" ? "rounded-br-md bg-navy text-white" : "rounded-bl-md bg-white text-ink ring-1 ring-line"
                }`}
              >
                {m.content}
              </p>
            </div>
          ))}
          {awaitingReply ? (
            <div className="flex justify-start">
              <p className="inline-flex items-center gap-1 rounded-2xl rounded-bl-md bg-white px-4 py-3 ring-1 ring-line">
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-teal" />
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-teal [animation-delay:150ms]" />
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-teal [animation-delay:300ms]" />
                <span className="sr-only">Ava is typing</span>
              </p>
            </div>
          ) : null}
        </div>
        <form onSubmit={send} className="border-t border-line bg-white p-3">
          <label htmlFor="symptom" className="sr-only">
            Message Ava
          </label>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              id="symptom"
              className="field flex-1 rounded-full px-4"
              placeholder="Describe what you feel…"
              value={text}
              autoComplete="off"
              onChange={(e) => setText(e.target.value)}
              disabled={busy || closed || starting || !session}
            />
            <Button className="rounded-full px-5" disabled={busy || closed || starting || !session}>
              <IconSend className="h-4 w-4" />
              Send
            </Button>
          </div>
          {error ? (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <p className="text-sm text-rose-700">{error}</p>
              {/session expired|sign in required/i.test(error) ? (
                <Link href="/login" className="text-sm font-semibold text-teal">
                  Sign in again
                </Link>
              ) : (
                <button
                  type="button"
                  className="text-sm font-semibold text-teal"
                  onClick={() => {
                    setError("");
                    setStarting(true);
                    startSession()
                      .catch((e) => setError(e instanceof Error ? e.message : "Could not start triage"))
                      .finally(() => setStarting(false));
                  }}
                >
                  Retry
                </button>
              )}
            </div>
          ) : null}
        </form>
      </section>

      <aside className="space-y-4">
        <div className="card p-5">
          <h2 className="font-semibold">Route me</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            When you have described the problem, Ava classifies risk. If she can help online, you skip the clinic queue.
            If you need a doctor, pick the clinician below. New doctors you register are listed first — not the demo
            account. The first high-risk patient on that doctor gets the next open slot; each following patient on the
            same doctor is booked 30 minutes later and can arrive now for staff care.
          </p>
          {doctors.length ? (
            <label className="mt-4 block text-sm font-medium">
              Clinician
              <select
                className="field mt-1.5 h-11"
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
                disabled={busy || closed || starting || !session}
              >
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name || "Clinician"} · {d.specialty}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <Button variant="navy" onClick={finalize} disabled={busy || closed || starting || !session} className="mt-4 w-full">
            Classify &amp; schedule
          </Button>
        </div>

        {result ? (
          <div className="card space-y-3 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Result</h2>
              <SeverityChip severity={result.session.severity || "low"} />
            </div>
            <p className="text-sm leading-relaxed text-ink/75">{result.session.ai_summary}</p>
            {result.appointment ? (
              <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-950 ring-1 ring-rose-100">
                {result.placement?.staff_care_now
                  ? `You can arrive at the hospital now for staff care. Your appointment with ${result.doctor.name} is booked at ${when(result.appointment.scheduled_at)}, after ${result.placement.preceding?.patient_name || "the current patient"}'s visit is done.`
                  : `Your appointment is booked with ${result.doctor.name} at ${when(result.appointment.scheduled_at)}. Please come in for this slot.`}
              </p>
            ) : null}
            {result.consult ? (
              <div>
                <p className="text-sm text-ink/75">{result.session.care_plan}</p>
                <p className="mt-2 text-xs text-muted">{result.doctor.name} is paid to oversee this AI plan.</p>
              </div>
            ) : null}
            {result.payment ? (
              <p className="rounded-xl bg-slate-50 px-3 py-2 font-mono text-xs text-ink/80">
                {money(result.payment.payment.amount_cents)} · doctor {money(result.payment.payment.doctor_payout_cents)} ·
                platform {money(result.payment.payment.platform_fee_cents)}
                {result.payment.client.demo ? " · demo checkout captured" : ""}
              </p>
            ) : null}
            <Link href="/patient/appointments" className="inline-flex text-sm font-semibold text-teal hover:underline">
              View my schedule →
            </Link>
          </div>
        ) : null}

        <div className="rounded-2xl border border-dashed border-line bg-white/70 p-4 text-sm text-muted">
          Try: “mild sore throat for two days” (low) vs “crushing chest pain radiating to my left arm” (high).
        </div>
      </aside>
    </div>
  );
}
