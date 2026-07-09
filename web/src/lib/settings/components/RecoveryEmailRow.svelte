<script lang="ts">
	import { removeRecoveryEmail, setRecoveryEmail } from '$lib/auth/model/auth-client';
	import Button from '$lib/basic/components/Button.svelte';
	import Label from '$lib/basic/components/Label.svelte';
	import TextInput from '$lib/basic/components/TextInput.svelte';
	import { userSettings } from '$lib/privacy/state/user-settings.svelte';

	import RecoveryEmailVerify from './RecoveryEmailVerify.svelte';

	// Client-held flow state; the on-file address lives in userSettings (read in
	// 3.1, written through the BFF here). 'idle' shows either the add affordance
	// or the current address; 'editing' shows the field; 'verifying' hands off to
	// RecoveryEmailVerify with the just-submitted candidate address.
	type Mode = 'idle' | 'editing' | 'verifying';
	let mode = $state<Mode>('idle');

	let email = $state('');
	let emailValid = $state(false);
	let submitting = $state(false);
	let pendingEmail = $state('');
	let error = $state<string | null>(null);

	const SERVER_ERROR_MESSAGE = "Couldn't reach the server. Try again.";

	function startEditing() {
		email = '';
		emailValid = false;
		error = null;
		mode = 'editing';
	}

	function cancel() {
		mode = 'idle';
		error = null;
	}

	function onEmailInput(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		email = target.value;
		emailValid = target.validity.valid && target.value.length > 0;
	}

	async function onSubmit(event: Event) {
		event.preventDefault();
		if (!emailValid || submitting) return;
		submitting = true;
		error = null;
		try {
			await setRecoveryEmail(email);
			pendingEmail = email;
			mode = 'verifying';
		} catch {
			error = SERVER_ERROR_MESSAGE;
		} finally {
			submitting = false;
		}
	}

	function onConfirmed() {
		userSettings.recoveryEmail = pendingEmail;
		mode = 'idle';
	}

	async function remove() {
		if (submitting) return;
		submitting = true;
		error = null;
		try {
			await removeRecoveryEmail();
			userSettings.recoveryEmail = null;
		} catch {
			error = SERVER_ERROR_MESSAGE;
		} finally {
			submitting = false;
		}
	}
</script>

<div class="recovery-email">
	{#if mode === 'verifying'}
		<RecoveryEmailVerify email={pendingEmail} {onConfirmed} />
	{:else if mode === 'editing'}
		<form class="edit" onsubmit={onSubmit}>
			<div class="field">
				<Label for="recovery-email-input">Recovery e-mail</Label>
				<TextInput
					type="email"
					id="recovery-email-input"
					bind:value={email}
					required
					autocomplete="email"
					inputmode="email"
					data-test="recovery-email-input"
					oninput={onEmailInput}
				/>
			</div>
			{#if error}
				<div class="inline-error" data-test="recovery-email-error">{error}</div>
			{/if}
			<div class="edit-actions">
				<Button
					variant="rect"
					tone="ink"
					type="button"
					data-test="recovery-email-cancel"
					onclick={cancel}
				>
					Cancel
				</Button>
				<Button
					variant="rect"
					tone="primary"
					type="submit"
					disabled={!emailValid || submitting}
					data-test="recovery-email-submit"
				>
					Send code
				</Button>
			</div>
		</form>
	{:else if userSettings.recoveryEmail}
		<div class="set-row">
			<span class="address" data-test="recovery-email-address">{userSettings.recoveryEmail}</span>
			<div class="set-actions">
				<Button
					variant="pill"
					tone="ink"
					size="sm"
					type="button"
					data-test="recovery-email-change"
					onclick={startEditing}
				>
					Change
				</Button>
				<Button
					variant="pill"
					tone="destructive"
					size="sm"
					type="button"
					disabled={submitting}
					data-test="recovery-email-remove"
					onclick={remove}
				>
					Remove
				</Button>
			</div>
		</div>
		{#if error}
			<div class="inline-error" data-test="recovery-email-error">{error}</div>
		{/if}
	{:else}
		<Button
			variant="text"
			tone="ink"
			leadingIcon="plus"
			type="button"
			data-test="recovery-email-add"
			onclick={startEditing}
		>
			Add recovery e-mail
		</Button>
		<p class="caption help">
			Store a recovery e-mail to reset your password if you forget it. You'll need to verify it
			first.
		</p>
		{#if error}
			<div class="inline-error" data-test="recovery-email-error">{error}</div>
		{/if}
	{/if}
</div>

<style>
	.recovery-email {
		display: flex;
		flex-direction: column;
	}

	.help {
		padding: 0 1.125rem 0.5rem;
	}

	.set-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.75rem 1.125rem;
	}

	.address {
		color: var(--ink);
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.set-actions {
		display: flex;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.edit {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0.5rem 1.125rem 0.75rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.edit-actions {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.inline-error {
		padding: 0 1.125rem 0.5rem;
		color: var(--ember);
		font-size: 0.8rem;
	}
</style>
