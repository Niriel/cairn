export function timeAgo(iso: string): string {
	const diff = Date.now() - new Date(iso).getTime();
	const mins = Math.floor(diff / 60_000);
	if (mins < 60) return mins <= 1 ? 'just now' : `${mins} minutes ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
	return new Intl.DateTimeFormat('en-GB', {
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	}).format(new Date(iso));
}
