// Прогон по живому приложению: библиотека → книга → печатаем → ошибка → раскладка → оглавление → настройки.
// Снимки в test-output/<TAG>/. Запуск: npm run build && npx vite preview --port 4174 & BOOK=путь node scripts/e2e-typing.mjs
import { mkdirSync } from "node:fs";
import { chromium, webkit } from "@playwright/test";

const base = process.env.BASE ?? "http://localhost:4174/";
const book = process.env.BOOK;
if (!book) throw new Error("BOOK=<путь к книге>");
const out = `test-output/${process.env.TAG ?? "run"}`;
mkdirSync(out, { recursive: true });
const sizes = (process.env.SIZES ?? "390x844,320x640,1280x800").split(",").map((s) => s.split("x").map(Number));
const browser = process.env.BROWSER === "webkit" ? await webkit.launch() : await chromium.launch({ channel: "chrome" });
const problems = [];

for (const [w, hgt] of sizes) {
	const name = `${w}`;
	const touch = w < 768;
	const ctx = await browser.newContext({ viewport: { width: w, height: hgt }, hasTouch: touch });
	const page = await ctx.newPage();
	page.on("pageerror", (e) => problems.push(`[${name}] pageerror: ${e.message}`));
	page.on("console", (m) => m.type() === "error" && problems.push(`[${name}] console: ${m.text()}`));
	await page.goto(base);
	await page.waitForSelector(".library");
	await page.screenshot({ path: `${out}/${name}-1-library.png` });
	await page.setInputFiles('input[type="file"]', book);
	await page.waitForSelector(".typer", { timeout: 120000 });
	await page.waitForTimeout(500);
	if (touch) await page.click(".stage");
	await page.screenshot({ path: `${out}/${name}-2-start.png` });

	const state = () =>
		page.evaluate(() => {
			const cur = document.querySelector(".tape .cur");
			const wrap = document.querySelector(".tape-wrap").getBoundingClientRect();
			const anchor = parseFloat(getComputedStyle(document.querySelector(".typer")).getPropertyValue("--anchor"));
			const r = cur.getBoundingClientRect();
			return { ch: cur.textContent, off: Math.abs(r.left - (wrap.left + anchor)), pct: document.querySelector(".stat:nth-child(3) b").textContent };
		});

	// Печатаем 150 знаков правильно
	let maxOff = 0;
	const start = await state();
	for (let i = 0; i < 150; i++) {
		const { ch } = await state();
		await page.keyboard.type(ch === "¶" ? " " : ch);
		await page.waitForTimeout(35);
		if (i % 15 === 14) {
			await page.waitForTimeout(120);
			maxOff = Math.max(maxOff, (await state()).off);
		}
	}
	await page.waitForTimeout(300);
	const speed = await page.locator(".stat:nth-child(1) b").textContent();
	const acc1 = await page.locator(".stat:nth-child(2) b").textContent();
	await page.screenshot({ path: `${out}/${name}-3-typed.png` });
	if (acc1 !== "100,0%") problems.push(`[${name}] точность после верного набора ${acc1}`);
	if (!/^\d+$/.test(speed ?? "")) problems.push(`[${name}] скорость не посчиталась: ${speed}`);
	if (maxOff > 1.5) problems.push(`[${name}] курсор уезжает с засечки на ${maxOff.toFixed(1)}px`);

	// Ошибка: строка стоит, точность падает
	const before = await state();
	const wrong = before.ch === "ъ" ? "щ" : "ъ";
	await page.keyboard.type(wrong);
	await page.waitForTimeout(60);
	await page.screenshot({ path: `${out}/${name}-4-error.png` });
	const after = await state();
	const acc2 = await page.locator(".stat:nth-child(2) b").textContent();
	if (after.ch !== before.ch) problems.push(`[${name}] после ошибки строка сдвинулась`);
	if (acc2 === "100,0%") problems.push(`[${name}] ошибка не посчиталась`);

	// Английская раскладка вместо русской
	let hint = "";
	if (/[а-яё]/i.test(after.ch)) {
		await page.keyboard.type("f");
		await page.waitForTimeout(100);
		hint = await page.locator(".type-hint").textContent();
		if (!/раскладк/.test(hint ?? "")) problems.push(`[${name}] нет подсказки про раскладку: "${hint}"`);
	}

	// Оглавление → переход
	await page.click('button[aria-label="Оглавление и закладки"]');
	await page.waitForTimeout(400);
	await page.screenshot({ path: `${out}/${name}-5-toc.png` });
	const toc = await page.locator(".toc-item").count();
	if (toc > 2) await page.locator(".toc-item").nth(2).click();
	else await page.keyboard.press("Escape");
	await page.waitForTimeout(400);
	if (touch) await page.click(".stage");
	await page.screenshot({ path: `${out}/${name}-6-after-jump.png` });

	// Настройки: «Бумага», с засечками
	await page.click('.topbar button[aria-label="Настройки"]');
	await page.waitForTimeout(400);
	await page.screenshot({ path: `${out}/${name}-7-settings.png` });
	await page.click('.segmented button:text-is("Бумага")');
	await page.click('.segmented button:text-is("С засечками")');
	await page.keyboard.press("Escape");
	await page.waitForTimeout(400);
	for (let i = 0; i < 20; i++) {
		const { ch } = await state();
		await page.keyboard.type(ch === "¶" ? " " : ch);
		await page.waitForTimeout(30);
	}
	await page.waitForTimeout(200);
	maxOff = Math.max(maxOff, (await state()).off);
	await page.screenshot({ path: `${out}/${name}-8-paper.png` });
	if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) problems.push(`[${name}] горизонтальная прокрутка`);

	await page.click('button[aria-label="К библиотеке"]');
	await page.waitForSelector(".library .book");
	await page.waitForTimeout(300);
	await page.screenshot({ path: `${out}/${name}-9-library.png` });
	const status = await page.locator(".book-status").first().textContent();
	console.log(`[${name}] скорость ${speed}, точность ${acc1} → ${acc2}, прогресс ${start.pct} → ${(await page.locator(".book-status").count()) ? status : "?"}, пунктов оглавления ${toc}, сдвиг курсора ${maxOff.toFixed(2)}px${hint ? `, подсказка: ${hint}` : ""}`);
	await ctx.close();
}
await browser.close();
console.log(problems.length ? `ПРОБЛЕМЫ:\n${problems.join("\n")}` : "Проблем не найдено");
