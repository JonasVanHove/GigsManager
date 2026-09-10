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
  const pinchStateRef = useRef<{ startDist: number; startScale: number } | null>(null);
  const dragStateRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number; pointerId: number } | null>(null);
  const dragOccurredRef = useRef(false);
  const currentAttachmentRef = useRef<Attachment | null>(null);
  const attachmentNow = attachments[index] ?? null;
  currentAttachmentRef.current = attachmentNow;
  const isImageNow = attachmentNow ? isImageAttachment(attachmentNow) : false;
  // Reset zoom/pan whenever the attachment changes or the viewer opens/closes.
  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, [isOpen, index]);

  const zoomIn = useCallback(() => setScale((s) => clampScale(s * 1.25)), []);
  const zoomOut = useCallback(() => {
    setScale((s) => {
      const next = clampScale(s / 1.25);
      if (next <= MIN_SCALE) setOffset({ x: 0, y: 0 });
      return next;
    });
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
      if (e.key === "Escape") onClose();
      if (e.key === "+" || e.key === "=") zoomIn();
      if (e.key === "-") zoomOut();
      if (e.key === "0") resetZoom();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose, onPrev, onNext, zoomIn, zoomOut, resetZoom]);

  // Non-passive wheel zoom (React onWheel is passive; preventDefault must
  // be attached natively). Images only.
  useEffect(() => {
    const el = mediaAreaRef.current;
    if (!isOpen || !el) return;
    const onWheel = (e: WheelEvent) => {
      if (!currentAttachmentRef.current || !isImageAttachment(currentAttachmentRef.current)) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      setScale((sv) => {
        const next = clampScale(sv * factor);
        if (next <= MIN_SCALE) setOffset({ x: 0, y: 0 });
        return next;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [isOpen, index, isImageNow]);

  if (!isOpen) return null;
  const attachment = attachments[index];
  if (!attachment) return null;
  const imageAttachment = isImageAttachment(attachment);
  const pdfAttachment = isPdfAttachment(attachment);
  const src = getSrc(attachment);
  const kind = getKind(attachment);
  const onPointerDown = (e: React.PointerEvent) => {
    if (!imageAttachment || scale <= MIN_SCALE) return;
    dragStateRef.current = { startX: e.clientX, startY: e.clientY, baseX: offset.x, baseY: offset.y, pointerId: e.pointerId };
    dragOccurredRef.current = false;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragStateRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragOccurredRef.current = true;
    setOffset({ x: d.baseX + dx, y: d.baseY + dy });
  };
  const endPointer = (e: React.PointerEvent) => {
    if (dragStateRef.current?.pointerId === e.pointerId) {
      dragStateRef.current = null;
      window.setTimeout(() => { dragOccurredRef.current = false; }, 60);
    }
  };
  const onTouchStart = (e: React.TouchEvent) => {
    if (!imageAttachment || e.touches.length !== 2) return;
    const [a, b] = [e.touches[0], e.touches[1]];
    pinchStateRef.current = { startDist: touchDist(a.clientX, a.clientY, b.clientX, b.clientY), startScale: scale };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const pinch = pinchStateRef.current;
    if (!pinch || e.touches.length !== 2) return;
    const [a, b] = [e.touches[0], e.touches[1]];
    const nextDist = touchDist(a.clientX, a.clientY, b.clientX, b.clientY);
    if (nextDist > 0) setScale(clampScale(pinch.startScale * (nextDist / pinch.startDist)));
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
            className="max-h-full max-w-full select-none object-contain"
            style={{
              transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
              transformOrigin: "center center",
              willChange: "transform",
              touchAction: "none",
              cursor: scale > MIN_SCALE ? "grab" : "zoom-in",
            }}
          />
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
