// The one ordering for anything shown by name (lists, items). Case- and
// accent-insensitive, with natural number order ("Item 2" before "Item 10").
// Surrounding whitespace is ignored so a stray leading space can't jump a row
// to the top. Equal names compare as 0 — the variants below add a tie-break.
//
// Callers always re-sort fetched rows with these: the server's ORDER BY is only
// a first pass, since Postgres collation can disagree with the browser's.
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

export function compareNames(a: { name: string }, b: { name: string }): number {
	return collator.compare(a.name.trim(), b.name.trim());
}

// compareNames, then oldest first. The tie-break parses the timestamps rather
// than comparing their text: PostgREST drops a zero fraction of a second, so
// `…12:00:00+00:00` and `…12:00:00.5+00:00` don't collate chronologically.
export function compareNamesThenAge(
	a: { name: string; created_at: string },
	b: { name: string; created_at: string }
): number {
	return compareNames(a, b) || Date.parse(a.created_at) - Date.parse(b.created_at);
}

// compareNames, then by id, so same-named rows keep a stable order.
export function compareNamesThenId(
	a: { name: string; id: string },
	b: { name: string; id: string }
): number {
	return compareNames(a, b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
