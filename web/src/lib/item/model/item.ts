import { pgDelete, pgGet, pgPatch, pgPost } from '$lib/shared/http/postgrest';

export type Item = {
	id: string;
	list_id: string;
	name: string;
	notes: string | null;
	created_by: string;
	modified_by: string;
	created_by_name: string;
	modified_by_name: string | null;
	score: number;
	created_at: string;
	modified_at: string;
	my_vote: number | null;
	member_votes: { user_id: string; display_name: string; value: number }[];
};

// Wire type from the items_ranked view — profile embeds may be null if
// PostgREST schema cache is stale or the server predates FK-based joins.
export type ItemRanked = {
	id: string;
	list_id: string;
	name: string;
	notes: string | null;
	created_by: string;
	modified_by: string;
	score: number;
	created_at: string;
	modified_at: string;
	created_by_profile: { display_name: string } | null;
	modified_by_profile: { display_name: string } | null;
};

export type VoteRow = {
	item_id: string;
	user_id: string;
	value: number;
	profile: { display_name: string } | null;
};

export async function fetchItems(listId: string, uid: string): Promise<Item[]> {
	const ranked = await pgGet<ItemRanked[]>(
		`/items_ranked?list_id=eq.${listId}&select=*,created_by_profile:profiles!created_by(display_name),modified_by_profile:profiles!modified_by(display_name)`
	);

	const ids = ranked.map((r) => r.id).join(',');
	const votes =
		ids.length > 0
			? await pgGet<VoteRow[]>(
					`/votes?item_id=in.(${ids})&select=item_id,user_id,value,profile:profiles!user_id(display_name)`
				)
			: [];

	const votesByItem = new Map<string, VoteRow[]>();
	for (const v of votes) {
		const list = votesByItem.get(v.item_id) ?? [];
		list.push(v);
		votesByItem.set(v.item_id, list);
	}

	return ranked.map((r) => {
		const itemVotes = votesByItem.get(r.id) ?? [];
		const myVoteRow = itemVotes.find((v) => v.user_id === uid);
		// modified_by_name is null when the item has never been edited:
		// the attribution trigger sets modified_by = created_by on insert
		// without advancing modified_at past created_at.
		const wasEdited = r.modified_at > r.created_at;
		return {
			id: r.id,
			list_id: r.list_id,
			name: r.name,
			notes: r.notes,
			created_by: r.created_by,
			modified_by: r.modified_by,
			created_by_name: r.created_by_profile?.display_name ?? 'Unknown',
			modified_by_name: wasEdited ? (r.modified_by_profile?.display_name ?? null) : null,
			score: r.score,
			created_at: r.created_at,
			modified_at: r.modified_at,
			my_vote: myVoteRow?.value ?? null,
			member_votes: itemVotes.map((v) => ({
				user_id: v.user_id,
				display_name: v.profile?.display_name ?? 'Unknown',
				value: v.value
			}))
		};
	});
}

export async function addItem(listId: string, name: string, notes?: string): Promise<Item> {
	const row = await pgPost<ItemRanked>(
		'/items?select=*,created_by_profile:profiles!created_by(display_name),modified_by_profile:profiles!modified_by(display_name)',
		{ list_id: listId, name, notes: notes ?? null },
		{ headers: { Prefer: 'return=representation' } }
	);
	return {
		id: row.id,
		list_id: row.list_id,
		name: row.name,
		notes: row.notes,
		created_by: row.created_by,
		modified_by: row.modified_by,
		created_by_name: row.created_by_profile?.display_name ?? 'Unknown',
		modified_by_name: null,
		score: row.score,
		created_at: row.created_at,
		modified_at: row.modified_at,
		my_vote: null,
		member_votes: []
	};
}

export function editItem(itemId: string, name: string, notes: string): Promise<void> {
	return pgPatch(`/items?id=eq.${itemId}`, { name, notes });
}

export function softDeleteItem(itemId: string): Promise<void> {
	return pgPatch(`/items?id=eq.${itemId}`, { deleted_at: new Date().toISOString() });
}

export function restoreItem(itemId: string): Promise<void> {
	// Send only deleted_at: null — the tg_set_attribution_items trigger's
	// restore branch clears deleted_by automatically.
	return pgPatch(`/items?id=eq.${itemId}`, { deleted_at: null });
}

export function upsertVote(itemId: string, value: number): Promise<void> {
	return pgPost(
		'/votes',
		{ item_id: itemId, value },
		{ headers: { Prefer: 'resolution=merge-duplicates' } }
	);
}

export function deleteVote(itemId: string): Promise<void> {
	// No user_id filter needed — the votes_delete RLS policy
	// (using (user_id = public.uid())) scopes the delete automatically.
	return pgDelete(`/votes?item_id=eq.${itemId}`);
}
