import { pgGet, pgPatch } from '$lib/shared/http/postgrest';
import { profile } from '$lib/shared/state/profile.svelte';

type InvitePolicy = 'everybody' | 'circle' | 'nobody';

const POLICY_RANK: Record<InvitePolicy, number> = { everybody: 0, circle: 1, nobody: 2 };

export const userSettings = $state<{
	invitePolicy: InvitePolicy | null;
	recoveryEmail: string | null;
	loaded: boolean;
}>({
	invitePolicy: null,
	recoveryEmail: null,
	loaded: false
});

export async function loadUserSettings(): Promise<void> {
	const me = profile.uid;
	if (!me) return;
	// recovery_email is read-only here — writes go through the BFF (the column is
	// not PATCHable via PostgREST). There is deliberately no pgPatch writer for it.
	const row = await pgGet<{ invite_policy: InvitePolicy; recovery_email: string | null }>(
		`/user_settings?id=eq.${me}&select=invite_policy,recovery_email`,
		{ headers: { Accept: 'application/vnd.pgrst.object+json' } }
	);
	userSettings.invitePolicy = row.invite_policy;
	userSettings.recoveryEmail = row.recovery_email;
	userSettings.loaded = true;
}

export async function setInvitePolicy(
	next: InvitePolicy
): Promise<{ prevCount: number; newCount: number; tightened: boolean }> {
	const me = profile.uid;
	if (!me) throw new Error('Not signed in');

	const prevPolicy = userSettings.invitePolicy;
	const invitationsPath = `/invitations?target_user_id=eq.${me}&select=id`;

	const prevRows = await pgGet<{ id: string }[]>(invitationsPath);
	const prevCount = prevRows.length;

	await pgPatch(`/user_settings?id=eq.${me}`, { invite_policy: next });

	const newRows = await pgGet<{ id: string }[]>(invitationsPath);
	const newCount = newRows.length;

	const tightened = prevPolicy !== null && POLICY_RANK[next] > POLICY_RANK[prevPolicy];

	userSettings.invitePolicy = next;

	return { prevCount, newCount, tightened };
}
