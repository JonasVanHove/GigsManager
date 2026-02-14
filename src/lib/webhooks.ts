// Webhook types and interfaces
export type WebhookEvent = "payment_received" | "payment_overdue" | "band_paid" | "upcoming_gig" | "gig_completed";
export type WebhookProvider = "discord" | "n8n" | "custom";

export interface Webhook {
  id: string;
  userId: string;
  provider: WebhookProvider;
  url: string;
  events: WebhookEvent[];
  enabled: boolean;
  name?: string;
  secret?: string;
  createdAt: Date;
  updatedAt: Date;
  lastTriggeredAt?: Date;
}

// Event payload types
export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: Date;
  data: Record<string, any>;
}

// Discord payload formatter
export function formatDiscordMessage(
  event: WebhookEvent,
  data: Record<string, any>
): { embeds: any[] } {
  const timestamp = new Date().toISOString();
  let color = 0x3b82f6; // blue
  let title = "";
  let description = "";

  switch (event) {
    case "payment_received":
      color = 0x10b981; // green
      title = "💰 Payment Received";
      description = `**Amount:** ${data.amount}\n**Event:** ${data.event}\n**Date:** ${data.date}`;
      break;

    case "payment_overdue":
      color = 0xef4444; // red
      title = "⚠️ Payment Overdue";
      description = `**Amount:** ${data.amount}\n**Event:** ${data.event}\n**Due:** ${data.dueDate}`;
      break;

    case "band_paid":
      color = 0x8b5cf6; // purple
      title = "✅ Band Payment Sent";
      description = `**Amount:** ${data.amount}\n**Event:** ${data.event}\n**Date:** ${data.date}`;
      break;

    case "upcoming_gig":
      color = 0xf59e0b; // amber
      title = "🎵 Upcoming Performance";
      description = `**Event:** ${data.event}\n**Performers:** ${data.performers}\n**In:** ${data.daysUntil} days`;
      break;

    case "gig_completed":
      color = 0x06b6d4; // cyan
      title = "🎉 Gig Completed";
      description = `**Event:** ${data.event}\n**Earnings:** ${data.earnings}\n**Date:** ${data.date}`;
      break;
  }

  return {
    embeds: [
      {
        color,
        title,
        description,
        footer: {
          text: "GigManager",
        },
        timestamp,
      },
    ],
  };
}

// n8n payload formatter (generic JSON)
export function formatN8nMessage(
  event: WebhookEvent,
  data: Record<string, any>
): Record<string, any> {
  return {
    event,
    timestamp: new Date().toISOString(),
    source: "GigManager",
    data,
  };
}

// Generic webhook sender
export async function sendWebhook(
  webhook: Webhook,
  event: WebhookEvent,
  data: Record<string, any>
): Promise<{ success: boolean; error?: string }> {
  try {
    let payload: any;

    if (webhook.provider === "discord") {
      payload = formatDiscordMessage(event, data);
    } else if (webhook.provider === "n8n") {
      payload = formatN8nMessage(event, data);
    } else {
      payload = formatN8nMessage(event, data);
    }

    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(webhook.secret && { "X-Webhook-Secret": webhook.secret }),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: msg,
    };
  }
}

// Batch webhook sender
export async function sendWebhooksForEvent(
  webhooks: Webhook[],
  event: WebhookEvent,
  data: Record<string, any>
): Promise<{ successful: number; failed: number; errors: string[] }> {
  const enabledWebhooks = webhooks.filter(
    (w) => w.enabled && w.events.includes(event)
  );

  if (enabledWebhooks.length === 0) {
    return { successful: 0, failed: 0, errors: [] };
  }

  const results = await Promise.all(
    enabledWebhooks.map((w) => sendWebhook(w, event, data))
  );

  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const errors = results
    .filter((r) => r.error)
    .map((r) => r.error || "Unknown error");

  return { successful, failed, errors };
}
