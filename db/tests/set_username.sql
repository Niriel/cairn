-- set_username.sql — locks in the public.set_username(text) RPC: it
-- rewrites the caller's profiles.username ONLY — case-preserving, with
-- separable taken/invalid errors and unauth/tombstone callers rejected
-- with 28000.
--
-- Under the stable identity the GoTrue login handle is the uid-derived
-- <uid>@cairn.internal, set once at account creation and never rewritten
-- on rename — so set_username must leave auth.users.email untouched. A
-- rename can therefore never break the credential; the profiles
-- lower(username) unique index is the sole uniqueness guarantee.
--
-- NOTE on the taken-error path: the load-bearing uniqueness guarantee is
-- the profiles lower(username) unique index plus the in-RPC availability
-- check; the taken assertion below exercises that path.

BEGIN;

SELECT plan(9);

\i /db/tests/fixtures/users_alice_bob_carol.sql

-- Bob holds 'LaraCroft' — the anchor for the case-fold taken check.
UPDATE public.profiles SET username = 'LaraCroft'
WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

-- Alice carries a known auth.users.email; set_username must leave it
-- untouched (the stable GoTrue identity is set at creation, not on rename).
UPDATE auth.users SET email = 'alice-known@example.test'
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- Act as Alice.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;

-- (a) set_username changes the caller's username, case preserved.
SELECT public.set_username('NewName');
SELECT is(
  (
    SELECT username FROM public.profiles
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  'NewName',
  'set_username updates profiles.username (case preserved)'
);

-- (b) reads auth.users as the superuser owner (authenticated has no grant
-- on the auth schema). The JWT-claims GUC stays set, so a later re-switch
-- to authenticated still resolves uid() to Alice.
RESET ROLE;

-- (b) set_username does NOT touch auth.users.email — the GoTrue identity is
-- the stable <uid>@cairn.internal set at account creation, not derived from
-- the handle. Alice's known e-mail (set above) survives the rename, so a
-- rename can never break the credential.
SELECT is(
  (
    SELECT email FROM auth.users
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  'alice-known@example.test',
  'set_username leaves auth.users.email unchanged'
);

-- Re-establish Alice as an authenticated caller for the remaining cases.
SET LOCAL ROLE authenticated;

-- (d) a name held by another user under case-fold raises the TAKEN error.
SELECT throws_ok(
  $$SELECT public.set_username('Laracroft')$$,
  '23505',
  'username taken',
  'set_username rejects a case-fold-taken name (23505 username taken)'
);

-- (e) invalid values raise the INVALID error — a DIFFERENT SQLSTATE from
-- the taken error, so the UI can tell "handle in use" from "bad handle".
SELECT throws_ok(
  $$SELECT public.set_username('a@b')$$,
  '23514',
  'invalid username',
  'set_username rejects punctuation (23514 invalid username)'
);
SELECT throws_ok(
  $$SELECT public.set_username('ab')$$,
  '23514',
  'invalid username',
  'set_username rejects a too-short value (23514 invalid username)'
);
SELECT throws_ok(
  $$SELECT public.set_username(repeat('a', 31))$$,
  '23514',
  'invalid username',
  'set_username rejects a too-long value (23514 invalid username)'
);

-- (f) re-setting to a case-variant of the caller's OWN current value
-- succeeds — self is excluded from the availability check. Alice is
-- 'NewName'; setting 'newname' must not collide with herself.
SELECT lives_ok(
  $$SELECT public.set_username('newname')$$,
  'set_username accepts a case-variant of the caller''s own handle'
);

-- (g) an unauthenticated caller raises 28000.
SELECT set_config('request.jwt.claims', '', TRUE);
SELECT throws_ok(
  $$SELECT public.set_username('Whoever')$$,
  '28000',
  'not authenticated',
  'set_username raises 28000 when JWT claims are unset'
);

-- (h) the tombstone caller raises 28000.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000000"}',
  TRUE
);
SELECT throws_ok(
  $$SELECT public.set_username('Tombstone')$$,
  '28000',
  'cannot act as the tombstone user',
  'set_username raises 28000 for the tombstone caller'
);

SELECT finish();

ROLLBACK;
