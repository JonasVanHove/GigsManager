"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icons } from "./Icons";

type Attachment = {
  id: string;
  publicUrl?: string;
  contentType?: string;
  // SetlistsTab passes the { url, type, title } shape - accept both.
  url?: string;
  type?: string;
  caption?: string | null;
  title?: string;
};

interface Props {
  isOpen: boolean;
  attachments: Attachment[];
  index: number;
  title?: string;
  tuning?: string;
  capo?: string;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

const getSrc = (attachment: Attachment) => attachment.publicUrl ?? attachment.url ?? "";
const getKind = (attachment: Attachment) => attachment.contentType ?? attachment.type ?? "";

const isImageAttachment = (attachment: Attachment) =>
  getKind(attachment).startsWith("image/") || /\.(avif|gif|jpe?g|png|svg|webp)(?:[?#]|$)/i.test(getSrc(attachment));

const isPdfAttachment = (attachment: Attachment) =>
  getKind(attachment).toLowerCase() === "application/pdf" || /\.pdf(?:[?#]|$)/i.test(getSrc(attachment));

const buildPdfViewerUrl = (url: string) => `${url}${url.includes("#") ? "&" : "#"}view=FitH`;

const MIN_SCALE = 1;
const MAX_SCALE = 8;
const clampScale = (v: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, v));
const touchDist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

export default function FullscreenMediaViewer({ isOpen, attachments, index, title, tuning, capo, onClose, onPrev, onNext }: Props) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const mediaAreaRef = useRef<HTMLDivElement | null>(null);
  // Latest scale, mirrored for use inside native event listeners and for
  // computing zoom-out without side-effects inside a state updater.
  const scaleRef = useRef(1);
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  const pinchStateRef = useRef<{ startDist: number; startScale: number } | null>(null);
  const dragStateRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number; pointerId: number } | null>(null);
  const dragOccurredRef = useRef(false);
  // window.setTimeout returns a number in the browser DOM lib; keep the
  // browser type (not NodeJS.Timeout) so `tsc --noEmit` passes.
  const dragTimerRef = useRef<number | null>(null);
  const currentAttachmentRef = useRef<Attachment | null>(null);
  const offsetRef = useRef({ x: 0, y: 0 });
  useEffect(() => { offsetRef.current = offset; }, [offset]);
  const attachmentNow = attachments[index] ?? null;
  // Mirror into a ref in an effect (never assign during render) so native
  // listeners always see the current attachment without re-subscribing.
  useEffect(() => { currentAttachmentRef.current = attachmentNow; });
  const isImageNow = attachmentNow ? isImageAttachment(attachmentNow) : false;
  // Image load failure (e.g. offline with an uncached remote URL). Reset per
  // attachment so a retry / navigation can recover; offers a cached-friendly
  // fallback instead of a broken <img>.
  const [imgError, setImgError] = useState(false);
  useEffect(() => { setImgError(false); }, [isOpen, index]);
  // Reset zoom/pan whenever the attachment changes or the viewer opens/closes.
  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, [isOpen, index]);

  const zoomIn = useCallback(() => setScale((s) => clampScale(s * 1.25)), []);
  const zoomOut = useCallback(() => {
    setScale((s) => clampScale(s / 1.25));
    // Shrinking back to 1x also recenters; do it as a separate update so we
    // never call a state setter from inside another state's updater
    // (React forbids side-effects there and it breaks in StrictMode).
    setOffset((o) => (clampScale((scaleRef.current ?? 1) / 1.25) <= MIN_SCALE ? { x: 0, y: 0 } : o));
  }, []);
  const resetZoom = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const toggleFullscreen = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    try {
      if (document.fullscreenElement) {
        void document.exitFullscreen();
      } else if (root.requestFullscreen) {
        root.requestFullscreen().catch(() => setIsFullscreen((v) => !v));
      } else {
        setIsFullscreen((v) => !v);
      }
    } catch {
      setIsFullscreen((v) => !v);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      // Don't hijack typing in inputs (caption edit etc.).
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "+" || e.key === "=") zoomIn();
      else if (e.key === "-") zoomOut();
      else if (e.key === "0") resetZoom();
      else if (e.key === "ArrowLeft") { resetZoom(); onPrev(); }
      else if (e.key === "ArrowRight") { resetZoom(); onNext(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose, onPrev, onNext, zoomIn, zoomOut, resetZoom]);

  // Non-passive wheel zoom (React onWheel is passive; preventDefault must
  // be attached natively). Images only. Native handler reads scale/offset
  // from refs so it never works on a stale closure.
  useEffect(() => {
    const el = mediaAreaRef.current;
    if (!isOpen || !el) return;
    const onWheel = (e: WheelEvent) => {
      if (!currentAttachmentRef.current || !isImageAttachment(currentAttachmentRef.current)) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const next = clampScale(scaleRef.current * factor);
      setScale(next);
      if (next <= MIN_SCALE) setOffset({ x: 0, y: 0 });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [isOpen, index, isImageNow]);

  // Native non-passive touchmove: a two-finger pinch-zoom that calls
  // preventDefault (blocks iOS Safari page-zoom/scroll fighting). React's
  // synthetic onTouchMove is passive in some browsers, so it cannot reliably
  // preventDefault — hence this native listener. Skipped when offline-broken
  // (no image rendered) and cleared on unmount.
  useEffect(() => {
    const el = mediaAreaRef.current;
    if (!isOpen || !el) return;
    const onNativeTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) e.preventDefault();
    };
    el.addEventListener("touchmove", onNativeTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onNativeTouchMove);
  }, [isOpen]);

  // Clear any pending drag-flag timer on close/unmount (no leak, no stray
  // setState-less ref write racing a later open).
  useEffect(() => {
    if (isOpen) return;
    if (dragTimerRef.current) { clearTimeout(dragTimerRef.current); dragTimerRef.current = null; }
    dragStateRef.current = null;
    pinchStateRef.current = null;
    dragOccurredRef.current = false;
  }, [isOpen]);
  useEffect(() => () => {
    if (dragTimerRef.current) clearTimeout(dragTimerRef.current);
  }, []);

  if (!isOpen) return null;
  const attachment = attachments[index];
  if (!attachment) return null;
  const imageAttachment = isImageAttachment(attachment);
  const pdfAttachment = isPdfAttachment(attachment);
  const src = getSrc(attachment);
  const kind = getKind(attachment);
  const onPointerDown = (e: React.PointerEvent) => {
    // A second finger during an active pinch reports pointerType "touch" —
    // never hijack it for panning (that would fling the image).
    if (!imageAttachment || scaleRef.current <= MIN_SCALE || pinchStateRef.current) return;
    if (e.pointerType === "touch" && e.isPrimary === false) return;
    dragStateRef.current = { startX: e.clientX, startY: e.clientY, baseX: offsetRef.current.x, baseY: offsetRef.current.y, pointerId: e.pointerId };
    dragOccurredRef.current = false;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragStateRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    // Touch pointers during a two-finger pinch also fire pointermove events;
    // ignore them so pinch-zoom and pan don't fight over the offset.
    if (e.pointerType === "touch" && pinchStateRef.current) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragOccurredRef.current = true;
    setOffset({ x: d.baseX + dx, y: d.baseY + dy });
  };
  const endPointer = (e: React.PointerEvent) => {
    if (dragStateRef.current?.pointerId === e.pointerId) {
      dragStateRef.current = null;
      try { (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId); } catch { /* already released */ }
      if (dragTimerRef.current) clearTimeout(dragTimerRef.current);
      dragTimerRef.current = window.setTimeout(() => { dragOccurredRef.current = false; }, 60);
    }
  };
  const onTouchStart = (e: React.TouchEvent) => {
    if (!imageAttachment || e.touches.length !== 2) return;
    // Cancel any in-progress single-finger drag so the pinch starts clean.
    dragStateRef.current = null;
    const [a, b] = [e.touches[0], e.touches[1]];
    const startDist = touchDist(a.clientX, a.clientY, b.clientX, b.clientY);
    if (!Number.isFinite(startDist) || startDist <= 0) return;
    pinchStateRef.current = { startDist, startScale: scaleRef.current };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const pinch = pinchStateRef.current;
    if (!pinch || e.touches.length !== 2) return;
    const [a, b] = [e.touches[0], e.touches[1]];
    const nextDist = touchDist(a.clientX, a.clientY, b.clientX, b.clientY);
    if (!Number.isFinite(nextDist) || nextDist <= 0 || !Number.isFinite(pinch.startDist) || pinch.startDist <= 0) return;
    // Clamp the zoom ratio so a single wild touch event can't jump 8x.
    const ratio = Math.min(4, Math.max(0.25, nextDist / pinch.startDist));
    setScale(clampScale(pinch.startScale * ratio));
  };
  const onTouchEnd = () => {
    pinchStateRef.current = null;
  };


  return (
    <div ref={rootRef} className="fixed inset-0 z-50 flex flex-col bg-black text-white" style={{ touchAction: "none" }}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className="min-w-0 space-y-0">
          <div className="truncate text-sm font-semibold">{title}</div>
          <div className="text-xs text-slate-300">{tuning || ""} {capo ? `· Capo ${capo}` : ""}</div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {imageAttachment && (
            <>
              <button onClick={zoomOut} title="Zoom out (-)" aria-label="Zoom out" className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/20">−</button>
              <span className="min-w-[52px] text-center text-xs tabular-nums text-slate-300">{Math.round(scale * 100)}%</span>
              <button onClick={zoomIn} title="Zoom in (+)" aria-label="Zoom in" className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/20">+</button>
              <button
                onClick={resetZoom}
                title="Reset zoom (0)"
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${scale !== 1 ? "bg-brand-600 text-white hover:bg-brand-500" : "bg-white/10 text-slate-400"}`}
              >
                100%
              </button>
            </>
          )}
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            className="rounded-lg bg-white/10 p-2 hover:bg-white/20"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              {isFullscreen ? (
                <path d="M9 9V4H4m0 5h5V4M15 9h5V4m-5 0v5m0 6v5h5m-5 0v-5h5M9 15H4v5m5 0v-5H4" />
              ) : (
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              )}
            </svg>
          </button>
          <button onClick={() => { if (!dragOccurredRef.current) onPrev(); }} className="rounded-lg bg-white/10 px-3 py-2" aria-label="Previous">◀</button>
          <button onClick={() => { if (!dragOccurredRef.current) onNext(); }} className="rounded-lg bg-white/10 px-3 py-2" aria-label="Next">▶</button>
          <button onClick={onClose} className="rounded-lg bg-white/10 px-3 py-2">Close</button>
        </div>
      </div>

      <div ref={mediaAreaRef} className="flex-1 overflow-hidden">
        <div className="flex h-full items-center justify-center px-4">
        {imageAttachment ? (
          imgError || !src ? (
            // Offline / broken-image fallback: images served from Supabase
            // storage may be uncached; never leave a broken <img> icon.
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/5 px-6 py-8 text-center">
              <Icons.Document className="h-10 w-10 text-slate-300" />
              <div>
                <div className="text-base font-semibold text-white">{attachment.caption || attachment.title || title || "Image"}</div>
                <div className="mt-1 text-sm text-slate-300">
                  {!src ? "No file URL available." : "Image unavailable offline — open the setlist online once to cache it."}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {!!src && (
                  <a
                    href={src}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
                  >
                    Open original
                  </a>
                )}
                {!!src && (
                  <button
                    onClick={() => setImgError(false)}
                    className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
                  >
                    Retry
                  </button>
                )}
              </div>
            </div>
          ) : (
          // object-fit: contain behaviour
          <img
            src={src}
            alt={attachment.caption || attachment.title || title || "media"}
            draggable={false}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchEnd}
            onError={() => setImgError(true)}
            className="max-h-full max-w-full select-none object-contain"
            style={{
              transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
              transformOrigin: "center center",
              willChange: "transform",
              touchAction: "none",
              cursor: scale > MIN_SCALE ? "grab" : "zoom-in",
            }}
          />
          )
        ) : pdfAttachment ? (
          <div className="flex h-full w-full max-w-6xl flex-col gap-3 py-2">
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200">
              <span className="inline-flex items-center gap-2 font-medium">
                <Icons.Document className="h-4 w-4" />
                PDF preview
              </span>
              <a
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
              >
                Open in new tab
              </a>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl">
              <iframe
                src={buildPdfViewerUrl(src)}
                className="h-full w-full"
                title={attachment.caption || "PDF document"}
              />
            </div>
            <p className="text-center text-xs text-slate-400">
              Rendered natively so high-resolution PDF pages stay sharp.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/5 px-6 py-8 text-center">
            <Icons.Document className="h-10 w-10 text-slate-300" />
            <div>
              <div className="text-base font-semibold text-white">{attachment.caption || attachment.title || title || "Document"}</div>
              <div className="mt-1 text-sm text-slate-300">{kind || "Document attachment"}</div>
            </div>
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
            >
              Open document
            </a>
          </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between px-4 py-3 text-sm text-slate-300">
        <div>{attachment.caption || attachment.title}</div>
        <div>{index + 1} / {attachments.length}</div>
      </div>
    </div>
  );
}
