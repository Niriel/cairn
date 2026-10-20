-- avatars.sql — locks in the avatar_version column, three RPCs
-- (bump_avatar_version, clear_avatar, set_display_name), and the
-- modified_at trigger rebind for avatar_version.
--
-- 17 assertions:
--   a.     Column default → 0
--   b–c.   bump_avatar_version() increment + return value (×2 each)
--   d.     clear_avatar() resets to 0
--   e.     modified_at advances on bump
--   f.     modified_at advances on clear
--   g.     set_display_name() updates and trims
--   h–j.   set_display_name() validation rejections (3×)
--   k.     CHECK constraint rejects avatar_version < 0
--   l–n.   Cross-user isolation (bump, clear, set_display_name)
--   o.     set_display_name() uid-null guard

BEGIN;

SELECT plan(17);

\i /db/tests/fixtures/users_alice_bob_carol.sql

-- a. Column default: fixture-created profile has avatar_version = 0.
-- Runs as cairn (session superuser) before role switch.
SELECT is(
  (
    SELECT avatar_version FROM public.profiles
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  0,
  'profiles.avatar_version defaults to 0 on INSERT'
);

-- Set JWT claims to Alice; drop superuser bypass so GRANT EXECUTE
-- is actually exercised for tests b–j.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);

SET LOCAL ROLE authenticated;

-- b. bump_avatar_version() first call: return value = 1, row = 1.
SELECT is(
  (SELECT public.bump_avatar_version()),
  1,
  'bump_avatar_version() first call returns 1'
);
SELECT is(
  (
    SELECT avatar_version FROM public.profiles
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  1,
  'bump_avatar_version() first call sets avatar_version = 1'
);

-- c. bump_avatar_version() second call: return value = 2, row = 2.
SELECT is(
  (SELECT public.bump_avatar_version()),
  2,
  'bump_avatar_version() second call returns 2'
);
SELECT is(
  (
    SELECT avatar_version FROM public.profiles
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  2,
  'bump_avatar_version() second call sets avatar_version = 2'
);

-- d. clear_avatar() resets to 0.
SELECT public.clear_avatar();
SELECT is(
  (
    SELECT avatar_version FROM public.profiles
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  0,
  'clear_avatar() resets avatar_version to 0'
);

-- e. modified_at advances on bump.
CREATE TEMPORARY TABLE _b_profiles_bump AS
SELECT modified_at FROM public.profiles
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

SELECT pg_sleep(0.001);
SELECT public.bump_avatar_version();

SELECT cmp_ok(
  (
    SELECT modified_at FROM public.profiles
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  '>',
  (SELECT b.modified_at FROM _b_profiles_bump AS b),
  'bump_avatar_version() advances modified_at'
);

-- f. modified_at advances on clear.
-- Alice is at avatar_version = 1 from the bump in e.
CREATE TEMPORARY TABLE _b_profiles_clear AS
SELECT modified_at FROM public.profiles
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

SELECT pg_sleep(0.001);
SELECT public.clear_avatar();

SELECT cmp_ok(
  (
    SELECT modified_at FROM public.profiles
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  '>',
  (SELECT b.modified_at FROM _b_profiles_clear AS b),
  'clear_avatar() advances modified_at'
);

-- g. set_display_name() updates and trims leading/trailing whitespace.
SELECT public.set_display_name('  Alice New  ');
SELECT is(
  (
    SELECT display_name FROM public.profiles
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  'Alice New',
  'set_display_name() trims and updates display_name'
);

-- h. set_display_name() rejects empty string.
SELECT throws_ok(
  $$SELECT public.set_display_name('')$$,
  '23514',
  NULL,
  'set_display_name() rejects empty string (23514)'
);

-- i. set_display_name() rejects whitespace-only string.
SELECT throws_ok(
  $$SELECT public.set_display_name('   ')$$,
  '23514',
  NULL,
  'set_display_name() rejects whitespace-only string (23514)'
);

-- j. set_display_name() rejects name longer than 100 characters.
SELECT throws_ok(
  $$SELECT public.set_display_name(repeat('x', 101))$$,
  '23514',
  NULL,
  'set_display_name() rejects name longer than 100 characters (23514)'
);

-- k. CHECK constraint: direct UPDATE to negative value.
-- RESET ROLE returns to cairn (the session superuser) which bypasses
-- RLS, so the CHECK fires before any privilege check.
RESET ROLE;
SELECT throws_ok(
  $$UPDATE public.profiles SET avatar_version = -1
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  '23514',
  NULL,
  'avatar_version CHECK rejects negative value (23514)'
);

-- l–n. Cross-user isolation: Alice cannot affect Bob's row.
RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;

-- Bump Alice so her avatar_version is 1 (was reset to 0 in f).
SELECT public.bump_avatar_version();

-- l. Cross-user bump: Bob's avatar_version is still 0.
SELECT is(
  (
    SELECT avatar_version FROM public.profiles
    WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  0,
  'bump_avatar_version() as Alice leaves Bob''s avatar_version unchanged'
);

-- m. Cross-user clear: Bob's avatar_version still 0.
SELECT public.clear_avatar();
SELECT is(
  (
    SELECT avatar_version FROM public.profiles
    WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  0,
  'clear_avatar() as Alice leaves Bob''s avatar_version unchanged'
);

-- n. Cross-user set_display_name: Bob's display_name still their signup
-- default (the provisional username the trigger seeded).
SELECT public.set_display_name('Hacker');
SELECT is(
  (
    SELECT display_name FROM public.profiles
    WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  'u' || repeat('b', 29),
  'set_display_name() as Alice leaves Bob''s display_name unchanged'
);

-- o. uid-null guard: calling set_display_name with no JWT claims
-- raises 28000 'not authenticated'.
SELECT set_config('request.jwt.claims', '', TRUE);
SELECT throws_ok(
  $$SELECT public.set_display_name('x')$$,
  '28000',
  'not authenticated',
  'set_display_name() raises 28000 when JWT claims are unset'
);

SELECT finish();

ROLLBACK;
