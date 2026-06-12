import { buildArchive, exportFileName } from '$lib/export/model/archive';
import type { ArchiveAvatar } from '$lib/export/model/archive';
import { ApiError, pgPost } from '$lib/shared/http/postgrest';

import type { ExportDocument } from '../model/types';

const TOMBSTONE_UID = '00000000-0000-0000-0000-000000000000';

// The export hub's state machine. `prepare()` calls the RPC, packages the
// result into the ZIP archive, and exposes it as a ready-to-download Blob;
// `download()` saves it; `reset()` returns to the start.
//
// The archive (data.json + data.html + READMEs + avatars) is built
// client-side. No server-side staging: the Blob lives in the tab's memory
// until reset or reload (docs/data-export.md § "Ready" / "What we don't do").

export type ExportStatus = 'idle' | 'packaging' | 'ready' | 'error';

export type ExportResult = {
	blob: Blob;
	fileName: string;
};

export const exportState = $state<{
	status: ExportStatus;
	result: ExportResult | null;
	error: string | null;
}>({
	status: 'idle',
	result: null,
	error: null
});

export async function prepare(): Promise<void> {
	exportState.status = 'packaging';
	exportState.error = null;
	exportState.result = null;
	try {
		const doc = await pgPost<ExportDocument>('/rpc/export_my_data', {});
		const avatars = await gatherAvatars(doc);
		const blob = await buildArchive(doc, avatars);
		exportState.result = { blob, fileName: exportFileName(doc) };
		exportState.status = 'ready';
	} catch (err) {
		exportState.error =
			err instanceof ApiError && err.message
				? err.message
				: 'We couldn’t prepare your download. Please try again.';
		exportState.status = 'error';
	}
}

// Gather avatar bytes best-effort: the caller's own picture as `avatar.webp`,
// and each distinct co-member's as `avatars/{uid}.webp`. Avatars are served
// publicly by Caddy (docs/avatars.md), so no auth header and no version
// cache-buster is needed — a one-shot fetch where "no picture" simply 404s.
// A missing or unreachable avatar is skipped, never fatal (R9).
async function gatherAvatars(doc: ExportDocument): Promise<ArchiveAvatar[]> {
	const callerId = doc.user.id;

	// Distinct co-member ids across list members and item authors, excluding
	// the caller (handled separately as avatar.webp) and the tombstone user.
	// A plain array + includes-dedup rather than a Set: this is a transient
	// local, not reactive state, and SvelteSet would be the wrong tool.
	const coMemberIds: string[] = [];
	const consider = (uid: string) => {
		if (uid !== callerId && uid !== TOMBSTONE_UID && !coMemberIds.includes(uid)) {
			coMemberIds.push(uid);
		}
	};
	for (const list of doc.lists) {
		for (const member of list.members) consider(member.id);
		for (const item of list.items) consider(item.created_by.id);
	}

	const targets = [
		{ uid: callerId, name: 'avatar.webp' },
		...coMemberIds.map((uid) => ({ uid, name: `avatars/${uid}.webp` }))
	];

	const settled = await Promise.all(targets.map((t) => fetchAvatar(t.uid, t.name)));
	return settled.filter((a): a is ArchiveAvatar => a !== null);
}

async function fetchAvatar(uid: string, name: string): Promise<ArchiveAvatar | null> {
	try {
		const res = await fetch(`/avatars/${uid}.webp`);
		if (!res.ok) return null;
		const bytes = new Uint8Array(await res.arrayBuffer());
		return { name, bytes };
	} catch {
		return null;
	}
}

export function download(): void {
	if (!exportState.result) return;
	const url = URL.createObjectURL(exportState.result.blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = exportState.result.fileName;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(url);
}

export function reset(): void {
	exportState.status = 'idle';
	exportState.result = null;
	exportState.error = null;
}
