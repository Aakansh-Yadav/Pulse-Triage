import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { IconPulse } from "./icons";

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function Wallpaper({
  src,
  position = "center center",
}: {
  src: string;
  position?: string;
}) {
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      width={1536}
      height={1024}
      decoding="async"
      fetchPriority="high"
      className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover"
      style={{ objectPosition: position }}
    />
  );
}

export function Logo({
  href = "/",
  invert = false,
  subtitle,
}: {
  href?: string;
  invert?: boolean;
  subtitle?: string;
}) {
  return (
    <Link href={href} className="focus-ring flex items-center gap-2.5 rounded-xl">
      <span
        className={cn(
          "grid h-9 w-9 place-items-center rounded-xl shadow-sm",
          invert ? "bg-teal-400 text-navy" : "bg-teal text-white",
        )}
      >
        <IconPulse className="h-5 w-5" />
      </span>
      <span className="leading-tight">
        <span className={cn("block text-[15px] font-semibold tracking-tight", invert ? "text-white" : "text-ink")}>
          PulseTriage
        </span>
        <span className={cn("block text-[11px] font-medium", invert ? "text-white/60" : "text-muted")}>
          {subtitle ?? "Clinical care routing"}
        </span>
      </span>
    </Link>
  );
}

export function SeverityChip({ severity }: { severity: "high" | "low" | string }) {
  const high = severity === "high";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide",
        high ? "bg-rose-50 text-rose-700 ring-1 ring-rose-100" : "bg-teal-50 text-teal-800 ring-1 ring-teal-100",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", high ? "bg-rose-600" : "bg-teal-600")} />
      {high ? "High risk" : "Low risk"}
    </span>
  );
}

const statusTone: Record<string, string> = {
  scheduled: "bg-teal-50 text-teal-800 ring-teal-100",
  completed: "bg-emerald-50 text-emerald-800 ring-emerald-100",
  cancelled: "bg-slate-100 text-slate-600 ring-slate-200",
  pending_payment: "bg-amber-50 text-amber-800 ring-amber-100",
  pending_oversight: "bg-sky-50 text-sky-800 ring-sky-100",
  in_progress: "bg-amber-50 text-amber-800 ring-amber-100",
  requested: "bg-amber-50 text-amber-800 ring-amber-100",
  waitlisted: "bg-violet-50 text-violet-800 ring-violet-100",
};

export function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ring-1",
        statusTone[status] || "bg-slate-50 text-slate-600 ring-slate-200",
      )}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-navy font-semibold text-white",
        size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm",
      )}
      aria-hidden
    >
      {initials || "PT"}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        {eyebrow ? (
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-teal">{eyebrow}</p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1.5 text-sm leading-relaxed text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-white/60 px-4 py-8 text-center">
      <p className="font-medium text-ink">{title}</p>
      {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
    </div>
  );
}

export function ScreenLoader({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("clinical-bg grid min-h-full place-items-center", className)}>
      <div className="flex items-center gap-3 text-muted">
        <span className="live-dot h-2.5 w-2.5 rounded-full bg-teal" />
        <span className="text-sm font-medium">{label}</span>
      </div>
    </div>
  );
}

export function Button({
  variant = "primary",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "navy" | "secondary" | "amber" | "ghost";
}) {
  return (
    <button className={cn("btn", `btn-${variant}`, "focus-ring", className)} {...props}>
      {children}
    </button>
  );
}
