export type RelationshipRow = {
	other_user_id: string;
	status: 'circle' | 'blocked';
	created_at: string;
	profiles: {
		display_name: string;
		avatar_version: number;
	};
};

export type CircleEntry = {
	otherUserId: string;
	displayName: string;
	avatarVersion: number;
	createdAt: string;
};

export type BlockedEntry = {
	otherUserId: string;
	displayName: string;
	avatarVersion: number;
	createdAt: string;
};

function formatDate(createdAt: string, prefix: string, now: Date): string {
	const date = new Date(createdAt);
	const sameYear = date.getFullYear() === now.getFullYear();
	const options: Intl.DateTimeFormatOptions = sameYear
		? { day: 'numeric', month: 'short' }
		: { day: 'numeric', month: 'short', year: 'numeric' };
	const formatted = new Intl.DateTimeFormat('en-GB', options).format(date);
	return `${prefix}${formatted}`;
}

export function addedAtLabel(createdAt: string, now: Date = new Date()): string {
	return formatDate(createdAt, 'added ', now);
}

export function blockedAtLabel(createdAt: string, now: Date = new Date()): string {
	return formatDate(createdAt, 'blocked ', now);
}
