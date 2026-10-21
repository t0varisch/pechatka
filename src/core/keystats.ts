// Статистика набора по клавишам. Идеи — keybr и Monkeytype (скорость и ошибки по каждой клавише,
// карта клавиатуры, путаницы), код свой: их лицензии AGPL/GPL несовместимы с MIT.

import { CATEGORY_NAMES, type CharCategory, categoryOf, FINGER_ORDER, type Finger, keyFor, type Layout, layoutOf } from "./layouts";
import { IDLE_MS } from "./typing";

/** n — верных нажатий, err — ошибочных, t/tn — сумма и число замеров времени перехода к символу, мс. */
export interface Agg {
	n: number;
	err: number;
	t: number;
	tn: number;
}

export interface LayoutStats {
	/** По ожидаемому символу с учётом регистра; пробел и абзац — " ". */
	keys: Record<string, Agg>;
	/** Пара «предыдущий + текущий» в нижнем регистре. */
	bigrams: Record<string, Agg>;
	/** «ожидали→нажали» → сколько раз. */
	confusions: Record<string, number>;
	/** Слова в нижнем регистре: сколько напечатано и сколько ошибок в них. */
	words: Record<string, { n: number; err: number }>;
}

export interface StatsDoc {
	id: "all";
	/** Когда начали собирать подробную статистику. */
	since: number;
	layouts: Record<Layout, LayoutStats>;
}

export interface SessionRec {
	/** Время начала — он же идентификатор. */
	id: number;
	ms: number;
	correct: number;
	errors: number;
	book: string;
}

const emptyLayout = (): LayoutStats => ({ keys: {}, bigrams: {}, confusions: {}, words: {} });
const agg = (): Agg => ({ n: 0, err: 0, t: 0, tn: 0 });

export function emptyStats(since = Date.now()): StatsDoc {
	return { id: "all", since, layouts: { ru: emptyLayout(), en: emptyLayout() } };
}

function addAgg(into: Record<string, Agg>, from: Record<string, Agg>): void {
	for (const [k, v] of Object.entries(from)) {
		const a = (into[k] ??= agg());
		a.n += v.n;
		a.err += v.err;
		a.t += v.t;
		a.tn += v.tn;
	}
}

const MAX_WORDS = 6000;

/** Добавляет b в a (a меняется) и возвращает a. */
export function mergeStats(a: StatsDoc, b: StatsDoc): StatsDoc {
	a.since = Math.min(a.since, b.since);
	for (const l of ["ru", "en"] as Layout[]) {
		const A = a.layouts[l];
		const B = b.layouts[l];
		addAgg(A.keys, B.keys);
		addAgg(A.bigrams, B.bigrams);
		for (const [k, v] of Object.entries(B.confusions)) A.confusions[k] = (A.confusions[k] ?? 0) + v;
		for (const [k, v] of Object.entries(B.words)) {
			const w = (A.words[k] ??= { n: 0, err: 0 });
			w.n += v.n;
			w.err += v.err;
		}
		const words = Object.entries(A.words);
		if (words.length > MAX_WORDS) {
			// Оставляем частые и ошибочные слова
			words.sort((x, y) => y[1].n + 5 * y[1].err - (x[1].n + 5 * x[1].err));
			A.words = Object.fromEntries(words.slice(0, MAX_WORDS));
		}
	}
	return a;
}

const LETTER = /\p{L}/u;

/** Копит нажатия текущей сессии; take() отдаёт накопленное для записи и начинает заново. */
export class KeystrokeCollector {
	private delta = emptyStats();
	private layout: Layout;
	private lastTime = 0;
	private lastOk = false;
	private prev: string | null = null;
	private word = "";
	private wordErr = 0;

	constructor(startLayout: Layout = "ru") {
		this.layout = startLayout;
	}

	press(expected: string, typed: string, ok: boolean, now: number): void {
		const exp = expected === "\n" ? " " : expected;
		const own = layoutOf(exp);
		if (own) this.layout = own;
		const L = this.delta.layouts[this.layout];
		const k = (L.keys[exp] ??= agg());
		const pair = this.prev !== null ? (this.prev + exp).toLowerCase() : null;
		if (ok) {
			const dt = this.lastOk && this.lastTime && now - this.lastTime < IDLE_MS ? now - this.lastTime : 0;
			k.n++;
			if (dt) {
				k.t += dt;
				k.tn++;
			}
			if (pair) {
				const b = (L.bigrams[pair] ??= agg());
				b.n++;
				if (dt) {
					b.t += dt;
					b.tn++;
				}
			}
			if (LETTER.test(exp)) this.word += exp;
			else this.finishWord(L);
			this.prev = exp;
		} else {
			k.err++;
			if (pair) (L.bigrams[pair] ??= agg()).err++;
			const t = typed === "\n" || typed === "\r" ? " " : typed;
			L.confusions[`${exp}→${t}`] = (L.confusions[`${exp}→${t}`] ?? 0) + 1;
			if (LETTER.test(exp)) this.wordErr++;
		}
		this.lastTime = now;
		this.lastOk = ok;
	}

	private finishWord(L: LayoutStats): void {
		if (this.word.length >= 2) {
			const w = (L.words[this.word.toLowerCase()] ??= { n: 0, err: 0 });
			w.n++;
			w.err += this.wordErr;
		}
		this.word = "";
		this.wordErr = 0;
	}

	/** Есть ли что записывать. */
	get dirty(): boolean {
		return Object.keys(this.delta.layouts.ru.keys).length + Object.keys(this.delta.layouts.en.keys).length > 0;
	}

	take(): StatsDoc {
		const d = this.delta;
		this.delta = emptyStats();
		return d;
	}
}

// ---------- разбор накопленного ----------

export const MIN_KEY = 20;
export const MIN_BIGRAM = 10;

export function errRate(a: Agg): number {
	const all = a.n + a.err;
	return all ? a.err / all : 0;
}

/** Скорость перехода к символу в зн/мин, если замеров хватает. */
export function cpmOf(a: Agg, min = 5): number | null {
	return a.tn >= min ? Math.round(60000 / (a.t / a.tn)) : null;
}

export function totals(L: LayoutStats): Agg {
	const t = agg();
	for (const v of Object.values(L.keys)) {
		t.n += v.n;
		t.err += v.err;
		t.t += v.t;
		t.tn += v.tn;
	}
	return t;
}

/** Буквы без учёта регистра (Ш и ш — одна клавиша), остальное как есть. */
export function byChar(L: LayoutStats): Map<string, Agg> {
	const m = new Map<string, Agg>();
	for (const [ch, v] of Object.entries(L.keys)) {
		const key = ch.toLowerCase();
		const a = m.get(key) ?? agg();
		a.n += v.n;
		a.err += v.err;
		a.t += v.t;
		a.tn += v.tn;
		m.set(key, a);
	}
	return m;
}

/** Сводка по физическим клавишам раскладки (KeyboardEvent.code). */
export function byKeyCode(L: LayoutStats, layout: Layout): Map<string, Agg> {
	const m = new Map<string, Agg>();
	for (const [ch, v] of Object.entries(L.keys)) {
		const k = keyFor(layout, ch);
		if (!k) continue;
		const a = m.get(k.key.code) ?? agg();
		a.n += v.n;
		a.err += v.err;
		a.t += v.t;
		a.tn += v.tn;
		m.set(k.key.code, a);
	}
	return m;
}

export function byFinger(L: LayoutStats, layout: Layout): Record<Finger, Agg> {
	const out = Object.fromEntries(FINGER_ORDER.map((f) => [f, agg()])) as Record<Finger, Agg>;
	for (const [ch, v] of Object.entries(L.keys)) {
		const k = keyFor(layout, ch);
		if (!k) continue;
		const a = out[k.key.finger];
		a.n += v.n;
		a.err += v.err;
		a.t += v.t;
		a.tn += v.tn;
	}
	return out;
}

export function byCategory(L: LayoutStats): Record<CharCategory, Agg> {
	const out = Object.fromEntries(Object.keys(CATEGORY_NAMES).map((c) => [c, agg()])) as Record<CharCategory, Agg>;
	for (const [ch, v] of Object.entries(L.keys)) {
		const a = out[categoryOf(ch)];
		a.n += v.n;
		a.err += v.err;
		a.t += v.t;
		a.tn += v.tn;
	}
	return out;
}

export interface Ranked {
	label: string;
	agg: Agg;
}

export function worstByErrors(L: LayoutStats, limit = 6, min = MIN_KEY): Ranked[] {
	return [...byChar(L)]
		.filter(([, a]) => a.n + a.err >= min && a.err > 0)
		.sort((x, y) => errRate(y[1]) - errRate(x[1]))
		.slice(0, limit)
		.map(([label, a]) => ({ label, agg: a }));
}

function avgMs(a: Agg): number {
	return a.tn ? a.t / a.tn : 0;
}

export function slowestKeys(L: LayoutStats, limit = 6, min = MIN_KEY): Ranked[] {
	return [...byChar(L)]
		.filter(([ch, a]) => a.tn >= min && ch !== " ")
		.sort((x, y) => avgMs(y[1]) - avgMs(x[1]))
		.slice(0, limit)
		.map(([label, a]) => ({ label, agg: a }));
}

export function fastestKeys(L: LayoutStats, limit = 6, min = MIN_KEY): Ranked[] {
	return [...byChar(L)]
		.filter(([ch, a]) => a.tn >= min && ch !== " ")
		.sort((x, y) => avgMs(x[1]) - avgMs(y[1]))
		.slice(0, limit)
		.map(([label, a]) => ({ label, agg: a }));
}

export function slowBigrams(L: LayoutStats, limit = 6, min = MIN_BIGRAM): Ranked[] {
	return Object.entries(L.bigrams)
		.filter(([p, a]) => a.tn >= min && !p.includes(" "))
		.sort((x, y) => avgMs(y[1]) - avgMs(x[1]))
		.slice(0, limit)
		.map(([label, a]) => ({ label, agg: a }));
}

export type ConfusionKind = "shift" | "layout" | "neighbor" | "other";

export interface Confusion {
	expected: string;
	typed: string;
	count: number;
	kind: ConfusionKind;
}

export function confusionKind(layout: Layout, expected: string, typed: string): ConfusionKind {
	if (expected !== typed && expected.toLowerCase() === typed.toLowerCase()) return "shift";
	const le = layoutOf(expected);
	const lt = layoutOf(typed);
	if (le && lt && le !== lt) return "layout";
	const a = keyFor(layout, expected);
	const b = keyFor(layout, typed);
	if (a && b && a.key.code !== b.key.code && isNeighbor(a.key.code, b.key.code)) return "neighbor";
	return "other";
}

const POS = new Map<string, [number, number]>();
/** Соседние ли клавиши (физически, одинаково для ЙЦУКЕН и QWERTY). */
function isNeighbor(c1: string, c2: string): boolean {
	if (!POS.size) {
		// Сдвиг рядов как на обычной клавиатуре: каждый следующий ряд правее на четверть-половину клавиши
		const offsets = [0, 0.5, 0.75, 1.25];
		const rows = [
			"Backquote Digit1 Digit2 Digit3 Digit4 Digit5 Digit6 Digit7 Digit8 Digit9 Digit0 Minus Equal",
			"KeyQ KeyW KeyE KeyR KeyT KeyY KeyU KeyI KeyO KeyP BracketLeft BracketRight Backslash",
			"KeyA KeyS KeyD KeyF KeyG KeyH KeyJ KeyK KeyL Semicolon Quote",
			"KeyZ KeyX KeyC KeyV KeyB KeyN KeyM Comma Period Slash",
		];
		rows.forEach((r, ri) => r.split(" ").forEach((c, ci) => POS.set(c, [ri, ci + offsets[ri]])));
	}
	const p = POS.get(c1);
	const q = POS.get(c2);
	if (!p || !q) return false;
	return Math.abs(p[0] - q[0]) <= 1 && Math.abs(p[1] - q[1]) <= 1.25;
}

export function topConfusions(L: LayoutStats, layout: Layout, limit = 6, min = 3): Confusion[] {
	return Object.entries(L.confusions)
		.filter(([, n]) => n >= min)
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit)
		.map(([k, count]) => {
			const [expected, typed] = Array.from(k.split("→"));
			return { expected, typed, count, kind: confusionKind(layout, expected, typed) };
		});
}

/** Доли ошибок по видам: сколько из всех ошибок — Shift, раскладка, соседняя клавиша. */
export function confusionShares(L: LayoutStats, layout: Layout): Record<ConfusionKind, number> {
	const out: Record<ConfusionKind, number> = { shift: 0, layout: 0, neighbor: 0, other: 0 };
	for (const [k, n] of Object.entries(L.confusions)) {
		const [e, t] = k.split("→");
		out[confusionKind(layout, e, t)] += n;
	}
	return out;
}

export function errorWords(L: LayoutStats, limit = 8, minErr = 2): { word: string; n: number; err: number }[] {
	return Object.entries(L.words)
		.filter(([, v]) => v.err >= minErr)
		.sort((a, b) => b[1].err - a[1].err || b[1].n - a[1].n)
		.slice(0, limit)
		.map(([word, v]) => ({ word, ...v }));
}

export interface DayRec {
	day: string;
	ms: number;
	correct: number;
	errors: number;
	cpm: number;
	accuracy: number;
}

/** Сессии → по дням (местная дата), по возрастанию. */
export function byDay(sessions: SessionRec[]): DayRec[] {
	const m = new Map<string, DayRec>();
	for (const s of sessions) {
		const d = new Date(s.id);
		const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
		const r = m.get(day) ?? { day, ms: 0, correct: 0, errors: 0, cpm: 0, accuracy: 0 };
		r.ms += s.ms;
		r.correct += s.correct;
		r.errors += s.errors;
		m.set(day, r);
	}
	return [...m.values()]
		.filter((r) => r.ms > 0)
		.map((r) => ({
			...r,
			cpm: Math.round(r.correct / (r.ms / 60000)),
			accuracy: r.correct + r.errors ? (r.correct / (r.correct + r.errors)) * 100 : 100,
		}))
		.sort((a, b) => a.day.localeCompare(b.day));
}
