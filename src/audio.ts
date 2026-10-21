// Звук клавиш: тихий щелчок на верное нажатие, глухой низкий — на ошибку.

let ctx: AudioContext | null = null;

/** Вызывать из обработчика нажатия: браузеры запускают звук только после жеста. */
export function unlockAudio(): void {
	try {
		const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
		if (session && session.type !== "playback") session.type = "playback";
	} catch {
		/* старые браузеры */
	}
	try {
		if (ctx && ctx.state === "closed") ctx = null;
		if (!ctx) {
			const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
			if (!C) return;
			ctx = new C();
		}
		if (ctx.state !== "running") ctx.resume().catch(() => {});
	} catch {
		ctx = null;
	}
}

function beep(freq: number, dur: number, volume: number, type: OscillatorType): void {
	const c = ctx;
	if (!c || c.state !== "running") return;
	try {
		const now = c.currentTime;
		const osc = c.createOscillator();
		const gain = c.createGain();
		osc.connect(gain);
		gain.connect(c.destination);
		osc.type = type;
		osc.frequency.setValueAtTime(freq, now);
		gain.gain.setValueAtTime(volume, now);
		gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
		osc.start(now);
		osc.stop(now + dur);
	} catch {
		/* звук не критичен */
	}
}

export function keyClick(): void {
	beep(1500, 0.012, 0.03, "triangle");
}

export function errorSound(): void {
	beep(140, 0.09, 0.07, "square");
}
