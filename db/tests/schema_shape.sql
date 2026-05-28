-- schema_shape.sql — locks in the shape of every domain table, view,
-- and function introduced by migration 0004.
--
-- Cheapest regression net: a migration that silently drops a view,
-- renames a column, or alters a function signature reds *here*
-- rather than only through downstream RLS/trigger tests. Phase B
-- expects this whole file red; Phase C green.
--
-- See docs/data-model.md → Tables / Views / Triggers and PLAN.md →
-- Architecture → Test files row `schema_shape.sql` for the per-
-- assertion rationale (in particular the load-bearing
-- `hasnt_column(... 'added_by')` that locks in the rename to
-- `created_by`).

BEGIN;

SELECT plan(75);

-- ---------------------------------------------------------------------
-- Tables (6) — every new table introduced by 0004 must exist.
-- ---------------------------------------------------------------------
SELECT has_table('public', 'profiles', 'profiles table exists');
SELECT has_table('public', 'user_settings', 'user_settings table exists');
SELECT has_table('public', 'lists', 'lists table exists');
SELECT has_table('public', 'list_members', 'list_members table exists');
SELECT has_table('public', 'items', 'items table exists');
SELECT has_table('public', 'votes', 'votes table exists');

-- ---------------------------------------------------------------------
-- profiles columns (4)
-- ---------------------------------------------------------------------
SELECT has_column('public', 'profiles', 'id', 'profiles.id exists');
SELECT has_column(
  'public', 'profiles', 'display_name', 'profiles.display_name exists'
);
SELECT has_column(
  'public', 'profiles', 'created_at', 'profiles.created_at exists'
);
SELECT has_column(
  'public', 'profiles', 'modified_at', 'profiles.modified_at exists'
);
SELECT has_column(
  'public', 'profiles', 'avatar_version',
  'profiles has avatar_version column'
);

-- ---------------------------------------------------------------------
-- user_settings columns (4)
-- ---------------------------------------------------------------------
SELECT has_column(
  'public', 'user_settings', 'id', 'user_settings.id exists'
);
SELECT has_column(
  'public',
  'user_settings',
  'invite_policy',
  'user_settings.invite_policy exists'
);
SELECT has_column(
  'public',
  'user_settings',
  'created_at',
  'user_settings.created_at exists'
);
SELECT has_column(
  'public',
  'user_settings',
  'modified_at',
  'user_settings.modified_at exists'
);

-- ---------------------------------------------------------------------
-- lists columns (8) — no `modified_by` on lists (see data-model.md).
-- ---------------------------------------------------------------------
SELECT has_column('public', 'lists', 'id', 'lists.id exists');
SELECT has_column('public', 'lists', 'name', 'lists.name exists');
SELECT has_column(
  'public', 'lists', 'description', 'lists.description exists'
);
SELECT has_column(
  'public', 'lists', 'created_by', 'lists.created_by exists'
);
SELECT has_column(
  'public', 'lists', 'deleted_by', 'lists.deleted_by exists'
);
SELECT has_column(
  'public', 'lists', 'created_at', 'lists.created_at exists'
);
SELECT has_column(
  'public', 'lists', 'modified_at', 'lists.modified_at exists'
);
SELECT has_column(
  'public', 'lists', 'deleted_at', 'lists.deleted_at exists'
);

-- ---------------------------------------------------------------------
-- list_members columns (7) — `created_by`, NOT `added_by`. The
-- hasnt_column assertion below is the load-bearing companion.
-- ---------------------------------------------------------------------
SELECT has_column(
  'public', 'list_members', 'list_id', 'list_members.list_id exists'
);
SELECT has_column(
  'public', 'list_members', 'user_id', 'list_members.user_id exists'
);
SELECT has_column(
  'public',
  'list_members',
  'created_by',
  'list_members.created_by exists'
);
SELECT has_column(
  'public',
  'list_members',
  'deleted_by',
  'list_members.deleted_by exists'
);
SELECT has_column(
  'public',
  'list_members',
  'created_at',
  'list_members.created_at exists'
);
SELECT has_column(
  'public',
  'list_members',
  'modified_at',
  'list_members.modified_at exists'
);
SELECT has_column(
  'public',
  'list_members',
  'deleted_at',
  'list_members.deleted_at exists'
);

-- ---------------------------------------------------------------------
-- items columns (10)
-- ---------------------------------------------------------------------
SELECT has_column('public', 'items', 'id', 'items.id exists');
SELECT has_column('public', 'items', 'list_id', 'items.list_id exists');
SELECT has_column('public', 'items', 'name', 'items.name exists');
SELECT has_column('public', 'items', 'notes', 'items.notes exists');
SELECT has_column(
  'public', 'items', 'created_by', 'items.created_by exists'
);
SELECT has_column(
  'public', 'items', 'modified_by', 'items.modified_by exists'
);
SELECT has_column(
  'public', 'items', 'deleted_by', 'items.deleted_by exists'
);
SELECT has_column(
  'public', 'items', 'created_at', 'items.created_at exists'
);
SELECT has_column(
  'public', 'items', 'modified_at', 'items.modified_at exists'
);
SELECT has_column(
  'public', 'items', 'deleted_at', 'items.deleted_at exists'
);

-- ---------------------------------------------------------------------
-- votes columns (5) — `created_at` (not `voted_at`) + `modified_at`.
-- ---------------------------------------------------------------------
SELECT has_column('public', 'votes', 'item_id', 'votes.item_id exists');
SELECT has_column('public', 'votes', 'user_id', 'votes.user_id exists');
SELECT has_column('public', 'votes', 'value', 'votes.value exists');
SELECT has_column(
  'public', 'votes', 'created_at', 'votes.created_at exists'
);
SELECT has_column(
  'public', 'votes', 'modified_at', 'votes.modified_at exists'
);

-- ---------------------------------------------------------------------
-- Views (3) — the per-list ranked view + the two trash views.
-- ---------------------------------------------------------------------
SELECT has_view(
  'public', 'items_ranked', 'items_ranked view exists'
);
SELECT has_view(
  'public', 'items_deleted', 'items_deleted view exists'
);
SELECT has_view(
  'public', 'lists_deleted', 'lists_deleted view exists'
);

-- ---------------------------------------------------------------------
-- Functions (4) — uid, the two membership helpers, the create_list RPC.
-- Signature locked via the argtypes array so a future migration that
-- changes an argument silently reds here.
-- ---------------------------------------------------------------------
SELECT has_function(
  'public', 'uid', ARRAY[]::text [], 'public.uid() exists with no args'
);
SELECT has_function(
  'public',
  'is_list_member',
  ARRAY['uuid'],
  'public.is_list_member(uuid) exists'
);
SELECT has_function(
  'public',
  'is_items_list_member',
  ARRAY['uuid'],
  'public.is_items_list_member(uuid) exists'
);
SELECT has_function(
  'public',
  'create_list',
  ARRAY['text', 'text'],
  'public.create_list(text, text) exists'
);
SELECT has_function(
  'public', 'bump_avatar_version', ARRAY[]::text [],
  'public.bump_avatar_version() exists with no args'
);
SELECT has_function(
  'public', 'clear_avatar', ARRAY[]::text [],
  'public.clear_avatar() exists with no args'
);
SELECT has_function(
  'public', 'set_display_name', ARRAY['text'],
  'public.set_display_name(text) exists'
);

-- ---------------------------------------------------------------------
-- relationships table (1) + columns (5) + circle RPCs (2) — added by 0008.
-- ---------------------------------------------------------------------
SELECT has_table(
  'public', 'relationships', 'relationships table exists'
);
SELECT has_column(
  'public', 'relationships', 'user_id', 'relationships.user_id exists'
);
SELECT has_column(
  'public',
  'relationships',
  'other_user_id',
  'relationships.other_user_id exists'
);
SELECT has_column(
  'public', 'relationships', 'status', 'relationships.status exists'
);
SELECT has_column(
  'public',
  'relationships',
  'created_at',
  'relationships.created_at exists'
);
SELECT has_column(
  'public',
  'relationships',
  'modified_at',
  'relationships.modified_at exists'
);
SELECT has_function(
  'public', 'add_circle_by_email', ARRAY['text'],
  'public.add_circle_by_email(text) exists'
);
SELECT has_function(
  'public', 'add_circle_by_id', ARRAY['uuid'],
  'public.add_circle_by_id(uuid) exists'
);

-- ---------------------------------------------------------------------
-- invitations table (1) + columns (7) + invite RPCs (3) — added by 0009.
-- ---------------------------------------------------------------------
SELECT has_table(
  'public', 'invitations', 'invitations table exists'
);
SELECT has_column(
  'public', 'invitations', 'id', 'invitations.id exists'
);
SELECT has_column(
  'public', 'invitations', 'list_id', 'invitations.list_id exists'
);
SELECT has_column(
  'public',
  'invitations',
  'created_by',
  'invitations.created_by exists'
);
SELECT has_column(
  'public',
  'invitations',
  'target_user_id',
  'invitations.target_user_id exists'
);
SELECT has_column(
  'public',
  'invitations',
  'target_email',
  'invitations.target_email exists'
);
SELECT has_column(
  'public',
  'invitations',
  'created_at',
  'invitations.created_at exists'
);
SELECT has_column(
  'public',
  'invitations',
  'modified_at',
  'invitations.modified_at exists'
);
SELECT has_function(
  'public', 'send_invitation', ARRAY['uuid', 'text', 'uuid'],
  'public.send_invitation(uuid, text, uuid) exists'
);
SELECT has_function(
  'public', 'accept_invitation', ARRAY['uuid'],
  'public.accept_invitation(uuid) exists'
);
SELECT has_function(
  'public', 'decline_invitation', ARRAY['uuid'],
  'public.decline_invitation(uuid) exists'
);

-- ---------------------------------------------------------------------
-- Load-bearing absence assertion — locks in the rename of the old
-- `list_members.added_by` to `created_by`.
-- ---------------------------------------------------------------------
SELECT hasnt_column(
  'public',
  'list_members',
  'added_by',
  'list_members has no `added_by` column (renamed to `created_by`)'
);

SELECT finish();

ROLLBACK;
