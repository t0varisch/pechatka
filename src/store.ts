import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import { emptyStats, mergeStats, type SessionRec, type StatsDoc } from "./core/keystats";
import type { BookFormat, ParsedBook, TocEntry } from "./types";

export interface Bookmark {
	id: string;
	/** Позиция символа в тексте для набора. */
	pos: number;
	createdAt: number;
	snippet: string;
}

export interface BookMeta {
	id: string;
	title: string;
	author: string;
	format: BookFormat;
	addedAt: number;
	openedAt: number;
	/** Сколько символов в тексте для набора. */
	charCount: number;
	/** Позиция символа, где остановились. */
	position: number;
	/** Накопленная статистика по книге: верные нажатия, ошибки, время печати. */
	stats: { correct: number; errors: number; activeMs: number };
	toc: TocEntry[];
	bookmarks: Bookmark[];
}

interface Schema extends DBSchema {
	books: { key: string; value: BookMeta };
	texts: { key: string; value: { id: string; paragraphs: string[] } };
	stats: { key: string; value: StatsDoc | { id: "sessions"; list: SessionRec[] } };
}

let dbp: Promise<IDBPDatabase<Schema>> | null = null;

function db(): Promise<IDBPDatabase<Schema>> {
	if (!dbp) {
		dbp = openDB<Schema>("pechatka", 2, {
			upgrade(d, oldVersion) {
				if (oldVersion < 1) {
					d.createObjectStore("books", { keyPath: "id" });
					d.createObjectStore("texts", { keyPath: "id" });
				}
				// v2: статистика по клавишам и сессии; книги и позиции не трогаем
				if (oldVersion < 2) d.createObjectStore("stats", { keyPath: "id" });
			},
		});
	}
	return dbp;
}

export function newId(): string {
	try {
		return crypto.randomUUID();
	} catch {
		return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
	}
}

/** Просим браузер не чистить книги при нехватке места (важно для iPhone). */
export function askPersist(): void {
	try {
		navigator.storage?.persist?.().catch(() => {});
	} catch {
		/* не поддерживается */
	}
}

export async function listBooks(): Promise<BookMeta[]> {
	const all = await (await db()).getAll("books");
	return all.sort((a, b) => b.openedAt - a.openedAt);
}

export async function getBook(id: string): Promise<{ meta: BookMeta; paragraphs: string[] } | null> {
	const d = await db();
	const [meta, text] = await Promise.all([d.get("books", id), d.get("texts", id)]);
	if (!meta || !text) return null;
	return { meta, paragraphs: text.paragraphs };
}

/** Сохраняет разобранную книгу. Если такая уже есть (название + автор + число символов) — возвращает её id. */
export async function addBook(book: ParsedBook, charCount: number): Promise<string> {
	const d = await db();
	const existing = (await d.getAll("books")).find(
		(b) => b.title === book.title && b.author === book.author && b.charCount === charCount,
	);
	if (existing) return existing.id;
	const id = newId();
	const now = Date.now();
	const meta: BookMeta = {
		id,
		title: book.title,
		author: book.author,
		format: book.format,
		addedAt: now,
		openedAt: now,
		charCount,
		position: 0,
		stats: { correct: 0, errors: 0, activeMs: 0 },
		toc: book.toc,
		bookmarks: [],
	};
	const tx = d.transaction(["books", "texts"], "readwrite");
	await Promise.all([tx.objectStore("books").put(meta), tx.objectStore("texts").put({ id, paragraphs: book.paragraphs }), tx.done]);
	return id;
}

export async function updateBook(id: string, patch: Partial<BookMeta>): Promise<void> {
	const d = await db();
	const meta = await d.get("books", id);
	if (!meta) return;
	await d.put("books", { ...meta, ...patch });
}

export async function deleteBook(id: string): Promise<void> {
	const d = await db();
	const tx = d.transaction(["books", "texts"], "readwrite");
	await Promise.all([tx.objectStore("books").delete(id), tx.objectStore("texts").delete(id), tx.done]);
}

// ---------- статистика набора ----------

const MAX_SESSIONS = 2000;

export async function getStats(): Promise<StatsDoc> {
	const doc = (await (await db()).get("stats", "all")) as StatsDoc | undefined;
	return doc ?? emptyStats();
}

/** Добавляет накопленное за последние секунды к общей статистике. */
export async function addStats(delta: StatsDoc): Promise<void> {
	const tx = (await db()).transaction("stats", "readwrite");
	const cur = ((await tx.store.get("all")) as StatsDoc | undefined) ?? emptyStats(delta.since);
	await tx.store.put(mergeStats(cur, delta));
	await tx.done;
}

export async function getSessions(): Promise<SessionRec[]> {
	const doc = (await (await db()).get("stats", "sessions")) as { list: SessionRec[] } | undefined;
	return doc?.list ?? [];
}

/** Записывает или обновляет сессию (по времени начала). */
export async function saveSession(rec: SessionRec): Promise<void> {
	const tx = (await db()).transaction("stats", "readwrite");
	const doc = ((await tx.store.get("sessions")) as { id: "sessions"; list: SessionRec[] } | undefined) ?? { id: "sessions" as const, list: [] };
	const i = doc.list.findIndex((x) => x.id === rec.id);
	if (i >= 0) doc.list[i] = rec;
	else doc.list.push(rec);
	if (doc.list.length > MAX_SESSIONS) doc.list = doc.list.slice(-MAX_SESSIONS);
	await tx.store.put(doc);
	await tx.done;
}

export async function resetStats(): Promise<void> {
	const tx = (await db()).transaction("stats", "readwrite");
	await Promise.all([tx.store.delete("all"), tx.store.delete("sessions"), tx.done]);
}
