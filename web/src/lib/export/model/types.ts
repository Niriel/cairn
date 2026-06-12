// Typed view of the `public.export_my_data()` RPC document. These mirror
// docs/data-export.md § "`data.json` shape" exactly — the keys are the
// snake_case JSON the RPC emits, consumed verbatim (no camelCase mapping),
// because the same shape is written into the archive's data.json.

/** A single vote on an item, rendered by display name only. */
export type ExportVote = {
	user_display_name: string;
	value: number;
};

/** A co-member of one of the caller's lists — display name only, never e-mail. */
export type ExportMember = {
	id: string;
	display_name: string;
};

export type ExportItem = {
	id: string;
	name: string;
	notes: string | null;
	created_by: ExportMember;
	created_at: string;
	deleted_at: string | null;
	/** The caller's own vote on this item, or null if they didn't vote. */
	your_vote: number | null;
	// Present (Option B) only on items the caller added; absent — never `[]` —
	// on items added by someone else. Consumers must read absent as "no
	// co-author votes" and never assume the key exists.
	all_votes?: ExportVote[];
};

export type ExportList = {
	id: string;
	name: string;
	description: string | null;
	created_at: string;
	deleted_at: string | null;
	members: ExportMember[];
	items: ExportItem[];
};

export type ExportUser = {
	id: string;
	email: string;
	display_name: string;
	signed_up_at: string;
	invite_policy: string;
	has_avatar: boolean;
};

/** An entry in `circle` / `blocked` — the other party by display name. */
export type ExportRelationship = {
	display_name: string;
};

// A pending invitation, sent or received. There is no `status` field:
// the invitations table holds only outstanding invites (accept/decline
// delete the row), so every entry is pending by construction. The other
// party is a display name where a claiming user exists — `invitee_display_name`
// on sent, `inviter_display_name` on received; an unclaimed email-keyed sent
// invite carries neither (target_email is never exposed).
export type ExportInvitation = {
	list_id: string;
	list_name: string;
	created_at: string;
	invitee_display_name?: string;
	inviter_display_name?: string;
};

export type ExportDocument = {
	exported_at: string;
	schema_version: number;
	user: ExportUser;
	lists: ExportList[];
	circle: ExportRelationship[];
	blocked: ExportRelationship[];
	invitations_sent: ExportInvitation[];
	invitations_received: ExportInvitation[];
};
