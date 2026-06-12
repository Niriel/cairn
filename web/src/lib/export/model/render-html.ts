// Pure renderers that turn the canonical export document (data.json) into the
// human-readable archive files. All three return strings and emit **no
// JavaScript** — data.html must work offline, open in any browser, and survive
// indefinitely (docs/data-export.md § "Format"). Every interpolated user string
// is HTML-escaped so a name or note can never inject markup into the archive.

import type { ExportDocument, ExportInvitation, ExportItem, ExportList } from './types';

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/** A muted caption citing the data.json path of a row, so the two correlate. */
function jsonPath(path: string): string {
	return `<span class="path">${escapeHtml(path)}</span>`;
}

function orDash(value: string | null): string {
	return value === null || value === '' ? '—' : escapeHtml(value);
}

function renderItem(item: ExportItem, path: string): string {
	const votes = item.all_votes
		? `<p class="votes">Votes: ${item.all_votes
				.map((v) => `${escapeHtml(v.user_display_name)} (${v.value})`)
				.join(', ')}</p>`
		: '';
	const yourVote = item.your_vote === null ? '—' : String(item.your_vote);
	const trashed = item.deleted_at ? ' <em>(in trash)</em>' : '';
	return `<li class="item">
  <h4>${escapeHtml(item.name)}${trashed} ${jsonPath(path)}</h4>
  <p class="notes">${orDash(item.notes)}</p>
  <p class="meta">Added by ${escapeHtml(item.created_by.display_name)} · your vote: ${yourVote}</p>
  ${votes}
</li>`;
}

function renderList(list: ExportList, index: number): string {
	const members = list.members.map((m) => escapeHtml(m.display_name)).join(', ');
	const items = list.items
		.map((item, j) => renderItem(item, `lists[${index}].items[${j}]`))
		.join('\n');
	const trashed = list.deleted_at ? ' <em>(in trash)</em>' : '';
	return `<section class="list">
  <h3>${escapeHtml(list.name)}${trashed} ${jsonPath(`lists[${index}]`)}</h3>
  <p class="desc">${orDash(list.description)}</p>
  <p class="meta">Members: ${members || '—'}</p>
  <ul class="items">
${items || '<li class="empty">No items.</li>'}
  </ul>
</section>`;
}

function renderInvitation(inv: ExportInvitation): string {
	const other = inv.invitee_display_name ?? inv.inviter_display_name;
	const who = other ? ` · ${escapeHtml(other)}` : '';
	return `<li>${escapeHtml(inv.list_name)}${who}</li>`;
}

function names(entries: { display_name: string }[]): string {
	return entries.map((e) => escapeHtml(e.display_name)).join(', ') || '—';
}

export function renderDataHtml(doc: ExportDocument): string {
	const u = doc.user;
	const lists = doc.lists.map((l, i) => renderList(l, i)).join('\n');
	const sent = doc.invitations_sent.map(renderInvitation).join('\n') || '<li>—</li>';
	const received = doc.invitations_received.map(renderInvitation).join('\n') || '<li>—</li>';

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Cairn data export — ${escapeHtml(u.display_name)}</title>
<style>
  body { font-family: Georgia, serif; max-width: 48rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; color: #1a1a1a; }
  h1 { font-size: 1.6rem; }
  h2 { margin-top: 2rem; border-bottom: 1px solid #ddd; padding-bottom: 0.25rem; }
  .path { font-family: monospace; font-size: 0.75rem; color: #888; }
  .meta, .notes, .desc, .votes { color: #555; font-size: 0.9rem; margin: 0.15rem 0; }
  ul { padding-left: 1.25rem; }
  .item { margin-bottom: 0.75rem; }
</style>
</head>
<body>
<h1>Cairn data export</h1>
<p>A copy of the data Cairn holds for ${escapeHtml(u.display_name)}, exported ${escapeHtml(doc.exported_at)}. The companion <code>data.json</code> is the canonical record; this page renders the same data for reading.</p>

<h2>Profile</h2>
<p class="meta">Display name: ${escapeHtml(u.display_name)}</p>
<p class="meta">E-mail: ${escapeHtml(u.email)}</p>
<p class="meta">Signed up: ${escapeHtml(u.signed_up_at)}</p>
<p class="meta">Invite policy: ${escapeHtml(u.invite_policy)}</p>
<p class="meta">Profile picture: ${u.has_avatar ? 'yes' : 'none'}</p>

<h2>Lists</h2>
${lists || '<p>—</p>'}

<h2>Circle</h2>
<p>${names(doc.circle)}</p>

<h2>Blocked</h2>
<p>${names(doc.blocked)}</p>

<h2>Invitations sent</h2>
<ul>
${sent}
</ul>

<h2>Invitations received</h2>
<ul>
${received}
</ul>
</body>
</html>`;
}

export function renderReadmeHtml(doc: ExportDocument): string {
	const name = escapeHtml(doc.user.display_name);
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>About this Cairn export</title>
<style>
  body { font-family: Georgia, serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; color: #1a1a1a; }
  code { font-family: monospace; }
</style>
</head>
<body>
<h1>Your Cairn data export</h1>
<p>This archive contains the data Cairn holds for ${name}, exported ${escapeHtml(doc.exported_at)}. Everything in it works offline — nothing here contacts Cairn.</p>
<h2>What's in this archive</h2>
<ul>
  <li><code>data.html</code> — this data as a page you can read in any browser.</li>
  <li><code>data.json</code> — the same data, machine-readable. This is the <strong>canonical</strong> record: if the two ever disagree, the JSON is authoritative.</li>
  <li><code>README.html</code> / <code>README.md</code> — this explanation, in two formats.</li>
  <li><code>avatar.webp</code> and <code>avatars/</code> — profile pictures, present only where one exists.</li>
</ul>
<p>The export is a personal copy, not a backup you can import back into Cairn.</p>
</body>
</html>`;
}

export function renderReadmeMarkdown(doc: ExportDocument): string {
	const name = doc.user.display_name;
	return `# Your Cairn data export

This archive contains the data Cairn holds for ${name}, exported ${doc.exported_at}.
Everything in it works offline — nothing here contacts Cairn.

## What's in this archive

- \`data.html\` — this data as a page you can read in any browser.
- \`data.json\` — the same data, machine-readable. This is the **canonical**
  record: if the two ever disagree, the JSON is authoritative.
- \`README.html\` / \`README.md\` — this explanation, in two formats.
- \`avatar.webp\` and \`avatars/\` — profile pictures, present only where one exists.

The export is a personal copy, not a backup you can import back into Cairn.
`;
}
