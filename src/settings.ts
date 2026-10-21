export type Theme = "auto" | "light" | "paper" | "dark" | "black";
export type FontKind = "mono" | "serif" | "sans";

export interface Settings {
	fontSize: number;
	font: FontKind;
	theme: Theme;
	/** Тихий щелчок на каждое нажатие и глухой звук на ошибку. */
	sound: boolean;
	/** Учитывать заглавные буквы. */
	caseSensitive: boolean;
	/** Печатать знаки препинания. */
	punctuation: boolean;
}

const KEY = "pechatka:settings";
const narrow = typeof window !== "undefined" && window.innerWidth < 768;

// Значения по умолчанию — пробы, Роман их не фиксировал (21.10.2026)
export const DEFAULTS: Settings = {
	fontSize: narrow ? 26 : 34,
	font: "mono",
	theme: "auto",
	sound: false,
	caseSensitive: true,
	punctuation: true,
};

export function loadSettings(): Settings {
	try {
		const raw = localStorage.getItem(KEY);
		if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
	} catch {
		/* приватный режим или запрет хранилища */
	}
	return { ...DEFAULTS };
}

export function saveSettings(s: Settings): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(s));
	} catch {
		/* не сохранилось — не страшно */
	}
}

const media = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

export function applyTheme(s: Settings): void {
	const t = s.theme === "auto" ? (media?.matches ? "dark" : "light") : s.theme;
	document.documentElement.dataset.theme = t;
	document.documentElement.dataset.font = s.font;
	const color = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
	document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color || "#1b1e24");
}

export function watchSystemTheme(get: () => Settings): void {
	media?.addEventListener?.("change", () => applyTheme(get()));
}
