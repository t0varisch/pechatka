// «Работа над ошибками»: короткий урок из слов, где больше всего твоих слабых букв и сочетаний.
// Подход keybr (упор на слабые клавиши), но из настоящих слов и без чужого кода.

import {
	byCategory,
	byChar,
	confusionShares,
	errorWords,
	errRate,
	type LayoutStats,
	slowBigrams,
} from "./keystats";
import type { Layout } from "./layouts";
import { EN_WORDS, RU_WORDS } from "./wordlists";

export const ALPHABET: Record<Layout, string> = {
	ru: "абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
	en: "abcdefghijklmnopqrstuvwxyz",
};

export const DRILL_TITLE = "Работа над ошибками";

export interface DrillPlan {
	layout: Layout;
	/** Буквы, на которые упор в уроке. */
	focus: string[];
	/** Медленные сочетания, которые попадут в урок. */
	pairs: string[];
	text: string;
	/** Мало данных по раскладке — урок из частых слов для разгона. */
	starter: boolean;
}

/** Насколько буква слабая: ошибки выше средних и медленнее медианы. Мало данных — средний вес. */
export function letterWeakness(L: LayoutStats, layout: Layout): Map<string, number> {
	const chars = byChar(L);
	const letters = Array.from(ALPHABET[layout]);
	let n = 0;
	let err = 0;
	const times: number[] = [];
	for (const ch of letters) {
		const a = chars.get(ch);
		if (!a) continue;
		n += a.n;
		err += a.err;
		if (a.tn >= 5) times.push(a.t / a.tn);
	}
	const avgEr = n + err ? err / (n + err) : 0;
	times.sort((x, y) => x - y);
	const med = times.length ? times[Math.floor(times.length / 2)] : 0;
	const out = new Map<string, number>();
	for (const ch of letters) {
		const a = chars.get(ch);
		if (!a || a.n + a.err < 15) {
			out.set(ch, 0.5);
			continue;
		}
		const er = errRate(a);
		const ms = a.tn >= 5 ? a.t / a.tn : med;
		const byErr = (1.5 * Math.max(0, er - avgEr)) / Math.max(avgEr, 0.01);
		const bySpeed = med ? 2 * Math.max(0, ms / med - 1) : 0;
		out.set(ch, byErr + bySpeed);
	}
	return out;
}

/** Буквы для упора урока. starter — данных мало (меньше 8 букв с 15+ нажатиями), упора нет. */
export function focusLetters(L: LayoutStats, layout: Layout): { starter: boolean; focus: string[] } {
	const alphabet = new Set(ALPHABET[layout]);
	const chars = byChar(L);
	const proven = [...letterWeakness(L, layout)]
		.filter(([c]) => {
			const a = chars.get(c);
			return alphabet.has(c) && a !== undefined && a.n + a.err >= 15;
		})
		.sort((a, b) => b[1] - a[1]);
	if (proven.length < 8) return { starter: true, focus: [] };
	const focus = proven.filter(([, s]) => s > 0.25).slice(0, 4).map(([c]) => c);
	return { starter: false, focus: focus.length ? focus : proven.slice(0, 3).map(([c]) => c) };
}

/** Генератор случайных чисел с зерном — чтобы тесты были повторяемыми. */
export function seeded(seed: number): () => number {
	let s = seed % 2147483647 || 1;
	return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Слова раскладки из текста: самые частые, длиной 2–12 букв. */
export function wordsFromText(texts: string[], layout: Layout, limit = 5000): string[] {
	const re = layout === "ru" ? /[а-яё]{2,12}/gi : /[a-z]{2,12}/gi;
	const freq = new Map<string, number>();
	for (const t of texts) {
		for (const m of t.slice(0, 400000).matchAll(re)) {
			const w = m[0].toLowerCase();
			freq.set(w, (freq.get(w) ?? 0) + 1);
		}
	}
	return [...freq]
		.filter(([, c]) => c >= 2)
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit)
		.map(([w]) => w);
}

export function buildDrill(L: LayoutStats, layout: Layout, bookWords: string[], rnd: () => number = Math.random, target = 380): DrillPlan {
	const builtIn = layout === "ru" ? RU_WORDS : EN_WORDS;
	const alphabet = new Set(ALPHABET[layout]);
	const pool = [...new Set([...bookWords, ...builtIn].map((w) => w.toLowerCase()))].filter((w) => Array.from(w).every((c) => alphabet.has(c)) && w.length >= 2);

	const weak = letterWeakness(L, layout);
	// В «упор» — только буквы, где слабость видна по нажатиям; редкие буквы без данных и так попадут в урок с весом 0,5
	const { starter, focus } = focusLetters(L, layout);
	const pairs = slowBigrams(L, 4, 6)
		.map((r) => r.label)
		.filter((p) => Array.from(p).every((c) => alphabet.has(c)));
	const errWords = new Set(errorWords(L, 12, 1).map((w) => w.word).filter((w) => Array.from(w).every((c) => alphabet.has(c))));

	const score = (w: string): number => {
		const chars = Array.from(w);
		let s = 0;
		for (const c of chars) s += weak.get(c) ?? 0;
		s /= Math.sqrt(chars.length);
		for (const p of pairs) if (w.includes(p)) s += 1;
		for (const f of focus) if (w.includes(f)) s += 0.6;
		if (errWords.has(w)) s += 1.5;
		return 0.2 + s;
	};
	const candidates = [...new Set([...pool, ...errWords])];
	const hot = candidates
		.map((w) => ({ w, s: score(w) }))
		.sort((a, b) => b.s - a.s)
		.slice(0, starter ? candidates.length : 400);
	const total = hot.reduce((acc, x) => acc + x.s * x.s, 0);

	// Мало данных: просто частые слова, без упора — чтобы набрать статистику
	const common = pool.slice(0, 300);
	const pickHot = (): string => {
		if (starter) return common[Math.floor(rnd() * common.length)];
		let r = rnd() * total;
		for (const x of hot) {
			r -= x.s * x.s;
			if (r <= 0) return x.w;
		}
		return hot[hot.length - 1].w;
	};

	// Регистр и знаки — только если они тоже слабое место
	const cats = byCategory(L);
	const enough = (c: keyof typeof cats) => cats[c].n + cats[c].err >= 15;
	const shares = confusionShares(L, layout);
	const shareTotal = Object.values(shares).reduce((a, b) => a + b, 0);
	const caps = (enough("upper") && enough("lower") && errRate(cats.upper) - errRate(cats.lower) > 0.02) || (shareTotal >= 10 && shares.shift / shareTotal > 0.15);
	const punct = enough("punct") && enough("lower") && errRate(cats.punct) - errRate(cats.lower) > 0.02;

	const words: string[] = [];
	const recent: string[] = [];
	let len = 0;
	let capNext = true;
	let guard = 0;
	while (len < target && guard++ < 2000) {
		// Каждое четвёртое слово — обычное, чтобы урок читался как текст, а не как набор букв
		let w = words.length % 4 === 3 && pool.length ? pool[Math.floor(rnd() * Math.min(pool.length, 600))] : pickHot();
		if (recent.includes(w)) continue;
		recent.push(w);
		if (recent.length > 8) recent.shift();
		if ((caps && rnd() < 0.2) || (punct && capNext)) w = w[0].toUpperCase() + w.slice(1);
		capNext = false;
		if (punct && rnd() < 0.15) {
			const mark = [",", ",", ".", "!", "?", ":", ";", "-"][Math.floor(rnd() * 8)];
			if (mark === "-") w = `${w} -`;
			else w += mark;
			capNext = ".!?".includes(mark);
		}
		words.push(w);
		len += w.length + 1;
	}
	let text = words.join(" ");
	if (punct && !/[.!?]$/.test(text)) text += ".";
	return { layout, focus, pairs, text, starter };
}
