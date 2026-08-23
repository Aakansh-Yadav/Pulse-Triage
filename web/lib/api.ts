const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4000/ws";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, options: { method?: string; body?: unknown; token?: string | null } = {}): Promise<T> {
  const token = options.token ?? (typeof window !== "undefined" ? localStorage.getItem("pt_token") : null);
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(
      503,
      "Can't reach the PulseTriage API. From the project root run npm run dev so the API is listening on port 4000.",
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || "Request failed");
  return data as T;
}

export function money(cents: number, currency = "usd") {
  const n = Number(cents) || 0;
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(n / 100);
}

export function when(iso?: string | Date | null) {
  if (!iso) return "—";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export function clock(iso?: string | Date | null) {
  if (!iso) return "—";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(d);
}
