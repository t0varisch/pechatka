import type { FontKind, Settings, Theme } from "../settings";
import { h, openSheet } from "./dom";

function range(label: string, value: number, min: number, max: number, step: number, fmt: (v: number) => string, set: (v: number) => void): HTMLElement {
	const out = h("output", {}, fmt(value));
	const input = h("input", { type: "range", min, max, step, value, "aria-label": label });
	input.addEventListener("input", () => {
		const v = Number(input.value);
		out.textContent = fmt(v);
		set(v);
	});
	return h("label.row.range-row", {}, h("span.row-label", {}, label, out), input);
}

function segmented<T extends string | number>(label: string, value: T, options: [T, string][], set: (v: T) => void): HTMLElement {
	const group = h("div.segmented", { role: "radiogroup", "aria-label": label });
	for (const [v, text] of options) {
		const b = h("button", { type: "button", role: "radio", "aria-checked": String(v === value) }, text);
		b.addEventListener("click", () => {
			for (const x of group.children) x.setAttribute("aria-checked", "false");
			b.setAttribute("aria-checked", "true");
			set(v);
		});
		group.append(b);
	}
	return h("div.row", {}, h("span.row-label", {}, label), group);
}

function toggle(label: string, hint: string, value: boolean, set: (v: boolean) => void): HTMLElement {
	const input = h("input", { type: "checkbox", role: "switch" });
	input.checked = value;
	input.addEventListener("change", () => set(input.checked));
	return h("label.row.toggle-row", {}, h("span.toggle-text", {}, h("span", {}, label), hint ? h("small", {}, hint) : null), input);
}

export function openSettings(s: Settings, onChange: (s: Settings) => void, onClose?: () => void): void {
	const set = <K extends keyof Settings>(k: K, v: Settings[K]) => {
		s[k] = v;
		onChange(s);
	};
	const body = h(
		"div.settings",
		{},
		range("Размер текста", s.fontSize, 18, 72, 1, (v) => `${v} px`, (v) => set("fontSize", v)),
		segmented<Theme>("Тема", s.theme, [["auto", "Авто"], ["light", "Светлая"], ["paper", "Бумага"], ["dark", "Тёмная"], ["black", "Чёрная"]], (v) => set("theme", v)),
		segmented<FontKind>("Шрифт", s.font, [["mono", "Моно"], ["serif", "С засечками"], ["sans", "Без засечек"]], (v) => set("font", v)),
		toggle("Заглавные буквы", "Печатать с Shift, как в книге", s.caseSensitive, (v) => set("caseSensitive", v)),
		toggle("Знаки препинания", "Выключи, чтобы печатать только буквы, цифры и пробелы", s.punctuation, (v) => set("punctuation", v)),
		toggle("Звук клавиш", "Тихий щелчок на нажатие и глухой звук на ошибку", s.sound, (v) => set("sound", v)),
		h(
			"p.fineprint",
			{},
			"Книги хранятся только на этом устройстве. «» печатаются как \", — как -, … как ..., вместо «ё» можно «е». Разбор EPUB частично основан на ",
			h("a", { href: "https://github.com/sami-29/speeedy", target: "_blank", rel: "noopener" }, "Speeedy"),
			" (лицензия MIT).",
		),
	);
	openSheet("Настройки", body, onClose);
}
