"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "./AuthProvider";
import { useSettings } from "./SettingsProvider";
import { useToast } from "./ToastContainer";
import { SongMediaManager } from "./SongMediaManager";
import FullscreenMediaViewer from "./FullscreenMediaViewer";
import { Icons } from "./Icons";
import { createPrintDocument } from "@/lib/print-document";
import { useTranslation } from "react-i18next";
import LoadingSpinner from "./LoadingSpinner";
import XAIExplanationModal from "./XAIExplanationModal";

type SongAttachment = {
  id: string;
  storagePath: string;
  publicUrl: string;
  contentType: string;
  caption?: string | null;
  order: number;
};

type SongRecord = {
  id: string;
  title: string;
  notes: string | null;
  attachments?: SongAttachment[];
  tags?: Array<{ id: string; name: string }>;
  bands?: Array<{ id: string; name: string }>;
  createdAt: string;
};

const isImageAttachment = (attachment: SongAttachment) =>
  attachment.contentType?.startsWith("image/") || /\.(avif|gif|jpe?g|png|webp)(?:[?#]|$)/i.test(attachment.publicUrl);

const isPdfAttachment = (attachment: SongAttachment) =>
  attachment.contentType?.toLowerCase() === "application/pdf" || /\.pdf(?:[?#]|$)/i.test(attachment.publicUrl);

type SongMeta = {
  bandProject: string;
  genre: string;
  keySignature: string;
  bpm: string;
  comments: string;
};

const META_START = "[[song-meta]]";
const META_END = "[[/song-meta]]";

const defaultMeta = (): SongMeta => ({ bandProject: "", genre: "", keySignature: "", bpm: "", comments: "" });

const parseSongNotes = (raw: string | null | undefined) => {
  const fallback = { meta: defaultMeta(), body: raw || "" };
  if (!raw || !raw.startsWith(META_START)) return fallback;

  const endIndex = raw.indexOf(META_END);
  if (endIndex < 0) return fallback;

  try {
    const metaJson = raw.slice(META_START.length, endIndex).trim();
    const body = raw.slice(endIndex + META_END.length).replace(/^\s+/, "");
    const parsed = JSON.parse(metaJson) as Partial<SongMeta>;
    return {
      meta: {
        bandProject: typeof parsed.bandProject === "string" ? parsed.bandProject : "",
        genre: typeof parsed.genre === "string" ? parsed.genre : "",
        keySignature: typeof parsed.keySignature === "string" ? parsed.keySignature : "",
        bpm: typeof parsed.bpm === "string" ? parsed.bpm : "",
        comments: typeof parsed.comments === "string" ? parsed.comments : "",
      },
      body,
    };
  } catch {
    return fallback;
  }
};

const serializeSongNotes = (meta: SongMeta, body: string) => {
  const cleanedBody = body.trim();
  return `${META_START}\n${JSON.stringify(meta)}\n${META_END}${cleanedBody ? `\n\n${cleanedBody}` : ""}`;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default function SongsTab() {
  const { getAccessToken } = useAuth();
  const { locale, settings } = useSettings();
  const toast = useToast();
  const { t } = useTranslation();

  const [songs, setSongs] = useState<SongRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [songSearch, setSongSearch] = useState("");
  const [showOnlyWithNotes, setShowOnlyWithNotes] = useState(false);
  const [attachmentFilter, setAttachmentFilter] = useState<"all" | "with" | "without">("all");
  const [tuningFilter, setTuningFilter] = useState<string>("");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [keyFilter, setKeyFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<"title" | "date" | "attachments">("title");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSong, setEditingSong] = useState<SongRecord | null>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [songMeta, setSongMeta] = useState<SongMeta>(defaultMeta());
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [attachments, setAttachments] = useState<SongAttachment[]>([]);
  const [saving, setSaving] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerAttachments, setViewerAttachments] = useState<SongAttachment[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerTitle, setViewerTitle] = useState<string | undefined>(undefined);
  const [viewerTuning, setViewerTuning] = useState<string | undefined>(undefined);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [selectedSongForAI, setSelectedSongForAI] = useState<SongRecord | null>(null);
  const [aiSimilarSongs, setAiSimilarSongs] = useState<SongRecord[]>([]);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [autoDetectedKey, setAutoDetectedKey] = useState<string>("");
  const [showAIExplanation, setShowAIExplanation] = useState(false);
  const [aiExplanationTitle, setAiExplanationTitle] = useState("");
  const [aiExplanationText, setAiExplanationText] = useState("");
  const [aiExplanationDetails, setAiExplanationDetails] = useState<Array<{ label: string; value: string }>>([]);

  const fetchSongs = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      console.log('[DEBUG SongsTab] Fetching songs with attachments...');
      const res = await fetch("/api/songs?includeAttachments=true", {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error("Failed to load songs");
      const data = (await res.json()) as SongRecord[];
      console.log('[DEBUG SongsTab] Received songs data:', data.length, data);
      console.log('[DEBUG SongsTab] Songs with attachments:', data.filter(s => s.attachments && s.attachments.length > 0).map(s => ({ id: s.id, title: s.title, attachmentsCount: s.attachments?.length })));
      setSongs(Array.isArray(data) ? data : []);
    } catch (error: any) {
      console.error('[DEBUG SongsTab] Error fetching songs:', error);
      toast.error(error?.message || "Failed to fetch songs");
    } finally {
      setLoading(false);
    }
  }, [getAccessToken, toast]);

  const deleteSong = useCallback(async (songId: string) => {
    if (!confirm(t('songs.deleteConfirm'))) return;
    
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/songs?id=${songId}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error("Failed to delete song");
      toast.success(t('songs.songDeleted'));
      fetchSongs();
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete song");
    }
  }, [getAccessToken, toast, t, fetchSongs]);

  useEffect(() => {
    fetchSongs();
  }, [fetchSongs]);

  // Close tag dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const dropdown = document.getElementById('tag-filter-dropdown');
      const button = document.querySelector('[data-tag-filter-button]');
      if (dropdown && !dropdown.contains(target) && button && !button.contains(target)) {
        setShowTagDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcut: ESC to close Similar Songs modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedSongForAI) {
        setSelectedSongForAI(null);
        setAiSimilarSongs([]);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSongForAI]);

  // AI Similar Songs Analysis
  const analyzeSimilarSongs = useCallback((song: SongRecord) => {
    setSelectedSongForAI(song);
    setAiAnalyzing(true);
    setAiSimilarSongs([]);

    setTimeout(() => {
      const currentMeta = parseSongNotes(song.notes).meta;
      const similarities = songs
        .filter(s => s.id !== song.id)
        .map(otherSong => {
          const otherMeta = parseSongNotes(otherSong.notes).meta;
          let score = 0;
          const reasons: string[] = [];

          // Genre match
          if (currentMeta.genre && otherMeta.genre && 
              currentMeta.genre.toLowerCase() === otherMeta.genre.toLowerCase()) {
            score += 30;
            reasons.push('Same genre');
          }

          // Key signature match
          if (currentMeta.keySignature && otherMeta.keySignature && 
              currentMeta.keySignature.toLowerCase() === otherMeta.keySignature.toLowerCase()) {
            score += 25;
            reasons.push('Same key');
          }

          // BPM proximity
          if (currentMeta.bpm && otherMeta.bpm) {
            const bpmDiff = Math.abs(parseInt(currentMeta.bpm) - parseInt(otherMeta.bpm));
            if (bpmDiff <= 5) {
              score += 20;
              reasons.push('Similar tempo');
            } else if (bpmDiff <= 15) {
              score += 10;
              reasons.push('Related tempo');
            }
          }

          // Band/project match
          if (currentMeta.bandProject && otherMeta.bandProject && 
              currentMeta.bandProject.toLowerCase() === otherMeta.bandProject.toLowerCase()) {
            score += 15;
            reasons.push('Same project');
          }

          return { song: otherSong, score, reasons };
        })
        .filter(result => result.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(result => result.song);

      setAiSimilarSongs(similarities);
      setAiAnalyzing(false);
    }, 1000); // Simulate AI processing
  }, [songs]);

  // Key/Tuning Detection Helper
  const detectKeyFromTitle = useCallback((title: string): string => {
    const commonKeys = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 
                       'Am', 'Dm', 'Em', 'Fm', 'Gm', 'Bm',
                       'Cm', 'C#', 'Db', 'D#', 'Eb', 'F#', 'Gb', 'G#', 'Ab', 'A#', 'Bb'];
    
    const lowerTitle = title.toLowerCase();
    
    for (const key of commonKeys) {
      if (lowerTitle.includes(key.toLowerCase()) || 
          lowerTitle.includes(key.replace('#', ' ').toLowerCase()) ||
          lowerTitle.includes(key.replace('b', ' ').toLowerCase())) {
        return key;
      }
    }
    
    return '';
  }, []);

  const detectKeyFromNotes = useCallback((notes: string): string => {
    if (!notes) return '';
    
    const chordPatterns = [
      /\b[A-G][#b]m?(?:maj|min)?\b/g,  // Basic chords like Am, C#m, Gmaj
      /\b[A-G](?=\s|\)|,|\.|$)/g      // Single letters followed by space or punctuation
    ];
    
    const keyCounts: Record<string, number> = {};
    
    for (const pattern of chordPatterns) {
      const matches = notes.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const cleanMatch = match.replace(/maj|min/g, '').toUpperCase();
          keyCounts[cleanMatch] = (keyCounts[cleanMatch] || 0) + 1;
        });
      }
    }
    
    // Find the most common key
    let maxCount = 0;
    let detectedKey = '';
    
    for (const [key, count] of Object.entries(keyCounts)) {
      if (count > maxCount) {
        maxCount = count;
        detectedKey = key;
      }
    }
    
    return maxCount >= 2 ? detectedKey : '';
  }, []);

  const autoDetectKey = useCallback((song: SongRecord) => {
    const titleKey = detectKeyFromTitle(song.title);
    const notesKey = detectKeyFromNotes(parseSongNotes(song.notes).body);
    
    const detected = titleKey || notesKey;
    if (detected) {
      setAutoDetectedKey(detected);
      setAiExplanationTitle("AI Key Detection");
      setAiExplanationText(
        `The AI has analyzed the song title and notes to detect the most likely key signature. This detection helps maintain harmonic compatibility when creating setlist flows and recommending similar songs.`
      );
      setAiExplanationDetails([
        { label: "Detected Key", value: detected },
        { label: "Detection Method", value: titleKey ? "Song title pattern" : "Notes metadata" },
        { label: "Confidence", value: "Medium (music metadata inference)" },
      ]);
      setShowAIExplanation(true);
    } else {
      toast.info('No clear key signature detected from title or notes');
    }
  }, [detectKeyFromTitle, detectKeyFromNotes, toast]);

  const filteredSongs = useMemo(() => {
    const query = songSearch.trim().toLowerCase();
    let result = songs.filter((song) => {
      const parsed = parseSongNotes(song.notes);
      if (showOnlyWithNotes && !parsed.body.trim()) return false;
      
      // Attachment filter
      if (attachmentFilter === "with" && (!song.attachments || song.attachments.length === 0)) return false;
      if (attachmentFilter === "without" && song.attachments && song.attachments.length > 0) return false;
      
      // Tuning filter
      if (tuningFilter && parsed.meta.keySignature.toLowerCase() !== tuningFilter.toLowerCase()) return false;
      
      // Tag filter (multi-select)
      if (tagFilter.length > 0 && (!song.tags || !tagFilter.some(tf => song.tags?.some(t => t.name.toLowerCase() === tf.toLowerCase())))) return false;
      
      // Key signature filter
      if (keyFilter && parsed.meta.keySignature.toLowerCase() !== keyFilter.toLowerCase()) return false;
      
      if (!query) return true;
      return (
        song.title.toLowerCase().includes(query) ||
        parsed.body.toLowerCase().includes(query) ||
        [parsed.meta.bandProject, parsed.meta.genre, parsed.meta.keySignature, parsed.meta.bpm, parsed.meta.comments]
          .join(" ")
          .toLowerCase()
          .includes(query)
      );
    });

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      if (sortBy === "title") {
        comparison = a.title.localeCompare(b.title);
      } else if (sortBy === "date") {
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortBy === "attachments") {
        comparison = (a.attachments?.length || 0) - (b.attachments?.length || 0);
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });

    return result;
  }, [songs, songSearch, showOnlyWithNotes, attachmentFilter, tuningFilter, tagFilter, keyFilter, sortBy, sortOrder]);

  const openEditor = (song?: SongRecord) => {
    if (!song) {
      setEditingSong(null);
      setTitle("");
      setNotes("");
      setSongMeta(defaultMeta());
      setTags([]);
      setTagInput("");
      setAttachments([]);
      setEditorOpen(true);
      return;
    }

    const parsed = parseSongNotes(song.notes);
    setEditingSong(song);
    setTitle(song.title);
    setNotes(parsed.body);
    setSongMeta(parsed.meta);
    setTags((song.tags || []).map((tag) => tag.name));
    setTagInput("");
    setAttachments((song.attachments || []).slice().sort((a, b) => a.order - b.order));
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingSong(null);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error(t('songs.titleRequired'));
      return;
    }

    setSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("No session token");

      const normalizedTags = tags.slice();
      const artist = (songMeta.bandProject || "").trim();
      if (artist && !normalizedTags.includes(artist)) normalizedTags.unshift(artist);

      const payload = {
        title: title.trim(),
        notes: serializeSongNotes(songMeta, notes),
        tags: normalizedTags,
        attachments: attachments.map((attachment, index) => ({
          storagePath: attachment.storagePath,
          publicUrl: attachment.publicUrl,
          contentType: attachment.contentType,
          caption: attachment.caption || null,
          order: index + 1,
        })),
      };

      const res = await fetch(editingSong ? `/api/songs?id=${editingSong.id}` : "/api/songs", {
        method: editingSong ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Failed to save song");
      }

      toast.success(t('songs.saved'));
      closeEditor();
      fetchSongs();
    } catch (error: any) {
      toast.error(error?.message || (t('songs.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  const handleExportSong = (song: SongRecord) => {
    const parsed = parseSongNotes(song.notes);
    const win = window.open('', '_blank', 'toolbar=0,location=0,menubar=0');
    if (!win) return;
    const body: string[] = [];
    
    // Header with centered title
    body.push('<header class="document-header"><div class="document-eyebrow">GigManager · Song Sheet</div>');
    body.push(`<h1 class="document-title">${escapeHtml(song.title)}</h1>`);

    // Metadata badges
    const metaBadges: string[] = [];
    if (parsed.meta.bandProject) metaBadges.push(`<span class="metadata-item">Band: ${escapeHtml(parsed.meta.bandProject)}</span>`);
    if (parsed.meta.genre) metaBadges.push(`<span class="metadata-item">Genre: ${escapeHtml(parsed.meta.genre)}</span>`);
    if (parsed.meta.keySignature) metaBadges.push(`<span class="metadata-item">Key: ${escapeHtml(parsed.meta.keySignature)}</span>`);
    if (parsed.meta.bpm) metaBadges.push(`<span class="metadata-item">BPM: ${escapeHtml(parsed.meta.bpm)}</span>`);
    if (metaBadges.length > 0) body.push(`<div class="metadata">${metaBadges.join('')}</div>`);
    body.push('</header>');

    // Notes section
    if (parsed.body.trim()) {
      body.push('<section class="section"><h2 class="section-heading">Notes</h2>');
      body.push(`<div class="note-content">${escapeHtml(parsed.body)}</div>`);
      body.push('</section>');
    }

    // Comments section
    if (parsed.meta.comments.trim()) {
      body.push('<section class="section"><h2 class="section-heading">Comments</h2>');
      body.push(`<div class="note-content">${escapeHtml(parsed.meta.comments)}</div>`);
      body.push('</section>');
    }

    // Attachments section - no captions by default
    if (song.attachments && song.attachments.length > 0) {
      const imageAttachments = song.attachments.filter(isImageAttachment);
      if (imageAttachments.length > 0) {
        body.push('<section class="section"><h2 class="section-heading">Attachments</h2>');
        imageAttachments.forEach((att) => {
          body.push(`<figure class="attachment"><img src="${escapeHtml(att.publicUrl)}" alt="" loading="eager" /></figure>`);
        });
        body.push('</section>');
      }
    }

    win.document.open();
    win.document.write(createPrintDocument(escapeHtml(song.title), body.join('\n'), {
      includeLogo: settings.pdfIncludeLogo ?? true,
      font: settings.pdfFont ?? "inter",
      pageSize: settings.pdfPageSize ?? "a4",
      pageBreakMode: settings.pdfPageBreakMode ?? "auto",
      darkMode: settings.pdfDarkMode ?? false,
      showHeaders: settings.pdfShowHeaders ?? true,
      showMetadata: settings.pdfShowMetadata ?? true,
      imagesOnly: settings.pdfImagesOnly ?? false,
      showPageNumbers: settings.pdfShowPageNumbers ?? true,
      marginSize: settings.pdfMarginSize ?? "medium",
    }));
    win.document.close();
  };

  return (
    <div data-testid="songs-container" className="space-y-6 bg-black text-slate-100 p-4 sm:p-6 rounded-3xl border border-neutral-800/80 shadow-2xl min-h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 border-b border-neutral-800/80 pb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-cyan-500 animate-pulse" />
            {t('songs.repertoireTitle')}
          </h2>
          <p className="text-xs text-neutral-400 mt-1">{t('songs.repertoireSubtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => openEditor()}
          className="rounded-xl bg-gradient-to-r from-brand-600 via-indigo-600 to-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:shadow-cyan-500/20 transition hover:scale-[1.02] active:scale-[0.98]"
        >
          {t('songs.newButton')}
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/90 p-4 shadow-xl backdrop-blur">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <input
            type="text"
            value={songSearch}
            onChange={(e) => setSongSearch(e.target.value)}
            placeholder={t('songs.searchPlaceholder')}
            className="w-full rounded-xl border border-neutral-800 bg-black px-4 py-2.5 text-sm text-slate-100 placeholder-neutral-500 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition"
          />
          <label className="inline-flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
            <input
              type="checkbox"
              checked={showOnlyWithNotes}
              onChange={(e) => setShowOnlyWithNotes(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-700 bg-neutral-900 text-cyan-500 focus:ring-cyan-500"
            />
            {t('songs.withNotesOnly')}
          </label>
        </div>
        
        {/* Additional Filters */}
        <div className="mt-3 flex flex-col gap-3">
          {/* Attachment Filter - Prominent */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-neutral-800 bg-black p-2 min-w-0 max-w-full">
            <span className="text-xs font-medium text-neutral-400 shrink-0">{t('songs.filterAttachments')}:</span>
            <div className="flex flex-wrap gap-1.5 min-w-0 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setAttachmentFilter("all")}
                className={`rounded px-2 py-1.5 text-xs font-medium transition shrink-0 ${
                  attachmentFilter === "all"
                    ? "bg-cyan-600 text-white"
                    : "bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
                }`}
              >
                {t('songs.filterAttachmentsAll')}
              </button>
              <button
                type="button"
                onClick={() => setAttachmentFilter("with")}
                className={`rounded px-2 py-1.5 text-xs font-medium transition shrink-0 ${
                  attachmentFilter === "with"
                    ? "bg-cyan-600 text-white"
                    : "bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
                }`}
              >
                {t('songs.filterAttachmentsWith')}
              </button>
              <button
                type="button"
                onClick={() => setAttachmentFilter("without")}
                className={`rounded px-2 py-1.5 text-xs font-medium transition shrink-0 ${
                  attachmentFilter === "without"
                    ? "bg-cyan-600 text-white"
                    : "bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
                }`}
              >
                {t('songs.filterAttachmentsWithout')}
              </button>
            </div>
          </div>

          {/* Secondary Filters Row */}
          <div className="flex flex-wrap gap-2">
            {/* Tuning Filter */}
            <select
              value={tuningFilter}
              onChange={(e) => setTuningFilter(e.target.value)}
              className="rounded-lg border border-neutral-800 bg-black px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition"
            >
              <option value="">{t('songs.filterTuning')}</option>
              {Array.from(new Set(songs.map(s => parseSongNotes(s.notes).meta.keySignature).filter(Boolean))).sort().map(tuning => (
                <option key={tuning} value={tuning}>{tuning}</option>
              ))}
            </select>
            
            {/* Multi-Select Tag Filter */}
            <div className="relative">
              <button
                type="button"
                data-tag-filter-button
                onClick={() => setShowTagDropdown(!showTagDropdown)}
                className="rounded-lg border border-neutral-800 bg-black px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition flex items-center gap-2"
              >
                {tagFilter.length > 0 ? (
                  <span className="text-cyan-400">{tagFilter.length} tags</span>
                ) : (
                  <span className="text-neutral-400">{t('songs.filterTag')}</span>
                )}
                <span className="text-neutral-400">▼</span>
              </button>
              
              {/* Dropdown */}
              {showTagDropdown && (
                <div 
                  id="tag-filter-dropdown"
                  className="absolute left-0 mt-1 w-56 max-h-64 overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-950 shadow-xl z-10 p-2"
                >
                  {Array.from(new Set(songs.flatMap(s => s.tags?.map(t => t.name) || []))).sort().map(tag => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        if (tagFilter.includes(tag)) {
                          setTagFilter(prev => prev.filter(t => t !== tag));
                        } else {
                          setTagFilter(prev => [...prev, tag]);
                        }
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs text-slate-100 hover:bg-neutral-800 rounded transition"
                    >
                      <input
                        type="checkbox"
                        checked={tagFilter.includes(tag)}
                        readOnly
                        className="h-3 w-3 rounded border-neutral-700 bg-neutral-900 text-cyan-500 focus:ring-cyan-500"
                      />
                      <span className={tagFilter.includes(tag) ? "text-cyan-400 font-medium" : "text-neutral-300"}>{tag}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Active Tag Filters */}
            {tagFilter.length > 0 && (
              <div className="flex flex-wrap gap-1.5 items-center">
                {tagFilter.map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setTagFilter(prev => prev.filter(t => t !== tag))}
                    className="rounded-full bg-cyan-950/60 border border-cyan-800/50 px-2 py-0.5 text-[10px] font-semibold text-cyan-300 hover:bg-cyan-900/80 transition flex items-center gap-1"
                  >
                    {tag}
                    <span className="text-cyan-400">×</span>
                  </button>
                ))}
              </div>
            )}
            
            {/* Key Filter */}
            <select
              value={keyFilter}
              onChange={(e) => setKeyFilter(e.target.value)}
              className="rounded-lg border border-neutral-800 bg-black px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition"
            >
              <option value="">{t('songs.filterKey')}</option>
              {Array.from(new Set(songs.map(s => parseSongNotes(s.notes).meta.keySignature).filter(Boolean))).sort().map(key => (
                <option key={key} value={key}>{key}</option>
              ))}
            </select>

            {/* Sort Controls */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "title" | "date" | "attachments")}
              className="rounded-lg border border-neutral-800 bg-black px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition"
            >
              <option value="title">{t('songs.sortTitle')}</option>
              <option value="date">{t('songs.sortDate')}</option>
              <option value="attachments">{t('songs.sortAttachments')}</option>
            </select>
            <button
              type="button"
              onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
              className="rounded-lg border border-neutral-800 bg-black px-3 py-1.5 text-xs text-slate-100 hover:bg-neutral-800 transition"
            >
              {sortOrder === "asc" ? "↑" : "↓"}
            </button>
          </div>
          
          {/* Reset Filters Button */}
          {(attachmentFilter !== "all" || tuningFilter || tagFilter.length > 0 || keyFilter) && (
            <button
              onClick={() => {
                setAttachmentFilter("all");
                setTuningFilter("");
                setTagFilter([]);
                setKeyFilter("");
              }}
              className="self-start rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs text-slate-300 hover:bg-neutral-800 transition"
            >
              {t('songs.resetFilters')}
            </button>
          )}
        </div>

        {/* Songs List */}
        <div className="mt-5 grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center col-span-full">
              <LoadingSpinner size="lg" message={t('songs.loadingRepertoire')} />
            </div>
          ) : filteredSongs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-800 p-8 text-center text-sm text-neutral-400 col-span-full">
              {t('songs.emptyState')}
            </div>
          ) : (
            filteredSongs.map((song) => {
              const parsed = parseSongNotes(song.notes);
              const attachmentCount = song.attachments?.length || 0;
              return (
                <div
                  key={song.id}
                  className="rounded-2xl border border-neutral-800/90 bg-black p-4 transition duration-200 hover:border-neutral-700 hover:shadow-card-hover hover:shadow-cyan-950/20 w-full"
                >
                  <div className="flex flex-col gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-base font-bold text-white">{song.title}</div>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="truncate text-xs font-medium text-neutral-400">
                          {(song.bands || []).map((b) => b.name).join(", ") || t('songs.noBand')}
                        </span>
                        {parsed.meta.keySignature && (
                          <span className="rounded-full bg-cyan-950/60 border border-cyan-800/50 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-300">
                            {parsed.meta.keySignature}
                          </span>
                        )}
                        {parsed.meta.bpm && (
                          <span className="rounded-full bg-neutral-900 border border-neutral-800 px-2.5 py-0.5 text-[11px] font-semibold text-neutral-300">
                            {parsed.meta.bpm} BPM
                          </span>
                        )}
                        <span className="text-[11px] text-neutral-400">
                          {attachmentCount} {t('songs.attachments')}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <button
                        type="button"
                        onClick={() => analyzeSimilarSongs(song)}
                        className="rounded-xl border border-purple-900/50 bg-purple-950/30 px-3 py-1.5 text-xs font-semibold text-purple-400 hover:bg-purple-950/50 transition flex-1 min-w-[80px]"
                        title="Find similar songs using AI"
                      >
                        ⚡ Similar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportSong(song)}
                        className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-800 transition flex-1 min-w-[80px]"
                        title="Export song details and images to PDF/Print"
                      >
                        {t('songs.exportSong')}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditor(song)}
                        className="rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-500 transition flex-1 min-w-[60px]"
                      >
                        {t('songs.edit')}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteSong(song.id)}
                        className="rounded-xl border border-rose-900/50 bg-rose-950/30 px-3 py-1.5 text-xs font-semibold text-rose-400 hover:bg-rose-950/50 transition"
                        title={t('songs.deleteSong')}
                      >
                        &times;
                      </button>
                    </div>
                  </div>

                  {parsed.body.trim() && (
                    <p className="mt-3 text-xs text-neutral-300 line-clamp-3 bg-neutral-950 p-2.5 rounded-xl border border-neutral-900">
                      {parsed.body}
                    </p>
                  )}

                  {(() => {
                    if (song.attachments && song.attachments.length > 0) {
                      console.log('[DEBUG SongsTab] Rendering attachments for song:', song.title, song.attachments.length, song.attachments);
                      return (
                        <div className="mt-3 flex gap-2.5 overflow-x-auto pb-1">
                          {song.attachments.map((attachment, aIdx) => (
                            <button
                              key={attachment.id}
                              type="button"
                              onClick={() => {
                                setViewerAttachments(song.attachments || []);
                                setViewerIndex(aIdx);
                                setViewerTitle(song.title);
                                const parsedMeta = parseSongNotes(song.notes).meta;
                                setViewerTuning(parsedMeta.keySignature || undefined);
                                setViewerOpen(true);
                              }}
                              className="group relative rounded-xl overflow-hidden border border-neutral-800 hover:border-cyan-500 transition shrink-0"
                            >
                              {isImageAttachment(attachment) ? (
                                <img
                                  src={attachment.publicUrl}
                                  alt={attachment.caption || song.title}
                                  className="h-20 w-20 object-cover group-hover:scale-105 transition"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    e.currentTarget.parentElement?.classList.add('bg-neutral-900');
                                  }}
                                />
                              ) : isPdfAttachment(attachment) ? (
                                <div className="flex h-20 w-20 flex-col items-center justify-center gap-1 bg-gradient-to-br from-rose-950/70 to-neutral-950 px-2 text-white">
                                  <Icons.Document className="h-6 w-6" />
                                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-200">PDF</span>
                                </div>
                              ) : (
                                <div className="flex h-20 w-20 flex-col items-center justify-center gap-1 bg-neutral-900 px-2 text-white">
                                  <Icons.Document className="h-6 w-6" />
                                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-300">Doc</span>
                                </div>
                              )}
                              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-[10px] text-white font-medium">
                                {t('songs.view')}
                              </div>
                            </button>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              );
            })
          )}
        </div>

        {/* AI Similar Songs Modal - Rendered via Portal to escape parent constraints */}
        {selectedSongForAI && typeof document !== 'undefined' && createPortal(
          <>
            {/* Modal Backdrop */}
            <div 
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              onClick={() => {
                setSelectedSongForAI(null);
                setAiSimilarSongs([]);
              }}
            />
            
            {/* Modal Dialog - Centered in viewport */}
            <div className="fixed inset-0 z-50 p-4 sm:p-6 flex items-center justify-center pointer-events-none">
              <div className="w-full max-w-2xl rounded-3xl border border-purple-200/60 bg-white/95 backdrop-blur shadow-2xl dark:border-purple-700/60 dark:bg-slate-900/95 pointer-events-auto flex flex-col max-h-[90vh]">
                {/* Modal Header */}
                <div className="border-b border-purple-200 px-6 py-4 dark:border-purple-800 flex items-center justify-between flex-shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-2xl flex-shrink-0">⚡</span>
                    <div className="min-w-0">
                      <h2 className="text-xl font-bold text-purple-900 dark:text-purple-100 truncate">
                        AI Similar Songs
                      </h2>
                      <p className="text-sm text-purple-600 dark:text-purple-300 mt-0.5 truncate">
                        for "{selectedSongForAI.title}"
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                    <button
                      type="button"
                      onClick={() => {
                        const selectedMeta = parseSongNotes(selectedSongForAI.notes).meta;
                        setAiExplanationTitle("Why These Songs?");
                        setAiExplanationText(
                          `These songs are recommended based on similarity analysis. Songs with matching genre, key signature, and similar tempo are grouped together to maintain energy flow and harmonic transitions in your setlist.`
                        );
                        setAiExplanationDetails([
                          { label: "Genre", value: selectedMeta.genre || "Not specified" },
                          { label: "Key Signature", value: selectedMeta.keySignature || "Not specified" },
                          { label: "BPM", value: selectedMeta.bpm || "Not specified" },
                          { label: "Band/Project", value: selectedMeta.bandProject || "Not specified" },
                        ]);
                        setShowAIExplanation(true);
                      }}
                      className="rounded-lg border border-purple-300 bg-purple-100 px-2 py-1.5 text-xs font-semibold text-purple-700 hover:bg-purple-200 dark:border-purple-700 dark:bg-purple-900 dark:text-purple-300 dark:hover:bg-purple-800 transition"
                      title="View explanation"
                    >
                      ℹ️
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSongForAI(null);
                        setAiSimilarSongs([]);
                      }}
                      className="rounded-lg border border-purple-300 bg-purple-100 px-3 py-1.5 text-xs font-semibold text-purple-700 hover:bg-purple-200 dark:border-purple-700 dark:bg-purple-900 dark:text-purple-300 dark:hover:bg-purple-800 transition"
                    >
                      ✕ Close
                    </button>
                  </div>
                </div>

                {/* Modal Content */}
                <div className="p-6 flex-1 overflow-y-auto">
                  {aiAnalyzing ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
                        <span className="animate-spin text-2xl">⚡</span>
                        <span className="text-sm font-medium">Analyzing song patterns...</span>
                      </div>
                    </div>
                  ) : aiSimilarSongs.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {aiSimilarSongs.map((similarSong) => {
                        const parsed = parseSongNotes(similarSong.notes);
                        return (
                          <div
                            key={similarSong.id}
                            className="rounded-xl border border-purple-200 bg-purple-50/50 p-4 dark:border-purple-800 dark:bg-purple-950/30 hover:shadow-card-hover transition cursor-pointer hover:bg-purple-100/50 dark:hover:bg-purple-900/50"
                            onClick={() => {
                              openEditor(similarSong);
                              setSelectedSongForAI(null);
                              setAiSimilarSongs([]);
                            }}
                          >
                            <div className="font-semibold text-purple-900 dark:text-purple-100 truncate mb-2">
                              {similarSong.title}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {parsed.meta.genre && (
                                <span className="text-[11px] bg-purple-200 text-purple-800 px-2 py-1 rounded-full font-medium dark:bg-purple-800/50 dark:text-purple-200">
                                  {parsed.meta.genre}
                                </span>
                              )}
                              {parsed.meta.keySignature && (
                                <span className="text-[11px] bg-purple-200 text-purple-800 px-2 py-1 rounded-full font-medium dark:bg-purple-800/50 dark:text-purple-200">
                                  {parsed.meta.keySignature}
                                </span>
                              )}
                              {parsed.meta.bpm && (
                                <span className="text-[11px] bg-purple-200 text-purple-800 px-2 py-1 rounded-full font-medium dark:bg-purple-800/50 dark:text-purple-200">
                                  {parsed.meta.bpm} BPM
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-purple-600 dark:text-purple-400">
                      <p className="text-sm">No similar songs found based on genre, key, and tempo analysis.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>,
          document.body
        )}
      </div>

      {/* Editor Modal */}
      {editorOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-sm p-4 sm:p-6 flex items-center justify-center">
          <div className="w-full max-w-4xl rounded-3xl bg-neutral-950 border border-neutral-800 p-6 shadow-2xl text-slate-100 my-auto">
            <div className="flex items-start justify-between gap-3 border-b border-neutral-800 pb-4">
              <div>
                <h3 className="text-xl font-bold text-white">
                  {editingSong ? editingSong.title : t('songs.create')}
                </h3>
                <p className="text-xs text-neutral-400 mt-1">{t('songs.attachmentHint')}</p>
              </div>
              <div className="flex items-center gap-2">
                {editingSong && (
                  <button
                    type="button"
                    onClick={() => handleExportSong(editingSong)}
                    className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-200 hover:bg-neutral-800 transition"
                  >
                    {t('songs.exportSong')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeEditor}
                  className="rounded-xl border border-neutral-800 px-3 py-1.5 text-xs font-semibold text-neutral-400 hover:bg-neutral-900 hover:text-white transition"
                >
                  {t('songs.cancel')}
                </button>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('songs.songTitlePlaceholder')}
                className="w-full rounded-xl border border-neutral-800 bg-black px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none"
              />

              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                <input
                  value={songMeta.bandProject}
                  onChange={(e) => setSongMeta((prev) => ({ ...prev, bandProject: e.target.value }))}
                  placeholder={t('songs.bandProject')}
                  className="rounded-xl border border-neutral-800 bg-black px-3.5 py-2 text-sm text-white placeholder-neutral-500 focus:border-cyan-500 outline-none"
                />
                <input
                  value={songMeta.genre}
                  onChange={(e) => setSongMeta((prev) => ({ ...prev, genre: e.target.value }))}
                  placeholder={t('songs.genre')}
                  className="rounded-xl border border-neutral-800 bg-black px-3.5 py-2 text-sm text-white placeholder-neutral-500 focus:border-cyan-500 outline-none"
                />
                <div className="relative">
                  <input
                    value={songMeta.keySignature}
                    onChange={(e) => setSongMeta((prev) => ({ ...prev, keySignature: e.target.value }))}
                    placeholder={t('songs.keySignature')}
                    className="rounded-xl border border-neutral-800 bg-black px-3.5 py-2 text-sm text-white placeholder-neutral-500 focus:border-cyan-500 outline-none pr-20"
                  />
                  {editingSong && (
                    <button
                      type="button"
                      onClick={() => autoDetectKey(editingSong)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border border-purple-700 bg-purple-900/50 px-2 py-1 text-[10px] font-semibold text-purple-300 hover:bg-purple-900 transition"
                      title="Auto-detect key from title and notes"
                    >
                      ⚡ Detect
                    </button>
                  )}
                </div>
                <input
                  value={songMeta.bpm}
                  onChange={(e) => setSongMeta((prev) => ({ ...prev, bpm: e.target.value }))}
                  placeholder={"BPM"}
                  className="rounded-xl border border-neutral-800 bg-black px-3.5 py-2 text-sm text-white placeholder-neutral-500 focus:border-cyan-500 outline-none"
                />
              </div>

              {/* Auto-detected key suggestion */}
              {autoDetectedKey && (
                <div className="rounded-lg bg-purple-900/30 border border-purple-700/50 px-3 py-2 text-xs text-purple-200">
                  <div className="flex items-center gap-2">
                    <span className="animate-pulse">⚡</span>
                    <span>AI detected key: <strong>{autoDetectedKey}</strong></span>
                    <button
                      type="button"
                      onClick={() => {
                        setSongMeta(prev => ({ ...prev, keySignature: autoDetectedKey }));
                        setAutoDetectedKey("");
                      }}
                      className="ml-auto rounded bg-purple-700 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-purple-600 transition"
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      onClick={() => setAutoDetectedKey("")}
                      className="rounded bg-transparent px-2 py-0.5 text-[10px] text-purple-300 hover:text-white transition"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('songs.placeholder')}
                className="min-h-36 w-full rounded-xl border border-neutral-800 bg-black px-4 py-3 text-sm text-white placeholder-neutral-500 focus:border-cyan-500 outline-none"
              />

              <div className="flex flex-wrap gap-2">
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const value = tagInput.trim();
                      if (value && !tags.includes(value)) setTags((prev) => [...prev, value]);
                      setTagInput("");
                    }
                  }}
                  placeholder={t('songs.addTag')}
                  className="min-w-[220px] flex-1 rounded-xl border border-neutral-800 bg-black px-3.5 py-2 text-sm text-white placeholder-neutral-500 focus:border-cyan-500 outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    const value = tagInput.trim();
                    if (value && !tags.includes(value)) setTags((prev) => [...prev, value]);
                    setTagInput("");
                  }}
                  className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-800"
                >
                  {t('songs.addTag')}
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setTags((prev) => prev.filter((entry) => entry !== tag))}
                    className="rounded-full bg-neutral-900 border border-neutral-800 px-3 py-1 text-xs font-semibold text-neutral-300 hover:border-rose-800 hover:text-rose-400"
                  >
                    {tag} ×
                  </button>
                ))}
              </div>

              <SongMediaManager attachments={attachments} onChange={setAttachments} />

              <div className="flex justify-end gap-3 border-t border-neutral-800 pt-4">
                <button
                  type="button"
                  onClick={closeEditor}
                  className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-2 text-sm font-semibold text-neutral-300 hover:bg-neutral-800"
                >
                  {t('songs.cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !title.trim()}
                  className="rounded-xl bg-gradient-to-r from-brand-600 to-cyan-600 px-5 py-2 text-sm font-semibold text-white shadow-md disabled:opacity-50"
                >
                  {saving ? `${t('songs.save')}...` : t('songs.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <FullscreenMediaViewer
        isOpen={viewerOpen}
        attachments={viewerAttachments}
        index={viewerIndex}
        title={viewerTitle}
        tuning={viewerTuning}
        onClose={() => setViewerOpen(false)}
        onPrev={() => setViewerIndex((i) => Math.max(0, i - 1))}
        onNext={() => setViewerIndex((i) => Math.min((viewerAttachments?.length || 1) - 1, i + 1))}
      />

      {/* AI Explanation Modal */}
      <XAIExplanationModal
        isOpen={showAIExplanation}
        title={aiExplanationTitle}
        explanation={aiExplanationText}
        details={aiExplanationDetails}
        confidenceScore={0.78}
        icon="⚡"
        onClose={() => setShowAIExplanation(false)}
      />
    </div>
  );
}
