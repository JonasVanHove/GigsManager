"use client";

import { useState } from "react";
import type { Notification } from "@/lib/notifications";
import { formatNotificationMessage } from "@/lib/notifications";

interface NotificationCenterProps {
  notifications: Notification[];
  onMarkAsRead?: (notificationId: string) => void;
  onDismiss?: (notificationId: string) => void;
  onClearAll?: () => void;
}

export default function NotificationCenter({
  notifications,
  onMarkAsRead,
  onDismiss,
  onClearAll,
}: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);

  const unreadCount = notifications.filter((n) => n.status === "unread").length;
  const visibleNotifications = notifications.filter((n) => n.status !== "dismissed").slice(0, 10);

  return (
    <div className="relative">
      {/* Notification Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-700/50"
        title="Notifications"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 002.689 6.072m0 0a23.9 23.9 0 0135.378-3.15M9.3 20.25H3.75a1.5 1.5 0 01-1.5-1.5V15m13.875 9h3.75a1.5 1.5 0 001.5-1.5V15"
          />
        </svg>
        <span className="text-xs">Alerts</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900 z-50 max-h-96 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 dark:text-white">Notifications</h3>
            {unreadCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/40 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                {unreadCount} new
              </span>
            )}
          </div>

          {/* Notifications List */}
          <div className="overflow-y-auto flex-1">
            {visibleNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <svg className="mb-3 h-8 w-8 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 012.689 6.072m0 0a23.9 23.9 0 0135.378-3.15" />
                </svg>
                <p className="text-sm text-slate-500 dark:text-slate-400">No notifications yet</p>
              </div>
            ) : (
              visibleNotifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`border-b border-slate-100 px-4 py-3 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50 ${
                    notif.status === "unread" ? "bg-blue-50 dark:bg-blue-950/20" : ""
                  }`}
                >
                  <div className="flex gap-3">
                    {/* Icon */}
                    <div className="mt-0.5 shrink-0 text-lg">
                      {notif.icon || "📢"}
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900 dark:text-white">{notif.title}</p>
                      <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400 line-clamp-2">{notif.message}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                        {new Date(notif.createdAt).toLocaleString("nl-NL", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>

                      {/* Action Button */}
                      {notif.actionUrl && (
                        <a
                          href={notif.actionUrl}
                          className="mt-2 inline-block text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
                        >
                          {notif.actionLabel || "View"}
                        </a>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1">
                      {notif.status === "unread" && onMarkAsRead && (
                        <button
                          onClick={() => onMarkAsRead(notif.id)}
                          className="rounded p-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300 transition"
                          title="Mark as read"
                        >
                          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                          </svg>
                        </button>
                      )}
                      {onDismiss && (
                        <button
                          onClick={() => onDismiss(notif.id)}
                          className="rounded p-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300 transition"
                          title="Dismiss"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {visibleNotifications.length > 0 && (
            <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-2 flex gap-2">
              {onClearAll && (
                <button
                  onClick={onClearAll}
                  className="flex-1 rounded px-2 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  Clear All
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="flex-1 rounded bg-slate-100 px-2 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
