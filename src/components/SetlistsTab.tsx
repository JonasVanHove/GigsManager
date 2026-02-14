"use client";

import { useEffect, useMemo, useState } from "react";
import type { Gig, Setlist } from "@/types";
import { useAuth } from "./AuthProvider";

interface DraftItem {
  id: string;
  type: "song" | "note";
  title: string;
  notes: string;
  chords: string;
  tuning: string;
}

const emptyDraft = {
  title: "",
  description: "",
  items: [] as DraftItem[],
};

const createDraftItem = (type: "song" | "note"): DraftItem => ({
  id: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  type,
  title: "",
  notes: "",
  chords: "",
  tuning: "",
});

export default function SetlistsTab() {
  const { getAccessToken } = useAuth();
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [selectedGigIds, setSelectedGigIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [includeChords, setIncludeChords] = useState(true);
  const [includeTuning, setIncludeTuning] = useState(true);

  const selectedSetlist = useMemo(
    () => setlists.find((s) => s.id === selectedId) || null,
    [setlists, selectedId]
  );

  const loadSetlists = async () => {
    try {
      setLoading(true);
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch("/api/setlists", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error("Failed to fetch setlists");
      }
      const data = await res.json();
      setSetlists(Array.isArray(data) ? data : []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const loadGigs = async () => {
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch("/api/gigs?take=200&skip=0", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error("Failed to fetch gigs");
      }
      const data = await res.json();
      const gigsArray = Array.isArray(data) ? data : (data.data ?? []);
      setGigs(gigsArray);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }
  };

  useEffect(() => {
    loadSetlists();
    loadGigs();
  }, []);

  const hydrateDraft = (setlist: Setlist | null) => {
    if (!setlist) {
      setSelectedId(null);
      setDraftTitle("");
      setDraftDescription("");
      setDraftItems([]);
      setSelectedGigIds([]);
      return;
    }

    setSelectedId(setlist.id);
    setDraftTitle(setlist.title);
    setDraftDescription(setlist.description || "");
    const items = (setlist.items || [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title || "",
        notes: item.notes || "",
        chords: item.chords || "",
        tuning: item.tuning || "",
      }));
    setDraftItems(items);
    setSelectedGigIds((setlist.gigs || []).map((gig) => gig.id));
  };

  const handleNew = () => {
    hydrateDraft(null);
  };

  const handleSelect = (setlist: Setlist) => {
    hydrateDraft(setlist);
  };

  const toggleExpanded = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleAddItem = (type: "song" | "note") => {
    setDraftItems((prev) => [...prev, createDraftItem(type)]);
  };

  const toggleGig = (gigId: string) => {
    setSelectedGigIds((prev) =>
      prev.includes(gigId) ? prev.filter((id) => id !== gigId) : [...prev, gigId]
    );
  };

  const updateItem = (id: string, patch: Partial<DraftItem>) => {
    setDraftItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const removeItem = (id: string) => {
    setDraftItems((prev) => prev.filter((item) => item.id !== id));
  };

  const moveItem = (id: string, direction: "up" | "down") => {
    setDraftItems((prev) => {
      const index = prev.findIndex((item) => item.id === id);
      if (index < 0) return prev;
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const copy = prev.slice();
      const [item] = copy.splice(index, 1);
      copy.splice(nextIndex, 0, item);
      return copy;
    });
  };

  const handleSave = async () => {
    setError("");
    if (!draftTitle.trim()) {
      setError("Title is required");
      return;
    }

    try {
      setSaving(true);
      const token = await getAccessToken();
      if (!token) return;

      const payload = {
        title: draftTitle.trim(),
        description: draftDescription.trim() || null,
        gigIds: selectedGigIds,
        items: draftItems.map((item, index) => ({
          type: item.type,
          title: item.title.trim() || null,
          notes: item.notes.trim() || null,
          chords: item.chords.trim() || null,
          tuning: item.tuning.trim() || null,
          order: index + 1,
        })),
      };

      const url = selectedId ? `/api/setlists/${selectedId}` : "/api/setlists";
      const res = await fetch(url, {
        method: selectedId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("Failed to save setlist");
      }

      const saved = await res.json();
      await loadSetlists();
      hydrateDraft(saved);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    const confirmed = window.confirm("Delete this setlist?");
    if (!confirmed) return;

    try {
      setSaving(true);
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch(`/api/setlists/${selectedId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error("Failed to delete setlist");
      }
      await loadSetlists();
      hydrateDraft(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    if (!selectedId) {
      setError("Select a setlist first");
      return;
    }

    try {
      const token = await getAccessToken();
      if (!token) return;
      const params = new URLSearchParams();
      if (includeChords) params.set("includeChords", "1");
      if (includeTuning) params.set("includeTuning", "1");
      const res = await fetch(`/api/setlists/${selectedId}/export?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error("Failed to export setlist");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${draftTitle.trim() || "setlist"}.docx`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Setlists</h3>
          <button
            type="button"
            onClick={handleNew}
            className="rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
          >
            New
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {loading ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">Loading...</p>
          ) : setlists.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">No setlists yet.</p>
          ) : (
            setlists.map((setlist) => {
              const isExpanded = expandedIds.has(setlist.id);
              const itemCount = setlist.items?.length || 0;
              return (
                <div key={setlist.id} className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                  <div
                    className={`flex items-start gap-2 px-3 py-2 text-left text-sm transition ${
                      selectedId === setlist.id
                        ? "border-brand-400 bg-brand-50 text-brand-700 dark:border-brand-500/50 dark:bg-brand-950/30 dark:text-brand-200"
                        : "bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/60"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={(e) => toggleExpanded(setlist.id, e)}
                      className="mt-0.5 flex-shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                      title={isExpanded ? "Collapse" : "Expand"}
                    >
                      <svg
                        className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelect(setlist)}
                      className="flex-1 text-left"
                    >
                      <p className="font-medium">{setlist.title}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {itemCount} {itemCount === 1 ? "item" : "items"} · {new Date(setlist.updatedAt).toLocaleDateString()}
                      </p>
                    </button>
                  </div>
                  {isExpanded && setlist.items && setlist.items.length > 0 && (
                    <div className="border-t border-slate-200 bg-slate-50/50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/30">
                      <div className="space-y-1.5">
                        {setlist.items
                          .sort((a, b) => a.order - b.order)
                          .map((item, idx) => (
                            <div
                              key={item.id}
                              className="flex items-start gap-2 rounded px-2 py-1.5 text-xs"
                            >
                              <span className="mt-0.5 flex-shrink-0 font-mono text-[10px] text-slate-400">
                                {idx + 1}.
                              </span>
                              <div className="flex-1 min-w-0">
                                {item.type === "song" ? (
                                  <>
                                    <div className="flex items-center gap-1.5">
                                      <svg className="h-3 w-3 flex-shrink-0 text-brand-500" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" />
                                      </svg>
                                      <p className="font-medium text-slate-700 dark:text-slate-200 truncate">
                                        {item.title || "Untitled"}
                                      </p>
                                    </div>
                                    {(item.chords || item.tuning) && (
                                      <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                        {item.tuning && <span className="font-medium">{item.tuning}</span>}
                                        {item.tuning && item.chords && <span className="mx-1">·</span>}
                                        {item.chords && <span>{item.chords}</span>}
                                      </p>
                                    )}
                                    {item.notes && (
                                      <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1">
                                        {item.notes}
                                      </p>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <div className="flex items-center gap-1.5">
                                      <svg className="h-3 w-3 flex-shrink-0 text-slate-400" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                      </svg>
                                      <p className="italic text-slate-600 dark:text-slate-300 line-clamp-2">
                                        {item.notes || "Note"}
                                      </p>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">Setlist editor</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Add songs and notes like breaks or gear changes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={!selectedId || saving}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-900/20"
            >
              Delete
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-500">Title</label>
            <input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              placeholder="Evening show setlist"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500">Description</label>
            <input
              value={draftDescription}
              onChange={(e) => setDraftDescription(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              placeholder="Main stage, 2 sets"
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleAddItem("song")}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            + Add song
          </button>
          <button
            type="button"
            onClick={() => handleAddItem("note")}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            + Add note
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {draftItems.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Add your first song or a note to start building the setlist.
            </div>
          ) : (
            draftItems.map((item, index) => (
              <div
                key={item.id}
                className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-800/50"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {item.type === "song" ? `Song ${index + 1}` : `Note ${index + 1}`}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveItem(item.id, "up")}
                      className="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveItem(item.id, "down")}
                      className="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="rounded px-1.5 py-0.5 text-xs text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {item.type === "song" ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-500">Song title</label>
                      <input
                        value={item.title}
                        onChange={(e) => updateItem(item.id, { title: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                        placeholder="Song name"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500">Tuning</label>
                      <input
                        value={item.tuning}
                        onChange={(e) => updateItem(item.id, { tuning: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                        placeholder="Standard, Drop D"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500">Chords</label>
                      <input
                        value={item.chords}
                        onChange={(e) => updateItem(item.id, { chords: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                        placeholder="Am - F - C - G"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-500">Notes</label>
                      <textarea
                        value={item.notes}
                        onChange={(e) => updateItem(item.id, { notes: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                        rows={2}
                        placeholder="Intro cues, tempo, arrangement"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mt-3">
                    <label className="block text-xs font-medium text-slate-500">Note</label>
                    <textarea
                      value={item.notes}
                      onChange={(e) => updateItem(item.id, { notes: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                      rows={2}
                      placeholder="Break, guitar change, start track"
                    />
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Add buttons at the bottom for mobile convenience */}
        {draftItems.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleAddItem("song")}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              + Add song
            </button>
            <button
              type="button"
              onClick={() => handleAddItem("note")}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              + Add note
            </button>
          </div>
        )}

        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Linked gigs</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Attach this setlist to one or more performances.
              </p>
            </div>
            <span className="text-xs text-slate-400">
              {selectedGigIds.length} selected
            </span>
          </div>
          <div className="mt-3 max-h-44 space-y-2 overflow-y-auto pr-1">
            {gigs.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">No gigs available.</p>
            ) : (
              gigs
                .slice()
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .map((gig) => (
                  <label
                    key={gig.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedGigIds.includes(gig.id)}
                        onChange={() => toggleGig(gig.id)}
                        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      />
                      <span className="font-medium text-slate-700 dark:text-slate-100">
                        {gig.eventName}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400">
                      {new Date(gig.date).toLocaleDateString()}
                    </span>
                  </label>
                ))
            )}
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Export</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Download as Word document for musicians.
              </p>
            </div>
            <button
              type="button"
              onClick={handleExport}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600"
            >
              Export .docx
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600 dark:text-slate-300">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeChords}
                onChange={(e) => setIncludeChords(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              Include chord schema
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeTuning}
                onChange={(e) => setIncludeTuning(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              Include tuning
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
