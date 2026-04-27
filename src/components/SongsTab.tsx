"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { supabaseClient } from "@/lib/supabase-client";
import { useAuth } from "./AuthProvider";
import { useSettings } from "./SettingsProvider";
import { useToast } from "./ToastContainer";

type AttachmentMeta = {
  storagePath: string;
  publicUrl: string;
  contentType: string;
  caption?: string | null;
};

type PhotoNote = {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

const PHOTO_EXPORT_WIDTH = 1400;
const PHOTO_EXPORT_HEIGHT = 933;

function PhotoAnnotationEditor({ onExport }: { onExport: (blob: Blob) => void }) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const photoImageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{
    kind: "photo" | "note";
    id?: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string>("");
  const [photoNatural, setPhotoNatural] = useState({ width: 0, height: 0 });
  const [photoPos, setPhotoPos] = useState({ x: 24, y: 24 });
  const [photoScale, setPhotoScale] = useState(1);
  const [notes, setNotes] = useState<PhotoNote[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  useEffect(() => {
    const updateSize = () => {
      const el = stageRef.current;
      if (!el) return;
      setStageSize({ width: el.clientWidth, height: el.clientHeight });
    };

    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  useEffect(() => {
    if (!photoUrl) {
      photoImageRef.current = null;
      return;
    }

    const img = new Image();
    img.onload = () => {
      photoImageRef.current = img;
      setPhotoNatural({ width: img.naturalWidth, height: img.naturalHeight });
      setPhotoScale(1);
      setPhotoPos({ x: 24, y: 24 });
    };
    img.src = photoUrl;

    return () => {
      photoImageRef.current = null;
    };
  }, [photoUrl]);

  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
  }, [photoUrl]);

  const photoBox = useMemo(() => {
    if (!photoUrl || !photoNatural.width || !photoNatural.height || !stageSize.width || !stageSize.height) {
      return null;
    }

    const fitWidth = Math.max(260, stageSize.width * 0.72);
    const scale = Math.min(1, fitWidth / photoNatural.width) * photoScale;
    const width = photoNatural.width * scale;
    const height = photoNatural.height * scale;

    return { x: photoPos.x, y: photoPos.y, width, height };
  }, [photoUrl, photoNatural, stageSize, photoScale, photoPos]);

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

  const updatePhotoFromPointer = (clientX: number, clientY: number) => {
    const drag = dragRef.current;
    const stage = stageRef.current?.getBoundingClientRect();
    if (!drag || !stage || drag.kind !== "photo" || !photoBox) return;
    const nextX = clamp(clientX - stage.left - drag.offsetX, -photoBox.width * 0.45, stage.width - photoBox.width * 0.15);
    const nextY = clamp(clientY - stage.top - drag.offsetY, -photoBox.height * 0.45, stage.height - photoBox.height * 0.15);
    setPhotoPos({ x: nextX, y: nextY });
  };

  const updateNoteFromPointer = (clientX: number, clientY: number) => {
    const drag = dragRef.current;
    const stage = stageRef.current?.getBoundingClientRect();
    if (!drag || !stage || drag.kind !== "note" || !drag.id) return;
    const nextX = clientX - stage.left - drag.offsetX;
    const nextY = clientY - stage.top - drag.offsetY;
    setNotes((prev) => prev.map((note) => {
      if (note.id !== drag.id) return note;
      return {
        ...note,
        x: clamp(nextX, -40, stage.width - note.width + 40),
        y: clamp(nextY, -20, stage.height - note.height + 20),
      };
    }));
  };

  const handlePhotoFile = (file: File | null) => {
    if (!file) return;
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    const nextUrl = URL.createObjectURL(file);
    setPhotoUrl(nextUrl);
    setPhotoName(file.name);
    setNotes([]);
    setSelectedNoteId(null);
  };

  const addNote = () => {
    const stage = stageRef.current?.getBoundingClientRect();
    const width = 210;
    const height = 110;
    const x = stage ? Math.max(16, stage.width / 2 - width / 2) : 32;
    const y = stage ? Math.max(16, stage.height / 2 - height / 2) : 32;
    const id = crypto.randomUUID();
    setNotes((prev) => [...prev, { id, text: "Nieuwe notitie", x, y, width, height }]);
    setSelectedNoteId(id);
  };

  const clearAll = () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl(null);
    setPhotoName("");
    setPhotoNatural({ width: 0, height: 0 });
    setPhotoPos({ x: 24, y: 24 });
    setPhotoScale(1);
    setNotes([]);
    setSelectedNoteId(null);
  };

  const exportAnnotatedPhoto = async () => {
    if (!photoImageRef.current || !photoBox) return;

    const stageRect = stageRef.current?.getBoundingClientRect();
    const scaleX = stageRect ? PHOTO_EXPORT_WIDTH / stageRect.width : 1;
    const scaleY = stageRect ? PHOTO_EXPORT_HEIGHT / stageRect.height : 1;
    const canvas = document.createElement("canvas");
    canvas.width = PHOTO_EXPORT_WIDTH;
    canvas.height = PHOTO_EXPORT_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      photoImageRef.current,
      photoBox.x * scaleX,
      photoBox.y * scaleY,
      photoBox.width * scaleX,
      photoBox.height * scaleY
    );

    const roundRect = (x: number, y: number, width: number, height: number, radius: number) => {
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + width - radius, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
      ctx.lineTo(x + width, y + height - radius);
      ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      ctx.lineTo(x + radius, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
    };

    const wrapText = (text: string, maxWidth: number) => {
      const words = text.split(/\s+/).filter(Boolean);
      const lines: string[] = [];
      let current = "";
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (ctx.measureText(candidate).width <= maxWidth) {
          current = candidate;
        } else {
          if (current) lines.push(current);
          current = word;
        }
      }
      if (current) lines.push(current);
      return lines.length ? lines : [""];
    };

    for (const note of notes) {
      const x = note.x * scaleX;
      const y = note.y * scaleY;
      const width = note.width * scaleX;
      const height = note.height * scaleY;
      ctx.fillStyle = "rgba(255, 248, 196, 0.95)";
      ctx.strokeStyle = "rgba(161, 98, 7, 0.75)";
      ctx.lineWidth = 2;
      roundRect(x, y, width, height, 14);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#111827";
      ctx.font = `${Math.max(14, 16 * scaleY)}px ui-sans-serif, system-ui, sans-serif`;
      const lines = wrapText(note.text, width - 22);
      const lineHeight = Math.max(18, 22 * scaleY);
      lines.slice(0, 5).forEach((line, index) => {
        ctx.fillText(line, x + 12, y + 24 + index * lineHeight);
      });
    }

    canvas.toBlob((blob) => {
      if (blob) onExport(blob);
    }, "image/webp", 0.92);
  };

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white/80 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Foto annoteren</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Sleep, schaal en zet notities op de foto.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
            <span>Foto kiezen</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhotoFile(e.target.files?.[0] ?? null)} />
          </label>
          <button
            type="button"
            onClick={addNote}
            disabled={!photoUrl}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Notitie toevoegen
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Wissen
          </button>
        </div>
      </div>

      {photoUrl && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950/40">
          <div className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">{photoName}</div>
          <label className="flex min-w-[220px] items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            Vergroten/verkleinen
            <input
              type="range"
              min="0.35"
              max="2.2"
              step="0.01"
              value={photoScale}
              onChange={(e) => setPhotoScale(Number(e.target.value))}
              className="w-full"
            />
          </label>
        </div>
      )}

      <div
        ref={stageRef}
        className="relative aspect-[4/3] overflow-hidden rounded-xl border border-dashed border-slate-300 bg-white shadow-inner touch-none dark:border-slate-700 dark:bg-slate-950"
      >
        {!photoUrl ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-500 dark:text-slate-400">
            Kies een foto om hem te verplaatsen, te schalen en er notities bovenop te zetten.
          </div>
        ) : (
          <>
            {photoBox && (
              <div
                onPointerDown={(e) => {
                  e.preventDefault();
                  const stage = stageRef.current?.getBoundingClientRect();
                  if (!stage) return;
                  dragRef.current = {
                    kind: "photo",
                    offsetX: e.clientX - stage.left - photoPos.x,
                    offsetY: e.clientY - stage.top - photoPos.y,
                  };
                  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (dragRef.current?.kind === "photo") updatePhotoFromPointer(e.clientX, e.clientY);
                }}
                onPointerUp={() => {
                  dragRef.current = null;
                }}
                onPointerCancel={() => {
                  dragRef.current = null;
                }}
                className="absolute cursor-move select-none"
                style={{ left: photoBox.x, top: photoBox.y, width: photoBox.width, height: photoBox.height }}
              >
                <img src={photoUrl} alt="Annotated photo" className="h-full w-full rounded-lg object-contain shadow-lg" draggable={false} />
              </div>
            )}

            {notes.map((note) => (
              <div
                key={note.id}
                onPointerDown={(e) => {
                  setSelectedNoteId(note.id);
                  const stage = stageRef.current?.getBoundingClientRect();
                  if (!stage) return;
                  dragRef.current = {
                    kind: "note",
                    id: note.id,
                    offsetX: e.clientX - stage.left - note.x,
                    offsetY: e.clientY - stage.top - note.y,
                  };
                  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (dragRef.current?.kind === "note" && dragRef.current.id === note.id) updateNoteFromPointer(e.clientX, e.clientY);
                }}
                onPointerUp={() => {
                  dragRef.current = null;
                }}
                onPointerCancel={() => {
                  dragRef.current = null;
                }}
                className={`absolute rounded-xl border shadow-lg ${selectedNoteId === note.id ? "border-brand-500 ring-2 ring-brand-400/30" : "border-amber-500/60"}`}
                style={{ left: note.x, top: note.y, width: note.width, height: note.height, background: "rgba(255,248,196,0.96)" }}
              >
                <div className="flex items-center justify-between rounded-t-xl bg-amber-200/90 px-3 py-1 text-[11px] font-semibold text-amber-900">
                  <span>Notitie</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setNotes((prev) => prev.filter((item) => item.id !== note.id));
                    }}
                    className="rounded px-1.5 py-0.5 hover:bg-amber-300/60"
                  >
                    ×
                  </button>
                </div>
                <textarea
                  value={note.text}
                  onChange={(e) => setNotes((prev) => prev.map((item) => (item.id === note.id ? { ...item, text: e.target.value } : item)))}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="h-[calc(100%-28px)] w-full resize-none bg-transparent px-3 py-2 text-sm text-slate-900 outline-none"
                />
              </div>
            ))}
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={exportAnnotatedPhoto}
          disabled={!photoUrl}
          className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Export annotatie
        </button>
      </div>
    </div>
  );
}

function CanvasEditor({ onExport }: { onExport: (blob: Blob) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const historyRef = useRef<string[]>([]);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = Math.min(window.innerWidth * 0.9, 1200);
    canvas.height = Math.min(window.innerHeight * 0.45, 900);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#111827";
    ctxRef.current = ctx;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Save initial state
    try {
      historyRef.current.push(canvas.toDataURL("image/webp", 0.9));
    } catch {
      // ignore
    }
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    drawing.current = true;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    ctxRef.current?.beginPath();
    ctxRef.current?.moveTo(x, y);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    ctxRef.current?.lineTo(x, y);
    ctxRef.current?.stroke();
  };
  const handlePointerUp = () => {
    drawing.current = false;
    ctxRef.current?.closePath();
    // push snapshot to history for undo
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const url = canvas.toDataURL("image/webp", 0.9);
      historyRef.current.push(url);
      // limit history
      if (historyRef.current.length > 30) historyRef.current.shift();
    } catch {
      // ignore
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas || !ctxRef.current) return;
    ctxRef.current.clearRect(0, 0, canvas.width, canvas.height);
    ctxRef.current.fillStyle = "#ffffff";
    ctxRef.current.fillRect(0, 0, canvas.width, canvas.height);
    try {
      historyRef.current.push(canvas.toDataURL("image/webp", 0.9));
    } catch {}
  };

  const exportImage = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return new Promise<void>((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) onExport(blob);
        resolve();
      }, "image/webp", 0.9);
    });
  };

  const undo = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    // pop current state
    if (historyRef.current.length <= 1) return;
    historyRef.current.pop();
    const prev = historyRef.current[historyRef.current.length - 1];
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = prev;
  };

  return (
    <div className="space-y-2">
      <div className="border rounded-lg overflow-hidden">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="w-full touch-none"
        />
      </div>
      <div className="flex gap-2">
        <button onClick={clear} className="rounded-lg px-3 py-2 bg-slate-100 dark:bg-slate-800">Clear</button>
        <button onClick={exportImage} className="rounded-lg px-3 py-2 bg-brand-600 text-white">Save Drawing</button>
      </div>
    </div>
  );
}

export default function SongsTab() {
  const { session, getAccessToken } = useAuth();
  const { language } = useSettings();
  const toast = useToast();

  const [songs, setSongs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [availableBands, setAvailableBands] = useState<Array<{id:string,name:string}>>([]);
  const [selectedBandIds, setSelectedBandIds] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [attachmentsMeta, setAttachmentsMeta] = useState<AttachmentMeta[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<any[]>([]);
  const [editingSongId, setEditingSongId] = useState<string | null>(null);
  const [deletingAttachmentIds, setDeletingAttachmentIds] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchSongs();
    // load bands for selection
    (async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch("/api/bands", { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const b = await res.json();
          setAvailableBands(b || []);
        }
      } catch (e) {
        // ignore
      }
    })();
  }, []);

  const fetchSongs = async () => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/songs", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed to load songs");
      const data = await res.json();
      setSongs(data);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Failed to fetch songs");
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setSelectedFiles(files);
  };

  async function uploadFile(file: File) {
    // compress images if large by drawing to canvas
    let uploadFile = file;
    if (file.type.startsWith("image/") && file.size > 800 * 1024) {
      // compress
      const img = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      const maxW = 1600;
      const ratio = Math.min(1, maxW / img.width);
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/webp", 0.8));
      if (blob) uploadFile = new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), { type: "image/webp" });
    }

    const fileExt = uploadFile.name.split(".").pop();
    const fileName = `${session?.user?.id}-${Date.now()}-${crypto.randomUUID()}.${fileExt}`;

    const { error: uploadError } = await supabaseClient.storage.from("songs").upload(fileName, uploadFile, { upsert: true });
    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabaseClient.storage.from("songs").getPublicUrl(fileName);
    return { storagePath: fileName, publicUrl, contentType: uploadFile.type } as AttachmentMeta;
  }

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setUploading(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("No session token");

      const uploaded: AttachmentMeta[] = [];
      for (const f of selectedFiles) {
        const meta = await uploadFile(f);
        uploaded.push(meta);
      }

      // attachmentsMeta may include drawings saved via CanvasEditor (client will push using onExport -> handleDrawingExport)
      const allAttachments = [...attachmentsMeta, ...uploaded];

      const bodyPayload: any = { title: title.trim(), notes: notes.trim() || null, attachments: allAttachments, tags, bandIds: selectedBandIds };

      let res;
      if (editingSongId) {
        res = await fetch(`/api/songs?id=${editingSongId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(bodyPayload),
        });
      } else {
        res = await fetch("/api/songs", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(bodyPayload),
        });
      }

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save song");
      }

      setTitle("");
      setNotes("");
      setTags([]);
      setSelectedBandIds([]);
      setSelectedFiles([]);
      setAttachmentsMeta([]);
      setShowForm(false);
      toast.success("Song saved");
      fetchSongs();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Save failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDrawingExport = async (blob: Blob) => {
    const file = new File([blob], `drawing-${Date.now()}.webp`, { type: blob.type });
    try {
      const meta = await uploadFile(file);
      setAttachmentsMeta((s) => [...s, meta]);
      toast.success("Drawing saved as attachment");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to upload drawing");
    }
  };

  const startEdit = (song: any) => {
    setEditingSongId(song.id);
    setTitle(song.title || "");
    setNotes(song.notes || "");
    setExistingAttachments((song.attachments || []).map((a: any) => ({ id: a.id, storagePath: a.storagePath || a.storage_path || a.storagePath, publicUrl: a.publicUrl || a.public_url || a.publicUrl, contentType: a.contentType || a.content_type || 'image', caption: a.caption || null })));
    setAttachmentsMeta([]);
    setSelectedFiles([]);
    setShowForm(true);
    setDeletingAttachmentIds(new Set());
    setTags((song.tags || []).map((t: any) => t.name));
    setSelectedBandIds((song.bands || []).map((b: any) => b.id));
  };

  const toggleDeleteExistingAttachment = (id: string) => {
    setDeletingAttachmentIds((prev) => {
      const copy = new Set(prev);
      if (copy.has(id)) copy.delete(id); else copy.add(id);
      return copy;
    });
  };

  const updateExistingAttachmentCaption = (id: string, caption: string) => {
    setExistingAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, caption } : a)));
  };

  const moveExistingAttachment = (index: number, dir: -1 | 1) => {
    setExistingAttachments((prev) => {
      const arr = [...prev];
      const to = index + dir;
      if (to < 0 || to >= arr.length) return prev;
      const tmp = arr[to];
      arr[to] = arr[index];
      arr[index] = tmp;
      return arr;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{language === 'nl' ? 'Notities' : 'Notes'}</h2>
        <div className="flex gap-2">
          <button onClick={() => setShowForm((s) => !s)} className="rounded-lg bg-brand-600 text-white px-3 py-2">{showForm ? 'Close' : language === 'nl' ? 'Nieuw' : 'New'}</button>
        </div>
      </div>

      {showForm && (
        <div className="space-y-3 rounded-lg border p-4">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={language === 'nl' ? 'Titel' : 'Title'} className="w-full rounded-lg border px-3 py-2" />
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={language === 'nl' ? 'Notities' : 'Notes'} className="w-full rounded-lg border px-3 py-2 h-28" />

          <div className="space-y-2 rounded-lg border p-3">
            <label className="block text-sm font-medium">Tags</label>
            <div className="flex gap-2">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const value = tagInput.trim();
                    if (value && !tags.includes(value)) {
                      setTags((prev) => [...prev, value]);
                    }
                    setTagInput('');
                  }
                }}
                placeholder="Add tag and press Enter"
                className="flex-1 rounded-lg border px-3 py-2"
              />
              <button
                type="button"
                onClick={() => {
                  const value = tagInput.trim();
                  if (value && !tags.includes(value)) setTags((prev) => [...prev, value]);
                  setTagInput('');
                }}
                className="rounded-lg border px-3 py-2"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setTags((prev) => prev.filter((item) => item !== tag))}
                  className="rounded-full bg-slate-100 px-3 py-1 text-sm dark:bg-slate-800"
                >
                  {tag} ×
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <label className="block text-sm font-medium">Bands</label>
            <div className="grid gap-2 sm:grid-cols-2">
              {availableBands.length === 0 ? (
                <div className="text-sm text-slate-500">No bands yet</div>
              ) : (
                availableBands.map((band) => (
                  <label key={band.id} className="flex items-center gap-2 rounded border px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedBandIds.includes(band.id)}
                      onChange={(e) => {
                        setSelectedBandIds((prev) =>
                          e.target.checked ? [...prev, band.id] : prev.filter((id) => id !== band.id)
                        );
                      }}
                    />
                    <span>{band.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="flex gap-2 items-center">
            <label className="rounded-lg border px-3 py-2 cursor-pointer">Attach Photo
              <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" multiple />
            </label>
            <div className="text-sm text-slate-500">{selectedFiles.length} files selected</div>
          </div>

          <div className="space-y-3">
            <PhotoAnnotationEditor onExport={handleDrawingExport} />
            <CanvasEditor onExport={handleDrawingExport} />
          </div>

              {/* Existing attachments (when editing) */}
              {existingAttachments.length > 0 && (
                <div className="space-y-2">
                  <div className="font-semibold">Existing attachments</div>
                  <div className="grid grid-cols-3 gap-2">
                    {existingAttachments.map((a, idx) => (
                      <div key={a.id} className={`rounded overflow-hidden border p-2 ${deletingAttachmentIds.has(a.id) ? 'opacity-50' : ''}`}>
                        <img src={a.publicUrl} className="h-24 w-full object-cover rounded" alt="attachment" />
                        <div className="mt-2 flex gap-2 items-center">
                          <button onClick={() => moveExistingAttachment(idx, -1)} className="px-2 py-1 border rounded">◀</button>
                          <button onClick={() => moveExistingAttachment(idx, 1)} className="px-2 py-1 border rounded">▶</button>
                          <button onClick={() => toggleDeleteExistingAttachment(a.id)} className={`ml-auto px-2 py-1 rounded ${deletingAttachmentIds.has(a.id) ? 'bg-red-600 text-white' : 'border'}`}>{deletingAttachmentIds.has(a.id) ? 'Undo' : 'Delete'}</button>
                        </div>
                        <input value={a.caption || ''} onChange={(e) => updateExistingAttachmentCaption(a.id, e.target.value)} placeholder="Caption" className="mt-2 w-full rounded border px-2 py-1 text-sm" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* New attachments preview (selected files and drawings) */}
              {(selectedFiles.length > 0 || attachmentsMeta.length > 0) && (
                <div className="space-y-2">
                  <div className="font-semibold">New attachments</div>
                  <div className="grid grid-cols-3 gap-2">
                    {selectedFiles.map((f, i) => (
                      <div key={f.name + i} className="rounded overflow-hidden border p-2">
                        <div className="h-24 w-full bg-slate-100 flex items-center justify-center text-sm">{f.name}</div>
                        <div className="mt-2 text-xs text-slate-500">{Math.round(uploadProgress[`${session?.user?.id}-${Date.now()}-${i}`] || 0)}%</div>
                      </div>
                    ))}
                    {attachmentsMeta.map((a, i) => (
                      <div key={a.storagePath} className="rounded overflow-hidden border p-2">
                        <img src={a.publicUrl} className="h-24 w-full object-cover rounded" alt="attachment" />
                        <input value={a.caption || ''} onChange={(e) => setAttachmentsMeta((prev) => prev.map((p, idx) => idx === i ? { ...p, caption: e.target.value } : p))} placeholder="Caption" className="mt-2 w-full rounded border px-2 py-1 text-sm" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={handleSave} disabled={uploading} className="rounded-lg bg-brand-600 text-white px-3 py-2">Save</button>
                <button onClick={() => { setShowForm(false); setSelectedFiles([]); setAttachmentsMeta([]); setExistingAttachments([]); setEditingSongId(null); setDeletingAttachmentIds(new Set()); }} className="rounded-lg border px-3 py-2">Cancel</button>
              </div>
            </div>
          )}

      <div className="space-y-3">
        {loading ? (
          <div className="text-sm text-slate-500">Loading...</div>
        ) : songs.length === 0 ? (
          <div className="text-sm text-slate-500">No songs yet</div>
        ) : (
          <div className="grid gap-3">
            {songs.map((s) => (
              <div key={s.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold">{s.title}</div>
                    {s.notes && <div className="text-sm text-slate-600">{s.notes}</div>}
                  </div>
                </div>
                {s.attachments && s.attachments.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {s.attachments.map((a: any) => (
                      <img key={a.id} src={a.publicUrl} className="h-24 w-full object-cover rounded" alt="attachment" />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
