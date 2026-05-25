import { pgGet } from '$lib/shared/http/postgrest';
import { session } from '$lib/shared/state/session.svelte';

export const profile = $state<{
	uid: string | null;
	displayName: string | null;
	avatarVersion: number;
}>({
	uid: null,
	displayName: null,
	avatarVersion: 0
});

$effect.root(() => {
	$effect(() => {
		const s = session.current;
		if (s.status === 'signed-in') {
			const uid = s.user.id;
			profile.uid = uid;
			pgGet<{ display_name: string; avatar_version: number }>(
				'/profiles?id=eq.' + uid + '&select=display_name,avatar_version',
				{ headers: { Accept: 'application/vnd.pgrst.object+json' } }
			)
				.then((result) => {
					profile.displayName = result.display_name;
					profile.avatarVersion = result.avatar_version;
				})
				.catch((err) => {
					console.error('profile: failed to load display_name', err);
				});
		} else if (s.status === 'signed-out') {
			profile.uid = null;
			profile.displayName = null;
			profile.avatarVersion = 0;
		}
	});
});
