import { describe, expect, it } from "vitest";
import {
	byCategory,
	byDay,
	byFinger,
	byKeyCode,
	confusionKind,
	emptyStats,
	errorWords,
	KeystrokeCollector,
	mergeStats,
	slowBigrams,
	topConfusions,
	worstByErrors,
} from "./keystats";
import { keyFor } from "./layouts";

/** Печатает строку без ошибок с заданным интервалом. */
function typeText(c: KeystrokeCollector, text: string, t0: number, step = 200): number {
	let t = t0;
	for (const ch of text) c.press(ch, ch, true, (t += step));
	return t;
}

describe("раскладки", () => {
	it("символы на своих клавишах", () => {
		expect(keyFor("ru", "ш")?.key.code).toBe("KeyI");
		expect(keyFor("ru", "Ш")).toMatchObject({ shift: true });
		expect(keyFor("ru", ",")?.key.code).toBe("Slash");
		expect(keyFor("ru", '"')?.key.code).toBe("Digit2");
		expect(keyFor("en", ",")?.key.code).toBe("Comma");
		expect(keyFor("en", " ")?.key.finger).toBe("th");
	});
});

describe("сбор нажатий", () => {
	it("скорость перехода, пары, ошибки, слова", () => {
		const c = new KeystrokeCollector();
		let t = typeText(c, "шла ", 1000);
		c.press("с", "ы", false, (t += 300)); // промах на соседнюю
		c.press("с", "с", true, (t += 200));
		t = typeText(c, "ша ", t);
		const d = c.take();
		const ru = d.layouts.ru;
		expect(ru.keys["ш"].n).toBe(2);
		expect(ru.keys["л"]).toMatchObject({ n: 1, tn: 1, t: 200 });
		expect(ru.keys["с"]).toMatchObject({ n: 1, err: 1, tn: 0 }); // после ошибки время не меряем
		expect(ru.bigrams["шл"].tn).toBe(1);
		expect(ru.confusions["с→ы"]).toBe(1);
		expect(ru.words["шла"]).toEqual({ n: 1, err: 0 });
		expect(ru.words["сша"]).toEqual({ n: 1, err: 1 });
		expect(c.take().layouts.ru.keys).toEqual({});
	});

	it("знаки и пробел относятся к раскладке соседнего текста", () => {
		const c = new KeystrokeCollector("ru");
		typeText(c, "ok, да.", 0);
		const d = c.take();
		expect(d.layouts.en.keys[","].n).toBe(1);
		expect(d.layouts.ru.keys["."].n).toBe(1);
	});

	it("паузы дольше 3 с не меряются", () => {
		const c = new KeystrokeCollector();
		c.press("а", "а", true, 1000);
		c.press("б", "б", true, 9000);
		expect(c.take().layouts.ru.keys["б"].tn).toBe(0);
	});
});

describe("разбор", () => {
	const doc = emptyStats();
	const c = new KeystrokeCollector();
	let t = 0;
	for (let i = 0; i < 30; i++) {
		t = typeText(c, "привет ", t, 150);
		c.press("Ш", "ш", false, (t += 200));
		c.press("Ш", "Ш", true, (t += 200));
		c.press("и", "и", true, (t += 600)); // «Ши» — медленная пара
		c.press(" ", " ", true, (t += 150));
	}
	mergeStats(doc, c.take());
	const ru = doc.layouts.ru;

	it("худшие клавиши и путаницы с видом ошибки", () => {
		expect(worstByErrors(ru)[0].label).toBe("ш");
		const conf = topConfusions(ru, "ru");
		expect(conf[0]).toMatchObject({ expected: "Ш", typed: "ш", count: 30, kind: "shift" });
		expect(confusionKind("ru", "с", "в")).toBe("neighbor");
		expect(confusionKind("ru", "с", "ы")).toBe("other");
		expect(confusionKind("ru", "р", "h")).toBe("layout");
	});

	it("медленные пары, пальцы, виды символов, клавиши", () => {
		expect(slowBigrams(ru)[0].label).toBe("ши");
		expect(byFinger(ru, "ru").rm.n).toBeGreaterThan(0); // ш — правый средний
		const cat = byCategory(ru);
		expect(cat.upper.err).toBe(30);
		expect(cat.lower.err).toBe(0);
		expect(byKeyCode(ru, "ru").get("KeyI")?.err).toBe(30);
		expect(errorWords(ru)[0].word).toBe("ши");
	});

	it("по дням", () => {
		const day = new Date(2026, 9, 21, 10).getTime();
		const days = byDay([
			{ id: day, ms: 60000, correct: 300, errors: 10, book: "a" },
			{ id: day + 3600e3, ms: 60000, correct: 200, errors: 0, book: "a" },
		]);
		expect(days).toHaveLength(1);
		expect(days[0]).toMatchObject({ day: "2026-10-21", cpm: 250 });
	});
});
