"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { IconCalendar, IconChat, IconHome, IconLogout } from "@/components/icons";
import { Avatar, Logo, ScreenLoader, Wallpaper } from "@/components/ui";
import { homePath, useAuth } from "@/lib/auth";

const links = [
  { href: "/patient", label: "Home", icon: IconHome },
  { href: "/patient/triage", label: "Triage with Ava", icon: IconChat },
  { href: "/patient/appointments", label: "Appointments", icon: IconCalendar },
];

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  const { user, ready, logout } = useAuth();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace("/login");
    else if (user.role !== "patient") router.replace(homePath(user.role));
  }, [ready, user, router]);

  if (!ready || !user || user.role !== "patient") {
    return <ScreenLoader label="Opening your care portal…" />;
  }

  return (
    <div className="clinical-bg min-h-full">
      <Wallpaper src="/wallpaper-care.png" position="center 35%" />
      <header className="sticky top-0 z-20 border-b border-line/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Logo href="/patient" subtitle="Patient portal" />
          <nav className="hidden items-center gap-1 sm:flex" aria-label="Patient">
            {links.map((l) => {
              const active = path === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                    active ? "bg-navy text-white" : "text-ink/70 hover:bg-slate-100"
                  }`}
                >
                  <l.icon className="h-4 w-4" />
                  {l.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-line bg-white py-1 pl-1 pr-3 sm:flex">
              <Avatar name={user.full_name} size="sm" />
              <span className="text-sm font-medium">{user.full_name.split(" ")[0]}</span>
            </div>
            <button
              onClick={() => {
                logout();
                router.push("/");
              }}
              className="focus-ring inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-muted hover:bg-slate-100 hover:text-ink"
            >
              <IconLogout className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-4 pb-3 sm:hidden" aria-label="Patient mobile">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ${
                path === l.href ? "bg-navy text-white" : "bg-white text-ink/70 ring-1 ring-line"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </header>
      <div id="main" className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </div>
    </div>
  );
}
