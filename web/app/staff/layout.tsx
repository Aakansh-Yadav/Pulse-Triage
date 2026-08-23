"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { IconLogout, IconUsers } from "@/components/icons";
import { Avatar, Logo, ScreenLoader, Wallpaper } from "@/components/ui";
import { homePath, useAuth } from "@/lib/auth";

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const { user, ready, logout } = useAuth();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace("/login");
    else if (user.role !== "staff") router.replace(homePath(user.role));
  }, [ready, user, router]);

  if (!ready || !user || user.role !== "staff") {
    return <ScreenLoader className="hud-bg" label="Opening staff board…" />;
  }

  return (
    <div className="hud-bg min-h-screen">
      <Wallpaper src="/wallpaper-hud-hd.png" position="right center" />
      <header className="sticky top-0 z-20 border-b border-line bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
          <Logo href="/staff" subtitle="Hospital staff" />
          <nav className="flex items-center gap-2 text-sm">
            <Link
              href="/staff"
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium ${
                path === "/staff" ? "bg-amber-100 text-amber-900" : "text-muted hover:bg-slate-100"
              }`}
            >
              <IconUsers className="h-4 w-4" />
              Bridge care
            </Link>
            <div className="hidden items-center gap-2 rounded-full border border-line py-1 pl-1 pr-3 sm:flex">
              <Avatar name={user.full_name} size="sm" />
              <span className="font-medium">{user.full_name.split(" ")[0]}</span>
            </div>
            <button
              onClick={() => {
                logout();
                router.push("/");
              }}
              className="focus-ring inline-flex items-center gap-1.5 rounded-full px-3 py-2 font-medium text-muted hover:bg-slate-100 hover:text-ink"
            >
              <IconLogout className="h-4 w-4" />
              Sign out
            </button>
          </nav>
        </div>
      </header>
      <div id="main" className="mx-auto max-w-6xl p-4 md:p-8">
        {children}
      </div>
    </div>
  );
}
