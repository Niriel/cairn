# Data export

Cairn lets users download a copy of their data. This document covers the model, the format, the user-facing flow, and what is and isn't included. It assumes the schema in `data-model.md`, the deletion model in `account-deletion.md`, and the conventions in `ui.md`.

The headline rule: **a personal archive, not a backup.** Export gives the user a copy of _their_ data — what they've contributed and what's been done with it on their behalf — in a form they can open without Cairn. It is not a database dump, not a portable account, and not a tool for migrating between Cairn instances.

## What's included

| Data                                    | Source                                                | Notes                                                                                           |
| --------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Your profile                            | `profiles` (yours, incl. username), `auth.users` (id) | Display name, username, signup date. Avatar file embedded as `avatar.webp` if you have one.     |
| Your settings                           | `user_settings` (yours)                               | Invite policy. (Theme and font size are device-local — `localStorage` — and not in the export.) |
| Lists you're a member of                | `lists` joined via `list_members`                     | Live and trashed lists alike.                                                                   |
| Items on those lists                    | `items` (live and soft-deleted)                       | Including notes, attribution, timestamps.                                                       |
| Your own votes                          | `votes` where `user_id = you`                         | One row per (item, you, value).                                                                 |
| Other people's votes on items you added | `votes` joined to items where `created_by = you`      | See "Vote scope" below — included (Option B).                                                   |
| Members of each of your lists           | `list_members` for each list                          | Display names only — no emails.                                                                 |
| Your invitations sent and received      | `invitations` where you're sender or recipient        | Pending state at export time.                                                                   |
| Your circle and blocklist               | `relationships` (your rows)                           | Status (`circle` or `blocked`), other user's display name.                                      |

## What's not included

- **Other users' emails.** Email is private (see `invites.md`); the export shows display names only, on every co-member row.
- **Other users' votes on items you didn't add.** A list with three members is a shared workspace; their votes on each other's items are their data, not yours.
- **The other side of relationships.** Whether Bob has _you_ in _his_ circle is Bob's private setting on himself — the export shows your circle, not Bob's.
- **Session and auth state.** No JWT, no refresh token, no cookie. The export is a static archive, not credentials.
- **Server-side telemetry.** Cairn doesn't run any (see `logging.md`); nothing to export.

## Format

A single ZIP file, named `cairn-export-{yyyymmdd}-{shortid}.zip`. Inside:

```
cairn-export-20260511-9a3f/
├── README.html              ← rendered on open; explains what's inside
├── README.md                ← same, plain-text fallback
├── data.json                ← machine-readable, the canonical export
├── data.html                ← human-readable rendering of the same data
├── avatar.webp              ← present only if you have one
└── avatars/
    └── {uid}.webp           ← co-members' avatars at export time (optional)
```

Two formats, packaged together, because the audiences are different. `data.json` is for people who'll feed it into a script or another tool. `data.html` is what most users will actually open — it renders the same content as a small static webpage they can read in any browser without running anything. The two are generated from the same source; if they ever disagree, JSON is canonical.

The HTML rendering links its references back to specific JSON paths so a curious reader can correlate the two. There is no JavaScript in `data.html` — it works offline, opens in any browser, and survives indefinitely.

### `data.json` shape

```json
{
	"exported_at": "2026-05-11T14:00:00Z",
	"schema_version": 1,
	"user": {
		"id": "…uuid…",
		"username": "alice",
		"display_name": "Alice",
		"signed_up_at": "2025-11-03T09:14:22Z",
		"invite_policy": "circle",
		"has_avatar": true
	},
	"lists": [
		{
			"id": "…uuid…",
			"name": "Movies for Alice",
			"description": "…",
			"created_at": "…",
			"deleted_at": null,
			"members": [{ "id": "…uuid…", "display_name": "Bob" }],
			"items": [
				{
					"id": "…uuid…",
					"name": "Bringing Up Baby",
					"notes": "…",
					"created_by": { "id": "…", "display_name": "Alice" },
					"created_at": "…",
					"deleted_at": null,
					"your_vote": 2,
					"all_votes": [
						{ "user_display_name": "Alice", "value": 2 },
						{ "user_display_name": "Bob", "value": 3 }
					]
				}
			]
		}
	],
	"circle": [{ "display_name": "Bob" }],
	"blocked": [{ "display_name": "Carol" }],
	"invitations_sent": [
		{
			"list_id": "…uuid…",
			"list_name": "Movies for Alice",
			"created_at": "…",
			"invitee_display_name": "Carol"
		}
	],
	"invitations_received": [
		{
			"list_id": "…uuid…",
			"list_name": "Bob's books",
			"created_at": "…",
			"inviter_display_name": "Bob"
		}
	]
}
```

Each invitation entry is an explicit allowlist: the target list (by
`list_name`, plus `list_id` for reference), `created_at`, and the _other_
party as a display name (`invitee_display_name` on sent, `inviter_display_name`
on received) where one exists. There is **no `status` field** — the
`invitations` table holds only outstanding invites (accept and decline
_delete_ the row), so every entry is pending by construction, which the
section's "pending state at export time" framing already conveys. An
email-keyed _sent_ invite with no claiming user yet renders by `list_name`
only: `target_email` is the invitee's e-mail, not the caller's, so it is
deliberately excluded (email is private; see `invites.md`).

A few notes:

- **`schema_version: 1`.** Lets a future export shape change without ambiguity.
- **No UUIDs cross-referenced anywhere a name suffices.** The export is for _the user_, not for replaying writes into another database. Names are the lingua franca.
- **`all_votes` rendering uses `user_display_name` only.** No UUIDs of co-members; the user knows their friends by name.
- **`deleted_at` fields are present** for items and lists the user has soft-deleted but not yet trash-purged. The export reflects the current state of the trash, since the trash _is_ their data.

## How the export is produced

A single `security definer` Postgres RPC, callable by the authenticated user, returns the JSON payload. The web app then renders the HTML from the same JSON, fetches the user's avatar from `/avatars/{uid}.webp` if any, fetches co-member avatars (best-effort; missing ones are simply omitted), and assembles the ZIP client-side.

```sql
create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := public.uid();
  result jsonb;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if uid = '00000000-0000-0000-0000-000000000000' then
    raise exception 'cannot export the tombstone user';
  end if;

  -- assemble the document; see data.json shape above
  select jsonb_build_object(
    'exported_at',    to_jsonb(now()),
    'schema_version', 1,
    'user',           (...),
    'lists',          (...),
    'circle',         (...),
    'blocked',        (...),
    'invitations_sent',     (...),
    'invitations_received', (...)
  ) into result;

  return result;
end;
$$;

revoke all on function public.export_my_data() from public;
grant  execute on function public.export_my_data() to authenticated;
```

The RPC is the only sanctioned export path. It runs as `security definer` because it reads across tables the caller's RLS would otherwise narrow (e.g. all votes on items the user added, not just the user's own); the function body's `where ... = uid` predicates are what bound the export to a single user. The function reads as much per call as PostgREST's `statement_timeout` permits — for the v1 user base (small groups, a few thousand items each, max), the typical export is well under a megabyte and well under a second.

For very large accounts (years of dogfooding, many shared lists), the body can be split into a paginated form that walks lists chunk by chunk; v1 doesn't need this.

## What the user sees

For the full screen flow, see `design/cairn-export-screens.jsx`. The high-level shape:

1. **Settings → Privacy & data → Download my data.** A new row under Privacy & data. Tapping opens the **Data export** hub.
2. **Data export hub.** A single screen explaining what's in the export, what's not, the format (zip with HTML + JSON), and a single **Prepare my download** button. Below the button, in muted text: _"This may take a few seconds for large accounts."_
3. **Packaging.** A brief progress state — _"Packaging your data…"_ with a spinner. The RPC runs; the client renders HTML; the zip assembles. On slow connections the avatar fetches dominate; the progress text remains generic.
4. **Ready.** _"Your data is ready."_ with a **Download** button (triggers the browser save), and below it _"Your archive is valid until you close this page."_ No server-side staging — the zip lives in the browser's memory until the tab closes.
5. **Delete-account variant.** On the **Delete account** screen (see `account-deletion.md` and `ui.md`), a small non-blocking panel sits _above_ the destructive button: _"Want a copy of your data first? **Download** (opens the export hub)."_ Tapping it navigates to the hub; the delete-account screen state is preserved. The export and the delete are independent — neither blocks the other.

The export is a privacy feature, not a feature in the marketing sense. The Settings location reflects that — it's reachable when wanted, invisible when not.

## Vote scope — decided (Option B, 2026-06-12)

The export includes **all votes on items the user added**, not just the
user's own votes. Items the caller added carry the `all_votes` array shown
above, rendered `{ user_display_name, value }` (display name only).

The rationale: Alice can already see _"Bob downvoted Bringing Up Baby"_ live
in the UI today — that information is available to her because the vote is on
_her_ item. Including it in the export just gives her a static copy of what
she already sees. Locking it out would create a mismatch between what she sees
today and what she gets in her archive, with no privacy gain (she could
screenshot the live UI). Hiding these values would be paternalistic without
benefit.

The conservative alternative (the user's own votes only, or rendering a
co-member's value as `"(hidden)"`) was considered and rejected on that basis.

## What we don't do

- **No "delete my account on completion."** Export and account deletion are independent flows. A user who wants both will perform both — the design surface to launch the export from inside the delete flow is the entire integration.
- **No retention window on the staged archive.** The zip is built client-side and lives only in the tab's memory. Refresh and it's gone — the user re-prepares. This avoids the security and storage problem of server-staged personal archives.
- **No periodic exports.** A user who wants a monthly archive can run the flow monthly. Cairn doesn't email anyone; we don't have the infrastructure to be doing periodic background work that touches user data in arbitrary ways.
- **No partial export.** The export is everything-at-once. A user who only wants "my notes on the gift-ideas list" can copy them from the UI.

## Build order

The smallest useful slice is "JSON-only download from Settings":

1. The `export_my_data` RPC (with pgTAP coverage on the per-user filtering and on the rejection of `uid = tombstone`).
2. The Settings → Privacy & data → Download my data row + a flat blob download (no UI polish — just the JSON file, named correctly).

Then:

3. The HTML rendering and the README files; the client-side zip assembly.
4. The avatar embeds (own and co-members').
5. The delete-account integration panel.

The slice above is enough to satisfy GDPR data-portability; everything after is product polish.
