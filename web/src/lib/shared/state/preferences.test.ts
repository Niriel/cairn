import { tick } from 'svelte';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { preferences } from './preferences.svelte';

describe('preferences', () => {
	beforeEach(async () => {
		preferences.theme = 'system';
		preferences.fontSize = 'm';
		await tick();
		localStorage.clear();
		document.documentElement.removeAttribute('data-theme');
		document.documentElement.style.removeProperty('--font-size-scale');
	});

	test('defaults to system theme and medium font-size when localStorage is empty', () => {
		expect(preferences.theme).toBe('system');
		expect(preferences.fontSize).toBe('m');
	});

	test('reads existing localStorage values at module load', async () => {
		localStorage.setItem('cairn.theme', 'dark');
		localStorage.setItem('cairn.font_size', 'l');
		vi.resetModules();
		const fresh = await import('./preferences.svelte');
		expect(fresh.preferences.theme).toBe('dark');
		expect(fresh.preferences.fontSize).toBe('l');
	});

	test('assigning theme writes data-theme on documentElement', async () => {
		preferences.theme = 'dark';
		await tick();
		expect(document.documentElement.dataset.theme).toBe('dark');
	});

	test('assigning fontSize writes --font-size-scale on :root', async () => {
		preferences.fontSize = 'l';
		await tick();
		expect(document.documentElement.style.getPropertyValue('--font-size-scale')).toBe('1.1');
	});

	test('assigning theme persists to localStorage', async () => {
		preferences.theme = 'dark';
		await tick();
		expect(localStorage.getItem('cairn.theme')).toBe('dark');
	});
});
