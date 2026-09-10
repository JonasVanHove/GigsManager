"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { useSettings } from "./SettingsProvider";
import { useToast } from "./ToastContainer";
import { createPrintDocument } from "@/lib/print-document";
import { supabaseClient } from "@/lib/supabase-client";
import { useTranslation } from "react-i18next";
import LoadingSpinner from "./LoadingSpinner";
import XAIConfirmationModal from "./XAIConfirmationModal";
import OptimizeFlowModal from "./OptimizeFlowModal";
import {
  getSpecialBlockTranslationKey,
  isKnownSpecialBlock,
  normalizeSpecialBlockKey,
} from "@/lib/setlist-special-blocks";
import { optimizeSetlistFlow, type OptimizationCriteria } from "@/lib/setlist-flow";
import { areCaposEqual, normalizeCapo, formatCapo } from "@/lib/capo-utils";
import { useOfflineSongs, useOfflineSetlists } from "@/lib/offline/hooks";
import {
  getPinnedSetlistIds,
  getPinnedSetlists,
  pinSetlistForOffline,
  unpinSetlistFromOffline,
} from "@/lib/offline/pin";

type SongRow = {
  id: string;
  title: string;
  notes: string | null;
  date: string;
  tags?: Array<{ name: string }>;
  attachments?: Array<{ id: string; publicUrl: string; contentType?: string; caption?: string | null }>;
};

const isImageAttachment = (attachment: NonNullable<SongRow["attachments"]>[number]) =>
  attachment.contentType?.startsWith("image/") || /\.(avif|gif|jpe?g|png|webp)(?:[?#]|$)/i.test(attachment.publicUrl);

type SongMeta = {
  bandProject: string;
  genre: string;
  keySignature: string;
  bpm: string;
  comments: string;
};

type ApiSetlistItem = {
  id: string;
  order: number;
  type: string;
  title: string | null;
  notes: string | null;
  chords: string | null;
  tuning: string | null;
};

type ApiSongRow = {
  id: string;
  title: string;
  notes?: string | null;
  date: string;
  tags?: Array<{ name: string }>;
  attachments?: Array<{ id: string; publicUrl: string; contentType?: string; caption?: string | null }>;
};

type ApiSetlistRow = {
  id: string;
  title?: string;
  description?: string | null;
  items?: ApiSetlistItem[];
  gigs?: Array<{ id: string; eventName?: string; date?: string | null }>;
  createdAt: string;
  updatedAt: string;
};

type SetlistMeta = {
  datum: string | null;
  locatie: string;
  notities: string;
  status: "concept" | "klaar" | "gearchiveerd";
  pauseOnTuningChange: boolean;
};

type DraftItem = {
  id: string;
  kind: "song" | "special";
  songId: string | null;
  label: string;
  artist: string;
  tuning: string;
  key: string;
  tempo: string;
  notitie: string;
  specialLabel: string;
  expanded: boolean;
};

type StoredSetlist = {
  id: string;
  userId: string;
  naam: string;
  datum: string | null;
  locatie: string | null;
  gigIds: string[];
  items: DraftItem[];
  notities: string;
  status: SetlistMeta["status"];
  pauseOnTuningChange: boolean;
  bandId?: string | null;
  band?: {
    id: string;
    name: string;
    color?: string | null;
    logoUrl?: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
};

type LinkedNote = {
  id: string;
  titel: string;
  inhoud: string;
  tags: string[];
};

type NotePayload = {
  titel?: unknown;
  inhoud?: unknown;
  tags?: unknown;
};

const SONG_META_START = "[[song-meta]]";
const SONG_META_END = "[[/song-meta]]";

const tuningGroups = ["Standard", "Capo I", "Capo II", "Capo III", "Capo IV", "Capo VI", "Downtuning", "Down Down", "Onbekend"];

const defaultSongMeta = (): SongMeta => ({ bandProject: "", genre: "", keySignature: "", bpm: "", comments: "" });

const parseSongNotes = (raw: string | null | undefined) => {
  const fallback = { meta: defaultSongMeta(), body: raw || "" };
  if (!raw || !raw.startsWith(SONG_META_START)) return fallback;

  const endIndex = raw.indexOf(SONG_META_END);
  if (endIndex < 0) return fallback;

  try {
    const metaJson = raw.slice(SONG_META_START.length, endIndex).trim();
    const body = raw.slice(endIndex + SONG_META_END.length).replace(/^\s+/, "");
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

const parseDateOnly = (value: string | null) => (value ? value.slice(0, 10) : "");

const defaultSetlistMeta = (): SetlistMeta => ({ datum: null, locatie: "", notities: "", status: "concept", pauseOnTuningChange: false });

const parseSetlistMeta = (description: string | null | undefined): SetlistMeta => {
  if (!description) return defaultSetlistMeta();
  try {
    const parsed = JSON.parse(description) as Partial<SetlistMeta> & { notes?: string; location?: string; date?: string };
    return {
      datum: typeof parsed.datum === "string" ? parsed.datum : typeof parsed.date === "string" ? parsed.date : null,
      locatie: typeof parsed.locatie === "string" ? parsed.locatie : typeof parsed.location === "string" ? parsed.location : "",
      notities: typeof parsed.notities === "string" ? parsed.notities : typeof parsed.notes === "string" ? parsed.notes : "",
      status: parsed.status === "klaar" || parsed.status === "gearchiveerd" || parsed.status === "concept" ? parsed.status : "concept",
      pauseOnTuningChange: Boolean(parsed.pauseOnTuningChange),
    };
  } catch {
    return { ...defaultSetlistMeta(), notities: description };
  }
};

const serializeSetlistMeta = (meta: SetlistMeta) =>
  JSON.stringify({
    datum: meta.datum,
    locatie: meta.locatie,
    notities: meta.notities,
    status: meta.status,
    pauseOnTuningChange: meta.pauseOnTuningChange,
  });

const songSortValue = (item: DraftItem) => Number(item.tempo || 0) || 0;

const tuningIndex = (value: string) => {
  const idx = tuningGroups.findIndex((group) => group.toLowerCase() === value.trim().toLowerCase());
  return idx < 0 ? tuningGroups.length - 1 : idx;
};

const tuningBadgeClass = (value: string) => {
  const key = value.trim().toLowerCase();
  if (key === "standard") return "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30";
  if (key.startsWith("capo")) return "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/30";
  if (key.includes("down")) return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30";
  return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
};

const createSongItem = (song: SongRow): DraftItem => {
  const parsed = parseSongNotes(song.notes);
  return {
    id: crypto.randomUUID(),
    kind: "song",
    songId: song.id,
    label: song.title,
    artist: parsed.meta.bandProject || parsed.meta.genre || "",
    tuning: parsed.meta.keySignature || "Onbekend",
    key: "",
    tempo: parsed.meta.bpm || "",
    notitie: "",
    specialLabel: "",
    expanded: false,
  };
};

const createSpecialItem = (label: string): DraftItem => ({
  id: crypto.randomUUID(),
  kind: "special",
  songId: null,
  label,
  artist: "",
  tuning: "",
  key: "",
  tempo: "",
  notitie: "",
  specialLabel: label,
  expanded: false,
});

const cloneItem = (item: DraftItem): DraftItem => ({ ...item });

type TranslateFn = (key: string) => string;

const resolveSpecialBlockLabel = (label: string, t: TranslateFn): string => {
  const translationKey = getSpecialBlockTranslationKey(label);
  return translationKey ? t(translationKey) : label;
};

const buildExportText = (setlist: StoredSetlist, songs: SongRow[], t: TranslateFn) => {
  const lines: string[] = [];
  lines.push(setlist.naam);
  if (setlist.datum) lines.push(`Datum: ${setlist.datum}`);
  if (setlist.locatie) lines.push(`Locatie: ${setlist.locatie}`);
  lines.push(`Status: ${setlist.status}`);
  lines.push("");

  let songNumber = 0;
  setlist.items.forEach((item) => {
    if (item.kind === "special") {
      lines.push(resolveSpecialBlockLabel(item.specialLabel, t));
      return;
    }

    songNumber++;
    const song = songs.find((entry) => entry.id === item.songId);
    const title = song?.title || item.label;
    const meta = [item.artist, item.tuning, item.key, item.tempo ? `${item.tempo} bpm` : ""].filter(Boolean).join(" · ");
    lines.push(`${songNumber}. ${title}${meta ? ` — ${meta}` : ""}`);
    if (item.notitie.trim()) lines.push(`   ${item.notitie.trim()}`);
  });

  if (setlist.notities.trim()) {
    lines.push("");
    lines.push("Notities:");
    lines.push(setlist.notities.trim());
  }

  return lines.join("\n");
};

type GigOption = {
  id: string;
  eventName: string;
  date?: string | null;
};

const normalizeGigOptions = (payload: unknown): GigOption[] => {
  const rows = Array.isArray(payload)
    ? payload
    : (payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown[] }).data))
      ? (payload as { data: unknown[] }).data
      : [];

  return rows
    .filter((row): row is { id: string; eventName?: string; date?: string | null } => Boolean(row && typeof row === "object" && typeof (row as { id?: unknown }).id === "string"))
    .map((row) => ({
      id: row.id,
      eventName: typeof row.eventName === "string" && row.eventName.trim() ? row.eventName : "Untitled gig",
      date: typeof row.date === "string" ? row.date : null,
    }));
};

export default function SetlistsTab() {
  const { session, getAccessToken } = useAuth();
  const { locale, settings } = useSettings();
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();

  const [songs, setSongs] = useState<SongRow[]>([]);
  const [gigsList, setGigsList] = useState<GigOption[]>([]);
  const [bandsList, setBandsList] = useState<Array<{ id: string; name: string; logoUrl?: string; color?: string | null }>>([]);
  const [setlists, setSetlists] = useState<StoredSetlist[]>([]);
  const [notes, setNotes] = useState<LinkedNote[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<StoredSetlist | null>(null);

  // --- Offline support (IndexedDB) ------------------------------------------
  const { fetchCollection: fetchSongsCollection } = useOfflineSongs<ApiSongRow>(getAccessToken);
  const { fetchCollection: fetchSetlistsCollection } = useOfflineSetlists<ApiSetlistRow>(getAccessToken);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [pinningId, setPinningId] = useState<string | null>(null);
  const rawSongsRef = useRef<ApiSongRow[] | null>(null);
  const rawSetlistsRef = useRef<ApiSetlistRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingState, setSavingState] = useState<"saved" | "saving" | "dirty">("saved");
  const [statusFilter, setStatusFilter] = useState<"alle" | SetlistMeta["status"]>("alle");
  const [songSearch, setSongSearch] = useState("");
  const [attachmentFilter, setAttachmentFilter] = useState<"all" | "with" | "without">("all");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [aiOptimizing, setAiOptimizing] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [showAIConfirmation, setShowAIConfirmation] = useState(false);
  const [pendingAIItems, setPendingAIItems] = useState<DraftItem[] | null>(null);
  const [pendingAIExplanations, setPendingAIExplanations] = useState<string[]>([]);
  const [pendingAIPreview, setPendingAIPreview] = useState<Array<{ label: string; before?: string; after: string; changed?: boolean }>>([]);
  const [optimizationCriteria, setOptimizationCriteria] = useState<OptimizationCriteria>("bpm-flow");
  const [showOptimizeFlowModal, setShowOptimizeFlowModal] = useState(false);
  const [showPerformanceMode, setShowPerformanceMode] = useState(false);
  const [performanceAttachmentsOpen, setPerformanceAttachmentsOpen] = useState(false);
  const [performanceActiveSong, setPerformanceActiveSong] = useState<DraftItem | null>(null);
  const [showGeneralNotes, setShowGeneralNotes] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('setlists_showGeneralNotes');
      return saved ? JSON.parse(saved) : true;
    }
    return true;
  });
  const [showTuningPanel, setShowTuningPanel] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('setlists_showTuningPanel');
      return saved ? JSON.parse(saved) : true;
    }
    return true;
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('setlists_sidebarCollapsed');
      return saved ? JSON.parse(saved) : false;
    }
    return false;
  });
  const [showExport, setShowExport] = useState(false);
  const [exportIncludeAttachments, setExportIncludeAttachments] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [error, setError] = useState("");
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [drawerSongId, setDrawerSongId] = useState<string | null>(null);
  const [itemAttachments, setItemAttachments] = useState<Map<string, Array<{ id: string; url: string; type: string; title?: string }>>>(new Map());
  const [uploadingAttachment, setUploadingAttachment] = useState<string | null>(null);
  const [showSongPicker, setShowSongPicker] = useState(false);
  const [convertingItemId, setConvertingItemId] = useState<string | null>(null);
  const [includeTuningNotes, setIncludeTuningNotes] = useState(false);
  const [setlistListCollapsed, setSetlistListCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('setlists_setlistListCollapsed');
      return saved ? JSON.parse(saved) : false;
    }
    return false;
  });
  const [repertoireCollapsed, setRepertoireCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('setlists_repertoireCollapsed');
      return saved ? JSON.parse(saved) : false;
    }
    return false;
  });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftVersionRef = useRef(0);

  const activeDraft = draft;
  const songOccurrences = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of activeDraft?.items || []) {
      if (item.kind === "song" && item.songId) counts.set(item.songId, (counts.get(item.songId) || 0) + 1);
    }
    return counts;
  }, [activeDraft?.items]);
  const selectedSetlist = useMemo(() => (selectedId ? setlists.find((setlist) => setlist.id === selectedId) || null : null), [selectedId, setlists]);
  const currentItems = useMemo(() => (draft?.items || selectedSetlist?.items || []).slice(), [draft?.items, selectedSetlist?.items]);
  const activeSongMap = useMemo(() => new Map(songs.map((song) => [song.id, song])), [songs]);
  const songNoteMap = useMemo(() => {
    const map = new Map<string, LinkedNote[]>();
    for (const note of notes) {
      const key = note.id;
      const list = map.get(key) || [];
      list.push(note);
      map.set(key, list);
    }
    return map;
  }, [notes]);

  const linkedNotesForSong = useCallback((songId: string) => {
    return notes.filter((note) => note.id === songId || note.titel.toLowerCase().includes(songId.toLowerCase()));
  }, [notes]);

  const filteredSetlists = useMemo(
    () => setlists.filter((setlist) => (statusFilter === "alle" ? true : setlist.status === statusFilter)),
    [setlists, statusFilter]
  );

  const statusLabels = useMemo(() => ({
    alle: t('setlists.all'),
    concept: t('setlists.concept'),
    klaar: t('setlists.klaar'),
    gearchiveerd: t('setlists.gearchiveerd'),
  }), [t]);

  const statusTooltips = useMemo(() => ({
    alle: t('setlists.statusAll'),
    concept: t('setlists.statusConcept'),
    klaar: t('setlists.statusReady'),
    gearchiveerd: t('setlists.statusArchived'),
  }), [t]);

  const statusIcons = useMemo(() => ({
    alle: "◉",
    concept: "✎",
    klaar: "✓",
    gearchiveerd: "🗂",
  }), []);

  const songGroups = useMemo(() => {
    const query = songSearch.trim().toLowerCase();
    const songsByGroup = new Map<string, SongRow[]>();

    // Fuzzy search with match explanations
    const fuzzySearchSongs = (songs: SongRow[], query: string): { song: SongRow; matchReasons: string[] }[] => {
      if (!query.trim()) return songs.map(s => ({ song: s, matchReasons: [] }));
      
      const q = query.toLowerCase().trim();
      const results: { song: SongRow; score: number; matchReasons: string[] }[] = [];
      
      for (const song of songs) {
        const parsed = parseSongNotes(song.notes);
        let score = 0;
        const reasons: string[] = [];
        
        // Check title (exact match gets highest score)
        if (song.title.toLowerCase() === q) {
          score += 100;
          reasons.push(t('setlists.exactTitleMatch'));
        } else if (song.title.toLowerCase().includes(q)) {
          score += 50;
          reasons.push(t('setlists.titleContainsSearchTerm'));
        } else {
          // Fuzzy title match (allow 1-2 character differences)
          const titleLower = song.title.toLowerCase();
          let matches = 0;
          let qIndex = 0;
          for (const char of titleLower) {
            if (qIndex < q.length && char === q[qIndex]) {
              matches++;
              qIndex++;
            }
          }
          if (matches >= q.length * 0.7) {
            score += 25;
            reasons.push(t('setlists.partialTitleMatch'));
          }
        }
        
        // Check body content
        if (parsed.body.toLowerCase().includes(q)) {
          score += 30;
          reasons.push(t('setlists.inLyrics'));
        }
        
        // Check metadata fields
        if (parsed.meta.bandProject?.toLowerCase().includes(q)) {
          score += 20;
          reasons.push(t('setlists.inBandProject'));
        }
        if (parsed.meta.genre?.toLowerCase().includes(q)) {
          score += 15;
          reasons.push(t('setlists.inGenre'));
        }
        if (parsed.meta.keySignature?.toLowerCase().includes(q)) {
          score += 15;
          reasons.push(t('setlists.inKeySignature'));
        }
        if (parsed.meta.bpm?.toLowerCase().includes(q)) {
          score += 10;
          reasons.push(t('setlists.inBPM'));
        }
        if (parsed.meta.comments?.toLowerCase().includes(q)) {
          score += 10;
          reasons.push(t('setlists.inComments'));
        }
        
        if (score > 0) {
          results.push({ song, score, matchReasons: reasons });
        }
      }
      
      // Sort by score descending and return songs with reasons
      return results.sort((a, b) => b.score - a.score).map(r => ({ song: r.song, matchReasons: r.matchReasons }));
    };

    const filteredSongs = query ? fuzzySearchSongs(songs, query) : songs.map(s => ({ song: s, matchReasons: [] }));

    for (const item of filteredSongs) {
      const song = 'song' in item ? item.song : item;
      const parsed = parseSongNotes(song.notes);
      const tuning = parsed.meta.keySignature || "Onbekend";
      const hasImages = Boolean(song.attachments?.some(isImageAttachment));
      
      // Attachment filter
      if ((attachmentFilter === "with" && !hasImages) || (attachmentFilter === "without" && hasImages)) continue;
      
      // Tag filter (multi-select)
      if (tagFilter.length > 0) {
        const songTags = (song.tags || []).map((tag) => tag.name).filter(Boolean);
        if (!tagFilter.some(tf => songTags.some(st => st.toLowerCase() === tf.toLowerCase()))) continue;
      }
      
      // Use normalized capo value for grouping to handle "Capo I" vs "Capo 1" consistently
      const normalizedTuning = normalizeCapo(tuning) !== null ? formatCapo(normalizeCapo(tuning)!) : tuning;
      const list = songsByGroup.get(normalizedTuning) || [];
      list.push(song);
      songsByGroup.set(normalizedTuning, list);
    }

    return Array.from(songsByGroup.entries())
      .map(([tuning, list]) => [tuning, list.slice().sort((a, b) => a.title.localeCompare(b.title))] as const)
      .sort((a, b) => tuningIndex(a[0]) - tuningIndex(b[0]));
  }, [attachmentFilter, songSearch, songs, t, tagFilter]);

  const repertoireImageStats = useMemo(() => {
    const withImages = songs.filter((song) => song.attachments?.some(isImageAttachment)).length;
    return { withImages, withoutImages: songs.length - withImages };
  }, [songs]);

  const exportText = useMemo(() => (draft ? buildExportText(draft, songs, t) : ""), [draft, songs, t]);

  const tuningExplanation = useMemo(() => {
    const lines: string[] = [];
    let previousTuning = "";
    let sawFirstSong = false;

    for (const item of currentItems) {
      if (item.kind === "special") {
        const label = normalizeSpecialBlockKey(item.specialLabel);
        if (label === "PAUZE") lines.push(t('setlists.goodMomentForTuningChange'));
        else if (label === "BIS") lines.push(t('setlists.encoreNumber'));
        continue;
      }

      const currentTuning = item.tuning || "Onbekend";
      if (!sawFirstSong) {
        lines.push(t('setlists.opener'));
        sawFirstSong = true;
      } else if (areCaposEqual(currentTuning, previousTuning)) {
        lines.push(`✓ ${currentTuning} — ${t('setlists.noChange')}`);
      } else {
        lines.push(`⚠ ${t('setlists.tuningChange')}: ${previousTuning} → ${currentTuning}`);
      }
      previousTuning = currentTuning;
    }

    return lines;
  }, [currentItems, t]);

  // Helper function to calculate song number (only counts actual songs, not special items)
  const getSongNumber = useCallback((items: DraftItem[], currentIndex: number): number => {
    if (!items || items.length === 0 || currentIndex < 0 || currentIndex >= items.length) {
      return 0;
    }
    let songCount = 0;
    for (let i = 0; i <= currentIndex; i++) {
      if (items[i]?.kind === "song") {
        songCount++;
      }
    }
    return songCount;
  }, []);

  const loadNotes = useCallback(async () => {
    if (!session?.user) return;
    const token = await getAccessToken();
    if (!token) return;

    const response = await fetch("/api/notes", { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return;
    const rows = (await response.json()) as Array<{ id: string; noteType?: string; photoName?: string | null; notes?: unknown; linkedBand?: string | null; createdAt: string; updatedAt: string }>;
    const textRows = rows.filter((row) => row.noteType === "text");
    setNotes(textRows.map((row) => {
      const raw = typeof row.notes === "string" ? safeJson<NotePayload>(row.notes, {}) : (row.notes as NotePayload | undefined) || {};
      return {
        id: row.id,
        titel: typeof raw.titel === "string" ? raw.titel : row.photoName || "",
        inhoud: typeof raw.inhoud === "string" ? raw.inhoud : "",
        tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === "string") : [],
      } satisfies LinkedNote;
    }));
  }, [getAccessToken, session?.user]);

  const loadItemAttachments = useCallback(async (itemId: string) => {
    try {
      const token = await getAccessToken();
      if (!token) return;
      
      console.log('[DEBUG SetlistsTab] Loading attachments for item:', itemId);
      const response = await fetch(`/api/setlist-items/${itemId}/attachments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        const attachments = await response.json();
        console.log('[DEBUG SetlistsTab] Loaded attachments for item:', itemId, attachments.length, attachments);
        setItemAttachments(prev => new Map(prev).set(itemId, attachments));
      } else {
        console.error('[DEBUG SetlistsTab] Failed to load attachments for item:', itemId, response.status);
      }
    } catch (error) {
      console.error('[DEBUG SetlistsTab] Failed to load attachments:', error);
    }
  }, [getAccessToken]);

  const loadData = useCallback(async () => {
    if (!session?.user) {
      setSongs([]);
      setSetlists([]);
      setNotes([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Offline-first repertoire fetch: try the network (auto-shadow-copies
      // the response into IndexedDB); on failure or while offline, fall back
      // to the last known IndexedDB data with zero blocking errors.
      const [songsResult, setlistsResult] = await Promise.all([
        fetchSongsCollection(),
        fetchSetlistsCollection(),
      ]);
      const songPayload = songsResult.data;
      const setlistPayload = setlistsResult.data;
      if (!songPayload || !setlistPayload) throw new Error(t('setlists.failedToLoadSetlists'));
      const offlineData = songsResult.fromCache || setlistsResult.fromCache;

      // Keep the raw payloads available for the "Offline Opslaan" pin action.
      rawSongsRef.current = songPayload;
      rawSetlistsRef.current = setlistPayload;

      // Bands are optional; offline the filter list is non-critical.
      const token = await getAccessToken();
      let bandsPayload: Array<{ id: string; name: string; logoUrl?: string; color?: string | null }> = [];
      if (token) {
        try {
          const bandsResponse = await fetch("/api/bands", { headers: { Authorization: `Bearer ${token}` } });
          if (bandsResponse.ok) {
            bandsPayload = (await bandsResponse.json()) as Array<{ id: string; name: string; logoUrl?: string; color?: string | null }>;
          }
        } catch {
          // Offline: the band filter list is non-critical.
        }
      }

      setBandsList(bandsPayload || []);
      const songIdByTitle = new Map((Array.isArray(songPayload) ? songPayload : []).map((song) => [song.title.trim().toLocaleLowerCase(), song.id]));

      const currentUserId = session.user?.id;
      if (!currentUserId) throw new Error("Missing user id");

      const hydratedSetlists: StoredSetlist[] = Array.isArray(setlistPayload)
        ? setlistPayload.map((setlist) => {
            const meta = parseSetlistMeta(setlist.description);
            const items: DraftItem[] = Array.isArray(setlist.items)
              ? setlist.items.map((item) => ({
                  id: item.id,
                  kind: item.type === "song" ? "song" : "special",
                  // The API stores a setlist item's title, not a song foreign
                  // key. Restore the repertoire link so image badges, exports
                  // and duplicate counters remain available after a reload.
                  songId: item.type === "song" ? songIdByTitle.get((item.title || "").trim().toLocaleLowerCase()) || null : null,
                  label: item.title || "",
                  artist: "",
                  tuning: item.tuning || "Onbekend",
                  key: item.chords || "",
                  tempo: "",
                  notitie: item.notes || "",
                  specialLabel: item.type === "note" ? item.title || "" : "",
                  expanded: false,
                }))
              : [];

            return {
              id: setlist.id,
              userId: currentUserId,
              naam: setlist.title || "Untitled setlist",
              datum: meta.datum,
              locatie: meta.locatie,
              gigIds: Array.isArray(setlist.gigs) ? setlist.gigs.map((gig) => gig.id) : [],
              items,
              notities: meta.notities,
              status: meta.status,
              pauseOnTuningChange: meta.pauseOnTuningChange,
              bandId: (setlist as any).bandId || null,
              band: (setlist as any).band || null,
              createdAt: setlist.createdAt,
              updatedAt: setlist.updatedAt,
            };
          })
        : [];

      setSongs(Array.isArray(songPayload) ? songPayload.map((song) => ({ id: song.id, title: song.title, notes: song.notes || null, date: song.date, tags: song.tags || [], attachments: song.attachments || [] })) : []);
      setSetlists(hydratedSetlists);

      if (offlineData) {
        // Serving from IndexedDB: restore the pinned item attachments that
        // are normally fetched lazily per item while online.
        const pinnedRecords = await getPinnedSetlists();
        setItemAttachments((prev) => {
          const merged = new Map(prev);
          pinnedRecords.forEach((record) => {
            Object.entries(record.itemAttachments || {}).forEach(([itemId, list]) => {
              if (Array.isArray(list)) {
                merged.set(itemId, list as Array<{ id: string; url: string; type: string; title?: string }>);
              }
            });
          });
          return merged;
        });
      }
      void getPinnedSetlistIds().then((ids) => setPinnedIds(ids));

      if (!selectedId && hydratedSetlists[0]) {
        const first = hydratedSetlists[0];
        setSelectedId(first.id);
        setDraft(JSON.parse(JSON.stringify(first)) as StoredSetlist);
        setSavingState("saved");
      }

      // These datasets are secondary to opening the setlist editor. Loading
      // them in the background makes the initial editor render immediate.
      void loadNotes();
      void (async () => {
        try {
          if (!token) return;
          const gigsRes = await fetch('/api/gigs', { headers: { Authorization: `Bearer ${token}` } });
          if (gigsRes.ok) {
            const gigsJson = await gigsRes.json();
            setGigsList(normalizeGigOptions(gigsJson));
          }
        } catch {
          // A gig assignment can be retried later; it must not delay setlists.
        }
      })();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [getAccessToken, loadNotes, session?.user, selectedId, toast, t, fetchSongsCollection, fetchSetlistsCollection]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handlePinForOffline = useCallback(async () => {
    const setlistId = draft?.id || selectedId;
    if (!setlistId) return;
    const raw = rawSetlistsRef.current?.find((entry) => entry.id === setlistId);
    if (!raw) return;
    setPinningId(setlistId);
    try {
      const attachments: Record<string, unknown[]> = {};
      itemAttachments.forEach((value, key) => {
        attachments[key] = value;
      });
      await pinSetlistForOffline({
        id: setlistId,
        setlist: raw,
        itemAttachments: attachments,
        songs: rawSongsRef.current || [],
      });
      setPinnedIds((prev) => new Set(prev).add(setlistId));
      toast.success(t('setlists.offlineReady'));
    } catch (err) {
      console.error('[SetlistsTab] offline pin failed:', err);
      toast.error(t('setlists.offlinePinFailed'));
    } finally {
      setPinningId(null);
    }
  }, [draft?.id, selectedId, itemAttachments, toast, t]);

  const handleUnpinFromOffline = useCallback(async () => {
    const setlistId = draft?.id || selectedId;
    if (!setlistId) return;
    try {
      await unpinSetlistFromOffline(setlistId);
      setPinnedIds((prev) => {
        const next = new Set(prev);
        next.delete(setlistId);
        return next;
      });
    } catch (err) {
      console.error('[SetlistsTab] offline unpin failed:', err);
    }
  }, [draft?.id, selectedId]);

  /**
   * Stage-ready setlist & chord sheet PDF export / print view.
   * Opens a print-optimized document (high-contrast black-and-white styling
   * via the @media print stylesheet in print-document.ts, with
   * break-inside: avoid so songs never split across pages) and triggers the
   * browser print dialog. Shared by the Setlist header button / Export modal.
   */
  const handlePrintPdf = useCallback(() => {
    if (!draft) return;
    const win = window.open('', '_blank', 'toolbar=0,location=0,menubar=0');
    if (!win) return;

    // Generate pastel colors for unique tunings (note: print stylesheet
    // forces high-contrast black-on-white, so these only matter on screen).
    const tuningColors = new Map<string, { pastel: string; dark: string }>();
    const pastelColors = [
      '#e3f2fd', '#e8f5e9', '#fff3e0', '#f3e5f5', '#fce4ec', '#e0f7fa', '#fff9c4', '#efebe9',
    ];
    const darkColors = [
      '#1976d2', '#2e7d32', '#f57c00', '#7b1fa2', '#c2185b', '#0097a7', '#fbc02d', '#5d4037',
    ];
    let colorIndex = 0;

    const getTuningColor = (tuning: string): { pastel: string; dark: string } => {
      if (!tuningColors.has(tuning)) {
        tuningColors.set(tuning, { pastel: pastelColors[colorIndex % pastelColors.length], dark: darkColors[colorIndex % darkColors.length] });
        colorIndex++;
      }
      return tuningColors.get(tuning)!;
    };

    const htmlParts: string[] = [];

    // Metadata badges (title itself is handled by createPrintDocument)
    const metaBadges: string[] = [];
    const selectedBand = draft.bandId ? bandsList.find((b) => b.id === draft.bandId) : null;
    if (selectedBand) metaBadges.push(`<span class="metadata-item">Band: ${escapeHtml(selectedBand.name)}</span>`);
    if (draft.status) metaBadges.push(`<span class="metadata-item">Status: ${escapeHtml(draft.status)}</span>`);
    if (draft.datum) metaBadges.push(`<span class="metadata-item">Date: ${escapeHtml(draft.datum)}</span>`);
    if (draft.locatie) metaBadges.push(`<span class="metadata-item">Location: ${escapeHtml(draft.locatie)}</span>`);
    if (metaBadges.length > 0) htmlParts.push(`<div class="metadata">${metaBadges.join('')}</div>`);
    htmlParts.push('<section class="section">');

    // Track song numbers separately (only for actual songs)
    let songNumber = 0;

    draft.items.forEach((item) => {
      if (item.kind === 'special') {
        htmlParts.push(`<div class="setlist-item" style="text-align:center;color:#64748b;font-size:11pt;font-weight:600;letter-spacing:0.1em;padding:4mm 0;border-top:1px dashed #e2e8f0;border-bottom:1px dashed #e2e8f0;text-transform:uppercase;">--- ${escapeHtml(resolveSpecialBlockLabel(item.specialLabel, t))} ---</div>`);
        return;
      }

      songNumber++;
      const song = songs.find((s) => s.id === item.songId || (s.title && s.title.toLowerCase() === item.label.toLowerCase()));
      const title = song ? song.title : item.label;

      const badges: string[] = [];
      if (item.tuning) {
        const colors = getTuningColor(item.tuning);
        badges.push(`<span class="metadata-item" style="border: 2px solid ${colors.pastel} !important; color: ${colors.dark} !important; font-weight: 800 !important;">${escapeHtml(item.tuning)}</span>`);
      }
      if (item.key) {
        const colors = getTuningColor(item.key);
        badges.push(`<span class="metadata-item" style="border: 2px solid ${colors.pastel} !important; color: ${colors.dark} !important; font-weight: 800 !important;">Key: ${escapeHtml(item.key)}</span>`);
      }
      if (item.tempo) {
        const colors = getTuningColor(item.tempo + ' bpm');
        badges.push(`<span class="metadata-item" style="border: 2px solid ${colors.pastel} !important; color: ${colors.dark} !important; font-weight: 800 !important;">${escapeHtml(item.tempo)} BPM</span>`);
      }
      const metaStr = badges.length > 0 ? ` ${badges.join('')}` : '';

      htmlParts.push(`<article class="setlist-item">`);
      htmlParts.push(`<h3 class="setlist-item-title"><span class="setlist-item-number">${songNumber}.</span>${escapeHtml(title)}${metaStr}</h3>`);

      if (exportIncludeAttachments && song?.attachments && song.attachments.length > 0) {
        const imageAttachments = song.attachments.filter(isImageAttachment);
        if (imageAttachments.length > 0) {
          imageAttachments.forEach((att) => {
            htmlParts.push(`<figure class="attachment"><img src="${escapeHtml(att.publicUrl)}" alt="" loading="eager" /></figure>`);
          });
        }
      }

      if (item.notitie) htmlParts.push(`<div class="note-content" style="margin-top:3mm;">${escapeHtml(item.notitie)}</div>`);
      htmlParts.push('</article>');
    });

    htmlParts.push('</section>');
    if (draft.notities.trim()) htmlParts.push(`<section class="section"><h2 class="section-heading">General Notes</h2><div class="note-content">${escapeHtml(draft.notities)}</div></section>`);

    const band = draft.bandId ? bandsList.find((b) => b.id === draft.bandId) : null;
    const logoUrl = band?.logoUrl || undefined;

    win.document.open();
    win.document.write(createPrintDocument(escapeHtml(draft.naam), htmlParts.join('\n'), {
      includeLogo: settings.pdfIncludeLogo ?? true,
      logoUrl,
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
    // Printing is handled by the small script that waits for images to load
  }, [draft, songs, bandsList, settings, exportIncludeAttachments, t]);

  // Load attachments for items in the currently selected setlist
  useEffect(() => {
    if (draft && draft.items.length > 0) {
      console.log('[DEBUG SetlistsTab] Loading attachments for setlist items:', draft.items.length);
      draft.items.forEach(item => {
        loadItemAttachments(item.id);
      });
    }
  }, [draft?.id, loadItemAttachments]);

  // Handle URL parameter to open specific setlist from gig card
  useEffect(() => {
    const setlistIdFromUrl = searchParams.get('setlist');
    if (setlistIdFromUrl && setlists.length > 0) {
      const targetSetlist = setlists.find(s => s.id === setlistIdFromUrl);
      if (targetSetlist && selectedId !== setlistIdFromUrl) {
        setSelectedId(setlistIdFromUrl);
        setDraft(JSON.parse(JSON.stringify(targetSetlist)) as StoredSetlist);
        setSavingState("saved");
        // Clean up URL parameter
        router.replace('/?tab=setlists', { scroll: false });
      }
    }
  }, [searchParams, setlists, selectedId, router]);

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

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // Persist collapsible states to localStorage
  useEffect(() => {
    localStorage.setItem('setlists_showGeneralNotes', JSON.stringify(showGeneralNotes));
  }, [showGeneralNotes]);

  useEffect(() => {
    localStorage.setItem('setlists_showTuningPanel', JSON.stringify(showTuningPanel));
  }, [showTuningPanel]);

  useEffect(() => {
    localStorage.setItem('setlists_sidebarCollapsed', JSON.stringify(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem('setlists_setlistListCollapsed', JSON.stringify(setlistListCollapsed));
  }, [setlistListCollapsed]);

  useEffect(() => {
    localStorage.setItem('setlists_repertoireCollapsed', JSON.stringify(repertoireCollapsed));
  }, [repertoireCollapsed]);

  const updateDraft = useCallback((patch: Partial<StoredSetlist>) => {
    draftVersionRef.current += 1;
    setDraft((current) => {
      if (!current) return current;
      return { ...current, ...patch, updatedAt: new Date().toISOString() };
    });
    setSavingState("dirty");
  }, []);

  const updateDraftItems = useCallback((update: (items: DraftItem[]) => DraftItem[]) => {
    draftVersionRef.current += 1;
    setDraft((current) => current ? {
      ...current,
      items: update(current.items),
      updatedAt: new Date().toISOString(),
    } : current);
    setSavingState("dirty");
  }, []);

  const selectSetlist = useCallback((setlist: StoredSetlist) => {
    draftVersionRef.current += 1;
    setSelectedId(setlist.id);
    setDraft(JSON.parse(JSON.stringify(setlist)));
    setSavingState("saved");
    setShowPerformanceMode(false);
    setActiveItemId(null);
    // Auto-collapse sidebar on mobile when setlist is selected
    setSidebarCollapsed(true);
  }, []);

  const saveDraft = useCallback(async (nextDraft: StoredSetlist, version: number) => {
    if (!session?.user) return;
    setSavingState("saving");
    const token = await getAccessToken();
    if (!token) return;

    const payload = {
      title: nextDraft.naam.trim() || t('setlists.newSetlist'),
      description: serializeSetlistMeta({
        datum: nextDraft.datum,
        locatie: nextDraft.locatie || "",
        notities: nextDraft.notities,
        status: nextDraft.status,
        pauseOnTuningChange: nextDraft.pauseOnTuningChange,
      }),
      items: nextDraft.items.map((item, index) => ({
        type: item.kind === "song" ? "song" : "note",
        title: item.kind === "song" ? item.label : item.specialLabel,
        notes: item.kind === "song" ? item.notitie || null : item.notitie || null,
        chords: item.kind === "song" ? item.key || null : null,
        tuning: item.kind === "song" ? item.tuning || null : null,
        order: index + 1,
      })),
      gigIds: nextDraft.gigIds,
      bandId: nextDraft.bandId || null,
    };

    const response = await fetch(`/api/setlists/${nextDraft.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(t('setlists.saveFailed'));
    }

    const refreshed = (await response.json()) as { id: string; title?: string; description?: string | null; gigs?: Array<{ id: string }>; createdAt: string; updatedAt: string; bandId?: string | null; band?: any };
    const meta = parseSetlistMeta(refreshed.description);
    const saved: StoredSetlist = {
      id: refreshed.id,
      userId: nextDraft.userId,
      naam: refreshed.title || nextDraft.naam,
      datum: meta.datum,
      locatie: meta.locatie,
      gigIds: Array.isArray(refreshed.gigs) ? refreshed.gigs.map((gig) => gig.id) : nextDraft.gigIds,
      items: nextDraft.items.map(cloneItem),
      notities: meta.notities,
      status: meta.status,
      pauseOnTuningChange: meta.pauseOnTuningChange,
      bandId: refreshed.bandId || nextDraft.bandId || null,
      band: refreshed.band || nextDraft.band || null,
      createdAt: refreshed.createdAt,
      updatedAt: refreshed.updatedAt,
    };

    // Never replace the live editor with an older network response. This was
    // the cause of quick additions/reorders appearing to undo themselves.
    if (draftVersionRef.current === version) {
      setSetlists((prev) => [saved, ...prev.filter((item) => item.id !== saved.id)]);
      setSelectedId(saved.id);
      setSavingState("saved");
    }
  }, [getAccessToken, session?.user, t]);

  useEffect(() => {
    if (!draft || savingState !== "dirty") return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const version = draftVersionRef.current;
    saveTimerRef.current = setTimeout(() => {
      saveDraft(draft, version).catch((err) => toast.error(err instanceof Error ? err.message : String(err)));
    }, 800);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [draft, saveDraft, savingState, toast]);

  const createSetlist = useCallback(async () => {
    if (!newName.trim() || !session?.user) return;
    try {
      const token = await getAccessToken();
      if (!token) return;
      const response = await fetch("/api/setlists", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: newName.trim(),
          description: serializeSetlistMeta({
            datum: newDate || null,
            locatie: newLocation.trim(),
            notities: "",
            status: "concept",
            pauseOnTuningChange: false,
          }),
          items: [],
        }),
      });

      if (!response.ok) throw new Error(t('setlists.failedToCreateSetlist'));

      const created = (await response.json()) as { id: string; title?: string; description?: string | null; createdAt: string; updatedAt: string };
      const meta = parseSetlistMeta(created.description);
      const next: StoredSetlist = {
        id: created.id,
        userId: session.user.id,
        naam: created.title || newName.trim(),
        datum: meta.datum,
        locatie: meta.locatie,
        gigIds: [],
        items: [],
        notities: meta.notities,
        status: meta.status,
        pauseOnTuningChange: meta.pauseOnTuningChange,
        bandId: null,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      };

      setSetlists((prev) => [next, ...prev]);
      selectSetlist(next);
      setShowCreateModal(false);
      setNewName("");
      setNewDate("");
      setNewLocation("");
      toast.success(t('setlists.setlistCreated'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }, [getAccessToken, newDate, newLocation, newName, selectSetlist, session?.user, toast, t]);

  const duplicateSetlist = useCallback(async () => {
    if (!draft || !session?.user) return;
    try {
      const token = await getAccessToken();
      if (!token) return;
      const response = await fetch("/api/setlists", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: `${draft.naam} (kopie)`,
          description: serializeSetlistMeta({
            datum: draft.datum,
            locatie: draft.locatie || "",
            notities: draft.notities,
            status: "concept",
            pauseOnTuningChange: draft.pauseOnTuningChange,
          }),
          items: draft.items.map((item, index) => ({
            type: item.kind === "song" ? "song" : "note",
            title: item.kind === "song" ? item.label : item.specialLabel,
            notes: item.notitie || null,
            chords: item.key || null,
            tuning: item.tuning || null,
            order: index + 1,
          })),
        }),
      });

      if (!response.ok) throw new Error(t('setlists.duplicateFailed'));

      const created = (await response.json()) as { id: string; title?: string; description?: string | null; createdAt: string; updatedAt: string };
      const meta = parseSetlistMeta(created.description);
      const next: StoredSetlist = {
        id: created.id,
        userId: draft.userId,
        naam: created.title || `${draft.naam} (kopie)`,
        datum: meta.datum,
        locatie: meta.locatie,
        gigIds: [],
        items: draft.items.map(cloneItem),
        notities: meta.notities,
        status: meta.status,
        pauseOnTuningChange: meta.pauseOnTuningChange,
        bandId: draft.bandId || null,
        band: draft.band || null,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      };

      setSetlists((prev) => [next, ...prev]);
      toast.success(t('setlists.setlistDuplicated'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }, [draft, getAccessToken, session?.user, toast, t]);

  const assignSetlistToGig = useCallback(async (gigId: string | null) => {
    if (!draft) return;
    try {
      const token = await getAccessToken();
      if (!token) return;

      const nextGigIds = gigId ? [gigId] : [];
      
      // Get gig info to sync bandId, band info, date, and location
      let bandId = draft.bandId || null;
      let bandInfo = draft.band || null;
      let gigDatum = draft.datum || null;
      let gigLocatie = draft.locatie || null;
      
      if (gigId) {
        const gigRes = await fetch(`/api/gigs/${gigId}`, { headers: { Authorization: `Bearer ${token}` } });
        if (gigRes.ok) {
          const gigData = await gigRes.json();
          bandId = gigData.bandId || null;
          gigDatum = gigData.date ? gigData.date.split('T')[0] : null;
          gigLocatie = gigData.eventName || null;
          
          // Fetch band info if bandId is present
          if (bandId) {
            const bandRes = await fetch(`/api/bands`, { headers: { Authorization: `Bearer ${token}` } });
            if (bandRes.ok) {
              const bands = await bandRes.json();
              const band = bands.find((b: any) => b.id === bandId);
              if (band) {
                bandInfo = { id: band.id, name: band.name, color: band.color, logoUrl: band.logoUrl };
              }
            }
          }
        }
      }

      const res = await fetch(`/api/setlists/${draft.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ gigIds: nextGigIds, datum: gigDatum, locatie: gigLocatie, bandId }),
      });

      if (!res.ok) throw new Error(gigId ? t('setlists.assignFailed') : t('setlists.unassignFailed'));

      const refreshed = (await res.json()) as { gigs?: Array<{ id: string }>; bandId?: string | null; band?: any; datum?: string | null; locatie?: string | null };
      const resolvedGigIds = Array.isArray(refreshed.gigs) ? refreshed.gigs.map((gig) => gig.id) : nextGigIds;

      setDraft((current) => current ? { 
        ...current, 
        gigIds: resolvedGigIds, 
        bandId: refreshed.bandId || null, 
        band: refreshed.band || bandInfo,
        datum: refreshed.datum || gigDatum || null,
        locatie: refreshed.locatie || gigLocatie || null
      } : current);
      setSetlists((prev) =>
        prev.map((setlist) => {
          if (setlist.id === draft.id) {
            return { 
              ...setlist, 
              gigIds: resolvedGigIds, 
              bandId: refreshed.bandId || null, 
              band: refreshed.band || bandInfo,
              datum: refreshed.datum || gigDatum || null,
              locatie: refreshed.locatie || gigLocatie || null
            };
          }
          return gigId && setlist.gigIds.includes(gigId)
            ? { ...setlist, gigIds: setlist.gigIds.filter((id) => id !== gigId) }
            : setlist;
        })
      );

      toast.success(gigId ? t('setlists.setlistAssigned') : t('setlists.setlistUnassigned'));

      const gigsRes = await fetch('/api/gigs', { headers: { Authorization: `Bearer ${await getAccessToken()}` } });
      if (gigsRes.ok) {
        const gigsJson = await gigsRes.json();
        setGigsList(normalizeGigOptions(gigsJson));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }, [draft, getAccessToken, toast, t]);

  const deleteSetlist = useCallback(async (setlistId: string) => {
    if (!window.confirm(t('setlists.deleteSetlistConfirm'))) return;
    const token = await getAccessToken();
    if (!token) return;
    const response = await fetch(`/api/setlists/${setlistId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      toast.error(t('setlists.deleteFailed'));
      return;
    }
    setSetlists((prev) => prev.filter((item) => item.id !== setlistId));
    if (selectedId === setlistId) {
      setSelectedId(null);
      setDraft(null);
    }
  }, [getAccessToken, selectedId, toast, t]);

  const addSong = useCallback((song: SongRow) => {
    updateDraftItems((items) => [...items, createSongItem(song)]);
  }, [updateDraftItems]);

  const addSpecial = useCallback((label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    updateDraftItems((items) => [...items, createSpecialItem(trimmed)]);
  }, [updateDraftItems]);

  const convertToSong = useCallback((itemId: string, songId: string) => {
    const song = songs.find(s => s.id === songId);
    if (!song) return;
    const songItem = createSongItem(song);
    updateDraftItems((items) => items.map(item => item.id === itemId ? { ...songItem, id: itemId } : item));
    setShowSongPicker(false);
    setConvertingItemId(null);
  }, [songs, updateDraftItems]);

  const convertToCustom = useCallback((itemId: string) => {
    updateDraftItems((items) => items.map(item => {
      if (item.id === itemId) {
        return { ...createSpecialItem(item.label || "Custom"), id: itemId };
      }
      return item;
    }));
  }, [updateDraftItems]);

  const insertTuningNotes = useCallback(() => {
    const notes: DraftItem[] = [];
    let previousTuning = "";
    
    for (const item of currentItems) {
      if (item.kind === "special") {
        previousTuning = "";
        continue;
      }
      
      const currentTuning = item.tuning || "Onbekend";
      if (previousTuning && !areCaposEqual(currentTuning, previousTuning)) {
        notes.push(createSpecialItem(`⚠ ${t('setlists.tuningChange')}: ${previousTuning} → ${currentTuning}`));
      }
      previousTuning = currentTuning;
    }
    
    if (notes.length === 0) {
      toast.error(t('setlists.noTuningChangesFound'));
      return;
    }
    
    // Insert notes at appropriate positions
    let noteIndex = 0;
    updateDraftItems((items) => {
      const newItems: DraftItem[] = [];
      let previousTuning = "";
      
      for (const item of items) {
        if (item.kind === "special") {
          previousTuning = "";
          newItems.push(item);
          continue;
        }
        
        const currentTuning = item.tuning || "Onbekend";
        if (previousTuning && !areCaposEqual(currentTuning, previousTuning) && noteIndex < notes.length) {
          newItems.push(notes[noteIndex]);
          noteIndex++;
        }
        newItems.push(item);
        previousTuning = currentTuning;
      }
      
      return newItems;
    });
    
    toast.success(`${notes.length} ${t('setlists.tuningChangesAdded')}`);
  }, [currentItems, updateDraftItems, toast, t]);

  const removeTuningNotes = useCallback(() => {
    updateDraftItems((items) => items.filter(item => !(item.kind === "special" && item.specialLabel.startsWith(`⚠ ${t('setlists.tuningChange')}:`))));
    toast.success(t('setlists.tuningChangesRemoved'));
  }, [updateDraftItems, toast, t]);

  const handleTuningToggle = useCallback((checked: boolean) => {
    setIncludeTuningNotes(checked);
    if (checked) {
      insertTuningNotes();
    } else {
      removeTuningNotes();
    }
  }, [insertTuningNotes, removeTuningNotes]);

  const updateItem = useCallback((itemId: string, patch: Partial<DraftItem>) => {
    updateDraftItems((items) => items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)));
  }, [updateDraftItems]);

  const removeItem = useCallback((itemId: string) => {
    updateDraftItems((items) => items.filter((item) => item.id !== itemId));
  }, [updateDraftItems]);

  const moveItem = useCallback((fromIndex: number, toIndex: number) => {
    updateDraftItems((items) => {
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) return items;
      const copy = items.slice();
      const [item] = copy.splice(fromIndex, 1);
      copy.splice(toIndex, 0, item);
      return copy;
    });
  }, [updateDraftItems]);

  const moveItemById = useCallback((itemId: string, direction: -1 | 1) => {
    updateDraftItems((items) => {
      const index = items.findIndex((item) => item.id === itemId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return items;
      const copy = items.slice();
      const [item] = copy.splice(index, 1);
      copy.splice(nextIndex, 0, item);
      return copy;
    });
  }, [updateDraftItems]);

  const autoGenerate = useCallback(() => {
    if (!draft) return;
    const songsOnly = draft.items.filter((item) => item.kind === "song");
    const specials = draft.items.filter((item) => item.kind === "special");
    const orderedSongs = tuningGroups.flatMap((group) =>
      songsOnly
        .filter((item) => areCaposEqual(item.tuning || "Onbekend", group))
        .sort((a, b) => songSortValue(b) - songSortValue(a))
    );

    const rebuilt: DraftItem[] = [];
    orderedSongs.forEach((item, index) => {
      rebuilt.push({ ...cloneItem(item), id: crypto.randomUUID(), expanded: false });
      const next = orderedSongs[index + 1];
      if (draft.pauseOnTuningChange && next && !areCaposEqual(item.tuning || "Onbekend", next.tuning || "Onbekend")) {
        rebuilt.push(createSpecialItem("PAUZE"));
      }
    });

    const preservedSpecials = specials.filter((item) => !isKnownSpecialBlock(item.specialLabel));
    updateDraft({ items: [...rebuilt, ...preservedSpecials] });
  }, [draft, updateDraft]);

  // AI Auto-Order tool with XAI explanations and explicit confirmation
  const aiOptimizeFlow = useCallback(() => {
    if (!draft) return;
    setShowOptimizeFlowModal(true);
  }, [draft]);

  const handleOptimizeFlowConfirm = useCallback((criteria: OptimizationCriteria) => {
    if (!draft) return;
    setAiOptimizing(true);
    setShowOptimizeFlowModal(false);

    setTimeout(() => {
      const { optimizedItems, explanations, previewItems } = optimizeSetlistFlow(draft.items, criteria);

      // Store optimized items and explanations for confirmation
      setPendingAIItems(optimizedItems);
      setPendingAIExplanations(explanations);
      setPendingAIPreview(
        previewItems.length > 0
          ? previewItems
          : [
              {
                label: "Setlist Order",
                before: "Original order",
                after: "Optimized order",
                changed: true,
              },
            ]
      );

      setShowAIConfirmation(true);
      setAiOptimizing(false);
    }, 400); // Process AI flow optimization
  }, [draft]);

  // Apply pending AI optimization after user confirmation
  const applyAIOptimization = useCallback(async () => {
    if (!pendingAIItems || !draft) return;

    draftVersionRef.current += 1;
    const version = draftVersionRef.current;

    // Directly construct updated setlist with reordered items
    const nextDraft: StoredSetlist = {
      ...draft,
      items: pendingAIItems.map(cloneItem),
      updatedAt: new Date().toISOString(),
    };

    // Immediately update local state for draft and all setlists list
    setDraft(nextDraft);
    setSetlists((prev) => prev.map((s) => (s.id === nextDraft.id ? nextDraft : s)));
    setSavingState("saving");

    setShowAIConfirmation(false);
    setPendingAIItems(null);
    setPendingAIExplanations([]);
    setPendingAIPreview([]);

    try {
      await saveDraft(nextDraft, version);
      toast.success(t('setlists.aiOptimizeSuccess', 'Setlist optimized and saved with AI flow analysis'));
    } catch (err) {
      console.error("[SetlistsTab] Failed to save AI optimized setlist:", err);
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }, [pendingAIItems, draft, saveDraft, toast, t]);

  const openNoteTab = useCallback((noteId: string) => {
    router.push(`?tab=notes&noteId=${noteId}`, { scroll: false } as any);
  }, [router]);

  const toggleDrawerSong = (songId: string) => {
    setDrawerSongId((current) => (current === songId ? null : songId));
  };

  const handleAttachmentUpload = async (itemId: string, file: File) => {
    if (!session?.user) return;
    setUploadingAttachment(itemId);
    
    try {
      const token = await getAccessToken();
      if (!token) return;
      
      // Upload to Supabase
      const ext = file.name.split('.').pop() || 'png';
      const fileName = `setlist-item-${itemId}-${Date.now()}.${ext}`;
      
      const { data: uploadData, error: uploadError } = await supabaseClient.storage
        .from('songs')
        .upload(fileName, file, { upsert: true });
      
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabaseClient.storage
        .from('songs')
        .getPublicUrl(fileName);
      
      // Create attachment record
      const response = await fetch(`/api/setlist-items/${itemId}/attachments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          url: publicUrl,
          type: file.type.startsWith('image/') ? 'image' : 'file',
          title: file.name,
          mimeType: file.type,
          fileSize: file.size,
        }),
      });
      
      if (response.ok) {
        await loadItemAttachments(itemId);
        toast.success(t('setlists.attachmentAdded'));
      }
    } catch (error) {
      console.error('Failed to upload attachment:', error);
      toast.error(t('setlists.uploadFailed'));
    } finally {
      setUploadingAttachment(null);
    }
  };

  const handleDeleteAttachment = async (itemId: string, attachmentId: string) => {
    if (!session?.user) return;
    
    try {
      const token = await getAccessToken();
      if (!token) return;
      
      const response = await fetch(`/api/setlist-items/${itemId}/attachments/${attachmentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        await loadItemAttachments(itemId);
        toast.success(t('setlists.attachmentDeleted'));
      }
    } catch (error) {
      console.error('Failed to delete attachment:', error);
      toast.error(t('setlists.deleteFailed'));
    }
  };

  const renderItem = (item: DraftItem, index: number, performance = false) => {
    const songNumber = getSongNumber(currentItems, index);
    const specialBlockLabel = item.kind === "special" ? resolveSpecialBlockLabel(item.specialLabel, t) : "";

    if (item.kind === "special") {
      if (performance) {
        return (
          <div key={item.id} className="rounded-3xl border border-dashed border-slate-300 bg-slate-100/80 px-4 py-5 text-center text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200">
            {specialBlockLabel}
            {normalizeSpecialBlockKey(item.specialLabel) === "PAUZE" && <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">15 min</div>}
          </div>
        );
      }
      return (
        <div
          key={item.id}
          draggable
          onDragStart={(event) => event.dataTransfer.setData("text/plain", String(index))}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const from = Number(event.dataTransfer.getData("text/plain"));
            if (!Number.isNaN(from)) moveItem(from, index);
          }}
          className="rounded-3xl border border-dashed border-slate-300 bg-slate-100/80 px-4 py-3 text-center text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200"
        >
          <div className="flex items-center justify-between gap-2">
            <span>{specialBlockLabel}</span>
            <div className="flex gap-1">
              <button type="button" onClick={() => { setConvertingItemId(item.id); setShowSongPicker(true); }} className="rounded-lg border border-brand-200 px-2 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50 dark:border-brand-500/30 dark:text-brand-400 dark:hover:bg-brand-500/10" title={t('setlists.convertToSong')} aria-label={t('setlists.convertToSong')}>
                🎵
              </button>
              <button type="button" onClick={() => moveItemById(item.id, -1)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800" title={t('setlists.moveUp')} aria-label={t('setlists.moveUp')}>
                ↑
              </button>
              <button type="button" onClick={() => moveItemById(item.id, 1)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800" title={t('setlists.moveDown')} aria-label={t('setlists.moveDown')}>
                ↓
              </button>
              <button type="button" onClick={() => convertToCustom(item.id)} className="rounded-lg border border-brand-200 px-2 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50 dark:border-brand-500/30 dark:text-brand-400 dark:hover:bg-brand-500/10" title={t('setlists.convertToCustom')} aria-label={t('setlists.convertToCustom')}>
                📝
              </button>
              <button type="button" onClick={() => removeItem(item.id)} className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/10">×</button>
            </div>
          </div>
        </div>
      );
    }

    const song = item.songId ? activeSongMap.get(item.songId) : null;
    const songNotes = item.songId ? linkedNotesForSong(item.songId) : [];
    const hasImages = Boolean(song?.attachments?.some(isImageAttachment));
    const tuningChanged = index > 0 ? (currentItems[index - 1]?.kind === "song" ? !areCaposEqual(currentItems[index - 1].tuning || "Onbekend", item.tuning || "Onbekend") : false) : false;

    if (performance) {
      return (
        <section key={item.id} data-testid="performance-song-item" className={`rounded-3xl border px-5 py-5 ${activeItemId === item.id ? "border-brand-400 bg-brand-500/10" : "border-white/10 bg-white/5"}`}>
          <button type="button" onClick={() => setActiveItemId(item.id)} className="flex w-full items-start justify-between gap-4 text-left">
            <div className="min-w-0">
              <div className="text-4xl font-black text-white/90">{songNumber}</div>
              <div className="mt-2 text-2xl font-semibold">{song?.title || item.label}</div>
              {hasImages && <div className="mt-2 text-sm font-medium text-cyan-200 cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); updateItem(item.id, { expanded: !item.expanded }); }}>{item.expanded ? "🖼️ " + t('setlists.hideImage') : "🖼️ " + t('setlists.showImage')}</div>}
              {item.artist && <div className="text-sm text-slate-300">{item.artist}</div>}
            </div>
            <div className="flex flex-col items-end gap-2 text-right">
              <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${tuningBadgeClass(item.tuning || "Onbekend")}`}>{item.tuning || "Onbekend"}</span>
              <div className="text-sm text-slate-300">{item.key || ""} {item.tempo ? `· ${item.tempo}` : ""}</div>
            </div>
          </button>
          {item.notitie && <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-base text-slate-100">{item.notitie}</div>}
          {item.expanded && hasImages && song?.attachments && (
            <div className="mt-4 space-y-3">
              {song.attachments.filter(isImageAttachment).map((att) => (
                <img key={att.id} src={att.publicUrl} alt="" className="max-h-96 w-auto rounded-2xl border border-white/10" />
              ))}
            </div>
          )}
          {songNotes.length > 0 && (
            <div className="mt-4 space-y-3">
              {songNotes.map((note) => (
                <details key={note.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-100">{note.titel}</summary>
                  <div className="mt-3 whitespace-pre-wrap text-sm text-slate-300">{note.inhoud}</div>
                  <div className="mt-3 flex justify-end">
                    <button type="button" onClick={() => openNoteTab(note.id)} className="text-sm font-semibold text-brand-300 hover:underline">
                      {t('setlists.editNote')}
                    </button>
                  </div>
                </details>
              ))}
            </div>
          )}
        </section>
      );
    }

    return (
      <div
        key={item.id}
        draggable
        onDragStart={(event) => event.dataTransfer.setData("text/plain", String(index))}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const from = Number(event.dataTransfer.getData("text/plain"));
          if (!Number.isNaN(from)) moveItem(from, index);
        }}
        data-testid="setlist-song-item"
        className={`rounded-2xl border p-2 sm:p-3 transition-all duration-200 ease-in-out ${activeItemId === item.id ? "border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-500/10" : "border-slate-200 bg-white hover:bg-slate-50 hover:shadow-md dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900"}`}
      >
        <div className="flex items-start gap-2 min-w-0 max-w-full">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {songNumber}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
              <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{song?.title || item.label}</div>
              {item.artist && <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">{item.artist}</span>}
            </div>
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap mt-1">
              <span className={`rounded-full border px-1.5 py-0.5 text-[11px] font-semibold shrink-0 ${tuningBadgeClass(item.tuning || "Onbekend")}`}>{item.tuning || "Onbekend"}</span>
              {item.key && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300 shrink-0">{item.key}</span>}
              {item.tempo && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300 shrink-0">{item.tempo}</span>}
              {hasImages && <span className="rounded-full border border-cyan-200 bg-cyan-50 px-1.5 py-0.5 text-[11px] font-semibold text-cyan-700 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-300 shrink-0" title={t('setlists.imageIncluded')} aria-label={t('setlists.imageIncluded')}>🖼️</span>}
              {tuningChanged && <span className="text-sm text-amber-600 shrink-0">⚠</span>}
            </div>
            {item.songId && songNoteMap.get(item.songId)?.length ? (
              <div className="mt-1.5 flex flex-wrap gap-2">
                <button type="button" onClick={(event) => { event.stopPropagation(); toggleDrawerSong(item.songId || ""); }} className="rounded-full border border-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800" title={t('setlists.linkedNotes')} aria-label={t('setlists.linkedNotes')}>
                  📝 {songNoteMap.get(item.songId)?.length}
                </button>
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col gap-1">
            <button type="button" onClick={() => moveItemById(item.id, -1)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:scale-105 active:scale-95 transition-all duration-200 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800" title={t('setlists.moveUp')} aria-label={t('setlists.moveUp')}>
              ↑
            </button>
            <button type="button" onClick={() => moveItemById(item.id, 1)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:scale-105 active:scale-95 transition-all duration-200 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800" title={t('setlists.moveDown')} aria-label={t('setlists.moveDown')}>
              ↓
            </button>
            <button type="button" onClick={() => convertToCustom(item.id)} className="rounded-lg border border-brand-200 px-2 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50 hover:scale-105 active:scale-95 transition-all duration-200 dark:border-brand-500/30 dark:text-brand-400 dark:hover:bg-brand-500/10" title={t('setlists.convertToCustom')} aria-label={t('setlists.convertToCustom')}>
              📝
            </button>
            <button type="button" onClick={() => {
              updateItem(item.id, { expanded: !item.expanded });
              if (!item.expanded) {
                loadItemAttachments(item.id);
              }
            }} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:scale-105 active:scale-95 transition-all duration-200 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800" title={t('setlists.expandDetails')} aria-label={t('setlists.expandDetails')}>
              🔧
            </button>
            <button type="button" onClick={() => removeItem(item.id)} className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:scale-105 active:scale-95 transition-all duration-200 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/10" title={t('setlists.delete')} aria-label={t('setlists.delete')}>
              ×
            </button>
          </div>
        </div>

        {item.expanded && (
          <div className="mt-4 grid gap-3 grid-cols-1 sm:grid-cols-2">
            <input value={item.notitie} onChange={(e) => updateItem(item.id, { notitie: e.target.value })} placeholder={t('setlists.inlineNote')} className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
              <input value={item.tuning} onChange={(e) => updateItem(item.id, { tuning: e.target.value })} placeholder={t('setlists.tuning')} className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
              <input value={item.key} onChange={(e) => updateItem(item.id, { key: e.target.value })} placeholder={t('setlists.key')} className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
            </div>
            
            {/* Attachments Section */}
            <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {t('setlists.attachments')}
                </span>
                <label data-testid="attach-file-button" className="cursor-pointer rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleAttachmentUpload(item.id, file);
                    }}
                    disabled={uploadingAttachment === item.id}
                  />
                  {uploadingAttachment === item.id ? (
                    <span className="flex items-center gap-1">
                      <span className="h-3 w-3 animate-spin rounded-full border border-slate-400 border-t-transparent" />
                      {t('setlists.uploading')}
                    </span>
                  ) : (
                    <span>+ {t('setlists.add')}</span>
                  )}
                </label>
              </div>
              
              <div className="flex flex-wrap gap-2">
                {(() => {
                  const attachments = itemAttachments.get(item.id);
                  console.log('[DEBUG SetlistsTab] Rendering attachments for item:', item.id, attachments?.length, attachments);
                  return attachments?.map((att) => (
                    <div key={att.id} data-testid="attachment-item" className="relative group">
                      {att.type === 'image' ? (
                        <img src={att.url} alt={att.title || ''} className="h-16 w-16 rounded-lg object-cover border border-slate-200 dark:border-slate-700" />
                      ) : (
                        <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          📄
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteAttachment(item.id, att.id)}
                        className="absolute -right-1 -top-1 hidden rounded-full bg-rose-500 p-1 text-white shadow-sm group-hover:block hover:bg-rose-600"
                        title={t('setlists.deleteAttachment')}
                      >
                        ×
                      </button>
                    </div>
                  )) || null;
                })()}
                {itemAttachments.get(item.id)?.length === 0 && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {t('setlists.noAttachments')}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const activeNotes = drawerSongId ? songNoteMap.get(drawerSongId) || [] : [];

  if (showPerformanceMode && activeDraft) {
    const songsOnly = currentItems.filter((item) => item.kind === "song");
    const activeIndex = currentItems.findIndex((item) => item.id === activeItemId);
    const currentSongNumber = activeIndex >= 0 ? getSongNumber(currentItems, activeIndex) : 0;
    const position = songsOnly.length > 0 ? `${currentSongNumber} / ${songsOnly.length}` : "0 / 0";
    const currentSong = performanceActiveSong || songsOnly.find((item) => item.id === activeItemId) || null;
    const currentSongAttachments = currentSong?.songId ? itemAttachments.get(currentSong.songId) || [] : [];

    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-slate-950 text-white">
        {/* Header - compact for mobile, optimized touch targets */}
        <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-slate-950/95 px-3 py-2 sm:px-4 sm:py-3 backdrop-blur shrink-0">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] sm:text-xs uppercase tracking-[0.18em] text-slate-400">{t('setlists.performanceMode')}</div>
            <div className="truncate text-base sm:text-xl font-semibold">{activeDraft.naam}</div>
            <div className="text-[10px] sm:text-sm text-slate-300">{[activeDraft.datum, activeDraft.locatie].filter(Boolean).join(" · ")}</div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <div className="rounded-full border border-white/10 px-2 py-1 sm:px-3 sm:py-2 text-[10px] sm:text-sm">{position}</div>
            <button type="button" onClick={() => setShowPerformanceMode(false)} className="rounded-full bg-white/10 px-3 py-1.5 sm:px-4 sm:py-2 text-[10px] sm:text-sm font-semibold hover:bg-white/20 min-h-[36px] sm:min-h-[40px]">{t('setlists.backToEditor')}</button>
          </div>
        </header>

        {/* Main content - split view when attachments open */}
        <div className="flex-1 flex flex-col sm:flex-row overflow-hidden">
          {/* Song list */}
          <main className={`flex-1 overflow-y-auto px-3 py-3 sm:px-4 sm:py-5 transition-all ${performanceAttachmentsOpen ? 'sm:w-1/2' : 'w-full'}`}>
            <div className="mx-auto max-w-5xl space-y-3 sm:space-y-4">
              {currentItems.map((item, index) => (
                <div 
                  key={item.id}
                  onClick={() => {
                    if (item.kind === "song") {
                      setActiveItemId(item.id);
                      setPerformanceActiveSong(item);
                      if (item.songId && itemAttachments.has(item.songId)) {
                        setPerformanceAttachmentsOpen(true);
                      }
                    }
                  }}
                  className={`cursor-pointer transition-all ${item.id === activeItemId ? 'ring-2 ring-brand-500 rounded-2xl' : ''}`}
                >
                  {renderItem(item, index, true)}
                </div>
              ))}
            </div>
          </main>

          {/* Attachment drawer - slide in from right on mobile, split view on desktop */}
          {performanceAttachmentsOpen && currentSong && (
            <aside data-testid="attachment-drawer" className="fixed inset-y-0 right-0 z-20 w-full sm:w-1/2 lg:w-2/5 bg-slate-900 border-l border-white/10 flex flex-col sm:static sm:flex">
              <div className="flex items-center justify-between gap-2 p-3 border-b border-white/10 shrink-0">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-300">{currentSong.label}</div>
                  <div className="text-[10px] text-slate-500">{currentSong.tuning && `Tuning: ${currentSong.tuning}`}</div>
                </div>
                <button 
                  type="button" 
                  onClick={() => setPerformanceAttachmentsOpen(false)}
                  className="rounded-full bg-white/10 p-2 hover:bg-white/20 min-h-[36px] min-w-[36px] flex items-center justify-center"
                  aria-label="Close attachments"
                >
                  ✕
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-3">
                {currentSongAttachments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center py-8">
                    <div className="text-3xl mb-2">📎</div>
                    <div className="text-sm text-slate-400">{t('setlists.noAttachments')}</div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {currentSongAttachments.map((att) => (
                      <div key={att.id} className="rounded-xl border border-white/10 bg-slate-800 overflow-hidden">
                        {att.type.startsWith('image/') ? (
                          <img 
                            src={att.url} 
                            alt={att.title || 'Attachment'} 
                            className="w-full h-auto max-h-[60vh] object-contain"
                            loading="eager"
                          />
                        ) : att.type.startsWith('audio/') ? (
                          <audio
                            controls
                            src={att.url}
                            className="w-full p-3"
                            onError={(e) => {
                              const media = e.currentTarget;
                              // Offline fallback: if the primary URL fails to
                              // load (e.g. SW cache miss, network error), retry
                              // with a cache-busting query so Service Worker
                              // strategy 3b can serve the pinned OFFLINE_CACHE
                              // copy of the backing track transparently.
                              if (!media.src.includes('_offline=')) {
                                media.src = att.url + (att.url.includes('?') ? '&' : '?') + '_offline=1';
                              }
                            }}
                          >
                            Your browser does not support audio.
                          </audio>
                        ) : att.type.startsWith('video/') ? (
                          <video
                            controls
                            src={att.url}
                            className="w-full"
                            onError={(e) => {
                              const media = e.currentTarget;
                              if (!media.src.includes('_offline=')) {
                                media.src = att.url + (att.url.includes('?') ? '&' : '?') + '_offline=1';
                              }
                            }}
                          >
                            Your browser does not support video.
                          </video>
                        ) : (
                          <div className="p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-2xl">📄</span>
                              <span className="text-sm font-medium">{att.title || 'Document'}</span>
                            </div>
                            <a 
                              href={att.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold hover:bg-brand-700"
                            >
                              {t('setlists.open')}
                            </a>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>

        {/* Footer - navigation with large touch targets */}
        <footer className="sticky bottom-0 border-t border-white/10 bg-slate-950/95 px-3 py-2 sm:px-4 sm:py-3 backdrop-blur shrink-0">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 sm:gap-3">
            <button 
              type="button" 
              onClick={() => {
                const idx = songsOnly.findIndex((item) => item.id === activeItemId);
                const next = songsOnly[Math.max(0, idx - 1)];
                setActiveItemId(next?.id || null);
                setPerformanceActiveSong(next || null);
                if (next?.songId && itemAttachments.has(next.songId)) {
                  setPerformanceAttachmentsOpen(true);
                } else {
                  setPerformanceAttachmentsOpen(false);
                }
              }} 
              className="flex-1 rounded-full bg-white/10 px-4 py-3 sm:px-6 sm:py-4 text-sm sm:text-base font-semibold text-slate-600 hover:bg-white/20 min-h-[48px] sm:min-h-[52px] flex items-center justify-center gap-2"
            >
              <span className="text-lg sm:text-xl">←</span>
              <span>{t('setlists.prev')}</span>
            </button>
            <div className="text-xs sm:text-sm text-slate-300 px-2">{position}</div>
            <button 
              type="button" 
              onClick={() => {
                const idx = songsOnly.findIndex((item) => item.id === activeItemId);
                const next = songsOnly[Math.min(songsOnly.length - 1, idx + 1)];
                setActiveItemId(next?.id || null);
                setPerformanceActiveSong(next || null);
                if (next?.songId && itemAttachments.has(next.songId)) {
                  setPerformanceAttachmentsOpen(true);
                } else {
                  setPerformanceAttachmentsOpen(false);
                }
              }} 
              className="flex-1 rounded-full bg-white/10 px-4 py-3 sm:px-6 sm:py-4 text-sm sm:text-base font-semibold text-slate-600 hover:bg-white/20 min-h-[48px] sm:min-h-[52px] flex items-center justify-center gap-2"
            >
              <span>{t('setlists.next')}</span>
              <span className="text-lg sm:text-xl">→</span>
            </button>
          </div>
          
          {/* Quick attachment toggle button */}
          {currentSong?.songId && itemAttachments.has(currentSong.songId) && (
            <button
              type="button"
              onClick={() => setPerformanceAttachmentsOpen(!performanceAttachmentsOpen)}
              className="absolute bottom-20 right-4 rounded-full bg-brand-600 p-3 shadow-lg hover:bg-brand-700 min-h-[48px] min-w-[48px] flex items-center justify-center"
              aria-label={performanceAttachmentsOpen ? "Hide attachments" : "Show attachments"}
            >
              <span className="text-xl sm:text-2xl">{performanceAttachmentsOpen ? '✕' : '📎'}</span>
            </button>
          )}
        </footer>
      </div>
    );
  }

  return (
    <div data-testid="setlists-container" className="flex flex-col h-full min-h-0 bg-black text-slate-100 rounded-3xl border border-neutral-800/80 shadow-2xl overflow-hidden">
      {/* Header - always visible, compact */}
      <div className="flex items-center justify-between gap-2 border-b border-neutral-800/80 px-3 py-2 sm:px-4 sm:py-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-2 w-2 rounded-full bg-brand-500 animate-pulse shrink-0" />
          <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-white truncate">{t('setlists.title')}</h2>
          {error && <p className="hidden sm:block text-xs text-rose-400">{error}</p>}
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {draft ? (
            pinnedIds.has(draft.id) ? (
              <button
                type="button"
                onClick={handleUnpinFromOffline}
                title={t('setlists.offlineReadyTitle')}
                aria-label={t('setlists.offlineReadyTitle')}
                className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm font-semibold text-emerald-400 transition-all duration-200 hover:scale-105 active:scale-95 flex items-center gap-1.5"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <span className="hidden md:inline">{t('setlists.offlineReady')} ✓</span>
                <span className="md:hidden" aria-hidden>✓</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePinForOffline}
                disabled={pinningId !== null}
                title={t('setlists.pinForOfflineTitle')}
                aria-label={t('setlists.pinForOfflineTitle')}
                className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm font-semibold text-cyan-300 transition-all duration-200 hover:scale-105 hover:bg-cyan-500/20 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 flex items-center gap-1.5"
              >
                <span className="text-sm" aria-hidden>{pinningId ? '⏳' : '📴'}</span>
                <span className="hidden md:inline">{pinningId ? t('setlists.offlinePinning') : t('setlists.pinForOffline')}</span>
              </button>
            )
          ) : null}
          <button type="button" onClick={() => setShowCreateModal(true)} className="rounded-lg bg-gradient-to-r from-brand-600 via-indigo-600 to-cyan-600 px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold text-white shadow-lg hover:shadow-cyan-500/20 transition hover:scale-[1.02] active:scale-[0.98]">{t('setlists.newSetlist')}</button>
          
          {/* Toggle Left Sidebar Button */}
          <button 
            type="button" 
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)} 
            className={`rounded-lg border px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm font-semibold transition-all duration-200 hover:scale-105 active:scale-95 flex items-center gap-1.5 ${
              !sidebarCollapsed
                ? "border-brand-500/50 bg-brand-500/10 text-brand-400 dark:border-brand-400 dark:bg-brand-500/20"
                : "border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
            title={sidebarCollapsed ? t('setlists.showSetlists') : t('setlists.hideSetlists')}
            aria-label={sidebarCollapsed ? t('setlists.showSetlists') : t('setlists.hideSetlists')}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            <span className="hidden sm:inline">{t('setlists.setlists')}</span>
            <span className="rounded-full bg-slate-200 dark:bg-slate-800 px-1.5 py-0.2 text-[10px]">{filteredSetlists.length}</span>
          </button>

          {/* Toggle Right Repertoire Drawer Button */}
          <button 
            type="button" 
            onClick={() => setRepertoireCollapsed(!repertoireCollapsed)} 
            className={`rounded-lg border px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm font-semibold transition-all duration-200 hover:scale-105 active:scale-95 flex items-center gap-1.5 ${
              !repertoireCollapsed
                ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400 dark:border-cyan-400 dark:bg-cyan-500/20"
                : "border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
            title={repertoireCollapsed ? t('setlists.showSongPicker') : t('setlists.hideSongPicker')}
            aria-label={repertoireCollapsed ? t('setlists.showSongPicker') : t('setlists.hideSongPicker')}
          >
            <span className="text-sm">🎵</span>
            <span className="hidden sm:inline">{t('setlists.songPicker')}</span>
            <span className="rounded-full bg-cyan-950/60 border border-cyan-800/50 px-1.5 py-0.2 text-[10px] text-cyan-300">{songs.length}</span>
          </button>
        </div>
      </div>

      {/* Main content area - flexible layout */}
      <div className="flex flex-col md:flex-row min-h-0 flex-1 overflow-hidden relative max-h-[calc(100vh-4rem)]">
        {/* Sidebar - collapsible desktop/mobile drawer */}
        <aside className={`hidden md:flex flex-shrink-0 border-r border-slate-200/80 bg-white/90 dark:border-slate-800 dark:bg-slate-950/80 transition-all duration-300 ease-in-out ${
          sidebarCollapsed 
            ? 'w-0 min-w-0 max-w-0 opacity-0 pointer-events-none p-0 border-0 m-0 overflow-hidden' 
            : 'md:w-72 lg:w-80 opacity-100 pointer-events-auto overflow-y-auto'
        }`}>
          <div className="flex flex-col h-full p-2 sm:p-3 space-y-2">
            {/* Status filters - compact */}
            <div className="grid grid-cols-4 gap-1.5">
              {["alle", "concept", "klaar", "gearchiveerd"].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value as typeof statusFilter)}
                  title={statusTooltips[value as keyof typeof statusTooltips]}
                  aria-label={statusLabels[value as keyof typeof statusLabels]}
                  className={`rounded-lg px-1.5 py-1.5 text-sm font-semibold transition ${statusFilter === value ? "bg-brand-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"}`}
                >
                  <span aria-hidden className="block text-center leading-none text-xs">{statusIcons[value as keyof typeof statusIcons]}</span>
                </button>
              ))}
            </div>

            {/* Setlist list - collapsible */}
            <div className="flex-1 min-h-0 flex flex-col">
              <button
                type="button"
                onClick={() => setSetlistListCollapsed(!setlistListCollapsed)}
                className="flex items-center justify-between gap-2 w-full text-left shrink-0 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg px-2 py-1.5 transition-colors"
                title={setlistListCollapsed ? t('setlists.showSetlists') : t('setlists.hideSetlists')}
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {setlistListCollapsed ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  )}
                  {t('setlists.setlists')} ({filteredSetlists.length})
                </div>
              </button>
              <div 
                className={`flex-1 overflow-y-auto transition-all duration-300 ease-in-out ${setlistListCollapsed ? 'max-h-0 opacity-0 pointer-events-none' : 'max-h-full opacity-100 pointer-events-auto'}`}
              >
                {loading ? (
                  <div className="py-8 flex flex-col items-center justify-center">
                    <LoadingSpinner size="lg" message={t('setlists.loadingSetlists')} />
                  </div>
                ) : filteredSetlists.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">{t('setlists.noSetlists')}</div>
                ) : (
                  <div className="space-y-2 py-2 animate-in fade-in duration-300">
                    {filteredSetlists.map((setlist) => (
                      <div key={setlist.id} data-testid="setlist-item" className={`rounded-xl border p-2 transition-all duration-200 ${selectedId === setlist.id ? "border-brand-500 bg-brand-50 dark:border-brand-500/50 dark:bg-brand-500/10" : "border-slate-200 bg-white hover:bg-slate-50 hover:shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900"}`}>
                        <button type="button" onClick={() => selectSetlist(setlist)} className="w-full text-left">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="break-words text-xs sm:text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100">{setlist.naam}</div>
                              <div className="mt-0.5 line-clamp-1 text-[10px] sm:text-xs leading-snug text-slate-500 dark:text-slate-400">{[setlist.datum, setlist.locatie].filter(Boolean).join(" · ")}</div>
                              <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{setlist.items.filter((item) => item.kind === "song").length} {t('setlists.songs')}</div>
                            </div>
                            <span className="max-w-[80px] rounded-full border border-slate-200 px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-none text-slate-600 dark:border-slate-700 dark:text-slate-300 shrink-0">
                              <span className="block truncate">{statusLabels[setlist.status]}</span>
                            </span>
                          </div>
                        </button>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <button type="button" onClick={duplicateSetlist} className="min-w-0 rounded-md border border-slate-200 px-2 py-1 text-[10px] sm:text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800" title={t('setlists.duplicate')} aria-label={t('setlists.duplicate')}>
                            {t('setlists.duplicate')}
                          </button>
                          <button type="button" onClick={() => deleteSetlist(setlist.id)} className="min-w-0 rounded-md border border-rose-200 px-2 py-1 text-[10px] sm:text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/10" title={t('setlists.delete')} aria-label={t('setlists.delete')}>
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>

        {/* Main content - full width & dynamic expansion */}
        <main data-testid="setlist-details" className="flex-1 min-h-0 min-w-0 overflow-hidden bg-white/95 dark:bg-slate-950/85 transition-all duration-300 ease-in-out flex flex-col">
          {!activeDraft ? (
            loading ? (
              <div className="flex min-h-full flex-col items-center justify-center p-6 sm:p-8 text-center">
                <LoadingSpinner size="lg" message={t('setlists.loadingSetlists')} />
              </div>
            ) : (
            <div className="flex min-h-full flex-col items-center justify-center p-6 sm:p-8 text-center">
              <div className="text-4xl sm:text-5xl">🎼</div>
              <div className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">{setlists.length === 0 ? t('setlists.noSetlists') : t('setlists.noSelection')}</div>
              <button type="button" onClick={() => setShowCreateModal(true)} className="mt-6 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                {t('setlists.newSetlist')}
              </button>
              {/* Mobile toggle button when no setlist selected */}
              {sidebarCollapsed && (
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed(false)}
                  className="mt-4 lg:hidden rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors flex items-center gap-2"
                  title={t('setlists.showSetlists')}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                  {t('setlists.showSetlists')}
                </button>
              )}
            </div>
            )
          ) : (
            <div className="flex flex-col h-full min-h-0 overflow-y-auto p-3 sm:p-4 space-y-4">
              {/* Compact header for editing */}
              <div className="flex flex-col gap-3 min-w-0 bg-slate-50/70 dark:bg-slate-900/40 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800/80">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <select 
                    value={activeDraft.id} 
                    onChange={(e) => {
                      const selected = setlists.find(s => s.id === e.target.value);
                      if (selected) selectSetlist(selected);
                    }}
                    className="max-w-[200px] rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-700 truncate dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                  >
                    {filteredSetlists.map((setlist) => (
                      <option key={setlist.id} value={setlist.id}>{setlist.naam}</option>
                    ))}
                  </select>
                  <input value={activeDraft.naam} onChange={(e) => updateDraft({ naam: e.target.value })} className="flex-1 min-w-0 border-0 bg-transparent p-0 text-lg sm:text-xl font-semibold tracking-tight text-slate-900 outline-none dark:text-slate-100" />
                  {activeDraft.bandId && (() => {
                    const band = bandsList.find(b => b.id === activeDraft.bandId);
                    return band ? (
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-full border shrink-0 max-w-[150px]" style={{ borderColor: band.color || '#e2e8f0', backgroundColor: band.color ? `${band.color}20` : undefined }}>
                        {band.logoUrl && (
                          <div className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-md border border-slate-200/80 bg-white/80 shadow-sm dark:border-slate-700/80 dark:bg-slate-900/80">
                            <img src={band.logoUrl} alt={band.name} className="max-h-full max-w-full object-contain" />
                          </div>
                        )}
                        <span className="text-xs font-medium truncate" style={{ color: band.color || '#6366f1' }}>{band.name}</span>
                      </div>
                    ) : null;
                  })()}
                </div>
                
                {/* Action bar */}
                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                  <select value={activeDraft.gigIds[0] || ""} onChange={(e) => assignSetlistToGig(e.target.value || null)} className="max-w-[180px] rounded-lg border border-slate-200 px-2 py-1.5 text-xs truncate dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                    <option value="">{t('setlists.assign')}</option>
                    {gigsList.map((g) => (
                      <option key={g.id} value={g.id}>{g.date ? `${g.eventName} · ${new Date(g.date).toLocaleDateString(locale)}` : g.eventName}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => assignSetlistToGig(null)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-rose-600 shrink-0 dark:border-slate-700 dark:text-rose-400">×</button>
                  <div className="flex-1 min-w-0" />
                  
                  {/* Performance Mode */}
                  <button data-testid="performance-mode-button" type="button" onClick={() => setShowPerformanceMode((current: boolean) => !current)} className="rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1.5 text-xs font-semibold text-purple-700 hover:bg-purple-100 hover:scale-105 active:scale-95 transition-all duration-200 shrink-0 dark:border-purple-500/30 dark:bg-purple-500/10 dark:text-purple-300 dark:hover:bg-purple-500/20">
                    {t('setlists.performanceMode')}
                  </button>

                  {/* Export */}
                  <button type="button" onClick={() => setShowExport(true)} className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 hover:scale-105 active:scale-95 transition-all duration-200 shrink-0 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20">
                    {t('setlists.export')}
                  </button>

                  {/* Print / PDF Export (stage-ready black-on-white sheet) */}
                  <button type="button" onClick={handlePrintPdf} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:scale-105 active:scale-95 transition-all duration-200 shrink-0 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700" title={t('setlists.exportPdf')}>
                    <span aria-hidden>📄</span>
                    <span className="hidden md:inline">{t('setlists.exportPdf')}</span>
                  </button>

                  {/* Duplicate */}
                  <button type="button" onClick={duplicateSetlist} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:scale-105 active:scale-95 transition-all duration-200 shrink-0 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900">
                    {t('setlists.duplicate')}
                  </button>

                  {/* Toggle Repertoire Drawer */}
                  <button
                    type="button"
                    onClick={() => setRepertoireCollapsed(!repertoireCollapsed)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all duration-200 shrink-0 flex items-center gap-1 hover:scale-105 active:scale-95 ${
                      !repertoireCollapsed
                        ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-600 dark:border-cyan-400 dark:bg-cyan-500/20 dark:text-cyan-300"
                        : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
                    }`}
                    title={repertoireCollapsed ? t('setlists.showSongPicker') : t('setlists.hideSongPicker')}
                  >
                    <span>🎵</span>
                    <span>{t('setlists.songPicker')}</span>
                    <span className="text-[10px] opacity-75">{repertoireCollapsed ? "▸" : "◂"}</span>
                  </button>
                </div>

                {/* Compact metadata grid */}
                <div className="grid gap-1.5 grid-cols-2 sm:grid-cols-4 min-w-0">
                  <input type="date" value={parseDateOnly(activeDraft.datum)} onChange={(e) => updateDraft({ datum: e.target.value || null })} className="min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
                  <input value={activeDraft.locatie || ""} onChange={(e) => updateDraft({ locatie: e.target.value })} placeholder={t('setlists.location')} className="min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
                  <select value={activeDraft.status} onChange={(e) => updateDraft({ status: e.target.value as SetlistMeta["status"] })} className="min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                    <option value="concept">{t('setlists.concept')}</option>
                    <option value="klaar">{t('setlists.klaar')}</option>
                    <option value="gearchiveerd">{t('setlists.gearchiveerd')}</option>
                  </select>
                  <select value={activeDraft.bandId || ""} onChange={(e) => updateDraft({ bandId: e.target.value || null })} className="min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                    <option value="">{t('setlists.band')}</option>
                    {bandsList.map((band) => (
                      <option key={band.id} value={band.id}>{band.name}</option>
                    ))}
                  </select>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">{savingState === "saving" ? t('common.saving') : t('common.saved')}</div>
              </div>

              {/* Main workspace layout: Songs column (flex-1) + Repertoire Drawer (collapsible) */}
              <div className="flex flex-col md:flex-row gap-4 min-h-0 min-w-0 flex-1">
                {/* Song list column - expands dynamically */}
                <section className="flex-1 min-w-0 flex flex-col space-y-3 h-full min-h-0">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 sm:p-3 dark:border-slate-800 dark:bg-slate-900/60 shrink-0">
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                      <button type="button" onClick={() => addSpecial("PAUZE")} className="min-w-0 rounded-full bg-slate-900 px-2.5 py-1 text-[10px] sm:text-xs font-semibold text-white dark:bg-white dark:text-slate-900 hover:scale-105 active:scale-95 transition">{t('setlists.pause')}</button>
                      <button type="button" onClick={() => addSpecial("BIS")} className="min-w-0 rounded-full bg-slate-900 px-2.5 py-1 text-[10px] sm:text-xs font-semibold text-white dark:bg-white dark:text-slate-900 hover:scale-105 active:scale-95 transition">{t('setlists.bis')}</button>
                      <button type="button" onClick={() => addSpecial("BINDTEKST")} className="min-w-0 rounded-full bg-slate-900 px-2.5 py-1 text-[10px] sm:text-xs font-semibold text-white dark:bg-white dark:text-slate-900 hover:scale-105 active:scale-95 transition">{t('setlists.bindtekst')}</button>
                      <button type="button" onClick={() => addSpecial(window.prompt(t('setlists.customBlockLabel')) || "")} className="min-w-0 rounded-full border border-slate-300 px-2.5 py-1 text-[10px] sm:text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200 hover:bg-slate-100 hover:scale-105 active:scale-95 transition-all duration-200 dark:hover:bg-slate-800">{t('setlists.customBlock')}</button>
                      <label className="min-w-0 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] sm:text-xs font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 cursor-pointer flex items-center gap-1 hover:bg-amber-100 hover:scale-105 active:scale-95 transition-all duration-200">
                        <input type="checkbox" checked={includeTuningNotes} onChange={(e) => handleTuningToggle(e.target.checked)} className="sr-only" />
                        <span>{includeTuningNotes ? "✓" : "⚠"} {t('setlists.tuning')}</span>
                      </label>
                      <button type="button" onClick={autoGenerate} className="min-w-0 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-[10px] sm:text-xs font-semibold text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300 hover:bg-brand-100 hover:scale-105 active:scale-95 transition-all duration-200">{t('setlists.autoGenerate')}</button>
                      <button 
                        type="button" 
                        onClick={aiOptimizeFlow} 
                        disabled={aiOptimizing}
                        className="min-w-0 rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-[10px] sm:text-xs font-semibold text-purple-700 dark:border-purple-500/30 dark:bg-purple-500/10 dark:text-purple-300 hover:bg-purple-100 hover:scale-105 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        {aiOptimizing ? (
                          <>
                            <span className="animate-spin">⚡</span>
                            <span>AI...</span>
                          </>
                        ) : (
                          <>
                            <span>⚡</span>
                            <span>Optimize Flow</span>
                          </>
                        )}
                      </button>
                      <label className="ml-auto flex items-center gap-1 text-[10px] sm:text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer">
                        <input type="checkbox" checked={activeDraft.pauseOnTuningChange} onChange={(e) => updateDraft({ pauseOnTuningChange: e.target.checked })} className="rounded" />
                        {t('setlists.pauseOnTuning')}
                      </label>
                    </div>
                  </div>

                  {/* Items List */}
                  <div className="flex-1 min-h-0 overflow-y-auto space-y-2 min-w-0 pr-1">
                    {currentItems.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 p-8 text-center text-sm text-slate-400">
                        <p className="text-2xl mb-2">🎵</p>
                        <p className="font-semibold text-slate-700 dark:text-slate-300">{t('setlists.songPicker')}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Selecteer songs uit het repertoire rechts om je setlist op te bouwen.</p>
                      </div>
                    ) : (
                      currentItems.map((item, index) => renderItem(item, index, false))
                    )}
                  </div>

                  {/* Bottom Accordion Panels (General Notes & Tuning Analysis) */}
                  <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 shrink-0 pt-2 border-t border-slate-200/80 dark:border-slate-800/80">
                    {/* General Notes Accordion */}
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/90 dark:border-slate-800 dark:bg-slate-900/60 overflow-hidden shadow-sm">
                      <button 
                        type="button" 
                        onClick={() => setShowGeneralNotes((current: boolean) => !current)} 
                        className="flex items-center justify-between gap-2 text-left text-xs font-bold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 px-3 py-2.5 transition-colors w-full"
                        title={showGeneralNotes ? t('setlists.hideGeneralNotes') : t('setlists.showGeneralNotes')}
                      >
                        <div className="flex items-center gap-2">
                          <svg className={`w-4 h-4 transition-transform duration-200 ${showGeneralNotes ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                          <span>📝 {t('setlists.generalNotes')}</span>
                        </div>
                        {activeDraft.notities && <span className="text-[10px] text-brand-600 dark:text-brand-400 font-medium">Ingevuld</span>}
                      </button>
                      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${showGeneralNotes ? 'max-h-72 opacity-100 p-3 pt-0' : 'max-h-0 opacity-0 p-0'}`}>
                        <textarea value={activeDraft.notities} onChange={(e) => updateDraft({ notities: e.target.value })} className="min-h-24 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 placeholder-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 outline-none focus:border-brand-500" placeholder={t('setlists.generalNotes')} />
                      </div>
                    </div>

                    {/* Tuning Panel Accordion */}
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/90 dark:border-slate-800 dark:bg-slate-900/60 overflow-hidden shadow-sm">
                      <button 
                        type="button" 
                        onClick={() => setShowTuningPanel((current: boolean) => !current)} 
                        className="flex items-center justify-between gap-2 text-left text-xs font-bold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 px-3 py-2.5 transition-colors w-full"
                        title={showTuningPanel ? t('setlists.hideTuningPanel') : t('setlists.showTuningPanel')}
                      >
                        <div className="flex items-center gap-2">
                          <svg className={`w-4 h-4 transition-transform duration-200 ${showTuningPanel ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                          <span>🎸 {t('setlists.tuningPanel')}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">{tuningExplanation.length} regels</span>
                      </button>
                      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${showTuningPanel ? 'max-h-72 opacity-100 p-3 pt-0' : 'max-h-0 opacity-0 p-0'}`}>
                        <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 max-h-48 overflow-y-auto pr-1">
                          {tuningExplanation.map((line, index) => (
                            <div key={`${line}-${index}`} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-950">{line}</div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Right Repertoire Drawer (Desktop & Medium screens) */}
                <aside className={`hidden md:flex flex-col rounded-2xl border border-slate-200 bg-slate-50/90 dark:border-slate-800 dark:bg-slate-900/60 shrink-0 transition-all duration-300 ease-in-out shadow-sm max-h-[calc(100vh-8rem)] ${
                  repertoireCollapsed 
                    ? 'w-0 min-w-0 max-w-0 opacity-0 pointer-events-none p-0 border-0 m-0 overflow-hidden' 
                    : 'w-72 xl:w-80 opacity-100 pointer-events-auto p-3 space-y-3'
                }`}>
                  <div className="flex items-center justify-between gap-2 shrink-0 border-b border-slate-200/80 dark:border-slate-800/80 pb-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-100">
                      <span>🎵 {t('setlists.songPicker')}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300">🖼️ {repertoireImageStats.withImages}/{songs.length}</span>
                      <button 
                        type="button" 
                        onClick={() => setRepertoireCollapsed(true)} 
                        className="rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
                        title={t('setlists.hideSongPicker')}
                        aria-label={t('setlists.hideSongPicker')}
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col flex-1 min-h-0 space-y-2">
                    <input 
                      value={songSearch} 
                      onChange={(e) => setSongSearch(e.target.value)} 
                      placeholder={t('setlists.searchSongs')} 
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 shrink-0 outline-none focus:border-cyan-500" 
                    />

                    {/* Attachment Filters */}
                    <div className="flex flex-wrap gap-1 min-w-0 max-w-full shrink-0">
                      {([
                        ["all", t('setlists.all')],
                        ["with", "Met PDF/img"],
                        ["without", "Zonder"],
                      ] as const).map(([value, label]) => (
                        <button 
                          key={value} 
                          type="button" 
                          onClick={() => setAttachmentFilter(value)} 
                          className={`rounded-lg border px-2 py-1 text-[10px] font-semibold leading-tight transition shrink-0 ${
                            attachmentFilter === value 
                              ? "border-cyan-500 bg-cyan-500 text-white" 
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {/* Multi-Select Tag Filter */}
                    <div className="relative">
                      <button
                        type="button"
                        data-tag-filter-button
                        onClick={() => setShowTagDropdown(!showTagDropdown)}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold leading-tight transition shrink-0 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      >
                        {tagFilter.length > 0 ? (
                          <span className="text-cyan-600 dark:text-cyan-400">{tagFilter.length} tags</span>
                        ) : (
                          <span className="text-slate-600 dark:text-slate-400">Tags</span>
                        )}
                        <span className="text-slate-400 ml-1">▼</span>
                      </button>
                      
                      {/* Dropdown */}
                      {showTagDropdown && (
                        <div 
                          id="tag-filter-dropdown"
                          className="absolute left-0 mt-1 w-48 max-h-48 overflow-y-auto rounded-lg border border-slate-300 bg-white shadow-xl z-10 p-2 dark:border-slate-700 dark:bg-slate-950"
                        >
                          {Array.from(new Set(songs.flatMap(s => {
                            const parsed = parseSongNotes(s.notes);
                            return [parsed.meta.bandProject, parsed.meta.genre].filter(Boolean);
                          }))).sort().map(tag => (
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
                              className="w-full flex items-center gap-2 px-2 py-1 text-left text-[10px] text-slate-700 hover:bg-slate-100 rounded transition dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              <input
                                type="checkbox"
                                checked={tagFilter.includes(tag)}
                                readOnly
                                className="h-3 w-3 rounded border-slate-300 bg-white text-cyan-500 focus:ring-cyan-500 dark:border-slate-600 dark:bg-slate-800"
                              />
                              <span className={tagFilter.includes(tag) ? "text-cyan-600 dark:text-cyan-400 font-medium" : "text-slate-600 dark:text-slate-300"}>{tag}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Active Tag Filters */}
                    {tagFilter.length > 0 && (
                      <div className="flex flex-wrap gap-1 items-center">
                        {tagFilter.map(tag => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => setTagFilter(prev => prev.filter(t => t !== tag))}
                            className="rounded-full bg-cyan-100 border border-cyan-300 px-2 py-0.5 text-[9px] font-semibold text-cyan-700 hover:bg-cyan-200 transition dark:bg-cyan-900/30 dark:border-cyan-700 dark:text-cyan-300 dark:hover:bg-cyan-900/50 flex items-center gap-1"
                          >
                            {tag}
                            <span className="text-cyan-600 dark:text-cyan-400">×</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Songs grouped by tuning */}
                    <div className="flex-1 space-y-2 overflow-y-auto pr-1 animate-in fade-in duration-300 min-h-0 max-h-[calc(100vh-12rem)]">
                      {songGroups.map(([tuning, group]) => (
                        <div key={tuning} className="space-y-1">
                          <div className={`inline-flex max-w-full rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tuningBadgeClass(tuning)}`}>
                            <span className="block truncate">{tuning} ({group.length})</span>
                          </div>
                          <div className="space-y-1">
                            {group.map((item) => {
                              const song = (item as any).song || item as SongRow;
                              const meta = parseSongNotes(song.notes).meta;
                              const imageCount = song.attachments?.filter(isImageAttachment).length || 0;
                              const documentCount = (song.attachments?.length || 0) - imageCount;
                              return (
                                <button 
                                  key={song.id} 
                                  type="button" 
                                  onClick={() => addSong(song)} 
                                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left text-xs transition-all duration-200 hover:border-brand-300 hover:bg-brand-50 hover:scale-[1.02] hover:shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:hover:border-brand-500/50 dark:hover:bg-brand-500/10 group"
                                >
                                  <div className="flex items-start justify-between gap-1.5">
                                    <div className="min-w-0 flex-1">
                                      <div className="break-words font-semibold leading-snug text-[11px] group-hover:text-brand-600 dark:group-hover:text-brand-400">{song.title}</div>
                                      <div className="line-clamp-1 text-[10px] text-slate-500 dark:text-slate-400">{meta.bandProject || meta.genre || ""}</div>
                                    </div>
                                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                                      <div className="text-[9px] text-slate-500">{imageCount ? `🖼️${imageCount}` : documentCount ? `📎${documentCount}` : "—"}</div>
                                      {songOccurrences.get(song.id) && <span className="rounded-full bg-slate-200 px-1 py-0.5 text-[9px] font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-100">{songOccurrences.get(song.id)}×</span>}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </aside>

                {/* Mobile Repertoire Drawer (<MD) */}
                <div className="md:hidden shrink-0">
                  <button
                    type="button"
                    onClick={() => setRepertoireCollapsed(!repertoireCollapsed)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-between"
                    title={repertoireCollapsed ? t('setlists.showSongPicker') : t('setlists.hideSongPicker')}
                  >
                    <div className="flex items-center gap-2">
                      <svg className={`w-4 h-4 transition-transform duration-200 ${!repertoireCollapsed ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <span>🎵 {t('setlists.songPicker')} ({songs.length})</span>
                    </div>
                    <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300">🖼️ {repertoireImageStats.withImages}</span>
                  </button>
                  
                  {!repertoireCollapsed && (
                    <div className="mt-2 flex flex-col rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900 transition-all duration-300 ease-in-out animate-in fade-in slide-in-from-top-2 max-h-[60vh]">
                      <input value={songSearch} onChange={(e) => setSongSearch(e.target.value)} placeholder={t('setlists.searchSongs')} className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 mb-2 shrink-0" />
                      <div className="flex-1 min-h-0 space-y-2 overflow-y-auto">
                        {songGroups.map(([tuning, group]) => (
                          <div key={tuning}>
                            <div className={`mb-1 inline-flex max-w-full rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${tuningBadgeClass(tuning)}`}><span className="block truncate">{tuning}</span></div>
                            <div className="space-y-1.5">
                              {group.map((item) => {
                                const song = (item as any).song || item as SongRow;
                                const occurrenceCount = songOccurrences.get(song.id) || 0;
                                const meta = parseSongNotes(song.notes).meta;
                                const imageCount = song.attachments?.filter(isImageAttachment).length || 0;
                                return (
                                  <button key={song.id} type="button" onClick={() => addSong(song)} className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left text-xs transition hover:border-brand-300 hover:bg-brand-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-brand-500/50 dark:hover:bg-brand-500/10">
                                    <div className="flex items-start justify-between gap-1.5">
                                      <div className="min-w-0 flex-1">
                                        <div className="break-words font-semibold leading-snug text-[11px]">{song.title}</div>
                                        <div className="line-clamp-1 text-[10px] text-slate-500 dark:text-slate-400">{meta.bandProject || meta.genre || ""}</div>
                                      </div>
                                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                                        <div className="text-[9px] text-slate-500">{imageCount ? `🖼️${imageCount}` : "—"}</div>
                                        {occurrenceCount > 0 && <span className="rounded-full bg-slate-200 px-1 py-0.5 text-[9px] font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-100">{occurrenceCount}×</span>}
                                      </div>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {drawerSongId && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
          <div className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-2xl dark:bg-slate-950">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t('setlists.linkedNotes')}</div>
                <div className="text-xl font-semibold text-slate-900 dark:text-slate-100">{activeSongMap.get(drawerSongId)?.title || ""}</div>
              </div>
              <button type="button" onClick={() => setDrawerSongId(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700">×</button>
            </div>

            <div className="mt-4 space-y-3">
              {activeNotes.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  {t('setlists.noLinkedNotes')}
                </div>
              ) : activeNotes.map((note) => (
                <div key={note.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{note.titel}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {note.tags.map((tag) => <span key={tag} className="rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-medium text-white">{tag}</span>)}
                      </div>
                    </div>
                    <button type="button" onClick={() => openNoteTab(note.id)} className="text-sm font-semibold text-brand-600 hover:underline">
                      {t('setlists.editNote')}
                    </button>
                  </div>
                  <div className="mt-3 whitespace-pre-wrap rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">{note.inhoud}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showSongPicker && convertingItemId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl max-h-[85vh] rounded-3xl bg-white p-5 shadow-2xl dark:bg-slate-950 flex flex-col">
            <div className="flex items-center justify-between gap-3 mb-4 shrink-0">
              <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t('setlists.selectSong')}</div>
              <button type="button" onClick={() => { setShowSongPicker(false); setConvertingItemId(null); }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700">×</button>
            </div>
            <input value={songSearch} onChange={(e) => setSongSearch(e.target.value)} placeholder={t('setlists.searchSongs')} className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 mb-4 shrink-0" />
            <div className="flex-1 overflow-y-auto space-y-2 min-h-0 max-h-[60vh]">
              {songGroups.map(([tuning, group]) => (
                <div key={tuning}>
                  <div className={`mb-2 inline-flex max-w-full rounded-full border px-2 py-0.5 text-xs font-semibold ${tuningBadgeClass(tuning)}`}><span className="block truncate">{tuning}</span></div>
                  <div className="space-y-2">
                    {group.map((item) => {
                      const song = (item as any).song || item as SongRow;
                      const matchReasons = (item as any).matchReasons || [] as string[];
                      const meta = parseSongNotes(song.notes).meta;
                      return (
                        <button key={song.id} type="button" onClick={() => convertToSong(convertingItemId, song.id)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-left text-sm transition hover:border-brand-300 hover:bg-brand-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-brand-500/50 dark:hover:bg-brand-500/10">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="break-words font-semibold leading-snug">{song.title}</div>
                              <div className="line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{meta.bandProject || meta.genre || ""}</div>
                              {matchReasons.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {matchReasons.map((reason: string, idx: number) => (
                                    <span key={idx} className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                                      {reason}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <span className="rounded-full bg-brand-600 px-2 py-1 text-xs font-semibold text-white shrink-0">{t('setlists.select')}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showExport && draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl rounded-3xl bg-white p-5 shadow-2xl dark:bg-slate-950">
            <div className="flex items-center justify-between gap-3">
              <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t('setlists.export')}</div>
              <button type="button" onClick={() => setShowExport(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700">×</button>
            </div>
            <textarea readOnly value={exportText} className="mt-4 min-h-80 w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 font-mono text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
            <div className="mt-4 flex items-center gap-2">
              <input
                type="checkbox"
                id="exportIncludeAttachments"
                checked={exportIncludeAttachments}
                onChange={(e) => setExportIncludeAttachments(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900"
              />
              <label htmlFor="exportIncludeAttachments" className="text-sm text-slate-700 dark:text-slate-300">
                {t('setlists.includeAttachments')}
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => navigator.clipboard.writeText(exportText)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">Copy</button>
              <button type="button" onClick={() => {
                // Open printable view for PDF export
                const win = window.open('', '_blank', 'toolbar=0,location=0,menubar=0');
                if (!win) return;
                
                // Generate pastel colors for unique tunings
                const tuningColors = new Map<string, { pastel: string; dark: string }>();
                const pastelColors = [
                  '#e3f2fd', // pastel blue
                  '#e8f5e9', // pastel green
                  '#fff3e0', // pastel orange
                  '#f3e5f5', // pastel purple
                  '#fce4ec', // pastel pink
                  '#e0f7fa', // pastel cyan
                  '#fff9c4', // pastel yellow
                  '#efebe9', // pastel brown
                ];
                const darkColors = [
                  '#1976d2', // dark blue
                  '#2e7d32', // dark green
                  '#f57c00', // dark orange
                  '#7b1fa2', // dark purple
                  '#c2185b', // dark pink
                  '#0097a7', // dark cyan
                  '#fbc02d', // dark yellow
                  '#5d4037', // dark brown
                ];
                let colorIndex = 0;
                
                const getTuningColor = (tuning: string): { pastel: string; dark: string } => {
                  if (!tuningColors.has(tuning)) {
                    tuningColors.set(tuning, { pastel: pastelColors[colorIndex % pastelColors.length], dark: darkColors[colorIndex % darkColors.length] });
                    colorIndex++;
                  }
                  return tuningColors.get(tuning)!;
                };
                
                const htmlParts: string[] = [];
                
                // Get band logo if band is selected
                const selectedBand = draft.bandId ? bandsList.find(b => b.id === draft.bandId) : null;
                const bandLogo = selectedBand?.logoUrl;
                
                // Metadata badges (without title - handled by createPrintDocument)
                const metaBadges: string[] = [];
                if (selectedBand) metaBadges.push(`<span class="metadata-item">Band: ${escapeHtml(selectedBand.name)}</span>`);
                if (draft.status) metaBadges.push(`<span class="metadata-item">Status: ${escapeHtml(draft.status)}</span>`);
                if (draft.datum) metaBadges.push(`<span class="metadata-item">Date: ${escapeHtml(draft.datum)}</span>`);
                if (draft.locatie) metaBadges.push(`<span class="metadata-item">Location: ${escapeHtml(draft.locatie)}</span>`);
                if (metaBadges.length > 0) htmlParts.push(`<div class="metadata">${metaBadges.join('')}</div>`);
                htmlParts.push('<section class="section">');
                
                // Track song numbers separately (only for actual songs)
                let songNumber = 0;
                
                draft.items.forEach((item) => {
                  if (item.kind === 'special') {
                    // Render as divider without number
                    htmlParts.push(`<div class="setlist-item" style="text-align:center;color:#64748b;font-size:11pt;font-weight:600;letter-spacing:0.1em;padding:4mm 0;border-top:1px dashed #e2e8f0;border-bottom:1px dashed #e2e8f0;text-transform:uppercase;">--- ${escapeHtml(resolveSpecialBlockLabel(item.specialLabel, t))} ---</div>`);
                    return;
                  }
                  
                  songNumber++;
                  const song = songs.find(s => s.id === item.songId || (s.title && s.title.toLowerCase() === item.label.toLowerCase()));
                  const title = song ? song.title : item.label;
                  
                  // Build metadata badges with colored text (most reliable for print)
                  const badges: string[] = [];
                  if (item.tuning) {
                    const colors = getTuningColor(item.tuning);
                    badges.push(`<span class="metadata-item" style="border: 2px solid ${colors.pastel} !important; color: ${colors.dark} !important; font-weight: 800 !important;">${escapeHtml(item.tuning)}</span>`);
                  }
                  if (item.key) {
                    const colors = getTuningColor(item.key);
                    badges.push(`<span class="metadata-item" style="border: 2px solid ${colors.pastel} !important; color: ${colors.dark} !important; font-weight: 800 !important;">Key: ${escapeHtml(item.key)}</span>`);
                  }
                  if (item.tempo) {
                    const colors = getTuningColor(item.tempo + ' bpm');
                    badges.push(`<span class="metadata-item" style="border: 2px solid ${colors.pastel} !important; color: ${colors.dark} !important; font-weight: 800 !important;">${escapeHtml(item.tempo)} BPM</span>`);
                  }
                  
                  const metaStr = badges.length > 0 ? ` ${badges.join('')}` : '';
                  
                  htmlParts.push(`<article class="setlist-item">`);
                  htmlParts.push(`<h3 class="setlist-item-title"><span class="setlist-item-number">${songNumber}.</span>${escapeHtml(title)}${metaStr}</h3>`);
                  
                  // Include image attachments only if checkbox is checked
                  if (exportIncludeAttachments && song?.attachments && song.attachments.length > 0) {
                    const imageAttachments = song.attachments.filter(isImageAttachment);
                    if (imageAttachments.length > 0) {
                      imageAttachments.forEach((att) => {
                        htmlParts.push(`<figure class="attachment"><img src="${escapeHtml(att.publicUrl)}" alt="" loading="eager" /></figure>`);
                      });
                    }
                  }
                  
                  if (item.notitie) htmlParts.push(`<div class="note-content" style="margin-top:3mm;">${escapeHtml(item.notitie)}</div>`);
                  htmlParts.push('</article>');
                });
                
                htmlParts.push('</section>');
                if (draft.notities.trim()) htmlParts.push(`<section class="section"><h2 class="section-heading">General Notes</h2><div class="note-content">${escapeHtml(draft.notities)}</div></section>`);

                // Get band logo if setlist is linked to a band
                const band = draft.bandId ? bandsList.find(b => b.id === draft.bandId) : null;
                const logoUrl = band?.logoUrl || undefined;
                
                win.document.open();
                win.document.write(createPrintDocument(escapeHtml(draft.naam), htmlParts.join('\n'), {
                  includeLogo: settings.pdfIncludeLogo ?? true,
                  logoUrl: logoUrl,
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
                // Printing is handled by the small script that waits for images to load
              }} className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition shadow-md">
                <span>📄</span>
                <span>{t('setlists.exportPdf')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl dark:bg-slate-950">
            <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t('setlists.newSetlist')}</div>
            <div className="mt-4 grid gap-3">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('setlists.name')} className="rounded-2xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
              <input value={newDate} onChange={(e) => setNewDate(e.target.value)} type="date" className="rounded-2xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
              <input value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder={t('setlists.location')} className="rounded-2xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreateModal(false)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">{t('setlists.cancel')}</button>
              <button type="button" onClick={createSetlist} disabled={!newName.trim()} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{t('setlists.create')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Optimize Flow Criteria Modal */}
      <OptimizeFlowModal
        isOpen={showOptimizeFlowModal}
        onConfirm={handleOptimizeFlowConfirm}
        onCancel={() => setShowOptimizeFlowModal(false)}
      />

      {/* AI Confirmation Modal */}
      <XAIConfirmationModal
        isOpen={showAIConfirmation}
        title="AI Flow Optimization Preview"
        explanation={pendingAIExplanations.length > 0 
          ? `The AI has analyzed your setlist and created an optimized flow based on your selected criteria. ${pendingAIExplanations.length} optimization${pendingAIExplanations.length !== 1 ? 's' : ''} identified: ${pendingAIExplanations.join('; ')}.`
          : "The AI has optimized your setlist order to create a more engaging performance flow."
        }
        previewItems={pendingAIPreview}
        confidenceScore={0.85}
        icon="⚡"
        confirmLabel="Apply Optimization"
        cancelLabel="Cancel"
        isLoading={false}
        onConfirm={applyAIOptimization}
        onCancel={() => {
          setShowAIConfirmation(false);
          setPendingAIItems(null);
          setPendingAIExplanations([]);
          setPendingAIPreview([]);
        }}
      />
    </div>
  );
}

function safeJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
