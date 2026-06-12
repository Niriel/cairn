# Admin

This document describes how the operator performs admin tasks on a running Cairn deployment: banning a user, deleting data on someone's behalf, moderating an item or a list after a complaint, helping a user who can't get in. It assumes the architecture in `architecture.md` (single Hetzner VPS, Docker Compose, Postgres as the authorization root), the schema in `data-model.md`, the deletion model in `account-deletion.md`, and the operational baseline in `deployment.md` and `logging.md`.

The headline rule: **admin is a runbook, not a feature.** Cairn has no admin UI, no admin role in the user JWT, no admin bundle shipped to user devices. Admin actions are performed by the operator from psql on the VPS, through a small set of `security definer` RPCs that live in a separate `admin` schema PostgREST cannot see, with required reasons logged to a dedicated table. There is exactly one trust boundary (SSH to the VPS), one authorization mechanism (Postgres role membership), and one audit trail (`admin.actions`).

## Why no admin UI

The architecture concentrates authorization in RLS policies in `public.*`, with PostgREST connecting as a low-privilege `authenticated` role that has no bypass paths. Every admin feature inside the user app would have to fight that bet:

- Every RLS policy in `data-model.md` would grow an `or is_admin()` disjunct, doubling the policy surface and the pgTAP test surface, and introducing a class of "new table forgot the bypass clause" bugs.
- The JWT would have to carry a custom claim that GoTrue doesn't issue today; every policy would have to read it; a compromised admin session would become an existential risk for every user's data.
- The admin bundle would ship to every device (Cairn is a PWA — the JS is on every phone), so a buggy client-side gate becomes a privilege-escalation bug. The code paths are visible even if the buttons aren't.

A separate admin web app fares slightly better on isolation but worse on most other axes: another container, another origin, another auth flow, another bundle to keep current, with the same RLS-bypass machinery still required in the database. The work-to-value ratio is dismal at a few-dozen-users scale.

Admin RPCs in Postgres are the opposite trade. They live inside the same trust boundary as `delete_account()` and `export_my_data()` — the database, which the architecture already treats as the authority on who can do what. They add nothing to the user app's surface, nothing to the web bundle, nothing to the JWT. PostgREST is configured (`PGRST_DB_SCHEMAS=public`) to expose only `public`, so the `admin` schema is structurally unreachable from the web — and that structural unreachability is the only authorization mechanism the user-facing API needs to understand. The whole admin story exists at a layer the user-facing code doesn't know about.

## What admin can actually do, mapped to actions

The full set, deliberately small. Each row corresponds to one psql-callable RPC; the wrapping CLI is described later in this document.

| Need | RPC | Effect |
|---|---|---|
| Stop a user logging in | `admin.ban_user(target, reason)` | Sets `auth.users.banned_until = 'infinity'`; GoTrue's magic-link issuance honours it. Existing sessions also fail at next request — see "Existing sessions" below. |
| Allow them back in | `admin.unban_user(target, reason)` | Clears `banned_until`. The account's data is untouched. |
| GDPR erasure on a user's behalf | `admin.delete_account_as(target, reason)` | Same effect as the user running `delete_account()` themselves: hard-delete `auth.users`, `profiles`, `user_settings`, `votes`, `list_members`, `relationships`, `invitations`; repoint attribution to the tombstone; hard-delete lists where the user was the only remaining member. |
| Take an item down (complaint, light) | `admin.moderate_item(target, reason)` | Soft-delete attributed to the tombstone user. Recoverable by list members through the standard trash UI. The right tool for *"please remove this, it shouldn't be there"* where the requester is a list member. |
| Take an item down (legal, hard) | `admin.purge_item(target, reason)` | Hard-delete the row; cascades remove its votes. Irrecoverable. The right tool for a DMCA notice, doxxing, or anything else where soft-delete-with-recovery is unacceptable. |
| Take a list down (complaint, light) | `admin.moderate_list(target, reason)` | Soft-delete the list. Members can restore from the per-user list trash. |
| Take a list down (legal, hard) | `admin.purge_list(target, reason)` | Hard-delete the list. Cascades through `items`, `votes`, `list_members`, `invitations`. Irrecoverable. |
| Read-only inspection of a user | `admin.inspect_user(target)` | Returns a single JSON document containing the user's `auth.users` row (minus the encrypted password hash), `profiles`, `user_settings`, lists they're a member of, item and vote counts. The only RPC that does not require a reason. |

That's the list. Everything else — re-sending a magic link, debugging a failed login, deciphering a stuck PWA cache — is GoTrue's admin endpoints, Caddy logs, or the user's browser, not Cairn's database. None of those need new code.

## The `admin` schema and Postgres roles

Admin lives in its own schema, owned by a dedicated owner role, with execute privileges granted only to a non-login `cairn_admin` role. PostgREST never sees any of this.

```sql
-- Owner role: owns the schema, the audit table, and every admin RPC.
-- Nobody logs in as this role; functions defined as security definer
-- execute with its privileges. Created in the migration that introduces
-- the schema.
create role cairn_admin_owner nologin;

-- Admin role: granted to operators' personal Postgres login roles.
-- Holds nothing on its own — it's the membership marker that allows
-- the security definer functions to be called.
create role cairn_admin nologin;

-- Read-only role: for inspection without write privileges. Bypasses
-- RLS on read because reading another user's rows is the whole point.
create role cairn_readonly nologin;
grant cairn_readonly to cairn_admin;   -- admin implies readonly

create schema admin authorization cairn_admin_owner;
revoke all on schema admin from public, authenticated, anon;
grant usage on schema admin to cairn_admin;
```

Two privilege escalations happen in this design, each at its own layer:

- **Personal role → `cairn_admin`.** A `SET ROLE cairn_admin;` in psql. Operators have membership in `cairn_admin` granted to their personal login role; SET ROLE is the explicit privilege-escalation step. This is what shows up in `pg_stat_activity` and what the operator types deliberately before running a destructive command. It is the human-visible escalation.
- **`cairn_admin` → `cairn_admin_owner`.** The `security definer` clause on each RPC. The function body runs with the owner's privileges, which is what gives it access to `auth.users` (owned by `gotrue`, not by us — see below) and the ability to write to `admin.actions`. This is the in-database escalation; operators never see it directly.

The shape mirrors the existing `delete_account()` function in `account-deletion.md` and the `send_invitation` family in `invites.md` — `security definer` for the table-crossing work, the caller's identity is the input.

**`auth.users` access.** The ban and erasure RPCs write to `auth.users`, which is owned by the `gotrue` role and not by us. We grant `cairn_admin_owner` the specific privileges it needs at migration time:

```sql
grant usage on schema auth          to cairn_admin_owner;
grant select on auth.users          to cairn_admin_owner;
grant update (banned_until) on auth.users to cairn_admin_owner;
grant delete                on auth.users to cairn_admin_owner;
```

The schema `USAGE` grant comes first and is load-bearing: schema usage gates every object privilege inside, so without it the table grants below are unreachable. `cairn_admin_owner` is a deliberately limited role — unlike `delete_account()`, whose `security definer` body runs as the privileged migration-runner role and so never needs these grants spelled out. `SELECT` is needed because the RPC bodies read `auth.users` before they write (`ban_user` snapshots the prior `banned_until`; `inspect_user` returns the allowlisted columns; `delete_account_as` reads the email for the audit payload). Per-column UPDATE means `cairn_admin_owner` cannot rewrite emails or password hashes, only flip the ban field. DELETE is broader but unavoidable for erasure; in practice only `admin.delete_account_as` calls it, and that function is the only path from `cairn_admin` to row deletion on `auth.users`. The migration that bumps GoTrue is the moment to re-check that these grants still apply to a `banned_until` column that still exists with that name — same caveat as the tombstone-row contract in `account-deletion.md`.

On the `public` side, `cairn_admin_owner` is created `BYPASSRLS` and granted `SELECT/UPDATE/DELETE` on `public.items` and `public.lists` and `SELECT` on `public.list_members`, `public.profiles`, `public.user_settings`, and `public.votes`. This is necessary because the RPCs run with no JWT in scope — `public.uid()` is NULL — so the RLS policies in `data-model.md` would otherwise deny the owner every read and write against the public tables the moderate/purge/delete/inspect functions touch. `BYPASSRLS` plus these explicit grants is what lets the `security definer` body operate on user data at all; the audit-log discipline, not RLS, is the boundary on what the operator may do with that access.

## The `admin.actions` audit table

Every admin RPC, except `inspect_user`, writes one row to this table before it commits. The reason is a required argument, not a nullable column.

```sql
create table admin.actions (
  id          uuid primary key default gen_random_uuid(),
  actor       text not null,           -- session_user: the operator's login role
  effective   text not null,           -- current_user: cairn_admin_owner under security definer
  action      text not null,           -- 'ban_user', 'moderate_item', …
  target      uuid,                    -- the affected user/item/list, when applicable
  reason      text not null check (length(reason) between 1 and 2000),
  payload     jsonb,                   -- pre-state snapshot, for partial undo
  created_at  timestamptz not null default clock_timestamp()
);

-- No row-level security. authenticated/anon have no GRANT on this
-- table and no USAGE on the admin schema, so it is unreachable from
-- PostgREST; cairn_admin (via cairn_readonly inheritance) reads it
-- through psql, and INSERTs come exclusively from the security definer
-- functions below, running as cairn_admin_owner. RLS is deliberately
-- NOT enabled: enabling it with no policy default-denies the
-- cairn_readonly SELECT to zero rows, breaking `cairn-admin log`.
-- Append-only is enforced by withholding UPDATE/DELETE grants, not by
-- RLS.

grant select on admin.actions to cairn_readonly;
revoke all  on admin.actions from authenticated, anon;
```

A few choices, called out:

- **Required reason is the discipline that matters.** Writing it down *before* the action runs, in the same transaction as the action, makes the table a real audit trail rather than a guilt log. It's also the answer to *"what did we do for that GDPR request three months ago"* — `select * from admin.actions where target = ? order by created_at`. The 2000-char ceiling matches `lists.description` and is generous for any reasonable note.
- **`actor` is `session_user`, not `current_user`.** After `SET ROLE cairn_admin`, `current_user` is `cairn_admin` (uniform, useless as an audit field) while `session_user` is still the operator's personal login role (which is what the audit log should record). The `effective` column carries `current_user` as a sanity check — but note *where* it's read: the insert happens inside a `security definer` function, where `current_user` is the function owner, so `effective` records `cairn_admin_owner`, not `cairn_admin`. The check is "writes always run as the admin owner"; if `effective` is ever anything else, something escalated through a path we didn't intend.
- **`payload` snapshots the pre-state, not the post-state.** For a ban: the previous `banned_until` value. For a moderate-item: the row before soft-delete. This is the minimum for a *partial* undo (re-set the prior `banned_until`, restore the prior soft-delete state); a *full* undo of a `purge_*` action still needs Restic. The snapshot is JSON because that's what survives schema migrations of the source table without breaking old audit rows.
- **No RLS, no PostgREST exposure.** The table is in `admin`, which isn't on PostgREST's schema list. Operator reads happen through psql, against a role that has `SELECT`. The right grep for "did anyone touch Alice's data this month" is `select * from admin.actions where target = (select id from auth.users where email = ?) and created_at > now() - interval '30 days'`.

## The RPCs

All of these live in the migration that introduces the schema. They share a small set of conventions: every function is `security definer` and owned by `cairn_admin_owner`; every function `revoke`s public execute and `grant`s execute only to `cairn_admin`; every destructive function takes `reason text` as a non-optional second argument and inserts into `admin.actions` *before* the destructive statement (the insert and the action are in one transaction, so either both happen or neither does).

### `admin.ban_user` and `admin.unban_user`

```sql
create or replace function admin.ban_user(p_target uuid, p_reason text)
returns void
language plpgsql security definer
set search_path = admin, public, auth
as $$
declare prev_banned_until timestamptz;
begin
  if p_target = '00000000-0000-0000-0000-000000000000' then
    raise exception 'cannot ban the tombstone user';
  end if;

  select banned_until into prev_banned_until from auth.users where id = p_target;
  if not found then
    raise exception 'no such user';
  end if;

  insert into admin.actions (actor, effective, action, target, reason, payload)
  values (session_user, current_user, 'ban_user', p_target, p_reason,
          jsonb_build_object('banned_until', prev_banned_until));

  update auth.users set banned_until = 'infinity' where id = p_target;
end;
$$;

revoke all on function admin.ban_user(uuid, text) from public;
grant  execute on function admin.ban_user(uuid, text) to cairn_admin;

-- unban is the mirror image; same shape, sets banned_until = null.
```

`'infinity'` is Postgres's permitted timestamp sentinel for "no upper bound." GoTrue reads `banned_until` and refuses to issue a magic link if `banned_until > now()` (which is trivially true here). A future GoTrue release that removes or renames this column is the failure mode to watch for at image-bump time — same caveat as the tombstone insert in `account-deletion.md`.

### Existing sessions for a banned user

`banned_until` only governs *new* magic-link issuance. A user who is banned but holds a still-valid `cairn_session` cookie will continue to make authenticated requests until the JWT expires or the cookie is cleared. Two defences:

- **JWT lifetime.** GoTrue's `GOTRUE_JWT_EXP` is set to one hour in production (the cookie's `Max-Age` is longer; Caddy refreshes the cookie value when GoTrue issues a new token via its refresh-token flow, which the ban breaks). One hour is the worst-case window between a ban landing and the banned user being unable to make API calls.
- **Hard expiry.** If "one hour is too long" is ever true (it isn't, today), the ban can be made effective immediately by either rotating `JWT_SECRET` (invalidates every session for every user — heavy) or by adding a `revoked_at` column on a session table and consulting it in the `public.uid()` helper. The latter is a v2 problem, deliberately not designed for v1. The audit row records the moment of ban; if a follow-up "session continued for N minutes after ban" question matters, the Caddy access log filtered by `cairn_session=<that user's cookie>` answers it within the 24-hour IP-retention window.

For Cairn's threat model — a small group of friends, the rare bad actor — one-hour worst case is fine.

### What the web app shows when a banned user tries to sign in

Banning a user at the GoTrue layer affects the web app's sign-in flow, and the web app has to be deliberate about how it presents that. The principle is the same anti-enumeration argument as the *"Couldn't send invite"* pattern in `invites.md`: **the response a banned user sees when they request a magic link must be indistinguishable from the response any other user sees in the same flow.**

When the user submits their email on the sign-in screen, the web app shows the same optimistic confirmation regardless of what GoTrue actually did:

> *"Check your inbox. We sent a link to **alice@example.net**. Tap it on this device to continue."*

This is the response shown when:

- The email exists and a link was sent (the normal case).
- The email exists but the account has `banned_until > now()` and GoTrue refused to send.
- The email exists but the account is unconfirmed (`GOTRUE_MAILER_AUTOCONFIRM` is `false` in production, per `deployment.md`).
- The email doesn't resolve to any account at all (typo, never signed up, or already deleted — for first-time signups, GoTrue's `/otp` flow auto-creates the user and the email *is* sent; this case is "doesn't exist *and* signups are closed or rate-limited," which we treat the same way).
- GoTrue's send rate-limit has been hit for that address.

**The protection is structural, not rhetorical.** The screen is identical in every case, and that's the entire mechanism. In the cases where the screen technically lies (banned, unconfirmed, rate-limited, sometimes doesn't-exist), the lie is benign: the user can't verify it from this screen alone — they verify by checking their inbox, which is a private channel we don't see. An attacker probing the user database sees the same screen for every address they try, with no timing or text signal distinguishing them; a legitimate user who mistyped discovers it within a minute (no email arrives) and tries again. *"Continue"* rather than *"sign in"* in the copy reads naturally for both first-time users (whose email becomes a new account on click) and returning ones.

An earlier draft of this section used a conditional phrasing — *"If an account exists for that address, we've sent a sign-in link"* — on the grounds that hedging the claim is more honest in the failure cases. It isn't. It's actively wrong for the most important audience: the first-time user, who reads *"if there's a Cairn account…"* and reasonably wonders why the screen is asking a question they can't answer when they just submitted their email to create one. The phrasing also slightly chills returning users by implying their account might not exist. The conditional protects nothing the structural design isn't already protecting, because anti-enumeration was always a property of the screen being identical, not of any single sentence on it. Don't reintroduce it.

The page also does *not* render *"Account suspended,"* *"No such user,"* *"Please confirm your email,"* or *"Too many attempts."* Each of those would leak the failure mode and break the indistinguishability the design relies on.

The contract the web app has to honour for this to work:

- **Treat any non-2xx response from `POST /auth/magiclink` as a success in the UI.** The error path and the success path render the same screen. GoTrue's actual response code is not surfaced.
- **Don't poll for delivery status.** A *"sent / not sent"* indicator that depends on GoTrue's view of the world reintroduces the distinction. The user finds out the link works by clicking it, or doesn't by not receiving it; that's the right surface area.
- **Don't add a *"resend"* button that distinguishes failure modes.** A button that says *"Try again — we couldn't send last time"* tells an attacker which addresses GoTrue refused. The same button on every screen, with the same effect, is fine.

The operator-facing flip side: "a banned user complains they can't sign in" is invisible from the user's screen. The signal lives in GoTrue's logs (filtered by the user's email hash per `logging.md`) and in `admin.actions` (filtered by `action = 'ban_user' and target = <uid>`). Both are accessible to the operator via the standard debug commands; neither is accessible to the user. That asymmetry is the whole point.

The future-self-service-appeal-channel question in "Open questions / future work" at the bottom of this document is the one place this design forces a tradeoff: if banned users ever need an in-product way to appeal, the web app has to surface *something* the user can act on, which breaks the perfect indistinguishability above. The right shape for that is probably a single neutral *"Account issues? Contact <address>"* link on the sign-in screen, shown to everyone, not just banned users — same anti-enumeration trick at one layer of indirection.

### `admin.delete_account_as`

This is the operator's GDPR-erasure pathway. The logic is identical to the user-initiated `delete_account()` in `account-deletion.md`; the only differences are that the target is an argument instead of `public.uid()`, and that the action is logged.

```sql
create or replace function admin.delete_account_as(p_target uuid, p_reason text)
returns void
language plpgsql security definer
set search_path = admin, public, auth
as $$
declare email_at_time text;
begin
  if p_target = '00000000-0000-0000-0000-000000000000' then
    raise exception 'cannot delete the tombstone user';
  end if;

  select email into email_at_time from auth.users where id = p_target;
  if not found then
    raise exception 'no such user';
  end if;

  insert into admin.actions (actor, effective, action, target, reason, payload)
  values (session_user, current_user, 'delete_account_as', p_target, p_reason,
          jsonb_build_object('email_at_time', email_at_time));

  -- Hard-delete lists where the target was the only remaining live
  -- member. This is delete_account()'s exact query (account-deletion.md)
  -- with p_target substituted for public.uid(); using the identical form
  -- — rather than additionally scoping to lists the target belongs to —
  -- is what guarantees delete_account_as and delete_account reach the same
  -- end-state in every case, including orphaned (zero-live-member) lists.
  delete from public.lists l
  where not exists (
    select 1 from public.list_members lm
    where lm.list_id = l.id
      and lm.deleted_at is null
      and lm.user_id <> p_target
  );

  -- Trigger the cascade: profiles, user_settings, votes, list_members,
  -- relationships, invitations all cascade; attribution columns are
  -- repointed to the tombstone via on delete set default.
  delete from auth.users where id = p_target;
end;
$$;

revoke all on function admin.delete_account_as(uuid, text) from public;
grant  execute on function admin.delete_account_as(uuid, text) to cairn_admin;
```

`payload` records the email at the time of deletion. Not the full account, deliberately: the audit log should *not* be a recovery channel for personal data that was just legally erased. The email is recorded as the only piece needed to confirm "yes, that erasure request was acted on for this address" months later, in the event of a regulator query. This is a thin compromise — strictly it's still personal data, retained for the legal-defence reason. If a stricter reading ever becomes operative, the `payload` for this one RPC can be reduced to a SHA-256 hash of the email (matching the GoTrue logging policy in `logging.md`).

The avatar-file side-effect is handled the same way as user-initiated deletion: the operator runs `curl -X DELETE http://avatars:8080/avatars/<uid>` from inside the docker network as a separate step (or relies on the nightly orphan-sweep; see `avatars.md`). The RPC stays a pure database transaction; cross-container side-effects don't belong in `security definer` functions.

### `admin.moderate_item`, `admin.purge_item`

```sql
create or replace function admin.moderate_item(p_target uuid, p_reason text)
returns void
language plpgsql security definer
set search_path = admin, public
as $$
declare snap jsonb;
begin
  select to_jsonb(i) into snap from public.items i where id = p_target;
  if snap is null then
    raise exception 'no such item';
  end if;

  insert into admin.actions (actor, effective, action, target, reason, payload)
  values (session_user, current_user, 'moderate_item', p_target, p_reason, snap);

  -- Attribute the soft-delete to the tombstone. The BEFORE UPDATE
  -- attribution trigger (tg_set_attribution_items) derives deleted_by
  -- from public.uid() on the live→deleted transition, and an admin RPC
  -- has no JWT — so a deleted_by = '0000…' set directly in the UPDATE
  -- would be overwritten with NULL. Set the request claim to the
  -- tombstone first, and let the trigger stamp deleted_by through the
  -- normal path.
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', '00000000-0000-0000-0000-000000000000')::text,
    true
  );

  update public.items
     set deleted_at = clock_timestamp()
   where id = p_target
     and deleted_at is null;
end;
$$;

create or replace function admin.purge_item(p_target uuid, p_reason text)
returns void
language plpgsql security definer
set search_path = admin, public
as $$
declare snap jsonb;
begin
  select to_jsonb(i) into snap from public.items i where id = p_target;
  if snap is null then
    raise exception 'no such item';
  end if;

  insert into admin.actions (actor, effective, action, target, reason, payload)
  values (session_user, current_user, 'purge_item', p_target, p_reason, snap);

  delete from public.items where id = p_target;
end;
$$;
```

`moderate_item` is intentionally reversible. It attributes the soft-delete to the tombstone, which means no real user sees the item through the base-table `items_select` path (the `or deleted_by = public.uid()` disjunct never admits the tombstone), but the `items_deleted` view — which runs as the table owner and gates only on `is_list_member()` — does include it. List members will find the moderated item in the trash UI and can restore it via the standard `PATCH /items?id=eq.<uuid>` with `deleted_at: null`. That's the right semantics for *"someone complained and I want to take this down pending review"*: it's gone from the live list, the members can decide whether to bring it back, and there's no separate trash to remember to monitor. The tombstone attribution is the visible signal that *this wasn't a member's deletion* — see `ui.md` for the per-trash-row "Deleted by Deleted user" rendering, which is unambiguous about what happened.

`purge_item` is the legal-takedown lever. It hard-deletes the row, votes cascade away, and nothing in the live tables remembers it. The audit row's `payload` is the only record that the item ever existed — useful for "we received DMCA notice X on date Y and removed the item with these characteristics," which is the kind of question regulators or courts ask.

`moderate_list` and `purge_list` follow the same shape, against `public.lists` (`moderate_list` uses the same `set_config` claim-to-tombstone step before its UPDATE, for the same reason — `tg_set_attribution_lists` would otherwise stamp `deleted_by` NULL). Soft-delete leaves the list in every member's list trash (reachable via `lists_deleted`); hard-delete cascades through `items`, `votes`, `list_members`, `invitations`, and is gone.

### `admin.inspect_user`

```sql
create or replace function admin.inspect_user(p_target uuid)
returns jsonb
language plpgsql security definer stable
set search_path = admin, public, auth
as $$
declare result jsonb;
begin
  select jsonb_build_object(
    -- Allowlist, not denylist: the `auth` sub-document is built from an
    -- explicit set of non-secret columns. Every credential/recovery token
    -- (encrypted_password, recovery_token, confirmation_token,
    -- email_change_token_new, email_change_token_current,
    -- reauthentication_token, phone_change_token, …) is excluded *by
    -- construction*, so a future GoTrue column can never silently leak
    -- through a `to_jsonb(u)` that forgot to subtract it.
    'auth', (select jsonb_build_object(
                'id',                 u.id,
                'email',              u.email,
                'email_confirmed_at', u.email_confirmed_at,
                'last_sign_in_at',    u.last_sign_in_at,
                'banned_until',       u.banned_until,
                'created_at',         u.created_at
              )
               from auth.users u where u.id = p_target),
    'profile',       (select to_jsonb(p) from public.profiles      p where p.id = p_target),
    'user_settings', (select to_jsonb(s) from public.user_settings s where s.id = p_target),
    'memberships',   (select jsonb_agg(lm) from public.list_members lm
                       where lm.user_id = p_target and lm.deleted_at is null),
    'item_count',    (select count(*) from public.items
                       where created_by = p_target and deleted_at is null),
    'vote_count',    (select count(*) from public.votes where user_id = p_target)
  ) into result;
  return result;
end;
$$;

revoke all on function admin.inspect_user(uuid) from public;
grant  execute on function admin.inspect_user(uuid) to cairn_readonly;
```

The `auth` sub-document is an **allowlist** of non-secret columns, not a `to_jsonb(u)` with the known secrets subtracted. A denylist is the wrong shape here: every GoTrue image bump that adds a token column (`reauthentication_token`, `phone_change_token`, `email_change_token_current`, …) would silently re-introduce a leak that nobody remembered to subtract, and `inspect_user` is the *only* path `cairn_readonly` has to `auth.users` data — so a leak there is a leak to a role that is supposed to inspect without seeing credentials. Building the document from an explicit safe set means a slip of the eye while reading the result exposes nothing sensitive, and a new GoTrue column is excluded by default rather than included by default. The function is `stable` (read-only at the SQL level) and does not log to `admin.actions`: read-only inspection is *constantly* useful for debugging "user says X is broken" reports, and logging every read would either drown the audit table or train the operator to skip the log.

The deliberate counterpart: any *write* path is logged, no exceptions. The asymmetry is the protection.

## The `cairn-admin` CLI

A small bash script in the repo at `scripts/cairn-admin`. It is a shell over psql, not a replacement for psql. Bash, not Python, because the VPS has no Python runtime — a Python CLI would force one onto the production box for a single operator script; bash matches every other operator script (`scripts/list-users.sh`, …) and rides the existing ShellCheck/shfmt gauntlet. Its only jobs are ergonomics and to refuse to invoke a destructive RPC without `--reason`:

```
cairn-admin inspect alice@example.com
cairn-admin ban     alice@example.com  --reason "T&S: harassment, ticket #4"
cairn-admin unban   alice@example.com  --reason "appeal granted #5"
cairn-admin delete  alice@example.com  --reason "GDPR erasure request 2026-05-19"
cairn-admin item    moderate <uuid>    --reason "user complaint #12"
cairn-admin item    purge    <uuid>    --reason "DMCA takedown #2026-12"
cairn-admin list    moderate <uuid>    --reason "complaint, pending review"
cairn-admin list    purge    <uuid>    --reason "DMCA takedown #2026-13"
cairn-admin log     [--actor alice]    [--since '7 days']
```

The script:

- Resolves emails to UUIDs by running `select id from auth.users where lower(email) = lower(?)` first; the RPCs themselves take UUIDs only.
- Connects as the operator's personal Postgres login role (with `cairn_admin` membership granted at provisioning time), reading credentials from `~/.cairn-admin.env` outside the repo.
- Issues `SET ROLE cairn_admin;` before invoking any write RPC. The role-flip is visible in `pg_stat_activity` and is the human-visible escalation step.
- Refuses to run any destructive subcommand without `--reason`, and refuses a reason shorter than 8 characters. The CLI's arg parsing sits close to the CHECK constraint on `admin.actions.reason`, but the in-process check is the one the operator notices.
- Prints the affected row(s) before and after the action, plus the generated `admin.actions.id`. The pre-state is for the operator's eyes ("yes, that's the right item"); the post-state is for confirmation; the action id is for the audit log query.

The script is authorization theatre at the OS layer — it adds no security on its own. The real authorization is `cairn_admin` membership at the database layer, which the operator's personal Postgres role either has or doesn't. The script could be replaced by an operator typing the same SET ROLE and SELECT lines into psql by hand, and the audit trail would look identical. The script exists so the operator doesn't make a typo at 2 AM.

### Self-target confirmation

The operator is, in the usual case, also a regular Cairn user with their own `auth.users` row. Nothing in the database stops them from running `cairn-admin ban` or `cairn-admin delete` against their own account — and nothing in the database *can* stop them cleanly, because the admin RPCs have no identity binding to a Cairn user (no JWT in scope, no `public.uid()`, no operator-to-Cairn-account mapping table). "Self" is a CLI-layer concept, not a database-layer one.

The CLI reads `CAIRN_ADMIN_EMAIL` from `~/.cairn-admin.env` (set at provisioning time, one line per operator). When the resolved target of a destructive subcommand matches that email, the CLI requires a literal-string confirmation before proceeding:

```
$ cairn-admin delete me@example.com --reason "testing erasure path"
Resolved me@example.com → 7d2a...
⚠ This is YOUR OWN account (matches CAIRN_ADMIN_EMAIL in ~/.cairn-admin.env).
  Deleting it will remove your profile, votes, solo lists, and memberships.
  Items you added to shared lists stay (repointed to "Deleted user").
  Your Postgres admin access is unaffected.
  Type "DELETE MY OWN ACCOUNT" to continue: _
```

Same pattern, milder phrasing, for `ban`. The confirmation string is verbatim — copy-paste-resistant, finger-memory-resistant, awake-at-2-AM-resistant.

The guard is deliberately at the CLI, not the database, for three reasons. First, the database can't reliably know which Cairn account "belongs to" the operator — building that knowledge requires an `admin.operators` mapping table that has to be maintained on every operator change, and gets out of sync the first time someone forgets. Second, deleting your own account through admin is the highest-confidence way to test the erasure path; a hard DB rule would either block the test or force a throwaway-account dance that's less honest than testing on the account whose deletion semantics you actually care about getting right. Third, the threat being defended against is fat-fingers, not malice — a malicious operator with `cairn_admin` membership can do considerably worse than ban or delete their own account, and cryptography in the wrong place would just be theatre. The CLI confirmation is the right size of friction for the actual risk.

The audit row is written either way, with the operator's `--reason`. If you ever wonder *"did I really mean to do that"* a week later, the answer is in `admin.actions.reason`.

## Operator workflow

The canonical paths, end to end. All commands assume an SSH session on the VPS as the `cairn` Linux user.

### Banning a user

```
$ cairn-admin ban alice@example.com --reason "T&S: harassment, ticket #4"
Resolved alice@example.com → 4f6b...
Pre-state:  banned_until = null
About to ban this user. Continue? [y/N] y
Action logged: admin.actions.id = c1a3...
Post-state: banned_until = infinity
```

The user is banned at the GoTrue layer; new magic-link requests for that email will be silently dropped by GoTrue (we deliberately don't surface "this account is banned" to the requester — see the anti-enumeration discussion in `invites.md` for the analogous reasoning). Existing sessions die within an hour as the JWT expires.

### Acting on a GDPR erasure request

```
$ cairn-admin inspect alice@example.com         # confirm it's the right account
$ restic backup /home/cairn/backups              # belt-and-braces snapshot
$ cairn-admin delete alice@example.com --reason "GDPR erasure 2026-05-19, ref: legal-ticket-12"
```

The manual `restic backup` here is the one belt-and-braces step that makes the destructive action fully reversible. The nightly cron will run anyway; doing one now means the snapshot is named at the moment of action.

### Moderating an item after a complaint

For a complaint that's *probably* legitimate but where you want the list members to be able to challenge the takedown:

```
$ cairn-admin item moderate 8a91... --reason "complaint received, pending review"
```

Members see the item disappear from the live list and reappear in the trash, attributed to "Deleted user." If a member restores it from trash, the audit row stays and the next reviewer can decide whether to act differently.

For a complaint that requires unambiguous removal (DMCA, doxxing):

```
$ cairn-admin item purge 8a91... --reason "DMCA takedown #2026-12"
```

The row is gone. The audit row's `payload` is the only record that the item ever existed.

### Reading the audit log

The operator periodically reviews what's happened:

```
$ cairn-admin log --since '7 days'
$ cairn-admin log --actor alice --since '90 days'   # what has alice done?
$ cairn-admin log --target 4f6b... --since '1 year' # what's happened to this user?
```

`cairn-admin log` is `select * from admin.actions` with the obvious filters. The retention policy is "forever, until it stops fitting" — `admin.actions` is small (one row per intentional admin action, of which there are maybe dozens per year at this scale) and the audit value increases with age. The Postgres database is the one place in Cairn where the retention conversation in `logging.md` goes the other way: keep it.

### Helping a user who can't log in

Most of the time this isn't a Cairn admin task — it's GoTrue. The first commands are:

```bash
docker logs cairn-gotrue | grep $(echo -n alice@example.com | sha256sum | cut -d' ' -f1)
docker logs cairn-postgrest | tail -200
```

The first finds magic-link send attempts for Alice; the second confirms whether any of her tokens reached PostgREST. Both are documented in `logging.md`. Only if those don't explain it does the operator reach for `cairn-admin inspect` to look at the database side. There is no "resend magic link" RPC because there's no Cairn-side reason for one — Alice can request a new one herself; the lever the operator pulls is GoTrue's, not ours.

## What admin must not do

A few rules, written down because the cost of violating them is high enough to warrant the duplication of "obviously don't."

- **Don't expose `admin` to PostgREST.** `PGRST_DB_SCHEMAS=public` is the single line in `.env.prod` that enforces this. Adding `admin` to that list — even temporarily, even for a "let me test something" reason — turns every RPC in this document into a public REST endpoint that any authenticated user can call. The schema separation only works because it isn't.
- **Don't call admin RPCs from the user-facing web app.** Even if PostgREST exposed them, even if the right cookie were attached, the right answer is to add a flow that goes through the user's own JWT (e.g. by extending `delete_account()` or `export_my_data`), not to plumb admin into the frontend.
- **Don't run destructive RPCs without `--reason`.** The CLI refuses, but psql doesn't. A direct `select admin.purge_item('...', '');` will fail the CHECK constraint at the database layer — that's the load-bearing defence. The CLI's refusal is a fast pre-check, not the wall.
- **Don't grant `cairn_admin` to `authenticated`.** The roles are non-login on purpose. Granting them to `authenticated` (the PostgREST role) gives every API caller `EXECUTE` on every admin RPC. The `revoke all from public` lines in each function definition are the second wall; the role separation is the first.
- **Don't edit `admin.actions` after the fact.** Operators have `SELECT` on the table, not `UPDATE` or `DELETE`. If you ever feel the urge to "clean up" a row, the right action is to add a new row explaining the situation, not to remove the old one. The migration that creates the table grants `SELECT` only; this is deliberate.
- **Don't put user content in `admin.actions.reason`.** The reason field is for the operator to explain themselves, not to quote the offending material. Ticket numbers, request IDs, short categorizations ("DMCA," "T&S," "user request") are the right vocabulary. Verbatim copies of complainant emails, the moderated item's name, anything that recreates user content — those have no place in an audit row that the operator will read months later out of context.
- **Don't add a hard DB-level guard against banning or deleting your own account.** The temptation is to slot `if p_target = (select user_id from admin.operators where postgres_role = session_user) then raise exception ...` into `ban_user` and `delete_account_as`. Don't — it requires an operator-mapping table that has to be maintained on every operator change, it gets out of sync the first time someone forgets, and it blocks the legitimate case of testing the erasure path on your own account. Self-protection is a CLI concern, not a database concern; see "Self-target confirmation" above.

## What's deliberately not in scope

A short list of things this document does *not* cover, with a one-line reason each.

- **An admin UI.** See the rationale at the top of this document. Reconsider when there are multiple operators, more than weekly admin actions, or any kind of public registration.
- **Multi-operator authentication.** Today the operator pool is "people with SSH access to the VPS and a Postgres login role granted `cairn_admin`." That's two operators in practice (the maintainers). Adding a third means provisioning a third Postgres login role and granting it `cairn_admin`; nothing in this document changes. Adding a tenth means a real identity story (LDAP, SSO, hardware keys), which is a v2 problem.
- **Per-action approvals.** No two-person rule for destructive operations. The audit log is the deterrent; at this scale it's enough.
- **Rate limiting on admin actions.** There's no rate limiter. There's also no scenario where the operator is rate-limited in a useful way — the limit is operator restraint, not infrastructure.
- **Notifying users of admin actions.** The product is silent about admin operations against accounts and content. A banned user finds out when their magic-link request fails; a user whose account was erased by request is the person who made the request. There's no general "you have been moderated" notification, and no architecture for one. If a future legal regime requires user-facing notification of moderation actions (e.g. DSA Article 17 for in-scope platforms), this is the place that would change — but Cairn is well below the DSA's "very large platform" thresholds and the proportionate compliance for a small private app is *"document the policy, keep the audit log, respond to user requests."*
- **Cross-instance moderation.** Cairn is single-tenant per VPS. There is no central moderation across deployments; no operator-level reputation; no shared blocklist. Other people running Cairn on their own VPS are running their own product as far as this document is concerned.

## Considered and rejected

The shape this document describes is one of several plausible answers. The ones it isn't, and why.

- **Admin UI inside the user app, gated by a JWT claim.** Rejected for the reasons in "Why no admin UI." The single worst feature is that the admin code paths ship to every device.
- **A separate admin web app on `cairn-admin.<domain>`.** Smaller-surface than admin-in-the-user-app, but still adds an origin, an auth flow, a bundle, and the RLS-bypass machinery in the database. The work-to-value ratio is bad at this scale, and the database-only design accomplishes the same outcome with less moving parts. Reconsider when there are operators who shouldn't have SSH.
- **A Postgres superuser role for admins.** Maximum power; minimum auditability. Anything the operator does as superuser bypasses the `admin.actions` insertion entirely — there is no way to log it short of trigger machinery on every table, which is both heavy and easily disabled by the same superuser. The `security definer` + dedicated role pattern is the cheapest design that makes the audit log structurally hard to bypass.
- **An external moderation queue (Modtools, etc).** Wildly out of scale. Cairn's moderation surface is on the order of one decision per quarter.
- **Encrypted `admin.actions` so even superusers can't read it.** Considered for the "what if the operator goes rogue" threat model. Rejected because the operator who would tamper with the log is also the operator who holds the encryption key. The right defence against an untrustworthy operator is to have a second one; cryptography doesn't help.
- **Per-action 2FA prompt.** The CLI could prompt for a TOTP code before each destructive RPC. Rejected for v1 — the SSH layer already requires a key, which is the second factor; doubling up at the CLI is friction without a clear threat. Reconsider when there are operators on shared workstations.

## Open questions / future work

- **Avatar file cleanup in the admin erasure path.** Currently the operator runs `curl -X DELETE http://avatars:8080/avatars/<uid>` as a separate post-step, or relies on the nightly orphan-sweep from `avatars.md`. A single `cairn-admin delete` subcommand that does both would be obvious to add and is on the list. The blocker is that the admin script doesn't currently shell into the docker network — once it does for one reason, it can do it for this one too.
- **A scheduled "what happened" summary.** A weekly cron that emails the operator the last seven days of `admin.actions` would catch a compromised account or a misconfiguration earlier than the current "remember to check" pattern. Cheap to add; not a v1 must-have.
- **Soft-delete recovery semantics for `moderate_item`.** Today, any list member can restore a moderated item from the trash. That's the right default for ambiguous cases but the wrong one for "this item is genuinely not okay." A future `moderate_item_locked` that uses a sentinel `deleted_by` other than the tombstone (and a matching policy clause that prevents restore) would split the difference. Not pressing until moderation volume justifies the second column.
- **Two-person rule for `purge_*`.** A workflow where one operator initiates a hard-delete and a second confirms within an hour. Reasonable to add when there is a second operator who isn't also the first one's manager. Not architecturally interesting; just a flag column and a second RPC.
- **Self-service appeal channel.** Banned users currently have no in-product path to appeal. They have an out-of-product one (email the operator), which is fine at this scale, but it isn't documented anywhere the user-facing app surfaces. Worth a one-line *"Account suspended — contact <address>"* on the sign-in screen if the magic-link path fails due to a ban. The blocker is that GoTrue doesn't tell the front-end *why* the magic-link path failed; we'd need a different error surface to distinguish ban from rate-limit from "we couldn't send the email."
