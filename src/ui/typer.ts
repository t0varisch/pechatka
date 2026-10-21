import { errorSound, keyClick, unlockAudio } from "../audio";
import {
	buildTypingText,
	layoutHint,
	type MatchOptions,
	matches,
	nextRequired,
	remainingRequired,
	TypingStats,
} from "../core/typing";
import type { Settings } from "../settings";
import { type BookMeta, getBook, newId, updateBook } from "../store";
import { formatDuration, h, iconButton, openSheet, toast } from "./dom";
import { openSettings } from "./settings-sheet";

export interface AppCtx {
	settings: Settings;
	saveSettings(): void;
	goLibrary(): void;
}

interface ChapterMark {
	title: string;
	level: number;
	pos: number;
}

const SAVE_EVERY_MS = 5000;
/** Сколько символов держать в строке слева и справа от курсора. */
const BEHIND = 80;
const AHEAD = 260;

function escapeHtml(ch: string): string {
	if (ch === "&") return "&amp;";
	if (ch === "<") return "&lt;";
	if (ch === ">") return "&gt;";
	return ch;
}

export async function openTyper(root: HTMLElement, id: string, app: AppCtx): Promise<() => void> {
	const book = await getBook(id);
	if (!book) {
		toast("Книга не найдена");
		app.goLibrary();
		return () => {};
	}
	const meta: BookMeta = book.meta;
	const s = app.settings;
	const { text, paraStarts } = buildTypingText(book.paragraphs);
	const len = text.length;
	if (len === 0) {
		toast("В книге не нашлось текста");
		app.goLibrary();
		return () => {};
	}
	const opts: MatchOptions = { caseSensitive: s.caseSensitive, punctuation: s.punctuation };

	const chapters: ChapterMark[] = meta.toc
		.filter((t) => t.paragraph >= 0 && t.paragraph < paraStarts.length)
		.map((t) => ({ title: t.title, level: t.level, pos: paraStarts[t.paragraph] }));
	const sortedChapters = [...chapters].sort((a, b) => a.pos - b.pos);

	let pos = nextRequired(text, Math.min(meta.position, len), opts);
	let remaining = remainingRequired(text, pos, opts);
	const session = new TypingStats();
	const base = { ...meta.stats };

	// ---- разметка
	const bar = h("div.progress-fill");
	const chapterLine = h("div.chapter");
	const titleLine = h("div.book-title", {}, meta.title);
	const tape = h("div.tape", { "aria-hidden": "true" });
	const tapeWrap = h("div.tape-wrap", {}, h("div.guide.top", {}, h("i")), tape, h("div.guide.bottom", {}, h("i")));
	const hintLine = h("div.type-hint", { "aria-live": "polite" });
	const speedOut = h("b", {}, "—");
	const accOut = h("b", {}, "—");
	const pctOut = h("b", {}, "0%");
	const metaLine = h("div.meta");
	const stats = h(
		"div.stats",
		{},
		h("div.stat", {}, speedOut, h("small", {}, "зн/мин")),
		h("div.stat", {}, accOut, h("small", {}, "точность")),
		h("div.stat", {}, pctOut, h("small", {}, "книги")),
	);
	// Невидимое поле ввода: через него приходят буквы и с компьютера, и с экранной клавиатуры телефона
	const input = h("textarea.ghost", {
		"aria-label": "Печатай здесь",
		autocomplete: "off",
		autocorrect: "off",
		autocapitalize: "off",
		spellcheck: "false",
		rows: 1,
	}) as HTMLTextAreaElement;
	const stage = h("main.stage", {}, tapeWrap, hintLine, stats, metaLine);
	const bookmarkBtn = iconButton("bookmark", "Закладка здесь", () => addBookmark());

	const view = h(
		"div.typer",
		{},
		h("div.progress", { "aria-hidden": "true" }, bar),
		h(
			"header.topbar",
			{},
			iconButton("back", "К библиотеке", () => app.goLibrary()),
			h("div.where", {}, chapterLine, titleLine),
			iconButton("toc", "Оглавление и закладки", () => openNav()),
			bookmarkBtn,
			iconButton("gear", "Настройки", () => openTyperSettings()),
		),
		stage,
		input,
	);
	root.replaceChildren(view);

	// ---- бегущая строка
	let winStart = 0;
	let winEnd = 0;
	let anchor = 0;

	function geometry(): void {
		const width = tapeWrap.clientWidth || window.innerWidth;
		anchor = Math.round(width * (width < 768 ? 0.3 : 0.35));
		view.style.setProperty("--anchor", `${anchor}px`);
	}

	function spanAt(i: number): HTMLElement | null {
		return (tape.children[i - winStart] as HTMLElement | undefined) ?? null;
	}

	function classFor(i: number): string {
		const ch = text[i];
		let c = i < pos ? "done" : i === pos ? "cur" : "";
		if (ch === "\n") c += " para";
		else if (i > pos && !isTypeable(i)) c += " skip";
		return c.trim();
	}

	function isTypeable(i: number): boolean {
		// Пропускаемое показываем бледным; для скорости проверяем только «видно ли его»
		return nextRequired(text, i, opts) === i;
	}

	function renderWindow(): void {
		winStart = Math.max(0, pos - BEHIND);
		winEnd = Math.min(len, pos + AHEAD);
		let html = "";
		for (let i = winStart; i < winEnd; i++) {
			const ch = text[i];
			const shown = ch === "\n" ? "¶" : escapeHtml(ch);
			const cls = classFor(i);
			html += cls ? `<span class="${cls}">${shown}</span>` : `<span>${shown}</span>`;
		}
		// Конец книги: пустой символ, чтобы курсору было где стоять
		if (winEnd === len) html += `<span class="${pos >= len ? "cur" : ""}"> </span>`;
		view.classList.add("no-anim");
		tape.innerHTML = html;
		place();
		void tape.offsetWidth;
		view.classList.remove("no-anim");
	}

	function place(): void {
		const sp = spanAt(Math.min(pos, winEnd));
		const x = sp ? sp.offsetLeft : 0;
		tape.style.transform = `translateX(${anchor - x}px)`;
	}

	function advance(from: number, to: number): void {
		if (to - winStart > BEHIND * 2 || to > winEnd - 60) {
			renderWindow();
			return;
		}
		for (let i = from; i < to; i++) {
			const sp = spanAt(i);
			if (sp) sp.className = text[i] === "\n" ? "done para" : "done";
		}
		const cur = spanAt(to);
		if (cur) cur.className = text[to] === "\n" ? "cur para" : "cur";
		place();
	}

	// ---- набор
	let lastSaved = Date.now();
	let hintTimer: ReturnType<typeof setTimeout> | null = null;
	let statsQueued = false;
	let audioReady = false;

	function setHint(t: string, ms = 0): void {
		hintLine.textContent = t;
		if (hintTimer) clearTimeout(hintTimer);
		hintTimer = ms ? setTimeout(() => refreshHint(), ms) : null;
	}

	function refreshHint(): void {
		if (pos >= len) return setHint("Книга напечатана целиком");
		if (document.activeElement !== input) return setHint(matchMedia("(pointer: coarse)").matches ? "Нажми на строку, чтобы печатать" : "Нажми любую клавишу, чтобы продолжить");
		setHint(session.correct === 0 ? "Печатай — время пойдёт с первой буквы" : "");
	}

	function press(ch: string): void {
		if (pos >= len) return;
		if (s.sound && !audioReady) {
			unlockAudio();
			audioReady = true;
		}
		const expected = text[pos];
		const now = performance.now();
		if (matches(expected, ch, opts)) {
			session.hit(true, now);
			const from = pos;
			pos = nextRequired(text, pos + 1, opts);
			remaining = Math.max(0, remaining - 1);
			advance(from, pos);
			if (s.sound) keyClick();
			if (hintLine.textContent) refreshHint();
			if (pos >= len) {
				save();
				refreshHint();
				toast("Книга напечатана целиком");
			}
		} else {
			session.hit(false, now);
			const cur = spanAt(pos);
			if (cur) {
				cur.classList.remove("err");
				void cur.offsetWidth;
				cur.classList.add("err");
			}
			if (s.sound) errorSound();
			const hint = layoutHint(expected, ch);
			if (hint) setHint(hint, 2500);
		}
		if (!statsQueued) {
			statsQueued = true;
			requestAnimationFrame(() => {
				statsQueued = false;
				updateStats();
			});
		}
		if (Date.now() - lastSaved > SAVE_EVERY_MS) save();
	}

	function typeChars(str: string): void {
		for (const ch of Array.from(str)) press(ch === "\r" ? "\n" : ch);
	}

	let composing = false;
	let consumed = 0;
	input.addEventListener("compositionstart", () => (composing = true));
	input.addEventListener("compositionend", () => {
		composing = false;
		input.value = "";
		consumed = 0;
	});
	input.addEventListener("beforeinput", (e) => {
		if (composing) return;
		if (e.inputType === "insertText" && e.data) {
			e.preventDefault();
			typeChars(e.data);
		} else if (e.inputType === "insertLineBreak" || e.inputType === "insertParagraph") {
			e.preventDefault();
			typeChars("\n");
		} else if (e.inputType.startsWith("delete")) {
			// Стирать нечего: при ошибке строка стоит и ждёт верную букву
			e.preventDefault();
		}
	});
	// Запасной путь для экранных клавиатур, которые набирают словами (Android)
	input.addEventListener("input", () => {
		const v = input.value;
		if (v.length < consumed) consumed = v.length;
		const fresh = v.slice(consumed);
		consumed = v.length;
		if (fresh) typeChars(fresh);
		if (!composing) {
			input.value = "";
			consumed = 0;
		}
	});
	input.addEventListener("focus", () => (view.classList.add("focused"), refreshHint()));
	input.addEventListener("blur", () => {
		view.classList.remove("focused");
		refreshHint();
		save();
	});

	const focusInput = () => input.focus({ preventScroll: true });
	stage.addEventListener("click", focusInput);

	// ---- цифры
	function bookCpm(): number {
		const ms = base.activeMs + session.activeMs;
		return ms > 5000 ? Math.round((base.correct + session.correct) / (ms / 60000)) : 0;
	}

	function updateStats(): void {
		const cpm = session.cpm;
		speedOut.textContent = cpm ? String(cpm) : "—";
		accOut.textContent = session.correct + session.errors ? `${session.accuracy.toFixed(1).replace(".", ",")}%` : "—";
		const pct = len > 1 ? (pos / len) * 100 : 0;
		pctOut.textContent = `${pct.toFixed(pct < 10 ? 1 : 0).replace(".", ",")}%`;
		bar.style.width = `${pct}%`;
		const avg = bookCpm();
		const speed = cpm || avg;
		const parts: string[] = [];
		if (avg) parts.push(`в среднем по книге ${avg} зн/мин`);
		if (speed) parts.push(`осталось ≈ ${formatDuration((remaining / speed) * 60000)}`);
		else parts.push(`осталось ${remaining.toLocaleString("ru")} знаков`);
		metaLine.textContent = parts.join(" · ");
		const ch = currentChapter();
		chapterLine.textContent = ch ? ch.title : "";
		view.classList.toggle("no-chapter", !ch);
	}

	function currentChapter(): ChapterMark | null {
		let found: ChapterMark | null = null;
		for (const c of sortedChapters) {
			if (c.pos <= pos) found = c;
			else break;
		}
		return found;
	}

	function save(): void {
		lastSaved = Date.now();
		meta.position = pos;
		meta.stats = {
			correct: base.correct + session.correct,
			errors: base.errors + session.errors,
			activeMs: base.activeMs + session.activeMs,
		};
		updateBook(meta.id, { position: pos, stats: meta.stats, openedAt: Date.now() }).catch(() => {});
	}

	// ---- переходы, оглавление, закладки
	function seek(target: number): void {
		pos = nextRequired(text, Math.max(0, Math.min(len, target)), opts);
		remaining = remainingRequired(text, pos, opts);
		renderWindow();
		updateStats();
		save();
	}

	function snippetAt(i: number): string {
		return text.slice(i, i + 70).replace(/\n/g, " ");
	}

	function addBookmark(): void {
		const b = { id: newId(), pos, createdAt: Date.now(), snippet: snippetAt(pos) };
		meta.bookmarks = [...meta.bookmarks, b].sort((x, y) => x.pos - y.pos);
		updateBook(meta.id, { bookmarks: meta.bookmarks }).catch(() => {});
		bookmarkBtn.classList.add("flash");
		setTimeout(() => bookmarkBtn.classList.remove("flash"), 600);
		toast("Закладка добавлена");
	}

	function openNav(): void {
		const pctOf = (p: number) => (len > 1 ? (p / len) * 100 : 0);
		const posOut = h("output", {}, `${pctOf(pos).toFixed(1)}%`);
		const slider = h("input", { type: "range", min: 0, max: 1000, step: 1, value: Math.round(pctOf(pos) * 10), "aria-label": "Позиция в книге" });
		slider.addEventListener("input", () => {
			const p = Math.round((Number(slider.value) / 1000) * len);
			posOut.textContent = `${(Number(slider.value) / 10).toFixed(1)}% · ${snippetAt(p).slice(0, 40)}…`;
		});
		slider.addEventListener("change", () => seek(Math.round((Number(slider.value) / 1000) * len)));

		const tocList = h("div.toc-list");
		const current = currentChapter();
		if (chapters.length === 0) tocList.append(h("p.empty", {}, "В этой книге нет оглавления. Двигайся ползунком выше."));
		for (const c of chapters) {
			const btn = h("button.toc-item", { type: "button", style: `padding-left:${12 + c.level * 16}px` }, h("span", {}, c.title), h("small", {}, `${Math.round(pctOf(c.pos))}%`));
			if (c === current) btn.classList.add("current");
			btn.addEventListener("click", () => {
				seek(c.pos);
				close();
			});
			tocList.append(btn);
		}

		const marks = h("div.marks-list");
		const renderMarks = () => {
			marks.replaceChildren();
			if (meta.bookmarks.length === 0) {
				marks.append(h("p.empty", {}, "Закладок пока нет. Значок закладки сверху отмечает текущее место."));
				return;
			}
			for (const b of meta.bookmarks) {
				const ch = sortedChapters.filter((c) => c.pos <= b.pos).pop();
				marks.append(
					h(
						"div.mark",
						{},
						h("button.mark-go", { type: "button", onclick: () => (seek(b.pos), close()) }, h("span", {}, `${b.snippet}…`), h("small", {}, `${Math.round(pctOf(b.pos))}%${ch ? ` · ${ch.title}` : ""}`)),
						iconButton("trash", "Удалить закладку", () => {
							meta.bookmarks = meta.bookmarks.filter((x) => x.id !== b.id);
							updateBook(meta.id, { bookmarks: meta.bookmarks }).catch(() => {});
							renderMarks();
						}),
					),
				);
			}
		};
		renderMarks();

		const tabToc = h("button", { type: "button", role: "tab", "aria-selected": "true" }, "Оглавление");
		const tabMarks = h("button", { type: "button", role: "tab", "aria-selected": "false" }, `Закладки${meta.bookmarks.length ? ` · ${meta.bookmarks.length}` : ""}`);
		marks.hidden = true;
		const select = (toc: boolean) => {
			tabToc.setAttribute("aria-selected", String(toc));
			tabMarks.setAttribute("aria-selected", String(!toc));
			tocList.hidden = !toc;
			marks.hidden = toc;
		};
		tabToc.addEventListener("click", () => select(true));
		tabMarks.addEventListener("click", () => select(false));
		const body = h("div.nav", {}, h("label.row.range-row", {}, h("span.row-label", {}, "Позиция", posOut), slider), h("div.tabs", { role: "tablist" }, tabToc, tabMarks), h("div.panes", {}, tocList, marks));
		const close = openSheet("Навигация", body, () => focusInput());
		requestAnimationFrame(() => tocList.querySelector(".current")?.scrollIntoView({ block: "center" }));
	}

	function openTyperSettings(): void {
		openSettings(
			s,
			() => {
				app.saveSettings();
				const changedRules = opts.caseSensitive !== s.caseSensitive || opts.punctuation !== s.punctuation;
				opts.caseSensitive = s.caseSensitive;
				opts.punctuation = s.punctuation;
				if (changedRules) {
					pos = nextRequired(text, pos, opts);
					remaining = remainingRequired(text, pos, opts);
				}
				applyLook();
				renderWindow();
				updateStats();
			},
			() => focusInput(),
		);
	}

	function applyLook(): void {
		view.style.setProperty("--type-size", `${s.fontSize}px`);
		geometry();
	}

	// ---- клавиши поверх: начать печатать можно, не попадая в поле
	const onKey = (e: KeyboardEvent) => {
		if (document.querySelector(".sheet-backdrop")) return;
		if (e.key === "Escape") return app.goLibrary();
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		if (document.activeElement !== input && (e.key.length === 1 || e.key === "Enter")) focusInput();
		if (e.key === "Tab") e.preventDefault();
	};
	const onHide = () => {
		if (document.visibilityState === "hidden") save();
	};
	const onResize = () => {
		applyLook();
		place();
	};
	document.addEventListener("keydown", onKey);
	document.addEventListener("visibilitychange", onHide);
	window.addEventListener("pagehide", save);
	window.addEventListener("resize", onResize);

	applyLook();
	await document.fonts?.ready;
	renderWindow();
	updateStats();
	if (!matchMedia("(pointer: coarse)").matches) focusInput();
	refreshHint();
	updateBook(meta.id, { openedAt: Date.now() }).catch(() => {});

	return () => {
		save();
		if (hintTimer) clearTimeout(hintTimer);
		document.removeEventListener("keydown", onKey);
		document.removeEventListener("visibilitychange", onHide);
		window.removeEventListener("pagehide", save);
		window.removeEventListener("resize", onResize);
	};
}
