"use client";

import { useState } from "react";
import { Icons } from "./Icons";
import type { Notification } from "@/lib/notifications";
import { formatNotificationMessage } from "@/lib/notifications";
import { formatDateTime } from "@/lib/preferences";
import { useSettings } from "./SettingsProvider";

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
  const { language } = useSettings();
  const [isOpen, setIsOpen] = useState(false);

  const unreadCount = notifications.filter((n) => n.status === "unread").length;
  const visibleNotifications = notifications.filter((n) => n.status !== "dismissed").slice(0, 10);
  const copy = language === "nl"
    ? {
        notifications: "Meldingen",
        alerts: "Meldingen",
        new: "nieuw",
        noNotificationsYet: "Nog geen meldingen",
        view: "Bekijken",
        markAsRead: "Markeren als gelezen",
        dismiss: "Verbergen",
        clearAll: "Alles wissen",
        close: "Sluiten",
      }
    : {
        notifications: "Notifications",
        alerts: "Alerts",
        new: "new",
        noNotificationsYet: "No notifications yet",
        view: "View",
        markAsRead: "Mark as read",
        dismiss: "Dismiss",
        clearAll: "Clear All",
        close: "Close",
      };

  return (
    <div className="relative">
      {/* Notification Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative inline-flex items-center gap-2 rounded-lg border border-slate-200/50 bg-slate-50/50 backdrop-blur dark:border-slate-700/50 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 dark:bg-slate-800/30 transition-all duration-200 hover:bg-slate-100/60 dark:hover:bg-slate-700/50 hover:shadow-sm"
        title={copy.notifications}
      >
        <Icons.Phone className="h-4 w-4" />
        <span className="text-xs">{copy.alerts}</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-red-600 text-xs font-bold text-white shadow-lg">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 rounded-xl border border-slate-200/50 bg-white/95 dark:border-slate-700/50 dark:bg-slate-900/95 backdrop-blur shadow-xl dark:shadow-2xl z-50 max-h-96 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="border-b border-slate-200/50 dark:border-slate-700/50 px-4 py-4 flex items-center justify-between bg-gradient-to-r from-slate-50 to-slate-50/50 dark:from-slate-800/30 dark:to-slate-800/10">
            <h3 className="font-semibold text-slate-900 dark:text-white">{copy.notifications}</h3>
            {unreadCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-blue-100/70 dark:bg-blue-900/40 px-3 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 backdrop-blur">
                {unreadCount} {copy.new}
              </span>
            )}
          </div>

          {/* Notifications List */}
          <div className="overflow-y-auto flex-1">
            {visibleNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Icons.Phone className="mb-3 h-8 w-8 text-slate-300 dark:text-slate-600" />
                <p className="text-sm text-slate-500 dark:text-slate-400">{copy.noNotificationsYet}</p>
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
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDateTime(notif.createdAt)}
                      </p>

                      {/* Action Button */}
                      {notif.actionUrl && (
                        <a
                          href={notif.actionUrl}
                          className="mt-2 inline-block text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
                        >
                          {notif.actionLabel || copy.view}
                        </a>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1">
                      {notif.status === "unread" && onMarkAsRead && (
                        <button
                          onClick={() => onMarkAsRead(notif.id)}
                          className="rounded p-1 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300 transition"
                          title={copy.markAsRead}
                        >
                          <Icons.Check className="h-4 w-4" />
                        </button>
                      )}
                      {onDismiss && (
                        <button
                          onClick={() => onDismiss(notif.id)}
                          className="rounded p-1 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300 transition"
                          title={copy.dismiss}
                        >
                          <Icons.Close className="h-4 w-4" />
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
                  {copy.clearAll}
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="flex-1 rounded bg-slate-100 px-2 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                {copy.close}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
