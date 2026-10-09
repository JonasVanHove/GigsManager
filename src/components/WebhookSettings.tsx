"use client";

import { useState, useEffect, useCallback } from "react";
import { Icons } from "./Icons";
import type { Webhook } from "@/lib/webhooks";
import { useSettings } from "./SettingsProvider";
import { useAuth } from "./AuthProvider";
import { useToast } from "./ToastContainer";

interface WebhookSettingsProps {
  webhooks?: Webhook[];
  onAddWebhook?: (webhook: Webhook) => void;
  onToggleWebhook?: (webhookId: string, enabled: boolean) => void;
  onDeleteWebhook?: (webhookId: string) => void;
}

export default function WebhookSettings({
  webhooks: propWebhooks,
  onAddWebhook,
  onToggleWebhook,
  onDeleteWebhook,
}: WebhookSettingsProps) {
  const { language } = useSettings();
  const { getAccessToken } = useAuth();
  const toast = useToast();
  const [webhooks, setWebhooks] = useState<Webhook[]>(propWebhooks || []);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<{
    provider: "discord" | "n8n" | "custom";
    url: string;
    events: string[];
    name: string;
  }>({
    provider: "discord",
    url: "",
    events: [],
    name: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Load webhooks from API on mount
  const loadWebhooks = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (!token) return;

      const response = await fetch("/api/webhooks", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setWebhooks(data.webhooks || []);
      }
    } catch (err) {
      console.error("Failed to load webhooks:", err);
    }
  }, [getAccessToken]);

  useEffect(() => {
    loadWebhooks();
  }, [loadWebhooks]);

  const eventOptions = [
    { id: "payment_received", label: language === "nl" ? "Betaling ontvangen" : "Payment Received", icon: "💰" },
    { id: "payment_overdue", label: language === "nl" ? "Betaling te laat" : "Payment Overdue", icon: "⚠️" },
    { id: "band_paid", label: language === "nl" ? "Band betaald" : "Band Payment Sent", icon: "✅" },
    { id: "upcoming_gig", label: language === "nl" ? "Aankomend optreden" : "Upcoming Performance", icon: "🎵" },
    { id: "gig_completed", label: language === "nl" ? "Optreden voltooid" : "Gig Completed", icon: "🎉" },
  ];

  const copy = language === "nl"
    ? {
        webhooks: "Webhooks",
        description: "Stuur meldingen naar Discord, n8n of aangepaste webhooks",
        addWebhook: "Webhook toevoegen",
        createWebhook: "Nieuwe webhook maken",
        provider: "Provider",
        webhookUrl: "Webhook-URL *",
        nameOptional: "Naam (optioneel)",
        eventsToNotify: "Gebeurtenissen om te melden *",
        cancel: "Annuleren",
        creating: "Aanmaken...",
        create: "Webhook maken",
        noWebhooks: "Nog geen webhooks ingesteld",
        noWebhooksHelp: "Voeg er een toe om te starten met externe integraties",
        requiredFields: "Vul alle verplichte velden in",
        findDiscord: "Te vinden in de serverinstellingen van Discord",
        n8nUrl: "Je n8n webhook-URL",
        customEndpoint: "Elk HTTP POST-endpoint",
        imageExample: "bijv. Mijn",
      }
    : {
        webhooks: "Webhooks",
        description: "Send notifications to Discord, n8n, or custom webhooks",
        addWebhook: "Add Webhook",
        createWebhook: "Create New Webhook",
        provider: "Provider",
        webhookUrl: "Webhook URL *",
        nameOptional: "Name (optional)",
        eventsToNotify: "Events to Notify *",
        cancel: "Cancel",
        creating: "Creating...",
        create: "Create Webhook",
        noWebhooks: "No webhooks configured yet",
        noWebhooksHelp: "Add one to get started with external integrations",
        requiredFields: "Please fill in all required fields",
        findDiscord: "Find this in your Discord server settings",
        n8nUrl: "Your n8n webhook URL",
        customEndpoint: "Any HTTP POST endpoint",
        imageExample: "e.g., My",
      };

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
        setError(copy.requiredFields);
        setLoading(false);
        return;
      }

      const token = await getAccessToken();
      if (!token) {
        setError(language === "nl" ? "Niet ingelogd" : "Not authenticated");
        setLoading(false);
        return;
      }

      const response = await fetch("/api/webhooks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          url: formData.url,
          provider: formData.provider,
          events: formData.events,
          name: formData.name || `${formData.provider} Webhook`,
          enabled: true,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const newWebhook = data.webhook;
        setWebhooks((prev) => [...prev, newWebhook]);
        onAddWebhook?.(newWebhook);
        setFormData({
          provider: "discord",
          url: "",
          events: [],
          name: "",
        });
        setShowForm(false);
        toast.success(language === "nl" ? "Webhook aangemaakt" : "Webhook created");
      } else {
        const errorData = await response.json();
        setError(errorData.error || (language === "nl" ? "Webhook maken mislukt" : "Failed to create webhook"));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : (language === "nl" ? "Webhook maken mislukt" : "Failed to create webhook");
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (webhookId: string, enabled: boolean) => {
    try {
      const token = await getAccessToken();
      if (!token) return;

      const response = await fetch(`/api/webhooks?id=${webhookId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled }),
      });

      if (response.ok) {
        const data = await response.json();
        setWebhooks((prev) =>
          prev.map((w) => (w.id === webhookId ? data.webhook : w))
        );
        onToggleWebhook?.(webhookId, enabled);
      }
    } catch (err) {
      console.error("Failed to toggle webhook:", err);
      toast.error(language === "nl" ? "Webhook update mislukt" : "Failed to update webhook");
    }
  };

  const handleDelete = async (webhookId: string) => {
    if (!confirm(language === "nl" ? "Weet je zeker dat je deze webhook wilt verwijderen?" : "Are you sure you want to delete this webhook?")) {
      return;
    }

    try {
      const token = await getAccessToken();
      if (!token) return;

      const response = await fetch(`/api/webhooks?id=${webhookId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        setWebhooks((prev) => prev.filter((w) => w.id !== webhookId));
        onDeleteWebhook?.(webhookId);
        toast.success(language === "nl" ? "Webhook verwijderd" : "Webhook deleted");
      }
    } catch (err) {
      console.error("Failed to delete webhook:", err);
      toast.error(language === "nl" ? "Webhook verwijderen mislukt" : "Failed to delete webhook");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{copy.webhooks}</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {copy.description}
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
        >
          <Icons.Plus className="h-4 w-4" />
          {copy.addWebhook}
        </button>
      </div>

      {/* Add Webhook Form */}
      {showForm && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
          <h4 className="mb-4 font-semibold text-slate-900 dark:text-white">{copy.createWebhook}</h4>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-red-50 dark:bg-red-950/30 px-4 py-2 text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            )}

            {/* Provider Selection */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{copy.provider}</label>
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
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{copy.webhookUrl}</label>
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
                  copy.findDiscord}
                {formData.provider === "n8n" &&
                  copy.n8nUrl}
                {formData.provider === "custom" &&
                  copy.customEndpoint}
              </p>
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{copy.nameOptional}</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={`${copy.imageExample} ${formData.provider.charAt(0).toUpperCase() + formData.provider.slice(1)} Bot`}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </div>

            {/* Events Selection */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{copy.eventsToNotify}</label>
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
                {copy.cancel}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
              >
                {loading ? copy.creating : copy.create}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Webhooks List */}
      {webhooks.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-slate-300 py-12 text-center dark:border-slate-600">
          <Icons.Document className="mx-auto mb-3 h-8 w-8 text-slate-500" />
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {copy.noWebhooks}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {copy.noWebhooksHelp}
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
                  <button
                    onClick={() => handleToggle(webhook.id, !webhook.enabled)}
                    title={webhook.enabled ? "Disable" : "Enable"}
                    className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    {webhook.enabled ? (
                      <Icons.Check className="h-4 w-4" />
                    ) : (
                      <Icons.Close className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(webhook.id)}
                    title="Delete"
                    className="rounded p-1 text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20"
                  >
                    <Icons.Trash className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
