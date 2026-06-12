import JSZip from 'jszip';
import { describe, expect, test } from 'vitest';

import { buildArchive, exportFileName } from './archive';
import type { ExportDocument } from './types';

function makeDoc(): ExportDocument {
	return {
		exported_at: '2026-06-12T10:00:00Z',
		schema_version: 1,
		user: {
			id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			email: 'alice@test',
			display_name: 'Alice',
			signed_up_at: '2025-11-03T09:14:22Z',
			invite_policy: 'circle',
			has_avatar: false
		},
		lists: [
			{
				id: '11111111-1111-1111-1111-111111111111',
				name: 'Movies for Alice',
				description: null,
				created_at: '2026-01-01T00:00:00Z',
				deleted_at: null,
				members: [{ id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', display_name: 'Bob' }],
				items: []
			}
		],
		circle: [{ display_name: 'Bob' }],
		blocked: [],
		invitations_sent: [],
		invitations_received: []
	};
}

describe('exportFileName', () => {
	test('(a) matches the cairn-export-<date>-<shortid>.zip shape', () => {
		expect(exportFileName(makeDoc())).toMatch(/^cairn-export-\d{8}-[a-z0-9]+\.zip$/);
	});

	test('(b) embeds the exported_at date', () => {
		expect(exportFileName(makeDoc())).toContain('cairn-export-20260612-');
	});
});

describe('buildArchive', () => {
	test('(c) contains exactly the four base files when no avatars are supplied', async () => {
		const blob = await buildArchive(makeDoc(), []);
		const zip = await JSZip.loadAsync(blob);
		const names = Object.keys(zip.files).sort();
		expect(names).toEqual(['README.html', 'README.md', 'data.html', 'data.json'].sort());
	});

	test('(d) data.json round-trips back to the input document', async () => {
		const doc = makeDoc();
		const blob = await buildArchive(doc, []);
		const zip = await JSZip.loadAsync(blob);
		const text = await zip.file('data.json')!.async('string');
		expect(JSON.parse(text)).toEqual(doc);
	});

	test('(e) includes supplied avatar entries', async () => {
		const blob = await buildArchive(makeDoc(), [
			{ name: 'avatar.webp', bytes: new Uint8Array([1, 2, 3]) },
			{ name: 'avatars/bbbbbbbb.webp', bytes: new Uint8Array([4, 5]) }
		]);
		const zip = await JSZip.loadAsync(blob);
		expect(zip.file('avatar.webp')).not.toBeNull();
		expect(zip.file('avatars/bbbbbbbb.webp')).not.toBeNull();
	});
});
