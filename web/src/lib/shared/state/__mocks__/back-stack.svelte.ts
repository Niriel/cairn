import { vi } from 'vitest';

export const pushHistoryGuard = vi.fn((_onPop: () => void) => vi.fn());
