import { buildDrill, focusLetters, wordsFromText } from "./core/drill";
import { byChar, errRate } from "./core/keystats";
import type { Layout } from "./core/layouts";
import { getBook, getStats, listBooks } from "./store";
import type { DrillLesson } from "./ui/typer";

/** Слова из книг библиотеки — по раскладке; пересобираются, когда меняется набор книг. */
const poolCache = new Map<Layout, { key: string; words: string[] }>();

async function bookWords(layout: Layout): Promise<string[]> {
	const books = await listBooks();
	const key = books.map((b) => b.id).sort().join(",");
	const cached = poolCache.get(layout);
	if (cached && cached.key === key) return cached.words;
	const texts: string[] = [];
	for (const b of books.slice(0, 12)) {
		const full = await getBook(b.id);
		if (full) texts.push(full.paragraphs.join(" ").slice(0, 400000));
	}
	const words = wordsFromText(texts, layout);
	poolCache.set(layout, { key, words });
	return words;
}

/** Собирает урок по слабым местам выбранной раскладки. */
export async function prepareDrill(layout: Layout): Promise<DrillLesson> {
	const [doc, words] = await Promise.all([getStats(), bookWords(layout)]);
	const L = doc.layouts[layout];
	const plan = buildDrill(L, layout, words);
	const chars = byChar(L);
	const before: Record<string, number> = {};
	for (const f of plan.focus) {
		const a = chars.get(f);
		if (a && a.n + a.err >= 15) before[f] = errRate(a);
	}
	return { ...plan, before };
}

/** Буквы, на которые будет упор, — для подписи кнопки. Пусто, если данных мало. */
export async function drillPreview(layout: Layout): Promise<string[]> {
	const doc = await getStats();
	return focusLetters(doc.layouts[layout], layout).focus.slice(0, 3);
}
