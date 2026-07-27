import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

// Root-anchored reads: vitest runs with cwd = web/, so the static manifest and
// app.html live at these fixed paths. These are the shipped artefacts, not
// fixtures — the test asserts the real files a browser will fetch.
const manifestPath = resolve(process.cwd(), 'static/manifest.webmanifest');
const appHtmlPath = resolve(process.cwd(), 'src/app.html');

const HEX = /^#[0-9a-fA-F]{6}$/;

type Manifest = {
	display: string;
	start_url: string;
	scope: string;
	theme_color: string;
	background_color: string;
	icons: { src: string; sizes: string; type: string; purpose?: string }[];
};

describe('manifest.webmanifest', () => {
	const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;

	test('declares a standalone, root-scoped installable app', () => {
		expect(manifest.display).toBe('standalone');
		expect(manifest.start_url).toBe('/');
		expect(manifest.scope).toBe('/');
	});

	test('ships a maskable icon alongside the any-purpose icons', () => {
		const maskable = manifest.icons.filter((i) =>
			(i.purpose ?? '').split(/\s+/).includes('maskable')
		);
		expect(maskable.length).toBeGreaterThanOrEqual(1);
	});

	test('theme and background colours are #-hex literals', () => {
		expect(manifest.theme_color).toMatch(HEX);
		expect(manifest.background_color).toMatch(HEX);
	});
});

describe('app.html PWA chrome', () => {
	const html = readFileSync(appHtmlPath, 'utf8');

	test('links the manifest', () => {
		expect(html).toMatch(/<link\s+rel="manifest"\s+href="\/manifest\.webmanifest"\s*\/?>/);
	});

	test('declares a light and a dark theme-color media meta', () => {
		expect(html).toMatch(
			/<meta\s+name="theme-color"\s+media="\(prefers-color-scheme:\s*light\)"\s+content="#[0-9a-fA-F]{6}"\s*\/?>/
		);
		expect(html).toMatch(
			/<meta\s+name="theme-color"\s+media="\(prefers-color-scheme:\s*dark\)"\s+content="#[0-9a-fA-F]{6}"\s*\/?>/
		);
	});
});
