const LEGAL_DATE = new Intl.DateTimeFormat('en-GB', {
	day: 'numeric',
	month: 'long',
	year: 'numeric',
	timeZone: 'UTC'
});

/** `'2026-10-20'` → `'20 October 2026'`. Parsed and formatted in UTC so the day never shifts. */
export function formatLegalDate(iso: string): string {
	return LEGAL_DATE.format(new Date(`${iso}T00:00:00Z`));
}
