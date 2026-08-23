"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Logo, Wallpaper } from "@/components/ui";
import { homePath, useAuth } from "@/lib/auth";

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="mesh min-h-full" />}>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const { register } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const asDoctor = params.get("as") === "doctor";
  const role = asDoctor ? "doctor" : "patient";
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const nextName = String(form.get("fullName") ?? "").trim();
    const nextEmail = String(form.get("email") ?? "").trim();
    const nextPassword = String(form.get("password") ?? "");
    setFullName(nextName);
    setEmail(nextEmail);
    setPassword(nextPassword);
    setBusy(true);
    setError("");
    try {
      const user = await register({ email: nextEmail, password: nextPassword, fullName: nextName, role });
      router.push(homePath(user.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not register");
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
        <Logo href="/" invert subtitle="Create your workspace" />
        <div className="relative z-10 mt-auto max-w-md pb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300">
            {asDoctor ? "For clinicians" : "For patients"}
          </p>
          <h2 className="mt-3 font-serif text-4xl leading-tight">
            {asDoctor ? "Join the clinic board and get paid for every case you oversee." : "Start with Ava. Only take a doctor slot if you truly need one."}
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-white/70">
            {asDoctor
              ? "This is the doctor console: clinic board, Ava oversight, and payouts. It is not for booking your own symptoms."
              : "After this, you chat with Ava about what feels wrong. Doctors use a separate console."}
          </p>
        </div>
      </aside>

      <div className="flex min-h-full flex-col">
        <header className="px-4 py-5 sm:px-8 lg:hidden">
          <Logo />
        </header>
        <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-16 sm:px-6">
          <h1 className="font-serif text-3xl tracking-tight">
            {asDoctor ? "Create a clinician account" : "Create your patient account"}
          </h1>
          <p className="mt-2 text-muted">
            {asDoctor
              ? "This is the doctor console: clinic board, Ava oversight, and payouts. It is not for booking your own symptoms."
              : "This is for patients. After this, you chat with Ava about what feels wrong. Doctors use a separate console."}
          </p>
          <form onSubmit={onSubmit} className="card mt-6 space-y-4 p-6">
            <label className="block text-sm font-medium">
              Full name
              <input
                className="field mt-1.5"
                name="fullName"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </label>
            <label className="block text-sm font-medium">
              Email
              <input
                className="field mt-1.5"
                type="email"
                name="email"
                autoComplete="email"
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
                autoComplete="new-password"
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <span className="mt-1 block text-xs font-normal text-muted">At least 6 characters</span>
            </label>
            {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
            <Button className="w-full" disabled={busy}>
              {busy ? "Creating…" : asDoctor ? "Open doctor console" : "Continue to Ava"}
            </Button>
          </form>
          <p className="mt-5 text-sm text-muted">
            Already registered?{" "}
            <Link href={asDoctor ? "/login?as=doctor" : "/login"} className="font-semibold text-teal hover:underline">
              Sign in
            </Link>
          </p>
        </main>
      </div>
    </div>
  );
}
