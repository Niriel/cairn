import { pgGet } from '$lib/shared/http/postgrest';
import { session } from '$lib/shared/state/session.svelte';

export const profile = $state<{ displayName: string | null }>({ displayName: null });

$effect.root(() => {
	$effect(() => {
		const s = session.current;
		if (s.status === 'signed-in') {
			const uid = s.user.id;
			pgGet<{ display_name: string }>('/profiles?id=eq.' + uid + '&select=display_name', {
				headers: { Accept: 'application/vnd.pgrst.object+json' }
			})
				.then((result) => {
					profile.displayName = result.display_name;
				})
				.catch((err) => {
					console.error('profile: failed to load display_name', err);
				});
		} else if (s.status === 'signed-out') {
			profile.displayName = null;
		}
	});
});
