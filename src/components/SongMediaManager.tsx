"use client";

import { useState } from "react";
import { supabaseClient } from "@/lib/supabase-client";
import { readAsDataUrl as readFileAsDataUrl } from "@/lib/file-utils";

type SongAttachment = {
  id: string;
  storagePath: string;
  publicUrl: string;
  contentType: string;
  caption?: string | null;
  order: number;
};

interface SongMediaManagerProps {
  attachments: SongAttachment[];
  onChange: (attachments: SongAttachment[]) => void;
}

export function SongMediaManager({ attachments, onChange }: SongMediaManagerProps) {
  const [uploading, setUploading] = useState(false);

  const uploadFiles = async (files: FileList | null) => {
    const items = Array.from(files || []);
    if (items.length === 0) return;

    setUploading(true);
    try {
      const nextAttachments = [...attachments];
      for (const file of items) {
        const ext = file.name.split(".").pop() || "bin";
        const fileName = `${Date.now()}-${crypto.randomUUID()}.${ext}`;

        const { error } = await supabaseClient.storage.from("songs").upload(fileName, file, { upsert: true });
        if (error) {
          const fallbackUrl = await readFileAsDataUrl(file);
          nextAttachments.push({
            id: crypto.randomUUID(),
            storagePath: `local:${fileName}`,
            publicUrl: fallbackUrl,
            contentType: file.type || "application/octet-stream",
            caption: file.name,
            order: nextAttachments.length + 1,
          });
          continue;
        }

        const { data } = supabaseClient.storage.from("songs").getPublicUrl(fileName);
        nextAttachments.push({
          id: crypto.randomUUID(),
          storagePath: fileName,
          publicUrl: data.publicUrl,
          contentType: file.type || "application/octet-stream",
          caption: file.name,
          order: nextAttachments.length + 1,
        });
      }

      onChange(nextAttachments.map((attachment, index) => ({ ...attachment, order: index + 1 })));
    } finally {
      setUploading(false);
    }
  };

  const updateCaption = (id: string, caption: string) => {
    onChange(attachments.map((attachment) => (attachment.id === id ? { ...attachment, caption } : attachment)));
  };

  const removeAttachment = (id: string) => {
    onChange(attachments.filter((attachment) => attachment.id !== id).map((attachment, index) => ({ ...attachment, order: index + 1 })));
  };

  const moveAttachment = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= attachments.length) return;
    const copy = [...attachments];
    const [item] = copy.splice(index, 1);
    copy.splice(nextIndex, 0, item);
    onChange(copy.map((attachment, idx) => ({ ...attachment, order: idx + 1 })));
  };

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-950/50">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Media</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Upload screenshots, scores, chord sheets and lyrics.</div>
        </div>
        <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          {uploading ? "Uploading..." : "Upload media"}
          <input type="file" accept="image/*,.pdf" multiple onChange={(event) => uploadFiles(event.target.files)} className="hidden" />
        </label>
      </div>

      {attachments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          No media attached yet.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {attachments.map((attachment, index) => (
            <div key={attachment.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
              {attachment.contentType.startsWith("image/") ? (
                <img 
                  src={attachment.publicUrl} 
                  alt={attachment.caption || "attachment"} 
                  className="h-36 w-full object-cover" 
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    const parent = e.currentTarget.parentElement;
                    if (parent) {
                      parent.classList.add('bg-slate-100', 'dark:bg-slate-800');
                    }
                  }}
                />
              ) : (
                <div className="flex h-36 items-center justify-center bg-slate-100 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  PDF / document
                </div>
              )}
              <div className="space-y-2 p-3">
                <input
                  value={attachment.caption || ""}
                  onChange={(event) => updateCaption(attachment.id, event.target.value)}
                  placeholder="Caption"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => moveAttachment(index, -1)} className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700">
                    ↑
                  </button>
                  <button type="button" onClick={() => moveAttachment(index, 1)} className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700">
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAttachment(attachment.id)}
                    className="ml-auto rounded border border-red-200 px-2 py-1 text-xs text-red-600 dark:border-red-500/40 dark:text-red-300"
                  >
                    Delete
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