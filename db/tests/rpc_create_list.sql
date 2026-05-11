-- rpc_create_list.sql — locks in the `public.create_list(text,
-- text)` RPC's happy path plus its two defence-in-depth body
-- guards and the GRANT-layer denial for anon.
--
-- `create_list` is the only sanctioned path for creating a list
-- (direct `POST /lists` is closed off by no INSERT grant AND no
-- INSERT policy). The body inserts a `lists` row and the matching
-- `list_members` row for the creator in the same transaction; the
-- `security definer` attribute is what lets those writes succeed
-- despite the missing GRANTs.
--
-- 6 assertions:
--   1. Returns a `lists` row.
--   2. `created_by = public.uid()` on the returned row.
--   3. Exactly one matching `list_members` row exists with
--      `user_id = creator` AND `created_by = creator`.
--   4. Anon → SQLSTATE 42501 (GRANT-layer denial — the function
--      EXECUTE excludes anon, body never runs).
--   5. Authenticated with claims unset → SQLSTATE 28000 errmsg
--      'not authenticated' (in-body `uid() IS NULL` guard).
--   6. Authenticated with claims = tombstone → SQLSTATE 28000
--      errmsg 'cannot act as the tombstone user' (in-body
--      tombstone-UID guard).
--
-- Each defence layer is exercised separately so a regression
-- removing the function GRANT *or* removing the body guard
-- surfaces independently.

BEGIN;

SELECT plan(6);

\i /db/tests/fixtures/users_alice_bob_carol.sql

-- Set claims to Alice; SET LOCAL ROLE authenticated to drop
-- superuser bypass so the function's GRANT EXECUTE is actually
-- exercised on the happy path.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);

SET LOCAL ROLE authenticated;

-- Capture the RPC's return into a temp table so subsequent
-- assertions can read both columns (id, created_by) without
-- re-calling the function (which would insert a second row).
CREATE TEMPORARY TABLE _new_list AS
SELECT
  id,
  created_by
FROM public.create_list('My happy-path list', NULL);

-- 1. Returns a lists row (exactly one).
SELECT is(
  (SELECT count(*)::int FROM _new_list),
  1,
  'create_list returns exactly one lists row'
);

-- 2. created_by = caller's uid().
SELECT is(
  (SELECT n.created_by FROM _new_list AS n),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'create_list: returned row''s created_by = alice'
);

-- 3. Exactly one matching list_members row, with the creator as
-- both user_id and created_by.
SELECT is(
  (
    SELECT count(*)::int FROM public.list_members AS lm
    WHERE
      lm.list_id = (SELECT n.id FROM _new_list AS n)
      AND lm.user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND lm.created_by = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  1,
  'create_list: inserted matching list_members row for the creator'
);

-- 4. GRANT-layer denial under anon. The function's EXECUTE is
-- granted to `authenticated` only; anon never reaches the body.
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT public.create_list('Anon attempt', NULL)$$,
  '42501',
  NULL,
  'create_list: anon denied at the GRANT layer (SQLSTATE 42501)'
);

-- 5. In-body `public.uid() IS NULL` guard. Switch back to
-- authenticated; unset claims so uid() returns NULL; the
-- function's first guard line must `RAISE ... USING errcode =
-- '28000'` with 'not authenticated'.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '', TRUE);
SELECT throws_ok(
  $$SELECT public.create_list('Guard 1', NULL)$$,
  '28000',
  'not authenticated',
  'create_list: in-body uid()-NULL guard raises 28000 ''not authenticated'''
);

-- 6. In-body tombstone-UID guard. Set claims to the tombstone
-- UUID and call again; the second guard line must `RAISE` with
-- 'cannot act as the tombstone user'. Without this, a future
-- DELETE-and-re-INSERT cycle of the tombstone could see the
-- tombstone row briefly authenticate and write attributed rows.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000000"}',
  TRUE
);
SELECT throws_ok(
  $$SELECT public.create_list('Guard 2', NULL)$$,
  '28000',
  'cannot act as the tombstone user',
  'create_list: in-body tombstone-UID guard raises 28000 '
  '''cannot act as the tombstone user'''
);

SELECT finish();

ROLLBACK;
