export const profile = $state<{
	uid: string | null;
	displayName: string | null;
	avatarVersion: number;
}>({
	uid: null,
	displayName: null,
	avatarVersion: 0
});
