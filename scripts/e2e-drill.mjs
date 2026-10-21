// «Работа над ошибками»: печатаем книгу, нарочно ошибаясь на «н» и «т», запускаем урок,
// проверяем упор на эти буквы, проходим урок до итога, берём следующий; английский разгон.
// Запуск: npx vite preview --port 4174 & BOOK=путь node scripts/e2e-drill.mjs
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const base = process.env.BASE ?? "http://localhost:4174/";
const out = `test-output/${process.env.TAG ?? "drill"}`;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const problems = [];

async function typeCur(page, count, mistakes = {}) {
	for (let i = 0; i < count; i++) {
		const ch = await page.evaluate(() => (document.querySelector(".lesson-result") ? null : (document.querySelector(".tape .cur")?.textContent ?? null)));
		if (ch === null) return i;
		const want = ch === "¶" ? " " : ch;
		if (mistakes[want]) await page.keyboard.type(mistakes[want]);
		await page.waitForTimeout(20 + (mistakes[want] ? 150 : 0));
		await page.keyboard.type(want);
	}
	return count;
}

for (const [w, h] of [[1280, 860], [390, 844]]) {
	const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 768 });
	const page = await ctx.newPage();
	page.on("pageerror", (e) => problems.push(`[${w}] pageerror: ${e.message}`));
	page.on("console", (m) => m.type() === "error" && problems.push(`[${w}] console: ${m.text()}`));
	await page.goto(base);
	await page.waitForSelector(".library");
	await page.setInputFiles('input[type="file"]', process.env.BOOK);
	await page.waitForSelector(".typer");
	await page.waitForTimeout(300);
	if (w < 768) await page.click(".stage");
	await typeCur(page, Number(process.env.WARM ?? 700), { н: "г", т: "ь" });
	await page.click('button[aria-label="К библиотеке"]');
	await page.waitForSelector(".drill-card");
	await page.waitForTimeout(600);
	const ruLabel = await page.locator(".drill-actions button").first().textContent();
	await page.screenshot({ path: `${out}/${w}-1-library.png` });

	await page.locator(".drill-actions button").first().click();
	await page.waitForSelector(".typer");
	await page.waitForTimeout(400);
	if (w < 768) await page.click(".stage");
	const focus = await page.locator(".chapter").textContent();
	const lessonText = await page.evaluate(() => [...document.querySelectorAll(".tape span")].map((s) => s.textContent).join(""));
	const nt = (lessonText.match(/[нт]/g) ?? []).length / lessonText.replace(/ /g, "").length;
	await page.screenshot({ path: `${out}/${w}-2-lesson.png` });
	if (!/[нт]/.test(focus ?? "")) problems.push(`[${w}] в упоре урока нет «н»/«т»: ${focus}`);

	await typeCur(page, 2000, { н: "г" });
	await page.waitForSelector(".lesson-result", { timeout: 20000 });
	await page.waitForTimeout(400);
	const result = await page.locator(".lesson-result").innerText();
	await page.screenshot({ path: `${out}/${w}-3-result.png` });
	await page.keyboard.press(" "); // лишний пробел после урока не должен пролистать итог
	await page.waitForTimeout(1100);
	if (!(await page.locator(".lesson-result").count())) problems.push(`[${w}] пробел пролистал итог урока`);
	await page.keyboard.press("Enter");
	await page.waitForSelector(".tape .cur", { timeout: 20000 });
	await page.waitForTimeout(300);
	const next = await page.evaluate(() => [...document.querySelectorAll(".tape span")].map((s) => s.textContent).join("").slice(0, 60));
	if (next === lessonText.slice(0, 60)) problems.push(`[${w}] следующий урок совпал с прошлым`);

	// Английский разгон
	await page.click('button[aria-label="К библиотеке"]');
	await page.waitForSelector(".drill-card");
	await page.locator(".drill-actions button").nth(1).click();
	await page.waitForSelector(".typer");
	await page.waitForTimeout(300);
	const en = await page.evaluate(() => [...document.querySelectorAll(".tape span")].map((s) => s.textContent).join("").slice(0, 80));
	const enFocus = await page.locator(".chapter").textContent();
	await page.screenshot({ path: `${out}/${w}-4-english.png` });
	if (!/^[a-zA-Z .,!?:;"-]+/.test(en)) problems.push(`[${w}] английский урок не на английском: ${en}`);
	if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) problems.push(`[${w}] горизонтальная прокрутка`);

	console.log(`[${w}] кнопка: «${ruLabel}» | ${focus} | доля н+т в уроке ${(nt * 100).toFixed(1)}%`);
	console.log(`[${w}] итог: ${result.replace(/\n+/g, " / ")}`);
	console.log(`[${w}] следующий урок: ${next}…`);
	console.log(`[${w}] английский: ${enFocus} | ${en}…`);
	await ctx.close();
}
await browser.close();
console.log(problems.length ? `ПРОБЛЕМЫ:\n${problems.join("\n")}` : "Проблем не найдено");
