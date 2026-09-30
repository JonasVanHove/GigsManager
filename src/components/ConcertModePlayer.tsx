"use client";

import { useEffect, useMemo } from "react";
import type { Setlist, SetlistItem } from "@/types";
import { useAuth } from "./AuthProvider";
import { useConcertMode } from "@/hooks/useConcertMode";
import { useSetlistNavigation } from "@/hooks/useSetlistNavigation";
import { FullscreenAttachmentViewer } from "./FullscreenAttachmentViewer";
import { getTouchTargetClass } from "@/lib/concert-mode";
import type { CSSProperties } from "react";

interface ConcertModePlayerProps {
  setlist: Setlist;
  onClose: () => void;
  isOpen: boolean;
}

export function ConcertModePlayer({ setlist, onClose, isOpen }: ConcertModePlayerProps) {
  const { getAccessToken } = useAuth();
  const itemIds = useMemo(() => (setlist.items || []).map((item) => item.id), [setlist.items]);
  const navigation = useSetlistNavigation(itemIds);

  const {
    settings,
    updateSettings,
    viewerState,
    openViewer,
    closeViewer,
    goToNextAttachment,
    goToPrevAttachment,
    goToAttachment,
    currentItemAttachments,
    loadAttachmentsForItem,
  } = useConcertMode({ setlistId: setlist.id });

  const items = useMemo(
    () => (setlist.items || []).slice().sort((a, b) => a.order - b.order),
    [setlist.items]
  );

  const currentItem = items.find((item) => item.id === navigation.currentItemId) || items[0] || null;

  useEffect(() => {
    if (!isOpen) return;
    updateSettings({ enabled: true, autoLandscape: true });
  }, [isOpen, updateSettings]);

  useEffect(() => {
    if (!settings.enabled || !currentItem) return;

    (async () => {
      const token = await getAccessToken();
      if (!token) return;
      await loadAttachmentsForItem(currentItem.id, token);
    })();
  }, [currentItem?.id, getAccessToken, loadAttachmentsForItem, settings.enabled]);

  useEffect(() => {
    if (!isOpen) {
      updateSettings({ enabled: false });
      closeViewer();
      navigation.reset();
    }
  }, [isOpen, updateSettings, closeViewer, navigation]);

  const filter = [
    settings.invertColors ? "invert(1) hue-rotate(180deg)" : "",
    settings.highContrast ? "contrast(1.25)" : "",
    settings.brightnessBoost ? "brightness(1.1)" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (!isOpen) {
    return null;
  }

  const position = items.length > 0 ? `${navigation.currentIndex + 1}/${items.length}` : "0/0";

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-white">
      <div className="flex h-full flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Concert Mode</div>
            <h2 className="truncate text-xl font-semibold sm:text-2xl">{setlist.title}</h2>
            {currentItem && (
              <p className="mt-1 text-sm text-slate-300">
                {position} · {currentItem.title || (currentItem.type === "note" ? "Note" : "Untitled")}
                {currentItem.tuning ? ` · ${currentItem.tuning}` : ""}
                {currentItem.chords ? ` · ${currentItem.chords}` : ""}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <label className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs">
              <input
                type="checkbox"
                checked={settings.invertColors}
                onChange={(e) => updateSettings({ invertColors: e.target.checked })}
              />
              Invert
            </label>
            <label className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs">
              <input
                type="checkbox"
                checked={settings.highContrast}
                onChange={(e) => updateSettings({ highContrast: e.target.checked })}
              />
              Contrast
            </label>
            <label className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs">
              <input
                type="checkbox"
                checked={settings.brightnessBoost}
                onChange={(e) => updateSettings({ brightnessBoost: e.target.checked })}
              />
              Bright
            </label>
            <button
              type="button"
              onClick={() => {
                updateSettings({ enabled: false });
                closeViewer();
                onClose();
              }}
              className="rounded-full bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/20"
            >
              Exit
            </button>
          </div>
        </header>

        <main className="relative flex-1 overflow-hidden p-3 sm:p-4">
          {currentItem ? (
            <div className="flex h-full flex-col gap-3">
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/40 p-2 sm:p-4">
                {currentItemAttachments.length > 0 ? (
                  <FullscreenAttachmentViewer
                    isOpen={viewerState.isOpen}
                    attachments={currentItemAttachments}
                    currentIndex={viewerState.currentIndex}
                    onClose={closeViewer}
                    onNext={goToNextAttachment}
                    onPrev={goToPrevAttachment}
                    onIndexChange={goToAttachment}
                    showControls={false}
                    preloadNextAttachment={settings.preloadNextAttachment}
                    className="bg-transparent"
                    style={filter ? ({ filter } as CSSProperties) : undefined}
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 p-6 text-center text-slate-300">
                    <div className="text-lg font-medium">{currentItem.title || "Untitled item"}</div>
                    <div className="mt-2 text-sm text-slate-500">No media attached for this item yet.</div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <button
                  type="button"
                  onClick={navigation.goPrev}
                  disabled={navigation.currentIndex === 0}
                  className={`${getTouchTargetClass(settings.touchTargetSize)} rounded-2xl bg-white/10 text-sm font-medium disabled:opacity-40`}
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => openViewer(currentItemAttachments, 0)}
                  disabled={currentItemAttachments.length === 0}
                  className={`${getTouchTargetClass(settings.touchTargetSize)} rounded-2xl bg-white/10 text-sm font-medium disabled:opacity-40`}
                >
                  Open media
                </button>
                <button
                  type="button"
                  onClick={navigation.goNext}
                  disabled={navigation.currentIndex >= items.length - 1}
                  className={`${getTouchTargetClass(settings.touchTargetSize)} rounded-2xl bg-white/10 text-sm font-medium disabled:opacity-40`}
                >
                  Next
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateSettings({ enabled: false });
                    closeViewer();
                    onClose();
                  }}
                  className={`${getTouchTargetClass(settings.touchTargetSize)} rounded-2xl bg-red-600 text-sm font-medium`}
                >
                  Exit mode
                </button>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-slate-300">No setlist items</div>
          )}
        </main>
      </div>
    </div>
  );
}