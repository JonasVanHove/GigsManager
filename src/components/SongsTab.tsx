"use client";

import { useEffect, useState, useRef } from "react";
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

          <div>
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
