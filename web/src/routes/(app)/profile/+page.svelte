<script lang="ts">
	import { profile } from '$lib/shared/state/profile.svelte';
	import { pgPost, ApiError } from '$lib/shared/http/postgrest';
	import Avatar from '$lib/shared/components/Avatar.svelte';
	import AppTopBar from '$lib/shared/components/AppTopBar.svelte';
	import Snackbar from '$lib/shared/components/Snackbar.svelte';
	import Button from '$lib/basic/components/Button.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';
	import Label from '$lib/basic/components/Label.svelte';
	import TextInput from '$lib/basic/components/TextInput.svelte';
	import AvatarSourceSheet from '$lib/avatar/components/AvatarSourceSheet.svelte';
	import AvatarCropScreen from '$lib/avatar/components/AvatarCropScreen.svelte';
	import type { IconName } from '$lib/basic/model/icon-paths';

	type ViewState =
		| 'edit'
		| 'cropping'
		| 'uploading'
		| 'success'
		| 'too-big'
		| 'wrong-format'
		| 'network';

	let viewState = $state<ViewState>('edit');
	let showSourceSheet = $state(false);
	let pendingFile = $state<File | null>(null);
	let pendingBlob = $state<Blob | null>(null);
	let removing = $state(false);
	let snackbarOpen = $state(false);
	let nameValue = $state(profile.displayName ?? '');
	let nameError = $state<string | null>(null);

	async function saveName() {
		nameError = null;
		const trimmedName = nameValue.trim();
		try {
			await pgPost('/rpc/set_display_name', { new_name: trimmedName });
			profile.displayName = trimmedName;
			history.back();
		} catch (err) {
			if (err instanceof ApiError && err.code === '23514') {
				nameError =
					trimmedName === '' ? "Name can't be blank" : 'Name must be 100 characters or fewer';
			} else {
				nameError = 'Something went wrong — please try again.';
			}
		}
	}

	async function removeAvatar() {
		removing = true;
		try {
			await pgPost('/rpc/clear_avatar', {});
			void fetch('/avatars/me', { method: 'DELETE' }).catch(() => {});
			profile.avatarVersion = 0;
		} catch {
			removing = false;
			snackbarOpen = true;
		}
	}

	async function doUpload(blob: Blob) {
		viewState = 'uploading';
		const formData = new FormData();
		formData.append('file', blob, 'avatar.jpg');
		try {
			const res = await fetch('/avatars', { method: 'POST', body: formData });
			if (res.status === 413) {
				viewState = 'too-big';
				return;
			}
			if (res.status === 415 || res.status === 422) {
				viewState = 'wrong-format';
				return;
			}
			if (!res.ok) {
				viewState = 'network';
				return;
			}
			profile.avatarVersion = ((await res.json()) as { version: number }).version;
			viewState = 'success';
		} catch {
			viewState = 'network';
		}
	}

	async function handleCropSave(blob: Blob | null) {
		if (blob === null) {
			viewState = 'wrong-format';
			return;
		}
		pendingBlob = blob;
		await doUpload(blob);
	}

	const UPLOAD_ICON: Record<Exclude<ViewState, 'edit' | 'cropping'>, IconName> = {
		uploading: 'feather',
		success: 'check',
		'too-big': 'x',
		'wrong-format': 'x',
		network: 'slash'
	};

	const UPLOAD_TITLE: Record<Exclude<ViewState, 'edit' | 'cropping'>, string> = {
		uploading: 'Uploading…',
		success: 'Saved',
		'too-big': "That's a big one",
		'wrong-format': "Can't read that",
		network: 'No connection'
	};

	const UPLOAD_SUB: Record<Exclude<ViewState, 'edit' | 'cropping'>, string> = {
		uploading: 'Resizing to 256 × 256 and saving to your account.',
		success: 'Your picture will show up next to your name everywhere.',
		'too-big': 'That picture is larger than 8 MB. Try another.',
		'wrong-format': 'Please pick a JPG, PNG, WebP, or HEIC image.',
		network: 'Cairn needs the network to save your picture. Try again when you’re back online.'
	};

	const UPLOAD_ACTION_LABEL: Record<Exclude<ViewState, 'edit' | 'cropping'>, string> = {
		uploading: 'Cancel',
		success: 'Done',
		'too-big': 'Choose another',
		'wrong-format': 'Choose another',
		network: 'Try again'
	};

	function handleUploadAction() {
		if (viewState === 'uploading' || viewState === 'success') {
			viewState = 'edit';
		} else if (viewState === 'too-big' || viewState === 'wrong-format') {
			viewState = 'edit';
			showSourceSheet = true;
		} else if (viewState === 'network' && pendingBlob) {
			void doUpload(pendingBlob);
		}
	}
</script>

{#if viewState === 'edit'}
	<div class="screen">
		<AppTopBar showBack={true}>Edit profile</AppTopBar>

		{#if showSourceSheet}
			<AvatarSourceSheet
				onfile={(file: File) => {
					pendingFile = file;
					showSourceSheet = false;
					viewState = 'cropping';
				}}
				oncancel={() => (showSourceSheet = false)}
			/>
		{/if}

		<div class="screen-body edit-body">
			<div class="avatar-field">
				<Label>Profile picture</Label>
				<div class="avatar-section">
					<Avatar
						displayName={profile.displayName ?? ''}
						uid={profile.uid ?? ''}
						avatarVersion={profile.avatarVersion}
						size={112}
						data-test="profile-avatar"
					/>
					<div class="avatar-actions">
						<Button
							variant="pill"
							tone="ink"
							size="sm"
							leadingIcon="pencil"
							data-test="change-picture"
							onclick={() => (showSourceSheet = true)}
						>
							{profile.avatarVersion > 0 ? 'Change' : 'Add a picture'}
						</Button>
						{#if profile.avatarVersion > 0}
							<Button
								variant="pill"
								tone="destructive"
								size="sm"
								leadingIcon="trash-2"
								data-test="remove-avatar"
								onclick={removeAvatar}
								disabled={removing}>Remove</Button
							>
						{/if}
					</div>
				</div>
			</div>

			<div class="field">
				<Label for="display-name">Display name</Label>
				<TextInput
					id="display-name"
					data-test="display-name-input"
					bind:value={nameValue}
					onkeydown={(e: KeyboardEvent) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							void saveName();
						} else if (e.key === 'Escape') {
							e.preventDefault();
							history.back();
						}
					}}
				/>
			</div>
			{#if nameError}
				<p class="field-error">{nameError}</p>
			{/if}
			<p class="field-hint">What other list members see. E-mail stays private.</p>

			<div class="save-row">
				<Button variant="rect" tone="primary" size="md" data-test="save-profile" onclick={saveName}
					>Save</Button
				>
			</div>
		</div>

		<Snackbar
			open={snackbarOpen}
			message="Couldn't remove picture — try again."
			onclose={() => (snackbarOpen = false)}
		/>
	</div>
{:else if viewState === 'cropping'}
	<AvatarCropScreen
		imageFile={pendingFile!}
		oncancel={() => (viewState = 'edit')}
		onsave={handleCropSave}
	/>
{:else}
	{@const isUploadState = viewState as Exclude<ViewState, 'edit' | 'cropping'>}
	{@const isError =
		viewState === 'too-big' || viewState === 'wrong-format' || viewState === 'network'}
	<div class="screen" data-test="upload-state">
		<AppTopBar showBack={false}>
			{#snippet left()}
				{#if viewState === 'uploading'}
					<button class="icon-btn" style="pointer-events:none;opacity:0.4" disabled>
						<Icon name="arrow-left" size={22} />
					</button>
				{:else}
					<button class="icon-btn" onclick={() => (viewState = 'edit')}>
						<Icon name="arrow-left" size={22} />
					</button>
				{/if}
			{/snippet}
			Profile picture
		</AppTopBar>

		<div class="screen-body upload-body">
			<div
				class="upload-disc"
				class:uploading={viewState === 'uploading'}
				class:success={viewState === 'success'}
				class:error={isError}
			>
				<Icon name={UPLOAD_ICON[isUploadState]} size={36} />
			</div>
			<div class="upload-title">{UPLOAD_TITLE[isUploadState]}</div>
			<div class="upload-sub">{UPLOAD_SUB[isUploadState]}</div>
			<Button variant="rect" tone="ink" size="md" onclick={handleUploadAction}>
				{UPLOAD_ACTION_LABEL[isUploadState]}
			</Button>
		</div>
	</div>
{/if}

<style>
	.edit-body {
		padding: 24px 18px;
	}

	.avatar-field {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.avatar-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
	}

	.avatar-actions {
		display: flex;
		gap: 8px;
	}

	/* Separate the picture block from the name block. */
	.field {
		margin-top: 28px;
	}

	.field-error {
		margin: 6px 0 0;
		font-size: 12px;
		color: var(--ember);
	}

	.field-hint {
		margin: 8px 0 0;
		font-size: 12px;
		color: var(--stone);
		line-height: 1.5;
	}

	/* Save sits at the foot of the form, full-width, where people expect the
	   primary commit action. */
	.save-row {
		margin-top: 28px;
	}

	.save-row :global(button) {
		width: 100%;
	}

	.icon-btn {
		background: none;
		border: none;
		padding: 4px;
		color: var(--ink);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.upload-body {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 40px 28px;
		text-align: center;
	}

	.upload-disc {
		width: 88px;
		height: 88px;
		border-radius: 99px;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 22px;
		background: var(--paper-alt);
		color: var(--stone);
	}

	.upload-disc.uploading {
		animation: cairnBlink 1.2s infinite;
	}

	.upload-disc.success {
		background: var(--sage-bg);
		color: var(--sage);
	}

	.upload-disc.error {
		background: var(--ember-bg);
		color: var(--ember);
	}

	.upload-title {
		font-family: 'Newsreader Variable', Georgia, serif;
		font-size: 24px;
		font-weight: 500;
		color: var(--ink);
		letter-spacing: -0.01em;
	}

	.upload-sub {
		margin-top: 12px;
		font-size: 14px;
		color: var(--ink-soft);
		line-height: 1.5;
		max-width: 280px;
	}

	.upload-body :global(button) {
		margin-top: 28px;
	}
</style>
