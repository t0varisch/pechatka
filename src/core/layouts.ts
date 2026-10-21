// Раскладки: русская ЙЦУКЕН (Windows) и английская QWERTY.
// Клавиша — физическая (как KeyboardEvent.code), у неё символ без Shift и с Shift и палец по слепой печати.

export type Layout = "ru" | "en";

export type Finger = "lp" | "lr" | "lm" | "li" | "ri" | "rm" | "rr" | "rp" | "th";

export const FINGER_NAMES: Record<Finger, string> = {
	lp: "Левый мизинец",
	lr: "Левый безымянный",
	lm: "Левый средний",
	li: "Левый указательный",
	ri: "Правый указательный",
	rm: "Правый средний",
	rr: "Правый безымянный",
	rp: "Правый мизинец",
	th: "Большие пальцы (пробел)",
};

export const FINGER_ORDER: Finger[] = ["lp", "lr", "lm", "li", "ri", "rm", "rr", "rp", "th"];

export interface KeyDef {
	code: string;
	base: string;
	shift: string;
	finger: Finger;
}

const CODES: string[][] = [
	["Backquote", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0", "Minus", "Equal"],
	["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP", "BracketLeft", "BracketRight", "Backslash"],
	["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon", "Quote"],
	["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash"],
];

const FINGER_OF: Record<string, Finger> = {};
for (const [f, codes] of Object.entries({
	lp: "Backquote Digit1 KeyQ KeyA KeyZ",
	lr: "Digit2 KeyW KeyS KeyX",
	lm: "Digit3 KeyE KeyD KeyC",
	li: "Digit4 Digit5 KeyR KeyT KeyF KeyG KeyV KeyB",
	ri: "Digit6 Digit7 KeyY KeyU KeyH KeyJ KeyN KeyM",
	rm: "Digit8 KeyI KeyK Comma",
	rr: "Digit9 KeyO KeyL Period",
	rp: "Digit0 Minus Equal KeyP BracketLeft BracketRight Backslash Semicolon Quote Slash",
	th: "Space",
})) {
	for (const c of codes.split(" ")) FINGER_OF[c] = f as Finger;
}

// Символы по рядам: пары «без Shift / с Shift»
const CHARS: Record<Layout, string[][]> = {
	en: [
		["`~", "1!", "2@", "3#", "4$", "5%", "6^", "7&", "8*", "9(", "0)", "-_", "=+"],
		["qQ", "wW", "eE", "rR", "tT", "yY", "uU", "iI", "oO", "pP", "[{", "]}", "\\|"],
		["aA", "sS", "dD", "fF", "gG", "hH", "jJ", "kK", "lL", ";:", "'\""],
		["zZ", "xX", "cC", "vV", "bB", "nN", "mM", ",<", ".>", "/?"],
	],
	ru: [
		["ёЁ", "1!", '2"', "3№", "4;", "5%", "6:", "7?", "8*", "9(", "0)", "-_", "=+"],
		["йЙ", "цЦ", "уУ", "кК", "еЕ", "нН", "гГ", "шШ", "щЩ", "зЗ", "хХ", "ъЪ", "\\/"],
		["фФ", "ыЫ", "вВ", "аА", "пП", "рР", "оО", "лЛ", "дД", "жЖ", "эЭ"],
		["яЯ", "чЧ", "сС", "мМ", "иИ", "тТ", "ьЬ", "бБ", "юЮ", ".,"],
	],
};

export const SPACE_KEY: KeyDef = { code: "Space", base: " ", shift: " ", finger: "th" };

/** Ряды клавиш раскладки (без пробела). */
export function keyRows(layout: Layout): KeyDef[][] {
	return CODES.map((row, r) =>
		row.map((code, i) => {
			const pair = Array.from(CHARS[layout][r][i]);
			return { code, base: pair[0], shift: pair[1], finger: FINGER_OF[code] };
		}),
	);
}

const LOOKUP: Record<Layout, Map<string, { key: KeyDef; shift: boolean }>> = { ru: new Map(), en: new Map() };
for (const layout of ["ru", "en"] as Layout[]) {
	for (const row of keyRows(layout)) {
		for (const key of row) {
			LOOKUP[layout].set(key.base, { key, shift: false });
			if (!LOOKUP[layout].has(key.shift)) LOOKUP[layout].set(key.shift, { key, shift: true });
		}
	}
	LOOKUP[layout].set(" ", { key: SPACE_KEY, shift: false });
}

/** Клавиша и Shift для символа в раскладке; null — символа на ней нет. */
export function keyFor(layout: Layout, ch: string): { key: KeyDef; shift: boolean } | null {
	return LOOKUP[layout].get(ch) ?? null;
}

const CYR = /[а-яА-ЯёЁ]/;
const LAT = /[a-zA-Z]/;

/** Раскладка, в которой печатается символ; для цифр, знаков и пробела — null (решает соседний текст). */
export function layoutOf(ch: string): Layout | null {
	if (CYR.test(ch)) return "ru";
	if (LAT.test(ch)) return "en";
	return null;
}

export type CharCategory = "lower" | "upper" | "punct" | "digit" | "space";

export const CATEGORY_NAMES: Record<CharCategory, string> = {
	lower: "Строчные буквы",
	upper: "Заглавные (с Shift)",
	punct: "Знаки препинания",
	digit: "Цифры",
	space: "Пробел и абзац",
};

export function categoryOf(ch: string): CharCategory {
	if (ch === " " || ch === "\n") return "space";
	if (/[0-9]/.test(ch)) return "digit";
	if (/[a-zа-яё]/.test(ch)) return "lower";
	if (/[A-ZА-ЯЁ]/.test(ch)) return "upper";
	return "punct";
}
