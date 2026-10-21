import "./styles.css";
import { registerSW } from "virtual:pwa-register";
import type { Layout } from "./core/layouts";
import { prepareDrill } from "./drill-source";
import { applyTheme, loadSettings, saveSettings, watchSystemTheme } from "./settings";
import { askPersist } from "./store";
import { toast } from "./ui/dom";
import { openLibrary } from "./ui/library";
import { openStats } from "./ui/stats";
import { openTyper } from "./ui/typer";

const root = document.getElementById("app") as HTMLElement;
const settings = loadSettings();
let cleanup: (() => void) | null = null;
let routeSeq = 0;

applyTheme(settings);
watchSystemTheme(() => settings);
// Просим браузер не вычищать книги из IndexedDB (на iPhone без этого Safari может удалить данные)
askPersist();

function persist(): void {
	saveSettings(settings);
	applyTheme(settings);
}

async function route(): Promise<void> {
	const seq = ++routeSeq;
	cleanup?.();
	cleanup = null;
	const hash = location.hash;
	const book = hash.match(/^#\/type\/(.+)$/);
	const drill = hash.match(/^#\/drill\/(ru|en)/);
	const goLibrary = () => (location.hash = "#/");
	const openStatsPage = () => (location.hash = "#/stats");
	// Новый урок — новый адрес, чтобы сработала смена страницы
	const startDrill = (layout: Layout) => (location.hash = `#/drill/${layout}/${Date.now()}`);
	const typerCtx = { settings, saveSettings: persist, goLibrary, openStats: openStatsPage, nextLesson: startDrill };
	try {
		const done =
			hash === "#/stats"
				? await openStats(root, goLibrary, startDrill)
				: drill
					? await openTyper(root, "drill", typerCtx, await prepareDrill(drill[1] as Layout))
					: book
						? await openTyper(root, decodeURIComponent(book[1]), typerCtx)
						: await openLibrary(root, {
								settings,
								saveSettings: persist,
								onSettingsChange: () => applyTheme(settings),
								openBook: (id) => (location.hash = `#/type/${encodeURIComponent(id)}`),
								openStats: openStatsPage,
								startDrill,
							});
		if (seq === routeSeq) cleanup = done;
		else done();
	} catch (e) {
		console.error(e);
		toast("Что-то сломалось. Обнови страницу.", 5000);
	}
}

window.addEventListener("hashchange", route);
route();

try {
	registerSW({ immediate: true });
} catch {
	/* без офлайна тоже работает */
}
