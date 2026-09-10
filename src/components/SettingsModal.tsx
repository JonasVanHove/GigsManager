"use client";

import Image from "next/image";
import Avatar from "./Avatar";
import { useEffect, useState, useCallback, useRef } from "react";
import { Icons } from "./Icons";
import { supabaseClient } from "@/lib/supabase-client";
import { useAuth } from "./AuthProvider";
import { useSettings } from "./SettingsProvider";
import { useToast } from "./ToastContainer";
import { useImmersiveMode } from "@/lib/use-immersive-mode";
import type { AppLanguage, UserSettingsData } from "@/types";
import { useTranslation } from "react-i18next";
import { useModalLock } from "@/hooks/useModalLock";
import { createPortal } from "react-dom";

const CURRENCIES = [
  { code: "EUR", label: "Euro (€)", symbol: "€" },
  { code: "USD", label: "US Dollar ($)", symbol: "$" },
  { code: "GBP", label: "British Pound (£)", symbol: "£" },
  { code: "CHF", label: "Swiss Franc (CHF)", symbol: "CHF" },
  { code: "SEK", label: "Swedish Krona (kr)", symbol: "kr" },
  { code: "NOK", label: "Norwegian Krone (kr)", symbol: "kr" },
  { code: "DKK", label: "Danish Krone (kr)", symbol: "kr" },
  { code: "PLN", label: "Polish Złoty (zł)", symbol: "zł" },
  { code: "CZK", label: "Czech Koruna (Kč)", symbol: "Kč" },
  { code: "HUF", label: "Hungarian Forint (Ft)", symbol: "Ft" },
  { code: "CAD", label: "Canadian Dollar (CA$)", symbol: "CA$" },
  { code: "AUD", label: "Australian Dollar (A$)", symbol: "A$" },
  { code: "JPY", label: "Japanese Yen (¥)", symbol: "¥" },
];

interface SettingsModalProps {
  onClose: () => void;
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const { session } = useAuth();
  const { settings, updateSettings, language, setLanguage } = useSettings();
  const toast = useToast();
  const { isFullscreen, canRequestFullscreen, toggleFullscreen } = useImmersiveMode();
  const { t } = useTranslation();
  const [currency, setCurrency] = useState(settings.currency);
  const [claimPerf, setClaimPerf] = useState(settings.claimPerformanceFee);
  const [claimTech, setClaimTech] = useState(settings.claimTechnicalFee);
  const [theme, setTheme] = useState(settings.theme);
  const [appLanguage, setAppLanguage] = useState<AppLanguage>(language);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const githubRepoUrl = "https://github.com/JonasVanHove/GigManager";

  // PDF Export Settings
  const [pdfIncludeLogo, setPdfIncludeLogo] = useState(settings.pdfIncludeLogo ?? true);
  const [pdfFont, setPdfFont] = useState(settings.pdfFont ?? "inter");
  const [pdfPageSize, setPdfPageSize] = useState(settings.pdfPageSize ?? "a4");
  const [pdfPageBreakMode, setPdfPageBreakMode] = useState(settings.pdfPageBreakMode ?? "auto");
  const [pdfDarkMode, setPdfDarkMode] = useState(settings.pdfDarkMode ?? false);
  const [pdfShowHeaders, setPdfShowHeaders] = useState(settings.pdfShowHeaders ?? true);
  const [pdfShowMetadata, setPdfShowMetadata] = useState(settings.pdfShowMetadata ?? true);
  const [pdfImagesOnly, setPdfImagesOnly] = useState(settings.pdfImagesOnly ?? false);
  const [pdfShowPageNumbers, setPdfShowPageNumbers] = useState(settings.pdfShowPageNumbers ?? true);
  const [pdfMarginSize, setPdfMarginSize] = useState(settings.pdfMarginSize ?? "medium");
  const [excludeSelfFromMemberCount, setExcludeSelfFromMemberCount] = useState(settings.excludeSelfFromMemberCount ?? false);
  
  // Custom Navigation Tabs
  const [customTab1, setCustomTab1] = useState(settings.customTab1 ?? "setlists");
  const [customTab2, setCustomTab2] = useState(settings.customTab2 ?? "songs");
  // Track the values we last saw from the account so we can (a) adopt
  // late-loading / cross-device updates without clobbering local edits and
  // (b) know when the user has an unsaved local change.
  const seenCustomTab1Ref = useRef(settings.customTab1 ?? "setlists");
  const seenCustomTab2Ref = useRef(settings.customTab2 ?? "songs");

  useEffect(() => {
    const next1 = settings.customTab1 ?? "setlists";
    const next2 = settings.customTab2 ?? "songs";
    const prev1 = seenCustomTab1Ref.current;
    const prev2 = seenCustomTab2Ref.current;
    // Adopt an account value only when local state still mirrors the
    // previously seen account value (i.e. the user hasn't edited locally
    // since). This keeps late-loading / cross-device updates in sync
    // without clobbering an unsaved local change.
    if (next1 !== prev1) {
      seenCustomTab1Ref.current = next1;
      setCustomTab1((local) => (local === prev1 ? next1 : local));
    }
    if (next2 !== prev2) {
      seenCustomTab2Ref.current = next2;
      setCustomTab2((local) => (local === prev2 ? next2 : local));
    }
  }, [settings.customTab1, settings.customTab2]);

  /**
   * Change handlers that guarantee Tab 1 and Tab 2 are always distinct:
   * picking the other tab's value swaps the two selections instead of
   * creating a duplicate, which would render two identical primary nav
   * buttons (React duplicate keys) and break the active-tab highlight.
   * The swap is persisted as a single atomic patch to avoid a transient
   * race between two PUT responses replacing the settings object.
   */
  const handleChangeCustomTab1 = (next: string) => {
    if (next === customTab2) {
      setCustomTab1(next);
      setCustomTab2(customTab1);
      persistCustomTab(
        { customTab1: next, customTab2: customTab1 },
        t("settings.customTab1")
      );
      return;
    }
    setCustomTab1(next);
    persistCustomTab({ customTab1: next }, t("settings.customTab1"));
  };

  const handleChangeCustomTab2 = (next: string) => {
    if (next === customTab1) {
      setCustomTab2(next);
      setCustomTab1(customTab2);
      persistCustomTab(
        { customTab1: customTab2, customTab2: next },
        t("settings.customTab2")
      );
      return;
    }
    setCustomTab2(next);
    persistCustomTab({ customTab2: next }, t("settings.customTab2"));
  };

  /**
   * Account-bound persistence: persist a custom-tab change to Supabase
   * immediately (not only when the modal is saved), keeping local state and
   * the database in sync so the choice follows the user across devices.
   * @param which "Tab 1"|"Tab 2" (for the toast)
   */
  const persistCustomTab = useCallback(
    async (patch: Partial<Pick<UserSettingsData, "customTab1" | "customTab2">>, label: string) => {
      try {
        // The API accepts well-formed strings only; never forward undefined.
        const safePatch: Partial<UserSettingsData> = {};
        if (patch.customTab1 !== undefined) safePatch.customTab1 = patch.customTab1;
        if (patch.customTab2 !== undefined) safePatch.customTab2 = patch.customTab2;
        await updateSettings(safePatch); // optimistic local update + PUT to /api/settings
        toast.success(`${label}: ${t("common.saved", "Saved")}`);
      } catch (err) {
        console.error("Failed to save custom tab to account:", err);
        // Surface the server's reason (e.g. a 400 for an invalid tab value)
        // instead of a bare generic message — no swallowed promise, no silent 400.
        const msg = err instanceof Error && err.message ? err.message : t("settings.errorSaveFailed");
        toast.error(msg.startsWith("Save failed") || msg.startsWith("Invalid") || msg.includes("must be different") ? msg : t("settings.errorSaveFailed"));
      }
    },
    [updateSettings, t, toast]
  );

  const hasSettingsChanges =
    currency !== settings.currency ||
    claimPerf !== settings.claimPerformanceFee ||
    claimTech !== settings.claimTechnicalFee ||
    theme !== settings.theme ||
    appLanguage !== language ||
    customTab1 !== (settings.customTab1 ?? "setlists") ||
    customTab2 !== (settings.customTab2 ?? "songs") ||
    pdfIncludeLogo !== (settings.pdfIncludeLogo ?? true) ||
    pdfFont !== (settings.pdfFont ?? "inter") ||
    pdfPageSize !== (settings.pdfPageSize ?? "a4") ||
    pdfPageBreakMode !== (settings.pdfPageBreakMode ?? "auto") ||
    pdfDarkMode !== (settings.pdfDarkMode ?? false) ||
    pdfShowHeaders !== (settings.pdfShowHeaders ?? true) ||
    pdfShowMetadata !== (settings.pdfShowMetadata ?? true) ||
    pdfImagesOnly !== (settings.pdfImagesOnly ?? false) ||
    pdfShowPageNumbers !== (settings.pdfShowPageNumbers ?? true) ||
    pdfMarginSize !== (settings.pdfMarginSize ?? "medium") ||
    excludeSelfFromMemberCount !== (settings.excludeSelfFromMemberCount ?? false);

  const hasProfileChanges =
    displayName !== (session?.user?.user_metadata?.name || "") ||
    avatarUrl !== (session?.user?.user_metadata?.avatar_url || "");

  useEffect(() => {
    setDisplayName(session?.user?.user_metadata?.name || "");
    setAvatarUrl(session?.user?.user_metadata?.avatar_url || "");
    setAvatarFile(null);
  }, [session?.user]);

  useEffect(() => {
    setAppLanguage(language);
  }, [language]);

  const { handleBackdropClick, handleTouchStart, handleTouchEnd } = useModalLock({
    onClose,
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError(t('settings.errorUploadImage'));
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError(t('settings.errorImageSize'));
      return;
    }

    setAvatarFile(file);
    setError("");

    setUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${session?.user?.id}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabaseClient.storage
        .from("avatars")
        .upload(fileName, file, { upsert: true });

      if (uploadError) {
        console.error("Avatar upload error:", uploadError);
        throw new Error(
          uploadError.message.includes("not found") || uploadError.statusCode === "404"
            ? "Storage bucket 'avatars' not found. Please create it in Supabase (see AVATAR_SETUP.md)"
            : uploadError.message
        );
      }

      const { data: { publicUrl } } = supabaseClient.storage
        .from("avatars")
        .getPublicUrl(fileName);

      setAvatarUrl(publicUrl);
    } catch (err: any) {
      console.error("Avatar upload failed:", err);
      setError(err.message || t('settings.errorUploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!hasSettingsChanges && !hasProfileChanges) {
      onClose();
      return;
    }

    setSaving(true);
    setError("");

    try {
      if (hasSettingsChanges) {
        await updateSettings({
          currency,
          claimPerformanceFee: claimPerf,
          claimTechnicalFee: claimTech,
          theme,
          customTab1,
          customTab2,
          pdfIncludeLogo,
          pdfFont,
          pdfPageSize,
          pdfPageBreakMode,
          pdfDarkMode,
          pdfShowHeaders,
          pdfShowMetadata,
          pdfImagesOnly,
          pdfShowPageNumbers,
          pdfMarginSize,
          excludeSelfFromMemberCount,
        });
        setLanguage(appLanguage);
      }

      if (hasProfileChanges) {
        const { error: profileError } = await supabaseClient.auth.updateUser({
          data: {
            name: displayName.trim(),
            avatar_url: avatarUrl.trim() || null,
          },
        });

        if (profileError) {
          throw profileError;
        }
      }
      onClose();
    } catch {
      setError(t('settings.errorSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  // Decouple the modal DOM node from the React tree via a portal mounted
  // directly under document.body (same pattern as XAIConfirmationModal).
  // This prevents parent transforms, filters, overflow or stacking contexts in
  // the layout from breaking `position: fixed` dead-center positioning.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex h-[100dvh] w-[100dvw] items-center justify-center bg-black/70 p-4 backdrop-blur-sm modal-backdrop-enter"
      onClick={handleBackdropClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Strict layout reset: `relative my-auto` guarantees no stray
          margin-top / top / translate offset can leak in — combined with
          items-center it yields perfect vertical symmetry (equal space above
          the header and below the footer). Surface colours stay theme-aware
          (a hard bg-slate-900 would be unreadable in light mode). */}
      <div
        className="relative my-auto flex w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200/50 bg-white/95 shadow-2xl backdrop-blur dark:border-slate-800 dark:bg-slate-900 max-h-[85dvh] settings-modal-card modal-content-enter"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100/50 px-6 py-5 dark:border-slate-700/50">
          <h2 className="bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-lg font-semibold text-transparent dark:from-white dark:to-slate-200">
            {t('settings.title')}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="touch-target inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 transition-all duration-200 hover:bg-slate-100/60 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800/60 dark:hover:text-slate-300"
          >
            <Icons.Close className="h-5 w-5" />
          </button>
        </div>

        {/* min-h-0 is critical: without it the tall settings content cannot
            shrink below its content height, pushing the footer outside the
            clipped card on short laptop viewports. */}
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-6">
          <div className="rounded-2xl border border-indigo-500/30 bg-indigo-50/40 p-4 backdrop-blur dark:border-indigo-500/20 dark:bg-indigo-950/10">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300">
                <Icons.People className="h-3.5 w-3.5" />
              </span>
              <label className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                {t('settings.profile')}
              </label>
            </div>
            <div className="flex items-center gap-3">
              <Avatar
                src={avatarUrl}
                name={displayName}
                email={session?.user?.email}
                size="lg"
              />
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t('settings.displayName')}
                  className="w-full rounded-lg border border-slate-300/60 bg-white/80 px-3 py-2 text-sm text-slate-900 shadow-sm backdrop-blur transition-all duration-200 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-600/60 dark:bg-slate-800/70 dark:text-slate-100 dark:focus:border-brand-400 dark:focus:ring-brand-400/20"
                />
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder={t('settings.avatarUrl')}
                    className="flex-1 rounded-lg border border-slate-300/60 bg-white/80 px-3 py-2 text-sm text-slate-900 shadow-sm backdrop-blur transition-all duration-200 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-600/60 dark:bg-slate-800/70 dark:text-slate-100 dark:focus:border-brand-400 dark:focus:ring-brand-400/20"
                  />
                  <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300/60 bg-white/80 px-3 py-2 text-sm text-slate-600 shadow-sm backdrop-blur transition-all duration-200 hover:bg-slate-50/90 hover:shadow-md dark:border-slate-600/60 dark:bg-slate-800/70 dark:text-slate-400 dark:hover:bg-slate-700/70">
                    {uploading ? <Icons.Spinner className="h-4 w-4" /> : <Icons.Download className="h-4 w-4" />}
                    <span className="hidden sm:inline">{t('settings.upload')}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      disabled={uploading}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {t('settings.uploadHint')}
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              {t('settings.project')}
            </label>
            <a
              href={githubRepoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300/60 bg-white/80 px-3 py-2 text-sm font-medium text-slate-800 shadow-sm backdrop-blur transition-all duration-200 hover:bg-slate-50/90 hover:shadow-md dark:border-slate-600/60 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-700/70"
              title="Open GitHub repository"
            >
              <Icons.GitHub className="h-4 w-4" />
              {t('settings.githubRepo')}
            </a>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t('settings.githubRepoHint')}
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              {t('settings.currency')}
            </label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full rounded-lg border border-slate-300/60 bg-white/80 px-3 py-2 text-sm text-slate-900 shadow-sm backdrop-blur transition-all duration-200 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-600/60 dark:bg-slate-800/70 dark:text-slate-100 dark:focus:border-brand-400 dark:focus:ring-brand-400/20"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t('settings.currencyHint')}
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              {t('settings.language')}
            </label>
            <select
              value={appLanguage}
              onChange={(e) => setAppLanguage(e.target.value as AppLanguage)}
              className="w-full rounded-lg border border-slate-300/60 bg-white/80 px-3 py-2 text-sm text-slate-900 shadow-sm backdrop-blur transition-all duration-200 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-600/60 dark:bg-slate-800/70 dark:text-slate-100 dark:focus:border-brand-400 dark:focus:ring-brand-400/20"
            >
              <option value="system">{t('settings.languageSystem')}</option>
              <option value="en">{t('settings.languageEnglish')}</option>
              <option value="nl">{t('settings.languageDutch')}</option>
            </select>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {appLanguage === "system"
                ? t('settings.languageHintSystem')
                : appLanguage === "nl"
                ? t('settings.languageHintDutch')
                : t('settings.languageHintEnglish')}
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-50/40 p-4 backdrop-blur dark:border-emerald-500/20 dark:bg-emerald-950/10">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300">
                <Icons.ListView className="h-3.5 w-3.5" />
              </span>
              <label className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                {t('settings.customTabs')}
              </label>
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
                {t('settings.tabAccountBound', 'Account')}
              </span>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {t('settings.customTab1')}
                </label>
                <select
                  value={customTab1}
                  onChange={(e) => handleChangeCustomTab1(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-all duration-200 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/30"
                >
                  <option value="setlists">{t('dashboard.setlists')}</option>
                  <option value="songs">{t('dashboard.songs')}</option>
                  <option value="calendar">{t('dashboard.calendar')}</option>
                  <option value="bands">{t('dashboard.bands')}</option>
                  <option value="band-members">{t('dashboard.bandMembers')}</option>
                  <option value="analytics">{t('dashboard.insights')}</option>
                  <option value="investments">{t('dashboard.investments')}</option>
                  <option value="shared-links">{t('dashboard.share')}</option>
                </select>
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {t('settings.customTab2')}
                </label>
                <select
                  value={customTab2}
                  onChange={(e) => handleChangeCustomTab2(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-all duration-200 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/30"
                >
                  <option value="setlists">{t('dashboard.setlists')}</option>
                  <option value="songs">{t('dashboard.songs')}</option>
                  <option value="calendar">{t('dashboard.calendar')}</option>
                  <option value="bands">{t('dashboard.bands')}</option>
                  <option value="band-members">{t('dashboard.bandMembers')}</option>
                  <option value="analytics">{t('dashboard.insights')}</option>
                  <option value="investments">{t('dashboard.investments')}</option>
                  <option value="shared-links">{t('dashboard.share')}</option>
                </select>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('settings.customTabsHint')}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-500/30 bg-amber-50/40 p-4 backdrop-blur dark:border-amber-500/20 dark:bg-amber-950/10">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:bg-amber-400/20 dark:text-amber-300">
                <Icons.Music2 className="h-3.5 w-3.5" />
              </span>
              <label className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                {t('settings.appearance')}
              </label>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(["light", "dark", "system"] as const).map((themeOption) => (
                <button
                  key={themeOption}
                  onClick={() => setTheme(themeOption)}
                  className={`rounded-lg border-2 px-3 py-2 text-sm font-medium transition-all duration-200 ${
                    theme === themeOption
                      ? "border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-950/30 dark:text-brand-300"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-600"
                  }`}
                >
                  {themeOption.charAt(0).toUpperCase() + themeOption.slice(1)}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {theme === "system"
                ? t('settings.themeHintSystem')
                : theme === "dark"
                ? t('settings.themeHintDark')
                : t('settings.themeHintLight')}
            </p>
          </div>

          {canRequestFullscreen && (
            <div>
              <label className="mb-3 block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t('settings.display')}
              </label>
              <button
                onClick={toggleFullscreen}
                className={`flex w-full items-center justify-between rounded-lg border-2 px-4 py-3 transition-all duration-200 ${
                  isFullscreen
                    ? "border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-950/30"
                    : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600"
                }`}
              >
                <span className={`text-sm font-medium ${isFullscreen ? "text-brand-700 dark:text-brand-300" : "text-slate-700 dark:text-slate-300"}`}>
                  {t('settings.fullscreenMode')}
                </span>
                <div className={`h-5 w-9 rounded-full transition ${isFullscreen ? "bg-brand-500 dark:bg-brand-600" : "bg-slate-300 dark:bg-slate-600"}`}>
                  <div className={`h-4 w-4 rounded-full bg-white transition-transform ${isFullscreen ? "translate-x-4" : "translate-x-0.5"}`} />
                </div>
              </button>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {isFullscreen ? t('settings.fullscreenActive') : t('settings.fullscreenInactive')}
              </p>
            </div>
          )}

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              {t('settings.feeComponents')}
            </legend>
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              {t('settings.feeComponentsHint')}
            </p>

            <div className="space-y-3">
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:bg-slate-800/70">
                <input
                  type="checkbox"
                  checked={claimPerf}
                  onChange={(e) => setClaimPerf(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600 dark:text-brand-400 dark:focus:ring-brand-400"
                />
                <div>
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{t('settings.performanceFee')}</span>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('settings.performanceFeeHint')}
                  </p>
                </div>
              </label>

              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:bg-slate-800/70">
                <input
                  type="checkbox"
                  checked={claimTech}
                  onChange={(e) => setClaimTech(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600 dark:text-brand-400 dark:focus:ring-brand-400"
                />
                <div>
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{t('settings.technicalFee')}</span>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('settings.technicalFeeHint')}
                  </p>
                </div>
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              {t('settings.pdfExportSettings')}
            </legend>
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              {t('settings.pdfExportSettingsHint')}
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:bg-slate-800/70">
                <input
                  type="checkbox"
                  checked={pdfIncludeLogo}
                  onChange={(e) => setPdfIncludeLogo(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600 dark:text-brand-400 dark:focus:ring-brand-400"
                />
                <div>
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{t('settings.includeLogo')}</span>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('settings.includeLogoHint')}
                  </p>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:bg-slate-800/70">
                <input
                  type="checkbox"
                  checked={pdfShowHeaders}
                  onChange={(e) => setPdfShowHeaders(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600 dark:text-brand-400 dark:focus:ring-brand-400"
                />
                <div>
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{t('settings.showHeaders')}</span>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('settings.showHeadersHint')}
                  </p>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:bg-slate-800/70">
                <input
                  type="checkbox"
                  checked={pdfShowMetadata}
                  onChange={(e) => setPdfShowMetadata(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600 dark:text-brand-400 dark:focus:ring-brand-400"
                />
                <div>
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{t('settings.showMetadata')}</span>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('settings.showMetadataHint')}
                  </p>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:bg-slate-800/70">
                <input
                  type="checkbox"
                  checked={pdfShowPageNumbers}
                  onChange={(e) => setPdfShowPageNumbers(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600 dark:text-brand-400 dark:focus:ring-brand-400"
                />
                <div>
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{t('settings.pageNumbers')}</span>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('settings.pageNumbersHint')}
                  </p>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:bg-slate-800/70">
                <input
                  type="checkbox"
                  checked={pdfDarkMode}
                  onChange={(e) => setPdfDarkMode(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600 dark:text-brand-400 dark:focus:ring-brand-400"
                />
                <div>
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{t('settings.darkMode')}</span>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('settings.darkModeHint')}
                  </p>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:bg-slate-800/70">
                <input
                  type="checkbox"
                  checked={pdfImagesOnly}
                  onChange={(e) => setPdfImagesOnly(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600 dark:text-brand-400 dark:focus:ring-brand-400"
                />
                <div>
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{t('settings.imagesOnly')}</span>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('settings.imagesOnlyHint')}
                  </p>
                </div>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t('settings.font')}
                </label>
                <select
                  value={pdfFont}
                  onChange={(e) => setPdfFont(e.target.value)}
                  className="w-full rounded-lg border border-slate-300/60 bg-white/80 px-3 py-2 text-sm text-slate-900 shadow-sm backdrop-blur transition-all duration-200 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-600/60 dark:bg-slate-800/70 dark:text-slate-100 dark:focus:border-brand-400 dark:focus:ring-brand-400/20"
                >
                  <option value="inter">Inter</option>
                  <option value="arial">Arial</option>
                  <option value="times">Times</option>
                  <option value="georgia">Georgia</option>
                  <option value="courier">Courier</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t('settings.size')}
                </label>
                <select
                  value={pdfPageSize}
                  onChange={(e) => setPdfPageSize(e.target.value)}
                  className="w-full rounded-lg border border-slate-300/60 bg-white/80 px-3 py-2 text-sm text-slate-900 shadow-sm backdrop-blur transition-all duration-200 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-600/60 dark:bg-slate-800/70 dark:text-slate-100 dark:focus:border-brand-400 dark:focus:ring-brand-400/20"
                >
                  <option value="a4">A4</option>
                  <option value="letter">Letter</option>
                  <option value="legal">Legal</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t('settings.breaks')}
                </label>
                <select
                  value={pdfPageBreakMode}
                  onChange={(e) => setPdfPageBreakMode(e.target.value)}
                  className="w-full rounded-lg border border-slate-300/60 bg-white/80 px-3 py-2 text-sm text-slate-900 shadow-sm backdrop-blur transition-all duration-200 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-600/60 dark:bg-slate-800/70 dark:text-slate-100 dark:focus:border-brand-400 dark:focus:ring-brand-400/20"
                >
                  <option value="auto">Auto</option>
                  <option value="song">Song</option>
                  <option value="section">Section</option>
                  <option value="none">None</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t('settings.margin')}
                </label>
                <select
                  value={pdfMarginSize}
                  onChange={(e) => setPdfMarginSize(e.target.value)}
                  className="w-full rounded-lg border border-slate-300/60 bg-white/80 px-3 py-2 text-sm text-slate-900 shadow-sm backdrop-blur transition-all duration-200 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-600/60 dark:bg-slate-800/70 dark:text-slate-100 dark:focus:border-brand-400 dark:focus:ring-brand-400/20"
                >
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                </select>
              </div>
            </div>
          </fieldset>

          <fieldset className="rounded-2xl border border-slate-200/60 bg-white/50 p-4 shadow-sm backdrop-blur dark:border-slate-700/60 dark:bg-slate-800/50">
            <legend className="mb-3 px-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t('settings.bandSettings')}
            </legend>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    {t('settings.includeSelfInCount')}
                  </label>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {t('settings.includeSelfInCountHint')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setExcludeSelfFromMemberCount(!excludeSelfFromMemberCount)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
                    !excludeSelfFromMemberCount ? "bg-brand-600" : "bg-slate-200 dark:bg-slate-700"
                  }`}
                  role="switch"
                  aria-checked={!excludeSelfFromMemberCount}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      !excludeSelfFromMemberCount ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          </fieldset>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-100/50 bg-white/95 px-6 py-4 dark:border-slate-700/50 dark:bg-slate-900/95">
          <button
            onClick={onClose}
            className="touch-target inline-flex min-h-[44px] items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {t('settings.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="touch-target inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-md transition-all duration-200 hover:from-indigo-600 hover:to-purple-700 hover:scale-[1.03] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving && (
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {saving ? t('settings.saving') : t('settings.save')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
