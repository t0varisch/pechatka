import {
	type Agg,
	byCategory,
	byDay,
	byFinger,
	byKeyCode,
	type ConfusionKind,
	confusionShares,
	cpmOf,
	type DayRec,
	errorWords,
	errRate,
	fastestKeys,
	MIN_KEY,
	type Ranked,
	slowBigrams,
	slowestKeys,
	type StatsDoc,
	topConfusions,
	totals,
	worstByErrors,
} from "../core/keystats";
import { CATEGORY_NAMES, type CharCategory, FINGER_NAMES, FINGER_ORDER, type Finger, keyRows, type Layout } from "../core/layouts";
import { getSessions, getStats, resetStats } from "../store";
import { formatDuration, h, iconButton, plural, toast } from "./dom";

const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits).replace(".", ",")}%`;
const charLabel = (ch: string) => (ch === " " ? "пробел" : `«${ch}»`);
/** Обработчики окна, которые снимаются при уходе со страницы. */
let disposers: (() => void)[] = [];
function onResize(fn: () => void): void {
	window.addEventListener("resize", fn);
	disposers.push(() => window.removeEventListener("resize", fn));
}

const KIND_NAMES: Record<ConfusionKind, string> = {
	shift: "регистр — Shift",
	layout: "не та раскладка",
	neighbor: "соседняя клавиша",
	other: "",
};

function section(title: string, ...children: (Node | null)[]): HTMLElement {
	return h("section.st-section", {}, h("h2", {}, title), ...children);
}

/** Строка списка с тонкой полосой величины. */
function barRow(label: string, value: string, share: number, note = ""): HTMLElement {
	return h(
		"div.st-row",
		{},
		h("span.st-label", {}, label, note ? h("small", {}, note) : null),
		h("span.st-bar", { "aria-hidden": "true" }, h("i", { style: `width:${Math.max(2, Math.min(100, share * 100))}%` })),
		h("span.st-value", {}, value),
	);
}

function rankedList(items: Ranked[], value: (a: Agg) => string, measure: (a: Agg) => number): HTMLElement {
	const max = Math.max(...items.map((i) => measure(i.agg)), 1e-9);
	return h("div.st-list", {}, ...items.map((i) => barRow(charLabel(i.label), value(i.agg), measure(i.agg) / max, `${i.agg.n + i.agg.err} наж.`)));
}

// ---------- график по дням ----------

/** Ровные деления шкалы: шаг 1, 2 или 5 × 10^k, от двух до пяти делений. */
function niceTicks(lo: number, hi: number): number[] {
	const mag = 10 ** Math.floor(Math.log10(hi - lo || 1));
	const steps = [5, 2, 1, 0.5, 0.2, 0.1].map((m) => m * mag);
	let best: number[] = [];
	for (const step of steps) {
		const out: number[] = [];
		for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(6)));
		best = out;
		if (out.length >= 2 && out.length <= 5) return out;
		if (out.length > 5) break;
	}
	return best;
}

function lineChart(days: DayRec[], get: (d: DayRec) => number, fmt: (v: number) => string, label: string): HTMLElement {
	const wrap = h("div.chart", { role: "img", "aria-label": label });
	const tip = h("div.chart-tip", { role: "status" });
	const draw = () => {
		const W = Math.max(260, wrap.clientWidth || 320);
		const H = 150;
		const pad = { l: 44, r: 40, t: 14, b: 24 };
		const vals = days.map(get);
		let lo = Math.min(...vals);
		let hi = Math.max(...vals);
		if (hi - lo < 1e-9) {
			lo -= 1;
			hi += 1;
		}
		const span = hi - lo;
		lo -= span * 0.15;
		hi += span * 0.15;
		const x = (i: number) => pad.l + (days.length === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (days.length - 1));
		const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
		const ticks = niceTicks(lo, hi);
		const NS = "http://www.w3.org/2000/svg";
		const svg = document.createElementNS(NS, "svg");
		svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
		svg.setAttribute("width", String(W));
		svg.setAttribute("height", String(H));
		let inner = "";
		for (const t of ticks) {
			inner += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}" class="grid"/>`;
			inner += `<text x="${pad.l - 8}" y="${y(t) + 4}" text-anchor="end" class="axis">${fmt(t)}</text>`;
		}
		const fmtDay = (d: string) => `${d.slice(8)}.${d.slice(5, 7)}`;
		inner += `<text x="${x(0)}" y="${H - 6}" text-anchor="${days.length === 1 ? "middle" : "start"}" class="axis">${fmtDay(days[0].day)}</text>`;
		if (days.length > 1) inner += `<text x="${x(days.length - 1)}" y="${H - 6}" text-anchor="end" class="axis">${fmtDay(days[days.length - 1].day)}</text>`;
		if (days.length > 1) inner += `<polyline class="line" points="${days.map((d, i) => `${x(i)},${y(get(d))}`).join(" ")}"/>`;
		days.forEach((d, i) => {
			inner += `<circle class="dot" cx="${x(i)}" cy="${y(get(d))}" r="4"/>`;
		});
		const last = days[days.length - 1];
		inner += `<text x="${x(days.length - 1) + 8}" y="${y(get(last)) + 4}" class="end-label">${fmt(get(last))}</text>`;
		// Зоны наведения шире точек
		const step = days.length > 1 ? (W - pad.l - pad.r) / (days.length - 1) : W;
		days.forEach((_, i) => {
			inner += `<rect class="hit" data-i="${i}" x="${x(i) - step / 2}" y="0" width="${step}" height="${H}"/>`;
		});
		inner += `<line class="cross" x1="0" x2="0" y1="${pad.t}" y2="${H - pad.b}" visibility="hidden"/>`;
		svg.innerHTML = inner;
		const cross = svg.querySelector(".cross") as SVGLineElement;
		const show = (i: number) => {
			const d = days[i];
			cross.setAttribute("x1", String(x(i)));
			cross.setAttribute("x2", String(x(i)));
			cross.setAttribute("visibility", "visible");
			tip.textContent = `${fmtDay(d.day)}: ${fmt(get(d))} · ${formatDuration(d.ms)} печати · ${d.correct.toLocaleString("ru")} знаков`;
		};
		svg.addEventListener("pointermove", (e) => {
			const r = (e.target as Element).closest(".hit");
			if (r) show(Number(r.getAttribute("data-i")));
		});
		svg.addEventListener("pointerleave", () => {
			cross.setAttribute("visibility", "hidden");
			tip.textContent = "";
		});
		wrap.replaceChildren(svg);
	};
	requestAnimationFrame(draw);
	onResize(draw);
	return h("div.chart-box", {}, h("h3", {}, label), wrap, tip);
}

// ---------- клавиатура-карта ----------

type Metric = "errors" | "speed";

function bucketFor(metric: Metric, a: Agg, medianMs: number): number {
	if (metric === "errors") {
		const r = errRate(a);
		return r < 0.01 ? 0 : r < 0.03 ? 1 : r < 0.06 ? 2 : r < 0.1 ? 3 : 4;
	}
	if (a.tn < 5 || !medianMs) return -1;
	const k = a.t / a.tn / medianMs;
	return k < 0.9 ? 0 : k < 1.1 ? 1 : k < 1.3 ? 2 : k < 1.6 ? 3 : 4;
}

const LEGENDS: Record<Metric, string[]> = {
	errors: ["до 1%", "1–3%", "3–6%", "6–10%", "больше 10%"],
	speed: ["быстрее обычного", "обычно", "на 10–30% медленнее", "на 30–60% медленнее", "в 1,6+ раза медленнее"],
};

function keyboard(doc: StatsDoc, layout: Layout): HTMLElement {
	const L = doc.layouts[layout];
	const stats = byKeyCode(L, layout);
	const timed = [...stats.values()].filter((a) => a.tn >= 5).map((a) => a.t / a.tn).sort((x, y) => x - y);
	const medianMs = timed.length ? timed[Math.floor(timed.length / 2)] : 0;
	let metric: Metric = "errors";
	const board = h("div.kb", { role: "group", "aria-label": "Клавиатура" });
	const detail = h("div.kb-detail", { role: "status" }, "Наведи или нажми на клавишу — покажу подробности.");
	const legend = h("div.kb-legend");
	const confusions = Object.entries(L.confusions);

	const describe = (code: string, label: string) => {
		const a = stats.get(code);
		if (!a || a.n + a.err === 0) return (detail.textContent = `${label}: пока нет нажатий.`);
		const chars = new Set(keyRows(layout).flat().filter((k) => k.code === code).flatMap((k) => [k.base, k.shift]));
		const wrong = confusions
			.filter(([k]) => chars.has(k.split("→")[0]))
			.sort((x, y) => y[1] - x[1])
			.slice(0, 3)
			.map(([k, n]) => `${charLabel(k.split("→")[1])} ${n}`);
		const speed = cpmOf(a);
		detail.textContent = `${label}: ${(a.n + a.err).toLocaleString("ru")} нажатий, ошибок ${pct(errRate(a))}${speed ? `, ${speed} зн/мин` : ""}${wrong.length ? `. Вместо неё жмёшь: ${wrong.join(", ")}` : ""}.`;
	};

	const render = () => {
		board.replaceChildren();
		const rows = keyRows(layout);
		const offsets = [0, 0.5, 0.75, 1.25];
		rows.forEach((row, r) => {
			const rowEl = h("div.kb-row", { style: `padding-left:calc(var(--u) * ${offsets[r]})` });
			for (const k of row) {
				const a = stats.get(k.code);
				const label = k.base.toUpperCase();
				const enough = a && a.n + a.err >= 5;
				const b = enough ? bucketFor(metric, a, medianMs) : -1;
				const key = h(`button.kb-key${b >= 0 ? `.b${b}` : ".nodata"}` as "button", { type: "button", "aria-label": `Клавиша ${label}` }, label);
				key.addEventListener("pointerenter", () => describe(k.code, `Клавиша ${label}`));
				key.addEventListener("click", () => describe(k.code, `Клавиша ${label}`));
				rowEl.append(key);
			}
			board.append(rowEl);
		});
		const space = stats.get("Space");
		const sb = space && space.n + space.err >= 5 ? bucketFor(metric, space, medianMs) : -1;
		const spaceKey = h(`button.kb-key.kb-space${sb >= 0 ? `.b${sb}` : ".nodata"}` as "button", { type: "button", "aria-label": "Пробел" }, "пробел");
		spaceKey.addEventListener("pointerenter", () => describe("Space", "Пробел"));
		spaceKey.addEventListener("click", () => describe("Space", "Пробел"));
		board.append(h("div.kb-row.kb-row-space", {}, spaceKey));
		legend.replaceChildren(...LEGENDS[metric].map((t, i) => h("span", {}, h(`i.b${i}` as "i"), t)), h("span", {}, h("i.nodata"), "мало данных"));
	};

	const fit = () => {
		const W = board.clientWidth || 320;
		const u = Math.min(46, Math.floor((W - 12 * 4) / 13.5));
		board.style.setProperty("--u", `${u}px`);
	};
	const toggle = h("div.segmented", { role: "radiogroup", "aria-label": "Что показать" });
	for (const [m, t] of [["errors", "Ошибки"], ["speed", "Скорость"]] as [Metric, string][]) {
		const b = h("button", { type: "button", role: "radio", "aria-checked": String(m === metric) }, t);
		b.addEventListener("click", () => {
			metric = m;
			for (const x of toggle.children) x.setAttribute("aria-checked", "false");
			b.setAttribute("aria-checked", "true");
			render();
		});
		toggle.append(b);
	}
	render();
	requestAnimationFrame(fit);
	onResize(fit);
	return h("div.kb-box", {}, toggle, board, legend, detail);
}

// ---------- выводы ----------

function summary(doc: StatsDoc, layout: Layout): HTMLElement | null {
	const L = doc.layouts[layout];
	const all = totals(L);
	if (all.n < 200) return null;
	const avgCpm = cpmOf(all, 20);
	const lines: string[] = [];
	const worst = worstByErrors(L, 1)[0];
	if (worst) lines.push(`Больше всего ошибок на ${charLabel(worst.label)} — ${pct(errRate(worst.agg))} нажатий (в среднем ${pct(errRate(all))}).`);
	const slow = slowestKeys(L, 1)[0];
	const slowCpm = slow && cpmOf(slow.agg);
	// Только если клавиша заметно медленнее средней, иначе это шум
	if (slow && slowCpm && avgCpm && slowCpm < avgCpm * 0.85) lines.push(`Медленнее всего ${charLabel(slow.label)} — ${slowCpm} зн/мин против ${avgCpm} в среднем.`);
	const conf = topConfusions(L, layout, 1)[0];
	if (conf) lines.push(`Чаще всего вместо ${charLabel(conf.expected)} жмёшь ${charLabel(conf.typed)} — ${conf.count} ${plural(conf.count, "раз", "раза", "раз")}${KIND_NAMES[conf.kind] ? ` (${KIND_NAMES[conf.kind]})` : ""}.`);
	const cats = byCategory(L);
	const lower = cats.lower;
	for (const c of ["upper", "punct", "digit"] as CharCategory[]) {
		const a = cats[c];
		if (a.n + a.err >= MIN_KEY && lower.n + lower.err >= MIN_KEY && errRate(a) - errRate(lower) > 0.02) {
			lines.push(`${CATEGORY_NAMES[c]}: точность ${pct(1 - errRate(a))} против ${pct(1 - errRate(lower))} у строчных букв.`);
		}
	}
	const fingers = byFinger(L, layout);
	const fWorst = FINGER_ORDER.filter((f) => fingers[f].n + fingers[f].err >= MIN_KEY * 3).sort((a, b) => errRate(fingers[b]) - errRate(fingers[a]))[0];
	if (fWorst && errRate(fingers[fWorst]) > 0) lines.push(`Слабее всего ${FINGER_NAMES[fWorst].toLowerCase()}: ${pct(errRate(fingers[fWorst]))} ошибок.`);
	const bg = slowBigrams(L, 1)[0];
	if (bg) lines.push(`Тяжелее всего даётся сочетание «${bg.label}» — ${cpmOf(bg.agg, 1)} зн/мин.`);
	if (!lines.length) return null;
	return section("Над чем поработать", h("ul.st-summary", {}, ...lines.map((l) => h("li", {}, l))));
}

function layoutBlock(doc: StatsDoc, layout: Layout): HTMLElement {
	const L = doc.layouts[layout];
	const all = totals(L);
	if (all.n + all.err < 50) {
		return h("p.empty", {}, layout === "ru" ? "В русской раскладке пока мало нажатий — попечатай русскую книгу." : "В английской раскладке пока мало нажатий — попечатай английскую книгу или текст.");
	}
	const parts: (HTMLElement | null)[] = [];
	parts.push(summary(doc, layout));
	parts.push(section("Клавиатура", keyboard(doc, layout)));

	const worst = worstByErrors(L);
	const slow = slowestKeys(L);
	const fast = fastestKeys(L);
	const conf = topConfusions(L, layout);
	const bigrams = slowBigrams(L);
	const words = errorWords(L);
	const need = Math.max(0, MIN_KEY * 10 - all.n);
	if (!worst.length && !slow.length) parts.push(h("p.empty", {}, `Для списков слабых клавиш нужно больше нажатий — ещё примерно ${need.toLocaleString("ru")} знаков.`));
	if (worst.length) parts.push(section("Больше всего ошибок", rankedList(worst, (a) => pct(errRate(a)), errRate)));
	if (slow.length) parts.push(section("Медленнее всего", rankedList(slow, (a) => `${cpmOf(a)} зн/мин`, (a) => a.t / a.tn)));
	if (conf.length) {
		const shares = confusionShares(L, layout);
		const total = Object.values(shares).reduce((x, y) => x + y, 0) || 1;
		const shareText = (["neighbor", "shift", "layout"] as ConfusionKind[])
			.filter((k) => shares[k] > 0)
			.map((k) => `${KIND_NAMES[k]} — ${pct(shares[k] / total, 0)}`)
			.join(", ");
		const max = conf[0].count;
		parts.push(
			section(
				"Что с чем путаешь",
				shareText ? h("p.st-note", {}, `Из всех ошибок: ${shareText}.`) : null,
				h("div.st-list", {}, ...conf.map((c) => barRow(`${charLabel(c.expected)} → ${charLabel(c.typed)}`, `${c.count} ${plural(c.count, "раз", "раза", "раз")}`, c.count / max, KIND_NAMES[c.kind]))),
			),
		);
	}
	if (bigrams.length) parts.push(section("Тяжёлые сочетания", rankedList(bigrams, (a) => `${cpmOf(a, 1)} зн/мин`, (a) => a.t / a.tn)));
	if (words.length) {
		const max = words[0].err;
		parts.push(section("Слова с ошибками", h("div.st-list", {}, ...words.map((w) => barRow(w.word, `${w.err} ош.`, w.err / max, `${w.n} раз`)))));
	}
	if (fast.length) parts.push(section("Получается быстро", rankedList(fast, (a) => `${cpmOf(a)} зн/мин`, (a) => 1 / (a.t / a.tn))));

	const cats = byCategory(L);
	const catRows = (Object.keys(CATEGORY_NAMES) as CharCategory[]).filter((c) => cats[c].n + cats[c].err > 0);
	parts.push(
		section(
			"По видам символов",
			h(
				"div.st-list",
				{},
				...catRows.map((c) => {
					const a = cats[c];
					const sp = cpmOf(a);
					return barRow(CATEGORY_NAMES[c], `${pct(1 - errRate(a))}${sp ? ` · ${sp} зн/мин` : ""}`, 1 - errRate(a), `${(a.n + a.err).toLocaleString("ru")} наж.`);
				}),
			),
		),
	);
	const fingers = byFinger(L, layout);
	const fRows = FINGER_ORDER.filter((f) => fingers[f].n + fingers[f].err > 0);
	const maxErr = Math.max(...fRows.map((f) => errRate(fingers[f])), 1e-9);
	parts.push(
		section(
			"По пальцам",
			h("p.st-note", {}, "Полоса — доля ошибок. Пальцы по правилам слепой печати."),
			h(
				"div.st-list",
				{},
				...fRows.map((f: Finger) => {
					const a = fingers[f];
					const sp = cpmOf(a);
					return barRow(FINGER_NAMES[f], `${pct(errRate(a))} ош.${sp ? ` · ${sp} зн/мин` : ""}`, errRate(a) / maxErr, `${(a.n + a.err).toLocaleString("ru")} наж.`);
				}),
			),
		),
	);
	return h("div", {}, ...parts.filter(Boolean));
}

export async function openStats(root: HTMLElement, goLibrary: () => void, startDrill: (layout: Layout) => void): Promise<() => void> {
	for (const d of disposers) d();
	disposers = [];
	const [doc, sessions] = await Promise.all([getStats(), getSessions()]);
	const days = byDay(sessions);
	const head = h("header.lib-head", {}, h("div", {}, h("h1", {}, "Статистика"), h("p.tagline", {}, "Что получается и над чем поработать")), iconButton("close", "К библиотеке", goLibrary));
	const body = h("div.stats-page");

	const week = days.filter((d) => Date.now() - new Date(d.day).getTime() < 7 * 864e5);
	const sum = (list: DayRec[]) => list.reduce((acc, d) => ({ ms: acc.ms + d.ms, correct: acc.correct + d.correct, errors: acc.errors + d.errors }), { ms: 0, correct: 0, errors: 0 });
	const w = sum(week);
	const allSum = sum(days);
	const tile = (label: string, value: string) => h("div.tile", {}, h("small", {}, label), h("b", {}, value));
	if (days.length) {
		body.append(
			h(
				"div.tiles",
				{},
				tile("Скорость за 7 дней", w.ms ? `${Math.round(w.correct / (w.ms / 60000))} зн/мин` : "—"),
				tile("Точность за 7 дней", w.correct + w.errors ? pct(w.correct / (w.correct + w.errors)) : "—"),
				tile("Всего напечатано", `${allSum.correct.toLocaleString("ru")} знаков`),
				tile("Время за печатью", formatDuration(allSum.ms)),
			),
		);
		if (days.length >= 2) {
			body.append(
				section(
					"По дням",
					lineChart(days.slice(-30), (d) => d.cpm, (v) => String(Math.round(v)), "Скорость, зн/мин"),
					lineChart(days.slice(-30), (d) => d.accuracy, (v) => `${Number(v.toFixed(1)).toString().replace(".", ",")}%`, "Точность"),
					h(
						"details.st-table",
						{},
						h("summary", {}, "Таблица по дням"),
						h(
							"table",
							{},
							h("thead", {}, h("tr", {}, h("th", {}, "День"), h("th", {}, "Время"), h("th", {}, "зн/мин"), h("th", {}, "Точность"))),
							h("tbody", {}, ...[...days].reverse().map((d) => h("tr", {}, h("td", {}, `${d.day.slice(8)}.${d.day.slice(5, 7)}`), h("td", {}, formatDuration(d.ms)), h("td", {}, String(d.cpm)), h("td", {}, `${d.accuracy.toFixed(1).replace(".", ",")}%`)))),
						),
					),
				),
			);
		} else {
			body.append(h("p.st-note", {}, "График по дням появится, когда будет хотя бы два дня печати."));
		}
	} else {
		body.append(h("p.empty", {}, "Попечатай пару минут — здесь появятся скорость, ошибки и слабые клавиши."));
	}

	const ruN = totals(doc.layouts.ru).n;
	const enN = totals(doc.layouts.en).n;
	let layout: Layout = enN > ruN ? "en" : "ru";
	const drillButton = () =>
		h("div.st-drill", {}, h("button.primary", { type: "button", onclick: () => startDrill(layout) }, "Поработать над недостатками"), h("small", {}, "Урок из слабых букв этой раскладки"));
	const layoutHost = h("div");
	const switcher = h("div.segmented.layout-switch", { role: "radiogroup", "aria-label": "Раскладка" });
	for (const [l, t] of [["ru", `Русская · ${ruN.toLocaleString("ru")}`], ["en", `Английская · ${enN.toLocaleString("ru")}`]] as [Layout, string][]) {
		const b = h("button", { type: "button", role: "radio", "aria-checked": String(l === layout) }, t);
		b.addEventListener("click", () => {
			layout = l;
			for (const x of switcher.children) x.setAttribute("aria-checked", "false");
			b.setAttribute("aria-checked", "true");
			layoutHost.replaceChildren(layoutBlock(doc, layout), drillButton());
		});
		switcher.append(b);
	}
	if (ruN + enN > 0) {
		body.append(h("div.layout-head", {}, h("span.st-note", {}, "Раскладка (число верных нажатий)"), switcher), layoutHost);
		layoutHost.replaceChildren(layoutBlock(doc, layout), drillButton());
	}

	const since = new Date(doc.since).toLocaleDateString("ru");
	const reset = h("button.secondary", { type: "button" }, "Сбросить статистику");
	reset.addEventListener("click", async () => {
		if (!confirm("Стереть всю статистику печати? Книги и места в них останутся.")) return;
		await resetStats();
		toast("Статистика сброшена");
		goLibrary();
	});
	body.append(h("footer.st-foot", {}, h("p.fineprint", {}, `Подробная статистика собирается с ${since}. Хранится только на этом устройстве.`), reset));

	root.replaceChildren(h("div.library.stats-root", {}, head, body));
	return () => {
		for (const d of disposers) d();
		disposers = [];
	};
}
