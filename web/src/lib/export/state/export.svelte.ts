import { ApiError, pgPost } from '$lib/shared/http/postgrest';

import type { ExportDocument } from '../model/types';

// The export hub's state machine. `prepare()` calls the RPC and packages
// the result; `download()` saves it; `reset()` returns to the start.
//
// This first slice downloads `data.json` directly — the raw RPC document,
// pretty-printed. Phase 3 swaps the Blob builder for the real ZIP (HTML +
// README + data.json + avatars) without changing this state surface.
//
// No server-side staging: the Blob lives in the tab's memory until reset or
// reload (docs/data-export.md § "Ready" / "What we don't do").

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
		const json = JSON.stringify(doc, null, 2);
		exportState.result = {
			blob: new Blob([json], { type: 'application/json' }),
			fileName: 'data.json'
		};
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
