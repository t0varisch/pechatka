// Печатаем русскую книгу и английский текст с ошибками разных видов, открываем статистику.
// Запуск: npx vite preview --port 4174 & BOOK=путь node scripts/e2e-stats.mjs
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const base = process.env.BASE ?? "http://localhost:4174/";
const out = `test-output/${process.env.TAG ?? "stats"}`;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const problems = [];
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));

const NEIGHBOR = { о: "л", а: "в", е: "к", и: "м", т: "ь", н: "г", с: "м", р: "п", o: "i", e: "r", a: "s", t: "y", n: "m" };
const LAT = { а: "f", о: "j", е: "t", и: "b", н: "y", т: "n", р: "h", с: "c" };
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

async function typeSome(count) {
	for (let i = 0; i < count; i++) {
		const ch = await page.locator(".tape .cur").textContent();
		const want = ch === "¶" ? " " : ch;
		const r = rnd();
		if (r < 0.04 && NEIGHBOR[want.toLowerCase()]) await page.keyboard.type(NEIGHBOR[want.toLowerCase()]);
		else if (r < 0.06 && want !== want.toLowerCase()) await page.keyboard.type(want.toLowerCase());
		else if (r < 0.075 && LAT[want]) await page.keyboard.type(LAT[want]);
		await page.waitForTimeout(25 + Math.floor(rnd() * 90) + (/[шщъжэю]/.test(want) ? 120 : 0));
		await page.keyboard.type(want);
	}
}

await page.goto(base);
await page.waitForSelector(".library");
await page.setInputFiles('input[type="file"]', process.env.BOOK);
await page.waitForSelector(".typer");
await page.waitForTimeout(400);
await typeSome(Number(process.env.RU ?? 500));
await page.click('button[aria-label="К библиотеке"]');
await page.waitForSelector(".library .book");

// Английский текст через «Вставить текст»
await page.click("button.secondary:has-text('Вставить текст')");
await page.fill(".paste textarea", "The quick brown fox jumps over the lazy dog. Typing practice makes the fingers remember where every key lives, and the mind follows the text without thinking about the keyboard at all. Read a book, type a book, learn the book.");
await page.click(".paste button.primary");
await page.waitForSelector(".typer");
await page.waitForTimeout(300);
await typeSome(Number(process.env.EN ?? 200));
await page.click('button[aria-label="К библиотеке"]');
await page.waitForSelector(".library .book");
const sessionToast = await page.locator("#toast").textContent().catch(() => "");

// Прошлые дни — чтобы проверить график
await page.evaluate(async () => {
	const req = indexedDB.open("pechatka");
	const db = await new Promise((res, rej) => ((req.onsuccess = () => res(req.result)), (req.onerror = rej)));
	const tx = db.transaction("stats", "readwrite");
	const store = tx.objectStore("stats");
	const cur = await new Promise((res) => (store.get("sessions").onsuccess = (e) => res(e.target.result)));
	const list = cur?.list ?? [];
	const day = 864e5;
	[[6, 180, 94], [5, 195, 95], [4, 210, 95.5], [2, 230, 96.4], [1, 245, 97]].forEach(([ago, cpm, acc]) => {
		const correct = cpm * 10;
		list.push({ id: Date.now() - ago * day, ms: 600000, correct, errors: Math.round((correct * (100 - acc)) / acc), book: "тест" });
	});
	store.put({ id: "sessions", list });
	await new Promise((r) => (tx.oncomplete = r));
});

await page.click('button[aria-label="Статистика"]');
await page.waitForSelector(".stats-page");
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/1280-stats-full.png`, fullPage: true });
const summary = await page.locator(".st-summary li").allTextContents();
const sections = await page.locator(".st-section h2").allTextContents();
const keys = await page.locator(".kb-key").count();
await page.locator(".kb-key").filter({ hasText: /^О$/ }).first().click();
const detail = await page.locator(".kb-detail").textContent();
await page.click('.kb-box .segmented button:text-is("Скорость")');
await page.waitForTimeout(200);
await page.locator(".kb-box").screenshot({ path: `${out}/1280-kb-speed.png` });
await page.click('.layout-switch button:has-text("Английская")');
await page.waitForTimeout(300);
const enSections = await page.locator(".st-section h2").allTextContents();
await page.screenshot({ path: `${out}/1280-stats-en.png`, fullPage: true });

for (const [w, h] of [[390, 844], [320, 640]]) {
	await page.setViewportSize({ width: w, height: h });
	await page.reload();
	await page.waitForSelector(".stats-page");
	await page.waitForTimeout(500);
	await page.screenshot({ path: `${out}/${w}-stats-full.png`, fullPage: true });
	if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) problems.push(`[${w}] горизонтальная прокрутка на статистике`);
}

console.log("итог сессии:", sessionToast);
console.log("выводы:", summary);
console.log("разделы RU:", sections.join(" | "));
console.log("разделы EN:", enSections.join(" | "));
console.log("клавиш на карте:", keys, "| О:", detail);
await browser.close();
console.log(problems.length ? `ПРОБЛЕМЫ:\n${problems.join("\n")}` : "Проблем не найдено");
