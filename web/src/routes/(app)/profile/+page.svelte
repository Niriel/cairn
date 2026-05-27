<script lang="ts">
	import { profile } from '$lib/shared/state/profile.svelte';
	import { pgPost, ApiError } from '$lib/shared/http/postgrest';
	import Avatar from '$lib/shared/components/Avatar.svelte';
	import AppTopBar from '$lib/shared/components/AppTopBar.svelte';
	import Snackbar from '$lib/shared/components/Snackbar.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';
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
	<AppTopBar showBack={false}>
		{#snippet left()}
			<button class="icon-btn" onclick={() => history.back()}>
				<Icon name="x" size={22} />
			</button>
		{/snippet}
		{#snippet right()}
			<button class="save-btn" data-test="save-profile" onclick={saveName}>Save</button>
		{/snippet}
		Edit profile
	</AppTopBar>

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

	<div class="edit-body">
		<div class="avatar-section">
			<Avatar
				displayName={profile.displayName ?? ''}
				uid={profile.uid ?? ''}
				avatarVersion={profile.avatarVersion}
				size={112}
				data-test="profile-avatar"
			/>
			<div class="avatar-actions">
				<button
					class="pill-btn ink"
					data-test="change-picture"
					onclick={() => (showSourceSheet = true)}
				>
					<Icon name="pencil" size={13} />
					{profile.avatarVersion > 0 ? 'Change picture' : 'Add a picture'}
				</button>
				{#if profile.avatarVersion > 0}
					<button
						class="pill-btn ember"
						data-test="remove-avatar"
						onclick={removeAvatar}
						disabled={removing}>Remove</button
					>
				{/if}
			</div>
		</div>

		<label class="field-label" for="display-name">Display name</label>
		<input
			id="display-name"
			class="name-input"
			data-test="display-name-input"
			bind:value={nameValue}
			onkeydown={(e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					void saveName();
				} else if (e.key === 'Escape') {
					e.preventDefault();
					history.back();
				}
			}}
		/>
		{#if nameError}
			<p class="field-error">{nameError}</p>
		{/if}
		<p class="field-hint">What other list members see. E-mail stays private.</p>

		<div class="info-box">
			<b>Where your picture appears.</b>
			Next to your name on shared lists, in the members screen, and on items you've added. A photo, a
			doodle, your cat — whatever you'd like other people in your lists to see.
		</div>
	</div>

	<Snackbar
		open={snackbarOpen}
		message="Couldn't remove picture — try again."
		onclose={() => (snackbarOpen = false)}
	/>
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
	<div data-test="upload-state">
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

		<div class="upload-body">
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
			<button class="upload-action-btn" onclick={handleUploadAction}>
				{UPLOAD_ACTION_LABEL[isUploadState]}
			</button>
		</div>
	</div>
{/if}

<style>
	.edit-body {
		padding: 24px 18px;
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

	.pill-btn {
		padding: 8px 14px;
		border-radius: 99px;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		font-family: inherit;
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.pill-btn.ink {
		border: 1px solid var(--ink);
		background: var(--paper);
		color: var(--ink);
	}

	.pill-btn.ember {
		border: 1px solid var(--rule);
		background: var(--paper);
		color: var(--ember);
	}

	.field-label {
		display: block;
		margin-top: 28px;
		font-size: 11.5px;
		color: var(--stone);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.name-input {
		display: block;
		width: 100%;
		margin-top: 6px;
		padding: 12px 14px;
		border: 1px solid var(--ink);
		border-radius: 12px;
		background: var(--paper);
		font-size: 16px;
		color: var(--ink);
		font-family: inherit;
		box-sizing: border-box;
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

	.info-box {
		margin-top: 24px;
		padding: 12px 14px;
		background: var(--paper-alt);
		border-radius: 12px;
		border: 1px solid var(--rule);
		font-size: 12px;
		color: var(--ink-soft);
		line-height: 1.55;
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

	.save-btn {
		padding: 8px 14px;
		border: none;
		border-radius: 10px;
		background: var(--ink);
		color: var(--paper);
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		font-family: inherit;
	}

	.upload-body {
		flex: 1;
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

	.upload-action-btn {
		margin-top: 28px;
		padding: 11px 22px;
		border: none;
		border-radius: 12px;
		background: var(--ink);
		color: var(--paper);
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		font-family: inherit;
	}
</style>
