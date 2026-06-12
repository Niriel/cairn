import { buildArchive, exportFileName } from '$lib/export/model/archive';
import { ApiError, pgPost } from '$lib/shared/http/postgrest';

import type { ExportDocument } from '../model/types';

// The export hub's state machine. `prepare()` calls the RPC, packages the
// result into the ZIP archive, and exposes it as a ready-to-download Blob;
// `download()` saves it; `reset()` returns to the start.
//
// The archive (data.json + data.html + READMEs, avatars added in Phase 4) is
// built client-side. No server-side staging: the Blob lives in the tab's
// memory until reset or reload (docs/data-export.md § "Ready" / "What we
// don't do").

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
		const blob = await buildArchive(doc, []);
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
