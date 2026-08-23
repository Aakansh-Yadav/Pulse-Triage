import Link from "next/link";
import { Logo, Wallpaper } from "@/components/ui";
import { IconChat, IconShield, IconStethoscope } from "@/components/icons";

const steps = [
  {
    n: "01",
    t: "Tell Ava what hurts",
    d: "A mobile-first intake with the AI health agent. Red flags are caught immediately.",
    icon: IconChat,
  },
  {
    n: "02",
    t: "Clinic vs online",
    d: "Only patients who need a doctor take a clinic slot, first-come first-served. Everyone Ava can help stays online. High-risk waits get hospital staff until their turn.",
    icon: IconStethoscope,
  },
  {
    n: "03",
    t: "Doctors still get paid",
    d: "Clinic visits and AI oversight both run through split payouts — Stripe or Razorpay.",
    icon: IconShield,
  },
];

export default function Home() {
  return (
    <div className="mesh min-h-full">
      <Wallpaper src="/wallpaper-care.png" position="center 35%" />
      <header className="sticky top-0 z-20 border-b border-line/70 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-1 sm:gap-2">
            <Link href="/login" className="focus-ring rounded-full px-4 py-2 text-sm font-semibold text-ink/75 hover:bg-white hover:text-ink">
              Sign in
            </Link>
            <Link href="/register" className="btn btn-primary focus-ring h-10 px-5 text-sm">
              Get care
            </Link>
          </nav>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <section className="grid items-center gap-12 py-12 lg:grid-cols-2 lg:py-20">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-teal/20 bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-teal">
              <span className="h-1.5 w-1.5 rounded-full bg-teal" />
              First come, first served
            </p>
            <h1 className="font-serif text-4xl leading-[1.12] tracking-tight text-ink sm:text-5xl lg:text-[3.4rem]">
              Fair doctor slots. Staff stay with anyone who is high risk while they wait.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
              PulseTriage splits care in two. Patients Ava can treat online never take a doctor slot. Clinic visits are
              first-come, first-served among people who actually need to see a doctor. If a high-risk patient waits,
              hospital staff stay with them so they do not deteriorate.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/register" className="btn btn-primary focus-ring h-12 px-6">
                Start a triage
              </Link>
              <Link href="/login?as=doctor" className="btn btn-secondary focus-ring h-12 px-6">
                Doctor console
              </Link>
            </div>
            <div className="mt-8 grid grid-cols-3 gap-3 max-w-md">
              {[
                { k: "AI intake", v: "Ava" },
                { k: "Queue", v: "FCFS" },
                { k: "Cover", v: "Staff" },
              ].map((item) => (
                <div key={item.k} className="rounded-2xl border border-line bg-white/80 px-3 py-3 text-center">
                  <p className="text-lg font-semibold text-navy">{item.v}</p>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{item.k}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5 sm:p-6" aria-label="Example clinic board">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted">Example · clinic board</p>
                <p className="mt-0.5 font-semibold text-ink">Your doctor’s in-person queue</p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                <span className="live-dot h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Sample
              </span>
            </div>
            <ol className="space-y-2.5">
              {[
                { time: "Next slot", name: "First high-risk patient", risk: "High", why: "Registered first · direct appointment" },
                { time: "+30 min", name: "Next high-risk patient", risk: "High", why: "Same doctor · staff covering until this slot" },
              ].map((row, i) => (
                <li
                  key={row.name}
                  className="flex items-start justify-between gap-3 rounded-2xl bg-rose-50/80 px-4 py-3.5 ring-1 ring-rose-100"
                >
                  <div className="flex gap-3">
                    <span className="mt-0.5 grid h-8 w-8 place-items-center rounded-full bg-white text-xs font-semibold text-rose-700 ring-1 ring-rose-100">
                      {i + 1}
                    </span>
                    <div>
                      <p className="font-semibold text-ink">{row.name}</p>
                      <p className="text-sm text-muted">{row.why}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm text-navy">{row.time}</p>
                    <p className="text-xs font-semibold text-rose-600">{row.risk}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs leading-relaxed text-muted">
              This card is a diagram, not live data. Mild cases stay with Ava online and never take a clinic slot. Real
              names appear only after you sign in, on your own board or appointments.
            </p>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          {steps.map((s) => (
            <article key={s.n} className="card p-6">
              <div className="flex items-center justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal/10 text-teal">
                  <s.icon className="h-5 w-5" />
                </span>
                <p className="font-mono text-xs text-teal">{s.n}</p>
              </div>
              <h2 className="mt-4 font-serif text-xl text-ink">{s.t}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.d}</p>
            </article>
          ))}
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          {[
            { href: "/register", title: "Patients", body: "Describe symptoms to Ava, skip the clinic when care can stay online, and keep a clear appointment list.", cta: "Create a patient account", icon: IconChat },
            { href: "/login?as=doctor", title: "Clinicians", body: "See the in-person board, review Ava’s low-risk plans, and track split payouts in one console.", cta: "Open doctor console", icon: IconStethoscope },
          ].map((item) => (
            <Link key={item.title} href={item.href} className="card group p-6 transition hover:-translate-y-0.5 hover:shadow-lg">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-navy/5 text-navy">
                <item.icon className="h-5 w-5" />
              </span>
              <h2 className="mt-4 text-lg font-semibold">{item.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
              <p className="mt-4 text-sm font-semibold text-teal group-hover:underline">{item.cta} →</p>
            </Link>
          ))}
        </section>
      </main>

      <footer className="border-t border-line/80 bg-white/70">
        <div className="mx-auto flex max-w-6xl items-center px-4 py-6 text-sm text-muted sm:px-6">
          <p>PulseTriage · clinical routing for fair, staff-backed care</p>
        </div>
      </footer>
    </div>
  );
}
