"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import type { Notification } from "@/lib/notifications";

/**
 * Loads and mutates the signed-in user's notifications (v1.37.0).
 *
 * Polls on an interval rather than holding a socket open: the bell only needs
 * to be roughly current, and every dashboard render already costs a demo
 * sign-in in tests, so a cheap read beats a realtime channel here.
 */
export function useNotifications(pollMs = 60_000) {
  const { getAccessToken } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch("/api/notifications?limit=20", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const body = await res.json();
      setNotifications(Array.isArray(body.notifications) ? body.notifications : []);
    } catch {
      // The bell is supplementary; a failure must not surface as an error.
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), pollMs);
    return () => clearInterval(timer);
  }, [load, pollMs]);

  const mutate = useCallback(
    async (id: string, action: "read" | "dismiss") => {
      // Optimistic: the row reacts immediately and the poll reconciles.
      // The API's "dismiss" action stores the "dismissed" status, which is
      // what NotificationCenter filters on.
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id
            ? { ...n, status: action === "dismiss" ? "dismissed" : "read" }
            : n
        )
      );
      try {
        const token = await getAccessToken();
        if (!token) return;
        await fetch(`/api/notifications?id=${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action }),
        });
      } catch {
        // Left to the next poll to correct.
      }
    },
    [getAccessToken]
  );

  const markAsRead = useCallback((id: string) => mutate(id, "read"), [mutate]);
  const dismiss = useCallback((id: string) => mutate(id, "dismiss"), [mutate]);

  const clearAll = useCallback(async () => {
    const previous = notifications;
    setNotifications([]);
    try {
      const token = await getAccessToken();
      if (!token) return;
      await fetch("/api/notifications", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      setNotifications(previous);
    }
  }, [notifications, getAccessToken]);

  return {
    notifications,
    loading,
    refresh: load,
    markAsRead,
    dismiss,
    clearAll,
  };
}
