"use client";

import { useEffect, useState } from "react";
import { api, WS_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Appointment } from "@/lib/types";

export function useDoctorQueue() {
  const { token, user } = useAuth();
  const [queue, setQueue] = useState<Appointment[]>([]);
  const [lastEvent, setLastEvent] = useState<string>("");

  useEffect(() => {
    if (!token) return;
    api<{ queue: Appointment[] }>("/api/doctors/me/queue")
      .then((d) => setQueue(d.queue as Appointment[]))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "schedule.updated" && Array.isArray(msg.queue)) {
          if (msg.doctorId && user?.doctor_id && msg.doctorId !== user.doctor_id) return;
          setQueue(msg.queue);
          setLastEvent(msg.at || new Date().toISOString());
        }
      } catch {
        /* ignore */
      }
    };
    return () => ws.close();
  }, [token, user?.doctor_id]);

  return { queue, lastEvent, setQueue };
}
