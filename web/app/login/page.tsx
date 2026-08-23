"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Logo, Wallpaper } from "@/components/ui";
import { homePath, useAuth } from "@/lib/auth";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="mesh min-h-full" />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const asDoctor = params.get("as") === "doctor";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const nextEmail = String(form.get("email") ?? "").trim();
    const nextPassword = String(form.get("password") ?? "");
    setEmail(nextEmail);
    setPassword(nextPassword);
    setBusy(true);
    setError("");
    try {
      const user = await login(nextEmail, nextPassword);
      if (asDoctor && user.role !== "doctor") {
        setError("This console is for doctors. Use Start a triage for patient care.");
        return;
      }
      if (!asDoctor && user.role === "doctor") {
        router.push("/doctor");
        return;
      }
      router.push(homePath(user.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  async function asDemo(kind: "patient" | "doctor" | "staff") {
    const nextEmail = kind === "doctor" ? "doctor@demo.com" : kind === "staff" ? "staff@demo.com" : "patient@demo.com";
    setEmail(nextEmail);
    setPassword("demo1234");
    setBusy(true);
    setError("");
    try {
      const user = await login(nextEmail, "demo1234");
      router.push(homePath(user.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mesh grid min-h-full lg:grid-cols-[1.05fr_0.95fr]">
      <Wallpaper
        src={asDoctor ? "/wallpaper-hud-hd.png" : "/wallpaper-care.png"}
        position={asDoctor ? "right center" : "center 35%"}
      />
      <aside className="relative hidden flex-col overflow-hidden bg-navy/80 px-10 py-8 text-white lg:flex">
        <Logo href="/" invert subtitle="Secure clinical access" />
        <div className="relative z-10 mt-auto max-w-md pb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300">
            {asDoctor ? "Clinician workspace" : "Patient access"}
          </p>
          <h2 className="mt-3 font-serif text-4xl leading-tight">
            {asDoctor ? "Your board, oversight inbox, and payouts — in one place." : "Continue care with Ava, then keep every visit in view."}
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-white/70">
            {asDoctor
              ? "High-risk clinic slots stay first-come, first-served. Low-risk plans stay online until you review them."
              : "Describe symptoms once. If you need a doctor, hospital staff cover any high-risk wait until your booked turn."}
          </p>
        </div>
      </aside>

      <div className="flex min-h-full flex-col">
        <header className="px-4 py-5 sm:px-8 lg:hidden">
          <Logo />
        </header>
        <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-16 sm:px-6">
          <h1 className="font-serif text-3xl tracking-tight">{asDoctor ? "Doctor console" : "Welcome back"}</h1>
          <p className="mt-2 text-muted">
            {asDoctor
              ? "Sign in to the clinic board, Ava oversight inbox, and payouts."
              : "Sign in to continue with Ava and your appointments."}
          </p>
          <form onSubmit={onSubmit} className="card mt-6 space-y-4 p-6">
            <label className="block text-sm font-medium">
              Email
              <input
                className="field mt-1.5"
                type="email"
                name="email"
                autoComplete="email"
                placeholder="you@clinic.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label className="block text-sm font-medium">
              Password
              <input
                className="field mt-1.5"
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
            <Button className="w-full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
            {asDoctor ? (
              <Button type="button" variant="secondary" onClick={() => asDemo("doctor")} className="w-full">
                Demo doctor
              </Button>
            ) : (
              <Button type="button" variant="secondary" onClick={() => asDemo("patient")} className="w-full">
                Demo patient
              </Button>
            )}
          </form>
          {asDoctor ? (
            <p className="mt-5 text-sm text-muted">
              New clinician?{" "}
              <Link href="/register?as=doctor" className="font-semibold text-teal hover:underline">
                Create a doctor account
              </Link>
            </p>
          ) : (
            <p className="mt-5 text-sm text-muted">
              New patient?{" "}
              <Link href="/register" className="font-semibold text-teal hover:underline">
                Create a patient account
              </Link>
            </p>
          )}
        </main>
      </div>
    </div>
  );
}
