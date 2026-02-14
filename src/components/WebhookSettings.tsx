"use client";

import { useState } from "react";
import type { Webhook } from "@/lib/webhooks";

interface WebhookSettingsProps {
  webhooks?: Webhook[];
  onAddWebhook?: (webhook: Webhook) => void;
  onToggleWebhook?: (webhookId: string, enabled: boolean) => void;
  onDeleteWebhook?: (webhookId: string) => void;
}

export default function WebhookSettings({
  webhooks = [],
  onAddWebhook,
  onToggleWebhook,
  onDeleteWebhook,
}: WebhookSettingsProps) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    provider: "discord" as const,
    url: "",
    events: [] as string[],
    name: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const eventOptions = [
    { id: "payment_received", label: "Payment Received", icon: "💰" },
    { id: "payment_overdue", label: "Payment Overdue", icon: "⚠️" },
    { id: "band_paid", label: "Band Payment Sent", icon: "✅" },
    { id: "upcoming_gig", label: "Upcoming Performance", icon: "🎵" },
    { id: "gig_completed", label: "Gig Completed", icon: "🎉" },
  ];

  const handleAddEvent = (eventId: string) => {
    setFormData((prev) => ({
      ...prev,
      events: prev.events.includes(eventId)
        ? prev.events.filter((e) => e !== eventId)
        : [...prev.events, eventId],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (!formData.url || formData.events.length === 0) {
        setError("Please fill in all required fields");
        setLoading(false);
        return;
      }

      // TODO: Call API to create webhook
      // For now, mock implementation
      const newWebhook: Webhook = {
        id: `webhook_${Date.now()}`,
        userId: "",
        provider: formData.provider,
        url: formData.url,
        events: formData.events as any,
        enabled: true,
        name: formData.name || `${formData.provider} Webhook`,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      onAddWebhook?.(newWebhook);
      setFormData({
        provider: "discord",
        url: "",
        events: [],
        name: "",
      });
      setShowForm(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create webhook";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Webhooks</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Send notifications to Discord, n8n, or custom webhooks
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Webhook
        </button>
      </div>

      {/* Add Webhook Form */}
      {showForm && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
          <h4 className="mb-4 font-semibold text-slate-900 dark:text-white">Create New Webhook</h4>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-red-50 dark:bg-red-950/30 px-4 py-2 text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            )}

            {/* Provider Selection */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Provider</label>
              <div className="mt-2 flex gap-2">
                {(["discord", "n8n", "custom"] as const).map((provider) => (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, provider }))}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                      formData.provider === provider
                        ? "bg-brand-600 text-white"
                        : "border border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400"
                    }`}
                  >
                    {provider === "discord" && "🎮 Discord"}
                    {provider === "n8n" && "🔗 n8n"}
                    {provider === "custom" && "🌐 Custom"}
                  </button>
                ))}
              </div>
            </div>

            {/* Webhook URL */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Webhook URL *</label>
              <input
                type="url"
                value={formData.url}
                onChange={(e) => setFormData((prev) => ({ ...prev, url: e.target.value }))}
                placeholder={
                  formData.provider === "discord"
                    ? "https://discordapp.com/api/webhooks/..."
                    : "https://..."
                }
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                required
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {formData.provider === "discord" &&
                  "Find this in your Discord server settings"}
                {formData.provider === "n8n" &&
                  "Your n8n webhook URL"}
                {formData.provider === "custom" &&
                  "Any HTTP POST endpoint"}
              </p>
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Name (optional)</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={`e.g., My ${formData.provider.charAt(0).toUpperCase() + formData.provider.slice(1)} Bot`}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </div>

            {/* Events Selection */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Events to Notify *</label>
              <div className="mt-2 space-y-2">
                {eventOptions.map((event) => (
                  <label key={event.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.events.includes(event.id)}
                      onChange={() => handleAddEvent(event.id)}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      {event.icon} {event.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
              >
                {loading ? "Creating..." : "Create Webhook"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Webhooks List */}
      {webhooks.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-slate-300 py-12 text-center dark:border-slate-600">
          <svg className="mx-auto mb-3 h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            No webhooks configured yet
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Add one to get started with external integrations
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((webhook) => (
            <div
              key={webhook.id}
              className="rounded-lg border border-slate-200 p-4 dark:border-slate-700 dark:bg-slate-900/50"
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">
                      {webhook.provider === "discord" && "🎮"}
                      {webhook.provider === "n8n" && "🔗"}
                      {webhook.provider === "custom" && "🌐"}
                    </span>
                    <h4 className="font-medium text-slate-900 dark:text-white">
                      {webhook.name || `${webhook.provider} Webhook`}
                    </h4>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        webhook.enabled
                          ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                          : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400"
                      }`}
                    >
                      {webhook.enabled ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 break-all">
                    {webhook.url}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {webhook.events.map((event) => (
                      <span
                        key={event}
                        className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                      >
                        {event.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="ml-4 flex gap-1">
                  {onToggleWebhook && (
                    <button
                      onClick={() => onToggleWebhook(webhook.id, !webhook.enabled)}
                      title={webhook.enabled ? "Disable" : "Enable"}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        {webhook.enabled ? (
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        ) : (
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        )}
                      </svg>
                    </button>
                  )}
                  {onDeleteWebhook && (
                    <button
                      onClick={() => onDeleteWebhook(webhook.id)}
                      title="Delete"
                      className="rounded p-1 text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
