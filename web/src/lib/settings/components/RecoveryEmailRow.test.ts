import { fireEvent } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';
import { setRecoveryEmail, removeRecoveryEmail } from '$lib/auth/model/auth-client';
import { userSettings } from '$lib/privacy/state/user-settings.svelte';

import RecoveryEmailRow from './RecoveryEmailRow.svelte';

vi.mock('$lib/basic/components/Icon.svelte');
vi.mock('$lib/privacy/state/user-settings.svelte');
vi.mock('$lib/auth/model/auth-client', () => ({
	setRecoveryEmail: vi.fn(async () => {}),
	removeRecoveryEmail: vi.fn(async () => {})
}));

beforeEach(() => {
	userSettings.recoveryEmail = null;
});

afterEach(() => {
	vi.clearAllMocks();
});

describe('RecoveryEmailRow', () => {
	test('with no recovery e-mail, shows the Add affordance and no address', () => {
		const { queryByDataTest } = render(RecoveryEmailRow);
		expect(queryByDataTest('recovery-email-add')).not.toBeNull();
		expect(queryByDataTest('recovery-email-address')).toBeNull();
	});

	test('with a recovery e-mail set, shows the address with Change and Remove', () => {
		userSettings.recoveryEmail = 'alice@example.test';
		const { getByDataTest, queryByDataTest } = render(RecoveryEmailRow);
		expect(getByDataTest('recovery-email-address').textContent).toContain('alice@example.test');
		expect(queryByDataTest('recovery-email-change')).not.toBeNull();
		expect(queryByDataTest('recovery-email-remove')).not.toBeNull();
		expect(queryByDataTest('recovery-email-add')).toBeNull();
	});

	test('clicking Add reveals the e-mail field', async () => {
		const { getByDataTest, queryByDataTest } = render(RecoveryEmailRow);
		await fireEvent.click(getByDataTest('recovery-email-add'));
		expect(queryByDataTest('recovery-email-input')).not.toBeNull();
	});

	test('submitting an address calls setRecoveryEmail and advances to the code step', async () => {
		const { getByDataTest, queryByDataTest } = render(RecoveryEmailRow);
		await fireEvent.click(getByDataTest('recovery-email-add'));
		const input = getByDataTest('recovery-email-input') as HTMLInputElement;
		await fireEvent.input(input, { target: { value: 'alice@example.test' } });
		await fireEvent.click(getByDataTest('recovery-email-submit'));
		expect(vi.mocked(setRecoveryEmail)).toHaveBeenCalledWith('alice@example.test');
		// The code-entry step (RecoveryEmailVerify) is now mounted.
		expect(queryByDataTest('recovery-email-code')).not.toBeNull();
	});

	test('clicking Remove calls removeRecoveryEmail and returns to the Add affordance', async () => {
		userSettings.recoveryEmail = 'alice@example.test';
		const { getByDataTest, queryByDataTest } = render(RecoveryEmailRow);
		await fireEvent.click(getByDataTest('recovery-email-remove'));
		expect(vi.mocked(removeRecoveryEmail)).toHaveBeenCalledTimes(1);
		// State cleared → the empty-state affordance is back.
		expect(queryByDataTest('recovery-email-add')).not.toBeNull();
		expect(queryByDataTest('recovery-email-address')).toBeNull();
	});
});
