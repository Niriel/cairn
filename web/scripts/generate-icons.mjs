// Rasterizes static/icons/icon.svg (the single master) into the PWA install
// icon set. Run with `pnpm gen:icons`. The outputs are committed under
// static/icons/ — reproducible from this script, not generated at build time.
//
// Field colour is the computed sRGB hex of the light --paper token; it must
// match icon.svg's field so the extended/flattened padding is seamless. See
// Task 2.1 Decisions for why the icons carry hex literals rather than tokens.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const iconsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'icons');
const master = readFileSync(join(iconsDir, 'icon.svg'));

// Light --paper, oklch(98% 0.012 85) -> sRGB.
const PAPER = '#fcf8f0';

/**
 * @param {number} size
 * @param {string} out
 * @param {{ maskable?: boolean }} [opts]
 */
async function render(size, out, { maskable = false } = {}) {
	let img;
	if (maskable) {
		// Android's maskable safe zone clips the outer ~10% on each edge, so
		// inset the glyph to ~80% of the tile and pad the rest with paper.
		const inner = Math.round(size * 0.8);
		const pad = Math.round((size - inner) / 2);
		img = sharp(master)
			.resize(inner, inner)
			.flatten({ background: PAPER })
			.extend({
				top: pad,
				bottom: size - inner - pad,
				left: pad,
				right: size - inner - pad,
				background: PAPER
			});
	} else {
		// flatten() drops the alpha channel: iOS composites any transparency
		// onto black, so apple-touch (and the rest) must be fully opaque.
		img = sharp(master).resize(size, size).flatten({ background: PAPER });
	}
	await img.png().toFile(join(iconsDir, out));
	console.log('wrote', out, `(${size}x${size}${maskable ? ', maskable' : ''})`);
}

await render(192, 'icon-192.png');
await render(512, 'icon-512.png');
await render(512, 'icon-512-maskable.png', { maskable: true });
await render(180, 'apple-touch-icon-180.png');
