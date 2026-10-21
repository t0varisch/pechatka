// Офлайн: открыть приложение с сетью, добавить книгу, выключить сеть,
// перезагрузить, открыть книгу и попечатать, затем загрузить без сети EPUB и PDF.
// Запуск: BASE=... FB2=... EPUB=... PDF=... node scripts/offline-check.mjs
import { chromium } from "@playwright/test";

const base = process.env.BASE ?? "http://localhost:4174/";
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const log = (...a) => console.log(...a);

await page.goto(base);
await page.waitForSelector(".library");
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload(); // страница под управлением service worker
await page.waitForSelector(".library");
log("под service worker:", await page.evaluate(() => !!navigator.serviceWorker.controller));
log("постоянное хранилище:", await page.evaluate(() => navigator.storage?.persisted?.()));

await page.setInputFiles('input[type="file"]', process.env.FB2);
await page.waitForSelector(".typer", { timeout: 60000 });
await page.click('button[aria-label="К библиотеке"]');
await page.waitForSelector(".library .book");

await ctx.setOffline(true);
await page.reload();
await page.waitForSelector(".library .book", { timeout: 15000 });
log("без сети библиотека открылась, книг:", await page.locator(".library .book").count());

await page.click(".book-open");
await page.waitForSelector(".typer");
await page.waitForTimeout(300);
const done = () => page.evaluate(() => document.querySelectorAll(".tape .done").length);
const done0 = await done();
for (let i = 0; i < 40; i++) {
	const ch = await page.locator(".tape .cur").textContent();
	await page.keyboard.type(ch === "¶" ? " " : ch);
}
await page.waitForTimeout(200);
log("без сети печатается, напечатано знаков:", (await done()) - done0, "из 40");

for (const [kind, file] of [["EPUB", process.env.EPUB], ["PDF", process.env.PDF]]) {
	await page.click('button[aria-label="К библиотеке"]');
	await page.waitForSelector(".library");
	await page.setInputFiles('input[type="file"]', file);
	try {
		await page.waitForSelector(".typer", { timeout: 120000 });
		log(`без сети ${kind} загрузился и открылся`);
	} catch {
		const t = await page.locator("#toast").textContent().catch(() => "");
		log(`без сети ${kind} НЕ открылся: ${t}`);
	}
}
await browser.close();
