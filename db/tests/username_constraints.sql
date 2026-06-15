-- username_constraints.sql — locks in the `profiles.username` column
-- introduced by migration 0019: the format CHECK (ASCII letters/digits,
-- length 3–30), the case-fold uniqueness index, NOT NULL, world-readable
-- visibility to authenticated callers, the trigger-seeded provisional
-- value on signup, the tombstone's post-migration value, and the
-- modified_at bump on a username change.
--
-- Strategy: tg_profile_on_signup creates a profiles row — with a
-- provisional username — for *every* auth.users insert, so the CHECK /
-- length / case-fold cases cannot be a fresh `INSERT INTO public.profiles`
-- for a new user (PK collision on the trigger-created row). Those cases
-- are exercised by UPDATE-ing the trigger-created row instead.

BEGIN;

SELECT plan(15);

\i /db/tests/fixtures/users_alice_bob_carol.sql

-- A fresh signup: the AFTER-INSERT trigger seeds a provisional username.
INSERT INTO auth.users (id, email) VALUES
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'dave@test');

-- (g) trigger-seeded provisional username matches the CHECK regex.
SELECT matches(
  (
    SELECT username FROM public.profiles
    WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
  ),
  '^[A-Za-z0-9]{3,30}$',
  'tg_profile_on_signup seeds a provisional username matching the CHECK'
);

-- (h) the tombstone profile carries a CHECK-valid value after migration.
SELECT matches(
  (
    SELECT username FROM public.profiles
    WHERE id = '00000000-0000-0000-0000-000000000000'
  ),
  '^[A-Za-z0-9]{3,30}$',
  'tombstone profile username matches the CHECK after migration'
);

-- (a) a valid username is accepted and stored case-preserving.
SELECT lives_ok(
  $$UPDATE public.profiles SET username = 'LaraCroft'
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'a valid username is accepted'
);
SELECT is(
  (
    SELECT username FROM public.profiles
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  'LaraCroft',
  'username is stored case-preserving'
);

-- (d) case-fold uniqueness: 'Laracroft' collides with Alice's 'LaraCroft'.
SELECT throws_ok(
  $$UPDATE public.profiles SET username = 'Laracroft'
    WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'$$,
  '23505',
  NULL,
  'case-fold uniqueness: Laracroft collides with LaraCroft (23505)'
);

-- (b) invalid usernames are rejected (check_violation, 23514). Exercised
-- by UPDATE-ing Bob's trigger-created row; each failed statement rolls
-- back, so Bob keeps his provisional value between assertions.
SELECT throws_ok(
  $$UPDATE public.profiles SET username = 'la ra'
    WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  '23514',
  NULL,
  'username CHECK rejects a space (23514)'
);
SELECT throws_ok(
  $$UPDATE public.profiles SET username = 'a@b'
    WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  '23514',
  NULL,
  'username CHECK rejects punctuation (23514)'
);
SELECT throws_ok(
  $$UPDATE public.profiles SET username = 'naïve'
    WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  '23514',
  NULL,
  'username CHECK rejects non-ASCII (23514)'
);

-- (e) username is NOT NULL (23502).
SELECT throws_ok(
  $$UPDATE public.profiles SET username = NULL
    WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  '23502',
  NULL,
  'username is NOT NULL (23502)'
);

-- (c) length bounds: 2 and 31 rejected, 3 and 30 accepted.
SELECT throws_ok(
  $$UPDATE public.profiles SET username = 'ab'
    WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  '23514',
  NULL,
  'username CHECK rejects a 2-character value (23514)'
);
SELECT throws_ok(
  $$UPDATE public.profiles SET username = repeat('a', 31)
    WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  '23514',
  NULL,
  'username CHECK rejects a 31-character value (23514)'
);
SELECT lives_ok(
  $$UPDATE public.profiles SET username = 'abc'
    WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  'username CHECK accepts a 3-character value'
);
SELECT lives_ok(
  $$UPDATE public.profiles SET username = repeat('z', 30)
    WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  'username CHECK accepts a 30-character value'
);

-- (i) a username change bumps modified_at (t20 rebind includes username).
CREATE TEMPORARY TABLE _b_profiles_username AS
SELECT modified_at FROM public.profiles
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

SELECT pg_sleep(0.001);
UPDATE public.profiles SET username = 'LaraCroft2'
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

SELECT cmp_ok(
  (
    SELECT modified_at FROM public.profiles
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  '>',
  (SELECT b.modified_at FROM _b_profiles_username AS b),
  'changing username advances modified_at'
);

-- (f) an authenticated caller can read another profile's username
-- (world-readable via the existing profiles_select policy + GRANT).
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT isnt(
  (
    SELECT username FROM public.profiles
    WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
  ),
  NULL,
  'an authenticated caller can read another profile''s username'
);

SELECT finish();

ROLLBACK;
