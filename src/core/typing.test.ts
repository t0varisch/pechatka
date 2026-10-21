import { describe, expect, it } from "vitest";
import { buildTypingText, isRequired, layoutHint, matches, nextRequired, normalizeParagraph, TypingStats } from "./typing";

const ALL = { caseSensitive: true, punctuation: true };

describe("подготовка текста", () => {
	it("типографика → клавиатура", () => {
		expect(normalizeParagraph("«Привет», — сказал он…")).toBe('"Привет", - сказал он...');
		expect(normalizeParagraph("10 000  руб.")).toBe("10 000 руб.");
	});

	it("абзацы через перевод строки, начала абзацев", () => {
		const t = buildTypingText(["Раз два.", "  ", "Три"]);
		expect(t.text).toBe("Раз два.\nТри");
		expect(t.paraStarts).toEqual([0, 9, 9]);
	});
});

describe("что печатать", () => {
	it("непечатаемое пропускается, сдвоенный пробел после пропуска — тоже", () => {
		const text = "a © b";
		expect(isRequired(text, 0, ALL)).toBe(true);
		expect(isRequired(text, 1, ALL)).toBe(true);
		expect(isRequired(text, 2, ALL)).toBe(false);
		expect(isRequired(text, 3, ALL)).toBe(false);
		expect(nextRequired(text, 2, ALL)).toBe(4);
	});

	it("без знаков препинания", () => {
		const opts = { caseSensitive: true, punctuation: false };
		const text = "Да, нет";
		expect(isRequired(text, 2, opts)).toBe(false);
		expect(isRequired(text, 3, opts)).toBe(true);
	});
});

describe("проверка нажатия", () => {
	it("пробел — пробелом или Enter, абзац — так же", () => {
		expect(matches(" ", "\n", ALL)).toBe(true);
		expect(matches("\n", " ", ALL)).toBe(true);
	});
	it("ё и е, регистр", () => {
		expect(matches("ё", "е", ALL)).toBe(true);
		expect(matches("А", "а", ALL)).toBe(false);
		expect(matches("А", "а", { caseSensitive: false, punctuation: true })).toBe(true);
	});
	it("кавычки и тире из типографской раскладки", () => {
		expect(matches('"', "«", ALL)).toBe(true);
		expect(matches("-", "—", ALL)).toBe(true);
	});
	it("подсказка про раскладку", () => {
		expect(layoutHint("р", "h")).toMatch(/русскую/);
		expect(layoutHint("р", "п")).toBeNull();
	});
});

describe("скорость", () => {
	it("паузы дольше 3 с не считаются", () => {
		const s = new TypingStats();
		let t = 1000;
		for (let i = 0; i < 31; i++) s.hit(true, (t += 200)); // 30 интервалов по 200 мс = 6 с
		s.hit(true, (t += 60000)); // отошёл на минуту
		expect(s.activeMs).toBe(6000);
		expect(s.cpm).toBe(320); // 32 знака за 6 с
		s.hit(false, (t += 200));
		expect(s.accuracy).toBeCloseTo(97);
	});
});
