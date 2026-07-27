// Controllable stand-in for the real `install` store. A `$state` object so a
// consumer test can flip `canPrompt` / `isStandalone` / `isIos` /
// `hintDismissed` and assert re-renders; the actions are spies.

import { vi } from 'vitest';

export const install = $state<{
	canPrompt: boolean;
	isStandalone: boolean;
	isIos: boolean;
	hintDismissed: boolean;
	promptInstall: () => Promise<void>;
	dismissHint: () => void;
}>({
	canPrompt: false,
	isStandalone: false,
	isIos: false,
	hintDismissed: false,
	promptInstall: vi.fn(async (): Promise<void> => {}),
	dismissHint: vi.fn((): void => {})
});
