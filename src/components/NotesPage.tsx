"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { useSettings } from "./SettingsProvider";
import { useToast } from "./ToastContainer";

type NoteLinkType = "song" | "setlist" | "algemeen";

type StoredNote = {
	id: string;
	userId: string;
	titel: string;
	inhoud: string;
	tags: string[];
	gekoppeldAan: {
		type: NoteLinkType;
		refId: string | null;
	};
	gepind: boolean;
	createdAt: string;
	updatedAt: string;
};

type NoteListRow = {
	id: string;
	photoName: string | null;
	noteType: string | null;
	updatedAt: string;
	createdAt: string;
};

type NoteDetailRow = NoteListRow & {
	linkedBand: string | null;
	notes: unknown;
};

type SongRow = { id: string; title: string };
type SetlistRow = { id: string; title: string };

const DEFAULT_TITLE = { en: "New note", nl: "Nieuwe nota" };

const emptyNote = (userId: string, locale: string): StoredNote => ({
	id: crypto.randomUUID(),
	userId,
	titel: locale.startsWith("nl") ? DEFAULT_TITLE.nl : DEFAULT_TITLE.en,
	inhoud: "",
	tags: [],
	gekoppeldAan: { type: "algemeen", refId: null },
	gepind: false,
	createdAt: new Date().toISOString(),
	updatedAt: new Date().toISOString(),
});

const cloneNote = (note: StoredNote): StoredNote => ({
	...note,
	tags: [...note.tags],
	gekoppeldAan: { ...note.gekoppeldAan },
});

const safeParse = <T,>(raw: unknown, fallback: T): T => {
	if (typeof raw !== "string") return fallback;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
};

const serializeNote = (note: StoredNote) =>
	JSON.stringify({
		titel: note.titel,
		inhoud: note.inhoud,
		tags: note.tags,
		gekoppeldAan: note.gekoppeldAan,
		gepind: note.gepind,
	});

const parseLinkedBand = (linkedBand: string | null | undefined): StoredNote["gekoppeldAan"] => {
	if (!linkedBand) return { type: "algemeen", refId: null };
	const [type, refId] = linkedBand.split(":");
	if (type === "song" || type === "setlist") return { type, refId: refId || null };
	return { type: "algemeen", refId: null };
};

const parseStoredNote = (row: NoteDetailRow, userId: string): StoredNote | null => {
	if (row.noteType !== "text") return null;

	const payload = safeParse<Record<string, unknown>>(row.notes, {});
	const title = typeof payload.titel === "string" && payload.titel.trim() ? payload.titel : row.photoName || (userId ? DEFAULT_TITLE.en : DEFAULT_TITLE.en);
	const content = typeof payload.inhoud === "string" ? payload.inhoud : "";
	const tags = Array.isArray(payload.tags)
		? Array.from(new Set(payload.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean)))
		: [];
	const linked = payload.gekoppeldAan && typeof payload.gekoppeldAan === "object"
		? payload.gekoppeldAan as StoredNote["gekoppeldAan"]
		: parseLinkedBand(row.linkedBand);

	return {
		id: row.id,
		userId,
		titel: title,
		inhoud: content,
		tags,
		gekoppeldAan: {
			type: linked?.type === "song" || linked?.type === "setlist" ? linked.type : "algemeen",
			refId: typeof linked?.refId === "string" ? linked.refId : null,
		},
		gepind: Boolean(payload.gepind),
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
};

const firstLine = (value: string) => value.trim().split(/\r?\n/).find(Boolean) || "";

const formatDateTime = (value: string, locale: string) => {
	try {
		return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
	} catch {
		return value;
	}
};

const escapeHtml = (value: string) =>
	value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");

const renderMarkdown = (value: string) => {
	const lines = value.split(/\r?\n/);
	const html: string[] = [];
	let listOpen = false;

	const closeList = () => {
		if (listOpen) {
			html.push("</ul>");
			listOpen = false;
		}
	};

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) {
			closeList();
			continue;
		}

		if (/^[-*]\s+/.test(trimmed)) {
			if (!listOpen) {
				html.push("<ul class='list-disc pl-5 space-y-1'>");
				listOpen = true;
			}
			html.push(`<li>${escapeHtml(trimmed.replace(/^[-*]\s+/, "")).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>").replace(/` + "`" + `([^` + "`" + `]+)` + "`" + `/g, "<code class='rounded bg-slate-200 px-1 py-0.5 font-mono text-[0.9em] text-slate-900 dark:bg-slate-800 dark:text-slate-100'>$1</code>")}</li>`);
			continue;
		}

		closeList();
		html.push(`<p>${escapeHtml(line).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>").replace(/` + "`" + `([^` + "`" + `]+)` + "`" + `/g, "<code class='rounded bg-slate-200 px-1 py-0.5 font-mono text-[0.9em] text-slate-900 dark:bg-slate-800 dark:text-slate-100'>$1</code>")}</p>`);
	}

	closeList();
	return html.join("") || "<p class='text-slate-500'>No content</p>";
};

const noteLinkLabel = (note: StoredNote, songs: SongRow[], setlists: SetlistRow[], isDutch: boolean) => {
	if (note.gekoppeldAan.type === "song" && note.gekoppeldAan.refId) {
		return songs.find((song) => song.id === note.gekoppeldAan.refId)?.title || (isDutch ? "Onbekend nummer" : "Unknown song");
	}
	if (note.gekoppeldAan.type === "setlist" && note.gekoppeldAan.refId) {
		return setlists.find((setlist) => setlist.id === note.gekoppeldAan.refId)?.title || (isDutch ? "Onbekende setlist" : "Unknown setlist");
	}
	return isDutch ? "Algemeen" : "General";
};

export default function NotesPage() {
	const { session, isLoading: authLoading, getAccessToken } = useAuth();
	const { locale } = useSettings();
	const toast = useToast();
	const router = useRouter();
	const searchParams = useSearchParams();

	const isDutch = locale.startsWith("nl");
	const noteIdParam = searchParams.get("noteId");

	const [notes, setNotes] = useState<StoredNote[]>([]);
	const [songs, setSongs] = useState<SongRow[]>([]);
	const [setlists, setSetlists] = useState<SetlistRow[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [draft, setDraft] = useState<StoredNote | null>(null);
	const [search, setSearch] = useState("");
	const [tagFilter, setTagFilter] = useState<string | null>(null);
	const [typeFilter, setTypeFilter] = useState<NoteLinkType | "all">("all");
	const [showAllPinned, setShowAllPinned] = useState(false);
	const [tagInput, setTagInput] = useState("");
	const [loading, setLoading] = useState(true);
	const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty">("saved");
	const [error, setError] = useState("");
	const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const copy = useMemo(() => ({
		title: isDutch ? "Notities" : "Notes",
		new: isDutch ? "Nieuwe nota" : "New note",
		search: isDutch ? "Zoek op titel, inhoud of tags" : "Search title, content or tags",
		all: isDutch ? "Alles" : "All",
		songs: isDutch ? "Nummers" : "Songs",
		setlists: isDutch ? "Setlists" : "Setlists",
		general: isDutch ? "Algemeen" : "General",
		pinned: isDutch ? "Vastgepinde nota's" : "Pinned notes",
		showMore: isDutch ? "toon meer" : "show more",
		noNotes: isDutch ? "Maak je eerste nota aan" : "Create your first note",
		noSelection: isDutch ? "Selecteer een nota of maak een nieuwe aan" : "Select a note or create a new one",
		titleLabel: isDutch ? "Titel" : "Title",
		tagsLabel: isDutch ? "Tags" : "Tags",
		linkedLabel: isDutch ? "Gekoppeld aan" : "Linked to",
		contentLabel: isDutch ? "Inhoud" : "Content",
		previewLabel: isDutch ? "Voorbeeld" : "Preview",
		saved: isDutch ? "Opgeslagen" : "Saved",
		saving: isDutch ? "Bezig met opslaan..." : "Saving...",
		updated: isDutch ? "Laatst bewerkt" : "Last edited",
		delete: isDutch ? "Verwijderen" : "Delete",
		unlink: isDutch ? "Ontkoppelen" : "Unlink",
		addTag: isDutch ? "Tag toevoegen" : "Add tag",
		noResults: isDutch ? "Geen nota's gevonden" : "No notes found",
	}), [isDutch]);

	const selectedNote = useMemo(
		() => notes.find((note) => note.id === selectedId) || null,
		[notes, selectedId]
	);

	const uniqueTags = useMemo(() => {
		const values = new Set<string>();
		notes.forEach((note) => note.tags.forEach((tag) => values.add(tag)));
		return Array.from(values).sort((a, b) => a.localeCompare(b));
	}, [notes]);

	const filteredNotes = useMemo(() => {
		const query = search.trim().toLowerCase();
		return notes.filter((note) => {
			if (tagFilter && !note.tags.includes(tagFilter)) return false;
			if (typeFilter !== "all" && note.gekoppeldAan.type !== typeFilter) return false;
			if (!query) return true;
			return [note.titel, note.inhoud, note.tags.join(" "), noteLinkLabel(note, songs, setlists, isDutch)].join(" ").toLowerCase().includes(query);
		});
	}, [isDutch, notes, search, setlists, songs, tagFilter, typeFilter]);

	const pinnedNotes = useMemo(
		() => filteredNotes.filter((note) => note.gepind).slice(0, showAllPinned ? filteredNotes.length : 3),
		[filteredNotes, showAllPinned]
	);

	const regularNotes = useMemo(() => filteredNotes.filter((note) => !note.gepind), [filteredNotes]);

	const tagSuggestions = useMemo(() => {
		const prefix = tagInput.trim().toLowerCase();
		if (!prefix) return uniqueTags.slice(0, 8);
		return uniqueTags.filter((tag) => tag.toLowerCase().includes(prefix)).slice(0, 8);
	}, [tagInput, uniqueTags]);

	const linkedOptions = useMemo(
		() => [
			{ label: copy.general, value: "algemeen:" },
			...songs.map((song) => ({ label: `${copy.songs.slice(0, -1)}: ${song.title}`, value: `song:${song.id}` })),
			...setlists.map((setlist) => ({ label: `${copy.setlists.slice(0, -1)}: ${setlist.title}`, value: `setlist:${setlist.id}` })),
		],
		[copy.general, copy.songs, copy.setlists, songs, setlists]
	);

	const loadNotes = useCallback(async () => {
		if (authLoading) return;

		if (!session?.user) {
			setNotes([]);
			setSongs([]);
			setSetlists([]);
			setLoading(false);
			return;
		}

		setLoading(true);
		setError("");

		try {
			const token = await getAccessToken();
			if (!token) return;

			const [notesResponse, songsResponse, setlistsResponse] = await Promise.all([
				fetch("/api/notes", { headers: { Authorization: `Bearer ${token}` } }),
				fetch("/api/songs", { headers: { Authorization: `Bearer ${token}` } }),
				fetch("/api/setlists", { headers: { Authorization: `Bearer ${token}` } }),
			]);

			if (songsResponse.ok) {
				const songRows = (await songsResponse.json()) as Array<{ id: string; title: string }>;
				setSongs(Array.isArray(songRows) ? songRows.map((song) => ({ id: song.id, title: song.title })) : []);
			}

			if (setlistsResponse.ok) {
				const setlistRows = (await setlistsResponse.json()) as Array<{ id: string; title?: string; name?: string }>;
				setSetlists(Array.isArray(setlistRows) ? setlistRows.map((setlist) => ({ id: setlist.id, title: setlist.title || setlist.name || "Untitled setlist" })) : []);
			}

			if (!notesResponse.ok) throw new Error(isDutch ? "Notities laden mislukt" : "Failed to load notes");

			const rows = (await notesResponse.json()) as NoteListRow[];
			const textRows = Array.isArray(rows) ? rows.filter((row) => row.noteType === "text") : [];
			const details = await Promise.all(
				textRows.map(async (row) => {
					const detailResponse = await fetch(`/api/notes/${row.id}`, { headers: { Authorization: `Bearer ${token}` } });
					if (!detailResponse.ok) return null;
					return (await detailResponse.json()) as NoteDetailRow;
				})
			);

			const hydrated = details
				.filter((row): row is NoteDetailRow => Boolean(row))
				.map((row) => parseStoredNote(row, session?.user?.id || ""))
				.filter((note): note is StoredNote => note !== null);
			hydrated.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
			setNotes(hydrated);

			if (noteIdParam) {
				const target = hydrated.find((note) => note.id === noteIdParam) || null;
				if (target) {
					setSelectedId(target.id);
					setDraft(cloneNote(target));
					setSaveState("saved");
				}
			} else if (!selectedId && hydrated[0]) {
				setSelectedId(hydrated[0].id);
				setDraft(cloneNote(hydrated[0]));
				setSaveState("saved");
			}
		} catch (loadError) {
			const message = loadError instanceof Error ? loadError.message : String(loadError);
			setError(message);
			toast.error(message);
		} finally {
			setLoading(false);
		}
	}, [authLoading, getAccessToken, isDutch, noteIdParam, selectedId, session?.user, toast]);

	useEffect(() => {
		loadNotes();
	}, [loadNotes]);

	useEffect(() => {
		if (!draft || saveState !== "dirty") return;
		if (autosaveRef.current) clearTimeout(autosaveRef.current);
		autosaveRef.current = setTimeout(() => {
			void persistDraft(draft).catch((err) => toast.error(err instanceof Error ? err.message : String(err)));
		}, 800);
		return () => {
			if (autosaveRef.current) clearTimeout(autosaveRef.current);
		};
	}, [draft, saveState, toast]);

	useEffect(() => () => {
		if (autosaveRef.current) clearTimeout(autosaveRef.current);
	}, []);

	const persistDraft = useCallback(async (note: StoredNote) => {
		if (!session?.user) return;
		setSaveState("saving");

		const token = await getAccessToken();
		if (!token) return;

		const response = await fetch(`/api/notes/${note.id}`, {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({
				photoUrl: null,
				photoName: note.titel.trim() || (isDutch ? DEFAULT_TITLE.nl : DEFAULT_TITLE.en),
				photoNatural: null,
				photoPos: null,
				photoScale: 1,
				notes: serializeNote(note),
				strokes: [],
				linkedBand: note.gekoppeldAan.type === "algemeen" ? null : `${note.gekoppeldAan.type}:${note.gekoppeldAan.refId || ""}`,
				noteType: "text",
			}),
		});

		if (!response.ok) {
			const body = await response.json().catch(() => ({}));
			throw new Error(body?.error || (isDutch ? "Opslaan mislukt" : "Save failed"));
		}

		const saved = parseStoredNote((await response.json()) as NoteDetailRow, session.user.id);
		if (!saved) return;

		setNotes((prev) => [saved, ...prev.filter((item) => item.id !== saved.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
		setDraft(cloneNote(saved));
		setSelectedId(saved.id);
		setSaveState("saved");
	}, [getAccessToken, isDutch, session?.user]);

	const createNewNote = useCallback(async () => {
		if (!session?.user) return;
		const token = await getAccessToken();
		if (!token) return;

		const blank = emptyNote(session.user.id, locale);
		const response = await fetch("/api/notes", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({
				photoUrl: null,
				photoName: blank.titel,
				photoNatural: null,
				photoPos: null,
				photoScale: 1,
				notes: serializeNote(blank),
				strokes: [],
				linkedBand: null,
				noteType: "text",
			}),
		});

		if (!response.ok) {
			toast.error(isDutch ? "Nota aanmaken mislukt" : "Failed to create note");
			return;
		}

		const created = parseStoredNote((await response.json()) as NoteDetailRow, session.user.id);
		if (!created) return;
		setNotes((prev) => [created, ...prev].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
		setSelectedId(created.id);
		setDraft(cloneNote(created));
		setSaveState("saved");
	}, [getAccessToken, isDutch, locale, session?.user, toast]);

	const updateDraft = useCallback((patch: Partial<StoredNote>) => {
		setDraft((current) => (current ? { ...current, ...patch, updatedAt: new Date().toISOString() } : current));
		setSaveState("dirty");
	}, []);

	const selectNote = useCallback((note: StoredNote) => {
		setSelectedId(note.id);
		setDraft(cloneNote(note));
		setSaveState("saved");
		setTagInput("");
	}, []);

	const deleteNote = useCallback(async (noteId: string) => {
		if (!window.confirm(isDutch ? "Deze nota verwijderen?" : "Delete this note?")) return;
		if (!session?.user) return;

		const token = await getAccessToken();
		if (!token) return;

		const response = await fetch(`/api/notes/${noteId}`, {
			method: "DELETE",
			headers: { Authorization: `Bearer ${token}` },
		});

		if (!response.ok) {
			toast.error(isDutch ? "Verwijderen mislukt" : "Delete failed");
			return;
		}

		setNotes((prev) => prev.filter((note) => note.id !== noteId));
		if (selectedId === noteId) {
			setSelectedId(null);
			setDraft(null);
		}
	}, [getAccessToken, isDutch, selectedId, session?.user, toast]);

	const togglePin = useCallback((noteId: string) => {
		setNotes((prev) => prev.map((note) => note.id === noteId ? { ...note, gepind: !note.gepind, updatedAt: new Date().toISOString() } : note).sort((a, b) => Number(b.gepind) - Number(a.gepind) || b.updatedAt.localeCompare(a.updatedAt)));
		if (draft?.id === noteId) {
			updateDraft({ gepind: !draft.gepind });
		}
	}, [draft, updateDraft]);

	const addTag = useCallback((value: string) => {
		if (!draft) return;
		const tag = value.trim();
		if (!tag || draft.tags.includes(tag)) return;
		updateDraft({ tags: [...draft.tags, tag] });
		setTagInput("");
	}, [draft, updateDraft]);

	const removeTag = useCallback((tag: string) => {
		if (!draft) return;
		updateDraft({ tags: draft.tags.filter((entry) => entry !== tag) });
	}, [draft, updateDraft]);

	if (loading && notes.length === 0) {
		return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900">Loading…</div>;
	}

	return (
		<div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
			<aside className={`rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-950/80 ${draft ? "hidden lg:block" : ""}`}>
				<div className="flex items-center justify-between gap-3">
					<h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">{copy.title}</h2>
					<button type="button" onClick={createNewNote} className="rounded-full bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700">{copy.new}</button>
				</div>

				<div className="mt-4 space-y-3">
					<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={copy.search} className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />

					<div className="flex flex-wrap gap-2 text-xs font-medium">
						{[
							{ label: copy.all, value: "all" },
							{ label: copy.songs, value: "song" },
							{ label: copy.setlists, value: "setlist" },
							{ label: copy.general, value: "algemeen" },
						].map((item) => (
							<button key={item.value} type="button" onClick={() => setTypeFilter(item.value as NoteLinkType | "all")} className={`rounded-full px-3 py-1.5 transition ${typeFilter === item.value ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"}`}>
								{item.label}
							</button>
						))}
					</div>

					<div className="flex flex-wrap gap-2">
						<button type="button" onClick={() => setTagFilter(null)} className={`rounded-full px-3 py-1.5 text-xs font-medium ${tagFilter === null ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}>All tags</button>
						{uniqueTags.map((tag) => (
							<button key={tag} type="button" onClick={() => setTagFilter((current) => current === tag ? null : tag)} className={`rounded-full px-3 py-1.5 text-xs font-medium ${tagFilter === tag ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}>
								{tag}
							</button>
						))}
					</div>

					<div>
						<div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
							<span>{copy.pinned}</span>
							{filteredNotes.filter((note) => note.gepind).length > 3 && (
								<button type="button" onClick={() => setShowAllPinned((prev) => !prev)} className="text-brand-600 hover:underline dark:text-brand-400">{copy.showMore}</button>
							)}
						</div>
						<div className="space-y-2">
							{pinnedNotes.map((note) => (
								<NoteRow key={note.id} note={note} selected={note.id === selectedId} onSelect={() => selectNote(note)} onPin={() => togglePin(note.id)} onDelete={() => deleteNote(note.id)} locale={locale} linkedLabel={noteLinkLabel(note, songs, setlists, isDutch)} />
							))}
						</div>
					</div>

					<div>
						<div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">All notes</div>
						<div className="space-y-2">
							{(regularNotes.length > 0 ? regularNotes : filteredNotes).map((note) => (
								<NoteRow key={note.id} note={note} selected={note.id === selectedId} onSelect={() => selectNote(note)} onPin={() => togglePin(note.id)} onDelete={() => deleteNote(note.id)} locale={locale} linkedLabel={noteLinkLabel(note, songs, setlists, isDutch)} />
							))}
							{filteredNotes.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">{copy.noResults}</div>}
						</div>
					</div>
				</div>
			</aside>

			<main className="min-h-[70vh] rounded-3xl border border-slate-200 bg-white/95 p-5 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-950/80">
				{!draft ? (
					<div className="flex min-h-[58vh] items-center justify-center text-center">
						<div>
							<div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-3xl dark:bg-slate-900">🗒️</div>
							<div className="text-lg font-semibold text-slate-900 dark:text-slate-50">{notes.length === 0 ? copy.noNotes : copy.noSelection}</div>
							<button type="button" onClick={createNewNote} className="mt-6 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">{copy.new}</button>
						</div>
					</div>
				) : (
					<div className="space-y-4">
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0 flex-1 space-y-3">
								<button
									type="button"
									onClick={() => selectNote(null as unknown as StoredNote)}
									className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 lg:hidden dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
								>
									← {copy.all}
								</button>
								<input value={draft.titel} onChange={(e) => updateDraft({ titel: e.target.value })} placeholder={copy.titleLabel} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xl font-semibold tracking-tight text-slate-900 outline-none transition focus:border-brand-500 sm:text-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50" />
								<div className="text-xs text-slate-500 dark:text-slate-400">{copy.updated}: {formatDateTime(draft.updatedAt, locale)}</div>
							</div>
							<div className="flex flex-col items-end gap-2">
								<span className={`rounded-full px-3 py-1 text-xs font-semibold ${saveState === "saved" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : saveState === "saving" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{saveState === "saving" ? copy.saving : copy.saved}</span>
								<button type="button" onClick={() => deleteNote(draft.id)} className="rounded-full border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/40">{copy.delete}</button>
							</div>
						</div>

						<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
							<section className="space-y-4">
								<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/70">
									<div className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{copy.tagsLabel}</div>
									<div className="flex flex-wrap gap-2">
										{draft.tags.map((tag) => (
											<button key={tag} type="button" onClick={() => removeTag(tag)} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:ring-brand-300 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700">{tag} ×</button>
										))}
										<input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === ",") {
												e.preventDefault();
												addTag(tagInput);
											}
										}} placeholder={copy.addTag} className="min-w-[180px] flex-1 rounded-full border border-dashed border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
									</div>
									{tagSuggestions.length > 0 && (
										<div className="mt-3 flex flex-wrap gap-2">
											{tagSuggestions.map((tag) => (
												<button key={tag} type="button" onClick={() => addTag(tag)} className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 transition hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-300">{tag}</button>
											))}
										</div>
									)}
								</div>

								<div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
									<div>
										<label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">{copy.linkedLabel}</label>
										<select
											value={`${draft.gekoppeldAan.type}:${draft.gekoppeldAan.refId || ""}`}
											onChange={(e) => {
												const [type, refId] = e.target.value.split(":");
												updateDraft({ gekoppeldAan: { type: type === "song" || type === "setlist" ? type : "algemeen", refId: refId || null } });
											}}
											className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
										>
											{linkedOptions.map((option) => (
												<option key={option.value} value={option.value}>{option.label}</option>
											))}
										</select>
									</div>
									<button type="button" onClick={() => updateDraft({ gekoppeldAan: { type: "algemeen", refId: null } })} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900">{copy.unlink}</button>
								</div>

								<div>
									<label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">{copy.contentLabel}</label>
									<textarea value={draft.inhoud} onChange={(e) => updateDraft({ inhoud: e.target.value })} placeholder={copy.contentLabel} className="min-h-[320px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
								</div>

								<div>
									<div className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{copy.previewLabel}</div>
									<div className="prose prose-slate max-w-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:prose-invert dark:border-slate-700 dark:bg-slate-900/70" dangerouslySetInnerHTML={{ __html: renderMarkdown(draft.inhoud) }} />
								</div>
							</section>

							<aside className="space-y-4">
								<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/70">
									<div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{isDutch ? "Snelle info" : "Quick info"}</div>
									<div className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
										<div>{copy.updated}: {formatDateTime(draft.updatedAt, locale)}</div>
										<div>{noteLinkLabel(draft, songs, setlists, isDutch)}</div>
										<div>{draft.tags.length} {copy.tagsLabel.toLowerCase()}</div>
									</div>
								</div>
								<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/70">
									<div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{isDutch ? "Tags uit andere nota's" : "Tags from other notes"}</div>
									<div className="mt-3 flex flex-wrap gap-2">
										{uniqueTags.slice(0, 16).map((tag) => (
											<button key={tag} type="button" onClick={() => addTag(tag)} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:ring-brand-300 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700">{tag}</button>
										))}
									</div>
								</div>
							</aside>
						</div>
					</div>
				)}
			</main>
		</div>
	);
}

function NoteRow({
	note,
	selected,
	onSelect,
	onPin,
	onDelete,
	locale,
	linkedLabel,
}: {
	note: StoredNote;
	selected: boolean;
	onSelect: () => void;
	onPin: () => void;
	onDelete: () => void;
	locale: string;
	linkedLabel: string;
}) {
	return (
		<button type="button" onClick={onSelect} className={`w-full rounded-2xl border p-3 text-left transition ${selected ? "border-brand-500 bg-brand-50/70 shadow-sm dark:border-brand-400 dark:bg-brand-500/10" : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600"}`}>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0 flex-1">
					<div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">{note.titel || "Untitled"}</div>
					<div className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{firstLine(note.inhoud) || linkedLabel}</div>
				</div>
				<div className="flex items-center gap-1">
					<button type="button" onClick={(e) => { e.stopPropagation(); onPin(); }} className={`rounded-full px-2 py-1 text-xs font-semibold ${note.gepind ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300"}`}>{note.gepind ? "📌" : "📍"}</button>
					<button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }} className="rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-900/40 dark:text-rose-200">×</button>
				</div>
			</div>
			<div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500 dark:text-slate-400">
				<span>{formatDateTime(note.updatedAt, locale)}</span>
				<span>•</span>
				<span>{linkedLabel}</span>
			</div>
			<div className="mt-2 flex flex-wrap gap-1.5">
				{note.tags.slice(0, 4).map((tag) => (
					<span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">{tag}</span>
				))}
			</div>
		</button>
	);
}
