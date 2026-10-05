"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icons } from "./Icons";
import { useAuth } from "./AuthProvider";

export interface GigChatMessage {
  id: string;
  content: string;
  createdAt: string;
  author: { id: string; name: string };
  isSelf?: boolean;
}

interface GigChatModalProps {
  gigId: string;
  gigName: string;
  isDutch: boolean;
  /** Called after the chat has been marked read server-side (clears the badge). */
  onRead?: () => void;
  onClose: () => void;
}

/**
 * v1.47.0 — "Gig chat / Overleg" drawer for quick band logistics talk:
 * arrival times, gear list, carpooling. Standalone like the quick-notes
 * drawer: it portals over the list so you never lose the gigs you were
 * scrolling.
 *
 * Freshness comes from polling `GET .../chat?markRead=1` every 5 seconds while
 * the drawer is open and visible — both sides keep their own poll running, so
 * messages appear within seconds without a websocket layer. Each poll also
 * bumps the caller's read marker, which is what clears the unread badge on the
 * card underneath.
 */
export default function GigChatModal({
  gigId,
  gigName,
  isDutch,
  onRead,
  onClose,
}: GigChatModalProps) {
  const { getAccessToken } = useAuth();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [messages, setMessages] = useState<GigChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const copy = isDutch
    ? {
        title: "Gig chat / Overleg",
        placeholder: "Bijv. aankomst 18u, 2x DI, carpool vanaf Antwerpen...",
        send: "Versturen",
        sending: "Versturen...",
        empty: "Nog geen berichten. Start het overleg!",
        loadFailed: "Kan de chat niet laden.",
        sendFailed: "Bericht kon niet verstuurd worden.",
        forbidden: "Je hebt geen toegang tot deze gig.",
        close: "Sluiten",
        messagesLabel: "Chatberichten",
      }
    : {
        title: "Gig chat / Discussion",
        placeholder: "e.g. arrival 18:00, 2x DI, carpool from Antwerp...",
        send: "Send",
        sending: "Sending...",
        empty: "No messages yet. Start the discussion!",
        loadFailed: "Could not load the chat.",
        sendFailed: "Could not send the message.",
        forbidden: "You do not have access to this gig.",
        close: "Close",
        messagesLabel: "Chat messages",
      };

  const load = useCallback(
    async (markRead: boolean) => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const res = await fetch(
          `/api/gigs/${gigId}/chat${markRead ? "?markRead=1" : ""}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) {
          setError(res.status === 403 ? copy.forbidden : copy.loadFailed);
          return;
        }
        const data = await res.json();
        setMessages(Array.isArray(data.messages) ? data.messages : []);
        setError("");
        if (markRead) onRead?.();
      } catch {
        // Transient network failure — keep showing what we already have and
        // let the next poll retry.
        if (markRead) setError((prev) => prev || copy.loadFailed);
      } finally {
        setLoading(false);
      }
    },
    // `copy` is derived from the stable `isDutch` prop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gigId, getAccessToken, onRead, isDutch]
  );

  // Initial load + the 5s freshness loop while the drawer is open.
  useEffect(() => {
    void load(true);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 5_000);
    return () => clearInterval(timer);
  }, [load]);

  // Keep the newest message in view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // Esc closes; the drawer sits above everything else.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const send = useCallback(async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch(`/api/gigs/${gigId}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        setError(res.status === 403 ? copy.forbidden : copy.sendFailed);
        return;
      }
      const data = await res.json();
      if (data?.message) {
        setMessages((prev) =>
          prev.some((m) => m.id === data.message.id)
            ? prev
            : [...prev, data.message]
        );
      }
      setDraft("");
      setError("");
      onRead?.();
    } catch {
      setError(copy.sendFailed);
    } finally {
      setSending(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, sending, getAccessToken, gigId, onRead, isDutch]);

  if (!mounted) return null;

  const timeLocale = isDutch ? "nl-BE" : "en-GB";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={copy.title}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label={copy.close}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm dark:bg-slate-900/70"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        data-testid="gig-chat-modal"
        className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:rounded-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-sky-50 to-slate-50 px-4 py-3 dark:border-slate-700 dark:from-sky-950/40 dark:to-slate-800/40">
          <div className="flex min-w-0 items-center gap-2">
            <Icons.Chat className="h-5 w-5 shrink-0 text-sky-600 dark:text-sky-400" />
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                {copy.title}
              </h3>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {gigName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="gig-chat-close"
            aria-label={copy.close}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-slate-700/60 dark:hover:text-slate-300"
          >
            <Icons.Close className="h-4 w-4" />
          </button>
        </div>

        {/* Messages */}
        <div
          ref={listRef}
          data-testid="gig-chat-messages"
          aria-label={copy.messagesLabel}
          className="min-h-[200px] flex-1 space-y-3 overflow-y-auto px-4 py-4"
        >
          {loading && messages.length === 0 ? (
            <p className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
              <Icons.Spinner className="h-4 w-4 animate-spin" />
              {isDutch ? "Laden..." : "Loading..."}
            </p>
          ) : messages.length === 0 ? (
            <p
              data-testid="gig-chat-empty"
              className="py-8 text-center text-sm text-slate-500 dark:text-slate-400"
            >
              {copy.empty}
            </p>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                data-testid="gig-chat-message"
                className={`flex ${message.isSelf ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                    message.isSelf
                      ? "rounded-br-sm bg-sky-600 text-white dark:bg-sky-500"
                      : "rounded-bl-sm bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                  }`}
                >
                  {!message.isSelf && (
                    <p className="mb-0.5 text-xs font-semibold text-sky-700 dark:text-sky-300">
                      {message.author?.name ?? "?"}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words">
                    {message.content}
                  </p>
                  <p
                    className={`mt-1 text-right text-[10px] ${
                      message.isSelf
                        ? "text-sky-100/80"
                        : "text-slate-400 dark:text-slate-500"
                    }`}
                  >
                    {new Date(message.createdAt).toLocaleString(timeLocale, {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
              </div>
            ))
          )}

          {error && (
            <p
              data-testid="gig-chat-error"
              className="rounded-lg bg-red-50 px-3 py-2 text-center text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-400"
            >
              {error}
            </p>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/60">
          <div className="flex items-end gap-2">
            <textarea
              data-testid="gig-chat-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={2}
              maxLength={4000}
              placeholder={copy.placeholder}
              aria-label={copy.placeholder}
              className="min-h-[44px] flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            />
            <button
              type="button"
              data-testid="gig-chat-send"
              onClick={() => void send()}
              disabled={sending || draft.trim().length === 0}
              className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? (
                <Icons.Spinner className="h-4 w-4 animate-spin" />
              ) : (
                <Icons.Plus className="h-4 w-4" />
              )}
              {sending ? copy.sending : copy.send}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

