// Notification types and interfaces
export type NotificationType =
  | "payment_received"
  | "payment_overdue"
  | "upcoming_gig"
  | "band_paid"
  | "rsvp_changed"
  | "custom";
export type NotificationStatus = "unread" | "read" | "dismissed";

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  icon?: string;
  actionUrl?: string;
  actionLabel?: string;
  status: NotificationStatus;
  createdAt: Date;
  readAt?: Date;
  dismissedAt?: Date;
}

export interface NotificationPreference {
  id: string;
  userId: string;
  emailNotifications: boolean;
  inAppNotifications: boolean;
  paymentReminders: boolean;
  overdueAlerts: boolean;
  upcomingGigReminders: boolean;
  dailyDigest: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Helper to create notifications
export function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  options?: {
    icon?: string;
    actionUrl?: string;
    actionLabel?: string;
  }
): Notification {
  return {
    id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    userId,
    type,
    title,
    message,
    status: "unread",
    createdAt: new Date(),
    ...options,
  };
}

// Helper to format notification by type
export function formatNotificationMessage(
  type: NotificationType,
  data: Record<string, any>
): { title: string; message: string; icon: string } {
  switch (type) {
    case "payment_received":
      return {
        title: "Payment Received ✓",
        message: `Payment of ${data.amount} received for ${data.event}`,
        icon: "💰",
      };
    case "payment_overdue":
      return {
        title: "Payment Overdue ⚠️",
        message: `${data.amount} owed for ${data.event} (due ${data.date})`,
        icon: "⏰",
      };
    case "upcoming_gig":
      return {
        title: "Upcoming Performance",
        message: `${data.event} in ${data.days} days with ${data.performers}`,
        icon: "🎵",
      };
    case "band_paid":
      return {
        title: "Band Payment Sent",
        message: `${data.amount} paid to band for ${data.event}`,
        icon: "✅",
      };
    case "rsvp_changed":
      return {
        title: "Attendance updated",
        message: `${data.member} is ${data.statusLabel} for ${data.event}`,
        icon: data.icon || "📋",
      };
    case "custom":
    default:
      return {
        title: data.title || "Notification",
        message: data.message || "",
        icon: data.icon || "📢",
      };
  }
}
