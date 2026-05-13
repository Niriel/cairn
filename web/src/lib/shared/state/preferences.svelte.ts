// The FONT_SCALE map and the localStorage keys ('cairn.theme', 'cairn.font_size')
// are duplicated in src/app.html's FOUC-prevent boot script. Keep them in sync —
// the boot script paints first, this module re-applies on hydration.

export type Theme = 'system' | 'light' | 'dark';

const FONT_SCALE = {
	xs: 0.85,
	s: 0.92,
	m: 1.0,
	l: 1.1,
	xl: 1.22
} as const;

export type FontSize = keyof typeof FONT_SCALE;

function readTheme(): Theme {
	const t = localStorage.getItem('cairn.theme');
	return t === 'light' || t === 'dark' || t === 'system' ? t : 'system';
}

function readFontSize(): FontSize {
	const f = localStorage.getItem('cairn.font_size');
	return f !== null && f in FONT_SCALE ? (f as FontSize) : 'm';
}

export const preferences = $state({
	theme: readTheme(),
	fontSize: readFontSize()
});

$effect.root(() => {
	$effect(() => {
		document.documentElement.dataset.theme = preferences.theme;
		localStorage.setItem('cairn.theme', preferences.theme);
	});
	$effect(() => {
		const scale = FONT_SCALE[preferences.fontSize];
		document.documentElement.style.setProperty('--font-size-scale', String(scale));
		localStorage.setItem('cairn.font_size', preferences.fontSize);
	});
});
