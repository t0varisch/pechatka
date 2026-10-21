import { describe, expect, it } from "vitest";
import { buildDrill, letterWeakness, seeded, wordsFromText } from "./drill";
import { emptyStats, KeystrokeCollector, mergeStats } from "./keystats";

/** Статистика: много нормальных нажатий и частые ошибки на «ш», медленная «щ». */
function stats() {
	const doc = emptyStats();
	const c = new KeystrokeCollector();
	let t = 0;
	const base = "привет как дела всё хорошо мы идём домой сегодня утром ";
	for (let r = 0; r < 20; r++) {
		for (const ch of base) c.press(ch, ch, true, (t += 180));
		c.press("ш", "щ", false, (t += 200));
		c.press("ш", "ш", true, (t += 200));
		c.press("щ", "щ", true, (t += 700));
		c.press(" ", " ", true, (t += 180));
	}
	return mergeStats(doc, c.take()).layouts.ru;
}

describe("урок по слабым местам", () => {
	it("слабые буквы: «ш» по ошибкам, «щ» по скорости", () => {
		const w = letterWeakness(stats(), "ru");
		expect(w.get("ш")).toBeGreaterThan(1);
		expect(w.get("щ")).toBeGreaterThan(1);
		expect(w.get("о")).toBeLessThan(0.3);
	});

	it("урок с упором на слабые буквы и нужной длины", () => {
		const plan = buildDrill(stats(), "ru", ["шум", "щука", "дом", "кот", "шишка", "щит", "лес"], seeded(42));
		expect(plan.starter).toBe(false);
		expect(plan.focus).toContain("ш");
		expect(plan.text.length).toBeGreaterThanOrEqual(380);
		const share = (plan.text.match(/[шщ]/g) ?? []).length / plan.text.replace(/ /g, "").length;
		expect(share).toBeGreaterThan(0.08); // в обычном тексте ш+щ ~1%
	});

	it("без данных — разгонный урок из частых слов", () => {
		const plan = buildDrill(emptyStats().layouts.en, "en", [], seeded(1));
		expect(plan.starter).toBe(true);
		expect(plan.text).toMatch(/^[a-z ]+$/);
	});

	it("слова из книг: частые, нужного алфавита", () => {
		expect(wordsFromText(["Кот и кот, cat cat кот. Пёс"], "ru")).toEqual(["кот"]);
		expect(wordsFromText(["Кот и кот, cat cat кот"], "en")).toEqual(["cat"]);
	});
});
