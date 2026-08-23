"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { IconCalendar, IconClipboard, IconLogout, IconStethoscope, IconWallet } from "@/components/icons";
import { Avatar, Logo, ScreenLoader, Wallpaper } from "@/components/ui";
import { homePath, useAuth } from "@/lib/auth";

const links = [
  { href: "/doctor", label: "Board", icon: IconStethoscope },
  { href: "/doctor/schedule", label: "Live schedule", icon: IconCalendar },
  { href: "/doctor/oversight", label: "AI oversight", icon: IconClipboard },
  { href: "/doctor/earnings", label: "Payouts", icon: IconWallet },
];

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  const { user, ready, logout } = useAuth();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace("/login");
    else if (user.role !== "doctor") router.replace(homePath(user.role));
  }, [ready, user, router]);

  if (!ready || !user || user.role !== "doctor") {
    return <ScreenLoader className="hud-bg" label="Opening clinician console…" />;
  }

  function signOut() {
    logout();
    router.push("/");
  }

  return (
    <div className="hud-bg min-h-screen">
      <Wallpaper src="/wallpaper-hud-hd.png" position="right center" />
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-line bg-white md:flex md:flex-col">
          <div className="px-5 py-5">
            <Logo href="/doctor" subtitle="Clinician console" />
          </div>
          <nav className="flex-1 space-y-1 px-3" aria-label="Doctor">
            {links.map((l) => {
              const active = path === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    active ? "bg-teal text-white shadow-sm" : "text-ink/70 hover:bg-slate-50 hover:text-ink"
                  }`}
                >
                  <l.icon className="h-4 w-4" />
                  {l.label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-line p-4">
            <div className="flex items-center gap-3">
              <Avatar name={user.full_name} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{user.full_name}</p>
                <p className="text-xs text-muted">Clinician</p>
              </div>
            </div>
            <button
              onClick={signOut}
              className="focus-ring mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-muted hover:bg-slate-50 hover:text-ink"
            >
              <IconLogout className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-line bg-white px-4 py-3 md:hidden">
            <Logo href="/doctor" subtitle="Clinician console" />
            <button onClick={signOut} className="text-sm font-medium text-muted">
              Sign out
            </button>
          </header>
          <nav className="flex gap-1 overflow-x-auto border-b border-line bg-white px-3 py-2 md:hidden">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${
                  path === l.href ? "bg-teal text-white" : "text-muted"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div id="main" className="flex-1 p-4 md:p-8">
            <div className="mx-auto max-w-6xl">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
