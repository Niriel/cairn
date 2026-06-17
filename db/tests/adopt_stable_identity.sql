-- adopt_stable_identity.sql — locks in the public.adopt_stable_identity()
-- RPC added by migration 0020: it sets the caller's permanent GoTrue
-- identity to the stable, uid-derived <uid>@cairn.internal, deriving the
-- value from public.uid() so a caller can only ever set THEIR OWN identity.
--
-- Registration (the BFF) signs up with a transient <random>@cairn.internal
-- address, then calls this RPC to adopt the permanent identity. The BFF
-- holds no GoTrue admin credential, so the just-signed-up user does it via
-- SECURITY DEFINER. It is idempotent (a second call rewrites the same value)
-- and guarded so it acts only on the transient/already-stable @cairn.internal
-- shapes — never clobbering a legacy account's real recovery e-mail.
--
-- auth.users reads happen as the superuser owner (authenticated has no grant
-- on the auth schema). The JWT-claims GUC is transaction-scoped, so a
-- re-switch to authenticated still resolves uid() to the same caller.

BEGIN;

SELECT plan(6);

\i /db/tests/fixtures/users_alice_bob_carol.sql

-- Alice arrives mid-registration with a transient address; the RPC must
-- rewrite it to her stable identity.
UPDATE auth.users SET email = 'transient-7f3a9@cairn.internal'
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- Bob is a legacy magic-link account holding a real, deliverable recovery
-- e-mail — the overwrite guard must leave it untouched.
UPDATE auth.users SET email = 'legacy@example.test'
WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

-- Act as Alice.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;

-- (a) the transient address is rewritten to the stable <uid>@cairn.internal.
SELECT public.adopt_stable_identity();
RESET ROLE;
SELECT is(
  (
    SELECT email FROM auth.users
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa@cairn.internal',
  'adopt_stable_identity sets auth.users.email to <uid>@cairn.internal'
);

-- (b) idempotent — a second call rewrites the same value (still matching the
-- @cairn.internal guard predicate).
SET LOCAL ROLE authenticated;
SELECT public.adopt_stable_identity();
RESET ROLE;
SELECT is(
  (
    SELECT email FROM auth.users
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa@cairn.internal',
  'adopt_stable_identity is idempotent — a second call is a no-op'
);

-- (c) an unauthenticated caller raises 28000.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '', TRUE);
SELECT throws_ok(
  $$SELECT public.adopt_stable_identity()$$,
  '28000',
  'not authenticated',
  'adopt_stable_identity raises 28000 when JWT claims are unset'
);

-- (d) the tombstone caller raises 28000.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000000"}',
  TRUE
);
SELECT throws_ok(
  $$SELECT public.adopt_stable_identity()$$,
  '28000',
  'cannot act as the tombstone user',
  'adopt_stable_identity raises 28000 for the tombstone caller'
);

-- (e) GRANT-layer denial: anon never reaches the body (REVOKE … FROM public
-- landed, so the anon-reachable UPDATE auth.users is closed off).
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT public.adopt_stable_identity()$$,
  '42501',
  NULL,
  'adopt_stable_identity denies anon at the GRANT layer (42501)'
);
RESET ROLE;

-- (f) overwrite guard — a caller whose e-mail is a real address (Bob's legacy
-- recovery e-mail) is left untouched: the predicate refuses any non
-- @cairn.internal value, so a legacy account's reset path can't be clobbered.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}',
  TRUE
);
SET LOCAL ROLE authenticated;
SELECT public.adopt_stable_identity();
RESET ROLE;
SELECT is(
  (
    SELECT email FROM auth.users
    WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  'legacy@example.test',
  'adopt_stable_identity leaves a real (non @cairn.internal) e-mail untouched'
);

SELECT finish();

ROLLBACK;
