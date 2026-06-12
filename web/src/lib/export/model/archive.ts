// Archive assembly: turn the canonical export document into the downloadable
// ZIP. One module owns the filename convention and the entry layout so the
// state machine just calls buildArchive() and hands the Blob to the browser.
// The ZIP is assembled entirely client-side (docs/data-export.md § "How the
// export is produced") — no server staging.

import JSZip from 'jszip';

import { renderDataHtml, renderReadmeHtml, renderReadmeMarkdown } from './render-html';
import type { ExportDocument } from './types';

/** A co-member or own avatar to embed at `name` within the archive. */
export type ArchiveAvatar = {
	name: string;
	bytes: Uint8Array;
};

/**
 * `cairn-export-{yyyymmdd}-{shortid}.zip`. The date is derived from the
 * document's `exported_at` (kept pure — no clock read here); the short id is a
 * little random salt so two same-day exports don't collide in a downloads
 * folder.
 */
export function exportFileName(doc: ExportDocument): string {
	const date = doc.exported_at.slice(0, 10).replace(/-/g, '');
	const shortid = Math.random().toString(36).slice(2, 8);
	return `cairn-export-${date}-${shortid}.zip`;
}

/**
 * Assemble the archive: the canonical `data.json`, its `data.html` rendering,
 * the two READMEs, and any supplied avatar entries. Returns a Blob ready for a
 * browser download.
 */
export function buildArchive(doc: ExportDocument, avatars: ArchiveAvatar[]): Promise<Blob> {
	const zip = new JSZip();
	zip.file('data.json', JSON.stringify(doc, null, 2));
	zip.file('data.html', renderDataHtml(doc));
	zip.file('README.html', renderReadmeHtml(doc));
	zip.file('README.md', renderReadmeMarkdown(doc));
	for (const avatar of avatars) {
		zip.file(avatar.name, avatar.bytes);
	}
	return zip.generateAsync({ type: 'blob' });
}
