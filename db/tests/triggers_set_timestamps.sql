-- triggers_set_timestamps.sql — locks in the universal
-- `tg_set_timestamps` BEFORE INSERT OR UPDATE trigger across every
-- table that has `created_at` and `modified_at`: profiles,
-- user_settings, lists, list_members, items, votes.
--
-- For every such table three assertions:
--   (a) **INSERT-override** — INSERT with both timestamps
--       backdated to 2020; assert stored values are within 5 s of
--       `now()` (the freeze cannot be bypassed by client value).
--   (b) **UPDATE-freeze `created_at`** — capture, then a PATCH-
--       style UPDATE that sets `created_at` to a backdated
--       literal; assert stored value matches the capture.
--   (c) **UPDATE-freeze `modified_at`** — same shape with *only*
--       `modified_at` in the SET list. `modified_at` is
--       deliberately absent from every per-table
--       `tg_set_modified_at` `OF` list, so `t20` does not fire
--       and `t05`'s freeze is the only thing standing. Without
--       (c), a member could `PATCH /lists?id=eq.<x>` with body
--       `{"modified_at": "2030-01-01"}` and silently distort every
--       "last modified" surface.
--
-- All INSERTs and UPDATEs run as the test session's `cairn`
-- superuser (the no-INSERT-grant on `lists` / `list_members`
-- makes that mandatory; the other four legs could also run as
-- `authenticated`). JWT claims are set by the included fixture
-- so attribution triggers on `lists` / `list_members` / `items`
-- don't fail their NOT NULL.

BEGIN;

SELECT plan(18);

\i /db/tests/fixtures/list_solo_alice.sql

-- Eve is the "fresh" user for profiles / user_settings INSERT
-- tests. Inserting her into auth.users fires
-- `tg_profile_on_signup`, which creates her profile and
-- user_settings rows automatically. Delete those so the (a)
-- INSERT-override tests below can write their own backdated rows.
INSERT INTO auth.users (id, email) VALUES
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'eve@test');

DELETE FROM public.profiles
WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

DELETE FROM public.user_settings
WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

-- ===================================================================
-- profiles
-- ===================================================================

INSERT INTO public.profiles
(id, display_name, username, created_at, modified_at) VALUES
(
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Eve', 'EveHandle',
  '2020-01-01T00:00:00Z'::timestamptz,
  '2020-01-01T00:00:00Z'::timestamptz
);

SELECT ok(
  (
    SELECT
      abs(extract(EPOCH FROM (now() - created_at))) < 5
      AND abs(extract(EPOCH FROM (now() - modified_at))) < 5
    FROM public.profiles
    WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
  ),
  'profiles (a) INSERT-override: backdated timestamps clamped to now()'
);

CREATE TEMPORARY TABLE _cap_profiles AS
SELECT
  created_at,
  modified_at
FROM public.profiles
WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

UPDATE public.profiles
SET created_at = '2020-01-01T00:00:00Z'::timestamptz
WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

SELECT is(
  (
    SELECT created_at FROM public.profiles
    WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
  ),
  (SELECT c.created_at FROM _cap_profiles AS c),
  'profiles (b) UPDATE-freeze: created_at survives a backdated UPDATE'
);

UPDATE public.profiles
SET modified_at = '2030-01-01T00:00:00Z'::timestamptz
WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

SELECT is(
  (
    SELECT modified_at FROM public.profiles
    WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
  ),
  (SELECT c.modified_at FROM _cap_profiles AS c),
  'profiles (c) UPDATE-freeze: modified_at survives a future-dated UPDATE '
  '(t20 not bound on modified_at)'
);

-- ===================================================================
-- user_settings
-- ===================================================================

INSERT INTO public.user_settings
(id, invite_policy, created_at, modified_at) VALUES
(
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'circle',
  '2020-01-01T00:00:00Z'::timestamptz,
  '2020-01-01T00:00:00Z'::timestamptz
);

SELECT ok(
  (
    SELECT
      abs(extract(EPOCH FROM (now() - created_at))) < 5
      AND abs(extract(EPOCH FROM (now() - modified_at))) < 5
    FROM public.user_settings
    WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
  ),
  'user_settings (a) INSERT-override: backdated timestamps clamped to now()'
);

CREATE TEMPORARY TABLE _cap_user_settings AS
SELECT
  created_at,
  modified_at
FROM public.user_settings
WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

UPDATE public.user_settings
SET created_at = '2020-01-01T00:00:00Z'::timestamptz
WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

SELECT is(
  (
    SELECT created_at FROM public.user_settings
    WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
  ),
  (SELECT c.created_at FROM _cap_user_settings AS c),
  'user_settings (b) UPDATE-freeze: created_at survives a backdated UPDATE'
);

UPDATE public.user_settings
SET modified_at = '2030-01-01T00:00:00Z'::timestamptz
WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

SELECT is(
  (
    SELECT modified_at FROM public.user_settings
    WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
  ),
  (SELECT c.modified_at FROM _cap_user_settings AS c),
  'user_settings (c) UPDATE-freeze: modified_at survives a future-dated UPDATE'
);

-- ===================================================================
-- lists
-- ===================================================================

INSERT INTO public.lists
(id, name, created_at, modified_at) VALUES
(
  '77777777-7777-7777-7777-777777777777', 'Timestamps test',
  '2020-01-01T00:00:00Z'::timestamptz,
  '2020-01-01T00:00:00Z'::timestamptz
);

SELECT ok(
  (
    SELECT
      abs(extract(EPOCH FROM (now() - created_at))) < 5
      AND abs(extract(EPOCH FROM (now() - modified_at))) < 5
    FROM public.lists
    WHERE id = '77777777-7777-7777-7777-777777777777'
  ),
  'lists (a) INSERT-override: backdated timestamps clamped to now()'
);

CREATE TEMPORARY TABLE _cap_lists AS
SELECT
  created_at,
  modified_at
FROM public.lists
WHERE id = '77777777-7777-7777-7777-777777777777';

UPDATE public.lists
SET created_at = '2020-01-01T00:00:00Z'::timestamptz
WHERE id = '77777777-7777-7777-7777-777777777777';

SELECT is(
  (
    SELECT created_at FROM public.lists
    WHERE id = '77777777-7777-7777-7777-777777777777'
  ),
  (SELECT c.created_at FROM _cap_lists AS c),
  'lists (b) UPDATE-freeze: created_at survives a backdated UPDATE'
);

UPDATE public.lists
SET modified_at = '2030-01-01T00:00:00Z'::timestamptz
WHERE id = '77777777-7777-7777-7777-777777777777';

SELECT is(
  (
    SELECT modified_at FROM public.lists
    WHERE id = '77777777-7777-7777-7777-777777777777'
  ),
  (SELECT c.modified_at FROM _cap_lists AS c),
  'lists (c) UPDATE-freeze: modified_at survives a future-dated UPDATE'
);

-- ===================================================================
-- list_members  (Eve in Alice's solo list 2222)
-- ===================================================================

INSERT INTO public.list_members
(list_id, user_id, created_at, modified_at) VALUES
(
  '22222222-2222-2222-2222-222222222222',
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  '2020-01-01T00:00:00Z'::timestamptz,
  '2020-01-01T00:00:00Z'::timestamptz
);

SELECT ok(
  (
    SELECT
      abs(extract(EPOCH FROM (now() - created_at))) < 5
      AND abs(extract(EPOCH FROM (now() - modified_at))) < 5
    FROM public.list_members
    WHERE
      list_id = '22222222-2222-2222-2222-222222222222'
      AND user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
  ),
  'list_members (a) INSERT-override: backdated timestamps clamped to now()'
);

CREATE TEMPORARY TABLE _cap_list_members AS
SELECT
  created_at,
  modified_at
FROM public.list_members
WHERE
  list_id = '22222222-2222-2222-2222-222222222222'
  AND user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

UPDATE public.list_members
SET created_at = '2020-01-01T00:00:00Z'::timestamptz
WHERE
  list_id = '22222222-2222-2222-2222-222222222222'
  AND user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

SELECT is(
  (
    SELECT created_at FROM public.list_members
    WHERE
      list_id = '22222222-2222-2222-2222-222222222222'
      AND user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
  ),
  (SELECT c.created_at FROM _cap_list_members AS c),
  'list_members (b) UPDATE-freeze: created_at survives a backdated UPDATE'
);

UPDATE public.list_members
SET modified_at = '2030-01-01T00:00:00Z'::timestamptz
WHERE
  list_id = '22222222-2222-2222-2222-222222222222'
  AND user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

SELECT is(
  (
    SELECT modified_at FROM public.list_members
    WHERE
      list_id = '22222222-2222-2222-2222-222222222222'
      AND user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
  ),
  (SELECT c.modified_at FROM _cap_list_members AS c),
  'list_members (c) UPDATE-freeze: modified_at survives a future-dated UPDATE'
);

-- ===================================================================
-- items
-- ===================================================================

INSERT INTO public.items
(id, list_id, name, created_at, modified_at) VALUES
(
  '88888888-8888-8888-8888-888888888888',
  '22222222-2222-2222-2222-222222222222',
  'Backdated movie',
  '2020-01-01T00:00:00Z'::timestamptz,
  '2020-01-01T00:00:00Z'::timestamptz
);

SELECT ok(
  (
    SELECT
      abs(extract(EPOCH FROM (now() - created_at))) < 5
      AND abs(extract(EPOCH FROM (now() - modified_at))) < 5
    FROM public.items
    WHERE id = '88888888-8888-8888-8888-888888888888'
  ),
  'items (a) INSERT-override: backdated timestamps clamped to now()'
);

CREATE TEMPORARY TABLE _cap_items AS
SELECT
  created_at,
  modified_at
FROM public.items
WHERE id = '88888888-8888-8888-8888-888888888888';

UPDATE public.items
SET created_at = '2020-01-01T00:00:00Z'::timestamptz
WHERE id = '88888888-8888-8888-8888-888888888888';

SELECT is(
  (
    SELECT created_at FROM public.items
    WHERE id = '88888888-8888-8888-8888-888888888888'
  ),
  (SELECT c.created_at FROM _cap_items AS c),
  'items (b) UPDATE-freeze: created_at survives a backdated UPDATE'
);

UPDATE public.items
SET modified_at = '2030-01-01T00:00:00Z'::timestamptz
WHERE id = '88888888-8888-8888-8888-888888888888';

SELECT is(
  (
    SELECT modified_at FROM public.items
    WHERE id = '88888888-8888-8888-8888-888888888888'
  ),
  (SELECT c.modified_at FROM _cap_items AS c),
  'items (c) UPDATE-freeze: modified_at survives a future-dated UPDATE'
);

-- ===================================================================
-- votes  (Alice on item 8888 — votes has no attribution trigger,
-- so JWT claims aren't load-bearing here.)
-- ===================================================================

INSERT INTO public.votes
(item_id, user_id, value, created_at, modified_at) VALUES
(
  '88888888-8888-8888-8888-888888888888',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  1,
  '2020-01-01T00:00:00Z'::timestamptz,
  '2020-01-01T00:00:00Z'::timestamptz
);

SELECT ok(
  (
    SELECT
      abs(extract(EPOCH FROM (now() - created_at))) < 5
      AND abs(extract(EPOCH FROM (now() - modified_at))) < 5
    FROM public.votes
    WHERE
      item_id = '88888888-8888-8888-8888-888888888888'
      AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  'votes (a) INSERT-override: backdated timestamps clamped to now()'
);

CREATE TEMPORARY TABLE _cap_votes AS
SELECT
  created_at,
  modified_at
FROM public.votes
WHERE
  item_id = '88888888-8888-8888-8888-888888888888'
  AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

UPDATE public.votes
SET created_at = '2020-01-01T00:00:00Z'::timestamptz
WHERE
  item_id = '88888888-8888-8888-8888-888888888888'
  AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

SELECT is(
  (
    SELECT created_at FROM public.votes
    WHERE
      item_id = '88888888-8888-8888-8888-888888888888'
      AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  (SELECT c.created_at FROM _cap_votes AS c),
  'votes (b) UPDATE-freeze: created_at survives a backdated UPDATE'
);

UPDATE public.votes
SET modified_at = '2030-01-01T00:00:00Z'::timestamptz
WHERE
  item_id = '88888888-8888-8888-8888-888888888888'
  AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

SELECT is(
  (
    SELECT modified_at FROM public.votes
    WHERE
      item_id = '88888888-8888-8888-8888-888888888888'
      AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  (SELECT c.modified_at FROM _cap_votes AS c),
  'votes (c) UPDATE-freeze: modified_at survives a future-dated UPDATE'
);

SELECT finish();

ROLLBACK;
