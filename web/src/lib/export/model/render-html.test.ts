import { describe, expect, test } from 'vitest';

import { renderDataHtml, renderReadmeHtml, renderReadmeMarkdown } from './render-html';
import type { ExportDocument } from './types';

function makeDoc(overrides: Partial<ExportDocument> = {}): ExportDocument {
	return {
		exported_at: '2026-06-12T10:00:00Z',
		schema_version: 1,
		user: {
			id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			username: 'alice',
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
				items: [
					{
						id: '33333333-3333-3333-3333-333333333333',
						name: 'Bringing Up Baby',
						notes: 'a screwball classic',
						created_by: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', display_name: 'Alice' },
						created_at: '2026-01-02T00:00:00Z',
						deleted_at: null,
						your_vote: 2,
						all_votes: [
							{ user_display_name: 'Alice', value: 2 },
							{ user_display_name: 'Bob', value: 3 }
						]
					}
				]
			}
		],
		circle: [{ display_name: 'Bob' }],
		blocked: [{ display_name: 'Carol' }],
		invitations_sent: [
			{
				list_id: '11111111-1111-1111-1111-111111111111',
				list_name: 'Movies for Alice',
				created_at: '2026-01-04T00:00:00Z',
				invitee_display_name: 'Carol'
			}
		],
		invitations_received: [
			{
				list_id: '88888888-8888-8888-8888-888888888888',
				list_name: "Bob's books",
				created_at: '2026-01-05T00:00:00Z',
				inviter_display_name: 'Bob'
			}
		],
		...overrides
	};
}

describe('renderDataHtml', () => {
	test('(a) renders the user display name plus a list and item name', () => {
		const html = renderDataHtml(makeDoc());
		expect(html).toContain('Alice');
		expect(html).toContain('Movies for Alice');
		expect(html).toContain('Bringing Up Baby');
	});

	test('(b) contains no <script>', () => {
		const html = renderDataHtml(makeDoc());
		expect(html).not.toContain('<script');
	});

	test('(c) HTML-escapes interpolated user text', () => {
		const html = renderDataHtml(
			makeDoc({
				user: {
					id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
					username: 'alice',
					display_name: 'Alice <b>injected</b>',
					signed_up_at: '2025-11-03T09:14:22Z',
					invite_policy: 'circle',
					has_avatar: false
				}
			})
		);
		expect(html).not.toContain('<b>injected</b>');
		expect(html).toContain('Alice &lt;b&gt;injected&lt;/b&gt;');
	});

	test('(d) cites the JSON path so HTML rows correlate to data.json', () => {
		const html = renderDataHtml(makeDoc());
		expect(html).toContain('lists[0].items[0]');
	});

	test('(d2) renders the username as @handle and never the synthetic e-mail', () => {
		const html = renderDataHtml(makeDoc());
		expect(html).toContain('@alice');
		expect(html).not.toContain('@cairn.internal');
		expect(html).not.toContain('E-mail:');
	});
});

describe('renderReadmeHtml', () => {
	test('(e) names data.json and the user, with no <script>', () => {
		const html = renderReadmeHtml(makeDoc());
		expect(html).toContain('data.json');
		expect(html).toContain('Alice');
		expect(html).not.toContain('<script');
	});

	test('(f) escapes the user display name', () => {
		const html = renderReadmeHtml(
			makeDoc({
				user: {
					id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
					username: 'alice',
					display_name: '<b>x</b>',
					signed_up_at: '2025-11-03T09:14:22Z',
					invite_policy: 'circle',
					has_avatar: false
				}
			})
		);
		expect(html).not.toContain('<b>x</b>');
	});
});

describe('renderReadmeMarkdown', () => {
	test('(g) names data.json and the user', () => {
		const md = renderReadmeMarkdown(makeDoc());
		expect(md).toContain('data.json');
		expect(md).toContain('Alice');
	});
});
