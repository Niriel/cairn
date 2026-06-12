import { vi } from 'vitest';

import type { ExportResult, ExportStatus } from '../export.svelte';

export const exportState = $state<{
	status: ExportStatus;
	result: ExportResult | null;
	error: string | null;
}>({
	status: 'idle',
	result: null,
	error: null
});

export const prepare = vi.fn(async (): Promise<void> => {});
export const download = vi.fn((): void => {});
export const reset = vi.fn((): void => {});
