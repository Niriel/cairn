-- triggers_set_attribution.sql — the per-table attribution
-- triggers (`tg_set_attribution_lists`, `tg_set_attribution_items`,
-- `tg_set_attribution_list_members`) × every rule they encode.
-- Largest test file in B.2 because the rules are the hardest
-- part of 0004 (Risk #11 DEFAULT-trap, Risk #12 cascade-aware
-- gating + content-aware modified_by).
--
-- 26 assertions organised by rule:
--   (i)   INSERT client-override of `created_by` — 1 per table.
--   (ii)  INSERT `deleted_by := NULL` — 1 per table.
--   (iii) UPDATE-time `created_by` attribution-lock — 1 per table.
--   (iii.b) UPDATE-time `deleted_by` anti-spoof freeze on the
--          ELSE branch — 3 sub-assertions on `lists`.
--   (iv)  `deleted_by` set on `deleted_at` null→non-null — 1
--         per table.
--   (v)   `deleted_by` frozen when `deleted_at` unchanged — items
--         and list_members (narrower restatement of (iii.b)(1)
--         for symmetry across the three attribution-bearing
--         tables).
--   (vi)  `deleted_by` cleared on `deleted_at` non-null→null
--         restore — 1 per table.
--   (vii) Items INSERT `modified_by := public.uid()`.
--   (viii) Items UPDATE-time content-edit stamps `modified_by`.
--   (ix)  Items UPDATE-time `modified_by` anti-spoof freeze
--         (PATCH with no content change).
--   (x)   Cascade for items.created_by leaves modified_by
--         unchanged when modified_by points at a non-deleted
--         user — load-bearing for Risk #12 (per-rule keying).
--         Split into two assertions (created_by repointed +
--         modified_by preserved) so a regression in either half
--         surfaces independently.
--   (xi)  Cascade-ordering coverage with two FK legs to the same
--         deleted user — load-bearing for Risk #12 (cascade-
--         order independence).
--
-- Role context: all INSERTs/UPDATEs run as the test session's
-- `cairn` superuser. JWT claims are switched between Alice and
-- Bob via `set_config('request.jwt.claims', …, TRUE)` to
-- exercise the trigger's `public.uid()` reads. Grant-layer
-- denials are covered separately in `grants.sql`, `rls_lists.sql`,
-- `rls_list_members.sql`.

BEGIN;

SELECT plan(26);

\i /db/tests/fixtures/list_shared_alice_bob.sql

-- Add two additional users — Eve and Frank — for list_members
-- tests that need fresh (list_id, user_id) pairs.
INSERT INTO auth.users (id, email) VALUES
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'eve@test');
INSERT INTO auth.users (id, email) VALUES
('ffffffff-ffff-ffff-ffff-ffffffffffff', 'frank@test');

-- ===================================================================
-- (i) INSERT client-override of `created_by` — one per table
-- ===================================================================
-- INSERT with a client-supplied `created_by = <bob>`; the trigger
-- must overwrite with `public.uid() = alice`.

INSERT INTO public.lists (id, name, created_by) VALUES
(
  '00000003-0000-0000-0000-000000000003', 'i on lists',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
);
SELECT is(
  (
    SELECT created_by FROM public.lists
    WHERE id = '00000003-0000-0000-0000-000000000003'
  ),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'lists (i) INSERT client-override: created_by from client (bob) -> alice'
);

INSERT INTO public.list_members (list_id, user_id, created_by) VALUES
(
  '11111111-1111-1111-1111-111111111111',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
);
SELECT is(
  (
    SELECT created_by FROM public.list_members
    WHERE
      list_id = '11111111-1111-1111-1111-111111111111'
      AND user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
  ),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'list_members (i) INSERT client-override: created_by (bob) -> alice'
);

INSERT INTO public.items (id, list_id, name, created_by) VALUES
(
  '00000031-0000-0000-0000-000000000031',
  '11111111-1111-1111-1111-111111111111',
  'i on items',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
);
SELECT is(
  (
    SELECT created_by FROM public.items
    WHERE id = '00000031-0000-0000-0000-000000000031'
  ),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'items (i) INSERT client-override: created_by (bob) -> alice'
);

-- ===================================================================
-- (ii) INSERT `deleted_by := NULL` — one per table
-- ===================================================================
-- The column DEFAULT is the tombstone (load-bearing for SET
-- DEFAULT cascade); a freshly inserted live row must override
-- to NULL. INSERT with a client-supplied `deleted_by = <bob>`
-- (real, non-tombstone, FK-valid); assert stored = NULL.

INSERT INTO public.lists (id, name, deleted_by) VALUES
(
  '00000004-0000-0000-0000-000000000004', 'ii on lists',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
);
SELECT is(
  (
    SELECT deleted_by FROM public.lists
    WHERE id = '00000004-0000-0000-0000-000000000004'
  ),
  NULL,
  'lists (ii) INSERT deleted_by override: client-supplied bob -> NULL'
);

INSERT INTO public.list_members (list_id, user_id, deleted_by) VALUES
(
  '11111111-1111-1111-1111-111111111111',
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
);
SELECT is(
  (
    SELECT deleted_by FROM public.list_members
    WHERE
      list_id = '11111111-1111-1111-1111-111111111111'
      AND user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
  ),
  NULL,
  'list_members (ii) INSERT deleted_by override: bob -> NULL'
);

INSERT INTO public.items (id, list_id, name, deleted_by) VALUES
(
  '00000032-0000-0000-0000-000000000032',
  '11111111-1111-1111-1111-111111111111',
  'ii on items',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
);
SELECT is(
  (
    SELECT deleted_by FROM public.items
    WHERE id = '00000032-0000-0000-0000-000000000032'
  ),
  NULL,
  'items (ii) INSERT deleted_by override: bob -> NULL'
);

-- ===================================================================
-- (iii) UPDATE-time `created_by` attribution-lock — one per table
-- ===================================================================
-- Seed an Alice-attributed row; switch JWT claims to Bob; attempt
-- to PATCH `created_by = <bob>`; assert stored stays Alice.

-- Item for the items leg of (iii). Alice creates it before
-- switching claims.
INSERT INTO public.items (id, list_id, name) VALUES
(
  '00000033-0000-0000-0000-000000000033',
  '11111111-1111-1111-1111-111111111111',
  'iii on items'
);

-- Switch to Bob's claims for (iii).
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}',
  TRUE
);

UPDATE public.lists
SET created_by = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
WHERE id = '11111111-1111-1111-1111-111111111111';
SELECT is(
  (
    SELECT created_by FROM public.lists
    WHERE id = '11111111-1111-1111-1111-111111111111'
  ),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'lists (iii) UPDATE created_by attribution-lock: stays alice under bob'
);

UPDATE public.list_members
SET created_by = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
WHERE
  list_id = '11111111-1111-1111-1111-111111111111'
  AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SELECT is(
  (
    SELECT created_by FROM public.list_members
    WHERE
      list_id = '11111111-1111-1111-1111-111111111111'
      AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'list_members (iii) UPDATE created_by attribution-lock: stays alice'
);

UPDATE public.items
SET created_by = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
WHERE id = '00000033-0000-0000-0000-000000000033';
SELECT is(
  (
    SELECT created_by FROM public.items
    WHERE id = '00000033-0000-0000-0000-000000000033'
  ),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'items (iii) UPDATE created_by attribution-lock: stays alice under bob'
);

-- ===================================================================
-- (iii.b) UPDATE-time `deleted_by` anti-spoof freeze on the ELSE
-- branch — three sub-assertions on `lists`.
-- ===================================================================

-- Switch back to Alice to seed.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);

-- Three fresh lists for the three sub-assertions:
--   5555 — pre-soft-deleted; deleted_at unchanged in the test UPDATE.
--   6666 — live; deleted_at stays NULL through the test UPDATE.
--   7777 — soft-deleted at t1; test UPDATE re-stamps to t2.

INSERT INTO public.lists (id, name) VALUES
('00000005-0000-0000-0000-000000000005', 'iii.b (1) pre-soft-deleted');
UPDATE public.lists
SET deleted_at = '2026-01-01T00:00:00Z'::timestamptz
WHERE id = '00000005-0000-0000-0000-000000000005';
-- After: deleted_at = 2026-01-01, deleted_by = alice (via null->non-null
-- branch).

INSERT INTO public.lists (id, name) VALUES
('00000006-0000-0000-0000-000000000006', 'iii.b (2) live');
-- After: deleted_at = NULL, deleted_by = NULL.

INSERT INTO public.lists (id, name) VALUES
('00000007-0000-0000-0000-000000000007', 'iii.b (3) re-stamped seed');
UPDATE public.lists
SET deleted_at = '2026-02-01T00:00:00Z'::timestamptz
WHERE id = '00000007-0000-0000-0000-000000000007';

-- Switch to Bob for the spoof attempts.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}',
  TRUE
);

-- (iii.b)(1) — deleted_at unchanged on a soft-deleted row.
-- Both old and new deleted_at are 2026-01-01; falls in ELSE
-- branch; the tombstone-gated freeze reverts deleted_by.
UPDATE public.lists
SET deleted_by = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
WHERE id = '00000005-0000-0000-0000-000000000005';
SELECT is(
  (
    SELECT deleted_by FROM public.lists
    WHERE id = '00000005-0000-0000-0000-000000000005'
  ),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'lists (iii.b)(1) anti-spoof on soft-deleted row: deleted_by stays alice'
);

-- (iii.b)(2) — deleted_at unchanged on a live row.
-- Both old and new deleted_at NULL; ELSE branch; freeze
-- reverts NEW.deleted_by from bob back to OLD.deleted_by = NULL.
UPDATE public.lists
SET deleted_by = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
WHERE id = '00000006-0000-0000-0000-000000000006';
SELECT is(
  (
    SELECT deleted_by FROM public.lists
    WHERE id = '00000006-0000-0000-0000-000000000006'
  ),
  NULL,
  'lists (iii.b)(2) anti-spoof on live row: deleted_by stays NULL'
);

-- (iii.b)(3) — deleted_at re-stamped to a different non-null
-- timestamp. Both old and new are non-null and distinct; ELSE
-- branch; freeze reverts deleted_by.
UPDATE public.lists
SET
  deleted_at = '2027-03-15T00:00:00Z'::timestamptz,
  deleted_by = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
WHERE id = '00000007-0000-0000-0000-000000000007';
SELECT is(
  (
    SELECT deleted_by FROM public.lists
    WHERE id = '00000007-0000-0000-0000-000000000007'
  ),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'lists (iii.b)(3) anti-spoof on re-stamped row: deleted_by stays alice'
);

-- ===================================================================
-- (iv) `deleted_by` set on `deleted_at` null→non-null — one per table
-- ===================================================================
-- Under Alice's claims, soft-delete a fresh live row; assert
-- the trigger filled `deleted_by = alice`.

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);

INSERT INTO public.lists (id, name) VALUES
('00000008-0000-0000-0000-000000000008', 'iv on lists');
UPDATE public.lists
SET deleted_at = now()
WHERE id = '00000008-0000-0000-0000-000000000008';
SELECT is(
  (
    SELECT deleted_by FROM public.lists
    WHERE id = '00000008-0000-0000-0000-000000000008'
  ),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'lists (iv) soft-delete null->non-null: deleted_by stamped to alice'
);

-- list_members: soft-remove Eve's row (from (ii)).
UPDATE public.list_members
SET deleted_at = now()
WHERE
  list_id = '11111111-1111-1111-1111-111111111111'
  AND user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
SELECT is(
  (
    SELECT deleted_by FROM public.list_members
    WHERE
      list_id = '11111111-1111-1111-1111-111111111111'
      AND user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
  ),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'list_members (iv) soft-remove null->non-null: deleted_by stamped to alice'
);

INSERT INTO public.items (id, list_id, name) VALUES
(
  '00000034-0000-0000-0000-000000000034',
  '11111111-1111-1111-1111-111111111111',
  'iv on items'
);
UPDATE public.items
SET deleted_at = now()
WHERE id = '00000034-0000-0000-0000-000000000034';
SELECT is(
  (
    SELECT deleted_by FROM public.items
    WHERE id = '00000034-0000-0000-0000-000000000034'
  ),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'items (iv) soft-delete null->non-null: deleted_by stamped to alice'
);

-- ===================================================================
-- (v) `deleted_by` frozen when `deleted_at` unchanged — items and
-- list_members (lists is covered by (iii.b)(1)).
-- ===================================================================
-- Reuse the rows soft-deleted by Alice in (iv); switch to Bob;
-- PATCH `deleted_by = bob` without changing `deleted_at`; assert
-- stays alice.

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}',
  TRUE
);

UPDATE public.items
SET deleted_by = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
WHERE id = '00000034-0000-0000-0000-000000000034';
SELECT is(
  (
    SELECT deleted_by FROM public.items
    WHERE id = '00000034-0000-0000-0000-000000000034'
  ),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'items (v) anti-spoof on soft-deleted row: deleted_by stays alice'
);

UPDATE public.list_members
SET deleted_by = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
WHERE
  list_id = '11111111-1111-1111-1111-111111111111'
  AND user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
SELECT is(
  (
    SELECT deleted_by FROM public.list_members
    WHERE
      list_id = '11111111-1111-1111-1111-111111111111'
      AND user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
  ),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'list_members (v) anti-spoof on soft-removed row: deleted_by stays alice'
);

-- ===================================================================
-- (vi) `deleted_by` cleared on `deleted_at` non-null→null restore
-- ===================================================================
-- Switch back to Alice; restore each soft-deleted row by
-- UPDATE deleted_at = NULL. Trigger's null<-non-null branch
-- clears deleted_by back to NULL.

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);

UPDATE public.lists
SET deleted_at = NULL
WHERE id = '00000008-0000-0000-0000-000000000008';
SELECT is(
  (
    SELECT deleted_by FROM public.lists
    WHERE id = '00000008-0000-0000-0000-000000000008'
  ),
  NULL,
  'lists (vi) restore non-null->null: deleted_by cleared to NULL'
);

UPDATE public.list_members
SET deleted_at = NULL
WHERE
  list_id = '11111111-1111-1111-1111-111111111111'
  AND user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
SELECT is(
  (
    SELECT deleted_by FROM public.list_members
    WHERE
      list_id = '11111111-1111-1111-1111-111111111111'
      AND user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
  ),
  NULL,
  'list_members (vi) restore non-null->null: deleted_by cleared to NULL'
);

UPDATE public.items
SET deleted_at = NULL
WHERE id = '00000034-0000-0000-0000-000000000034';
SELECT is(
  (
    SELECT deleted_by FROM public.items
    WHERE id = '00000034-0000-0000-0000-000000000034'
  ),
  NULL,
  'items (vi) restore non-null->null: deleted_by cleared to NULL'
);

-- ===================================================================
-- (vii) items INSERT `modified_by := public.uid()`
-- ===================================================================
-- INSERT items with explicit `modified_by = <bob>`; trigger
-- overrides with `public.uid() = alice`.

INSERT INTO public.items (id, list_id, name, modified_by) VALUES
(
  '00000037-0000-0000-0000-000000000037',
  '11111111-1111-1111-1111-111111111111',
  'vii on items',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
);
SELECT is(
  (
    SELECT modified_by FROM public.items
    WHERE id = '00000037-0000-0000-0000-000000000037'
  ),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'items (vii) INSERT modified_by override: client (bob) -> alice'
);

-- ===================================================================
-- (viii) items UPDATE-time content-edit stamps `modified_by`
-- ===================================================================
-- Alice already owns item 00000033 (created_by = alice,
-- modified_by = alice). Switch to Bob; edit the item's name.
-- Content-detection tuple changes → trigger stamps modified_by
-- with public.uid() = bob.

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}',
  TRUE
);

UPDATE public.items
SET name = 'iii on items, edited by bob'
WHERE id = '00000033-0000-0000-0000-000000000033';
SELECT is(
  (
    SELECT modified_by FROM public.items
    WHERE id = '00000033-0000-0000-0000-000000000033'
  ),
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
  'items (viii) UPDATE name under bob: modified_by stamped to bob'
);

-- ===================================================================
-- (ix) items UPDATE-time `modified_by` anti-spoof freeze
-- ===================================================================
-- Seed a fresh Alice-attributed item (so we don't perturb (viii)'s
-- end state). Switch to Bob; PATCH `modified_by = bob` with no
-- content change. Content tuple unchanged → freeze branch
-- reverts modified_by to OLD = alice.

-- Seed under Alice.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
INSERT INTO public.items (id, list_id, name) VALUES
(
  '00000039-0000-0000-0000-000000000039',
  '11111111-1111-1111-1111-111111111111',
  'ix on items'
);

-- Bob attempts the spoof.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}',
  TRUE
);
UPDATE public.items
SET modified_by = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
WHERE id = '00000039-0000-0000-0000-000000000039';
SELECT is(
  (
    SELECT modified_by FROM public.items
    WHERE id = '00000039-0000-0000-0000-000000000039'
  ),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'items (ix) anti-spoof PATCH modified_by, no content change: '
  'modified_by stays alice'
);

-- ===================================================================
-- (x) Cascade for items.created_by leaves modified_by unchanged
-- when modified_by points at a non-deleted user
-- ===================================================================
-- Seed item with (created_by = alice, modified_by = bob). Bob
-- achieves modified_by by editing content after alice creates.
-- After DELETE alice, cascade hits items.created_by FK only;
-- the items trigger's content-unchanged + tombstone-gated paths
-- let the cascade through created_by while preserving
-- modified_by.

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
INSERT INTO public.items (id, list_id, name) VALUES
(
  '00000040-0000-0000-0000-000000000040',
  '11111111-1111-1111-1111-111111111111',
  'x on items'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}',
  TRUE
);
UPDATE public.items
SET name = 'x on items, bob edited'
WHERE id = '00000040-0000-0000-0000-000000000040';
-- After: created_by = alice, modified_by = bob.

-- ===================================================================
-- (xi) Cascade-ordering coverage with two FK legs to the same
-- deleted user
-- ===================================================================
-- Seed item with (created_by = alice, modified_by = alice).
-- Capture modified_at. After DELETE alice, both FK legs cascade
-- (postgres fires two sequential UPDATEs, one per FK); the
-- assertion must hold regardless of which leg fires first.

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
INSERT INTO public.items (id, list_id, name) VALUES
(
  '00000041-0000-0000-0000-000000000041',
  '11111111-1111-1111-1111-111111111111',
  'xi on items'
);

CREATE TEMPORARY TABLE _xi_cap AS
SELECT modified_at FROM public.items
WHERE id = '00000041-0000-0000-0000-000000000041';

-- The big trigger: delete Alice from auth.users. Two FK legs on
-- items reference Alice (created_by + modified_by for item 0041;
-- created_by for item 0040); each fires SET DEFAULT via a
-- separate cascade UPDATE.
DELETE FROM auth.users
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- (x) assertions on item 0040: split into two so a regression in
-- either half (created_by repointed vs modified_by preserved)
-- surfaces independently. The modified_by-preserved half is the
-- load-bearing one for Risk #12 (per-rule keying — the modified_by
-- cascade has no candidate row, but the items trigger's
-- content-unchanged branch still must not rewrite modified_by
-- spuriously during the created_by cascade fire).
SELECT is(
  (
    SELECT created_by FROM public.items
    WHERE id = '00000040-0000-0000-0000-000000000040'
  ),
  '00000000-0000-0000-0000-000000000000'::uuid,
  'items (x) cascade for created_by: repointed to tombstone'
);

SELECT is(
  (
    SELECT modified_by FROM public.items
    WHERE id = '00000040-0000-0000-0000-000000000040'
  ),
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
  'items (x) cascade for created_by preserves modified_by: stays bob'
);

-- (xi) compound assertion: both attribution columns repointed,
-- modified_at unchanged.
SELECT ok(
  (
    SELECT
      created_by = '00000000-0000-0000-0000-000000000000'::uuid
      AND modified_by = '00000000-0000-0000-0000-000000000000'::uuid
      AND modified_at = (SELECT c.modified_at FROM _xi_cap AS c)
    FROM public.items
    WHERE id = '00000041-0000-0000-0000-000000000041'
  ),
  'items (xi) cascade-ordering: created_by + modified_by both -> '
  'tombstone AND modified_at unchanged (cascade-order independent)'
);

SELECT finish();

ROLLBACK;
