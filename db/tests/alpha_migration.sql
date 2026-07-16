-- alpha_migration.sql — locks in migration 0023's in-place identity rewrite of
-- the live-alpha accounts, plus its pure display-name fold helper.
--
-- public.username_from_display_name(text) folds a display name to a
-- CHECK-valid handle (ASCII letters/digits, 3–30, case preserved) or the
-- literal 'user' when nothing usable survives.
--
-- public.backfill_legacy_identity() migrates every legacy account (a real,
-- deliverable e-mail on auth.users) onto the stable-identity model: it
-- grandfathers the e-mail into user_settings.recovery_email, derives a
-- memorable username from the display name (numeric suffix on collision), and
-- overwrites auth.users.email with <uid>@cairn.internal. It is owner-only,
-- idempotent (an account already on @cairn.internal is skipped), and aborts
-- rather than overwrite an identity whose recovery address could not be
-- captured (the belt-and-braces against silent data loss).
--
-- Fixture + role idiom mirrors adopt_stable_identity.sql. The three fixture
-- accounts carry real e-mails (alice@test/bob@test/carol@test), so all three
-- are eligible; the signup trigger has already given each a user_settings row.

BEGIN;

SELECT plan(24);

\i /db/tests/fixtures/users_alice_bob_carol.sql

-- ---------------------------------------------------------------------------
-- Fold helper: pure, CHECK-valid, case-preserving, 'user' fallback.
-- ---------------------------------------------------------------------------
SELECT is(
  public.username_from_display_name('Lara Croft'), 'LaraCroft',
  'username_from_display_name folds spaces out'
);
SELECT is(
  public.username_from_display_name('Lara-Croft!'), 'LaraCroft',
  'username_from_display_name folds punctuation out'
);
SELECT is(
  public.username_from_display_name('🎉🎉'), 'user',
  'username_from_display_name falls back to ''user'' when nothing survives'
);
SELECT is(
  public.username_from_display_name('ab'), 'user',
  'username_from_display_name falls back to ''user'' below the 3-char minimum'
);
SELECT is(
  public.username_from_display_name(repeat('a', 40)), repeat('a', 30),
  'username_from_display_name truncates a long fold to 30 characters'
);
SELECT is(
  public.username_from_display_name('MixedCase'), 'MixedCase',
  'username_from_display_name preserves case'
);

-- ---------------------------------------------------------------------------
-- Backfill happy path. Alice and Bob fold to the same handle (LaraCroft), so
-- Bob exercises the collision-suffix path. A control account already on the
-- stable identity must be skipped; the tombstone (NULL e-mail) must be skipped.
-- ---------------------------------------------------------------------------
UPDATE public.profiles SET display_name = 'Lara Croft'
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
UPDATE public.profiles SET display_name = 'Lara-Croft'
WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
UPDATE public.profiles SET display_name = 'Solo'
WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

INSERT INTO auth.users (id, email) VALUES (
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'dddddddd-dddd-dddd-dddd-dddddddddddd@cairn.internal'
)
ON CONFLICT (id) DO NOTHING;
UPDATE public.profiles SET username = 'ControlName'
WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

SELECT is(
  public.backfill_legacy_identity(), 3,
  'backfill_legacy_identity migrates the three eligible accounts'
);

SELECT is(
  (
    SELECT recovery_email FROM public.user_settings
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  'alice@test',
  'backfill grandfathers the real e-mail into recovery_email (alice)'
);
SELECT is(
  (
    SELECT username FROM public.profiles
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  'LaraCroft',
  'backfill derives alice''s username from her display name'
);
SELECT is(
  (
    SELECT email FROM auth.users
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa@cairn.internal',
  'backfill sets alice''s login identity to <uid>@cairn.internal'
);

SELECT is(
  (
    SELECT username FROM public.profiles
    WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  'LaraCroft2',
  'backfill suffixes bob''s colliding handle to LaraCroft2'
);
SELECT is(
  (
    SELECT recovery_email FROM public.user_settings
    WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  'bob@test',
  'backfill grandfathers bob''s recovery e-mail'
);

SELECT is(
  (
    SELECT username FROM public.profiles
    WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
  ),
  'Solo',
  'backfill derives carol''s username with no collision'
);

SELECT is(
  (
    SELECT username FROM public.profiles
    WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
  ),
  'ControlName',
  'backfill leaves an already-stable account''s username untouched'
);
SELECT is(
  (
    SELECT email FROM auth.users
    WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
  ),
  'dddddddd-dddd-dddd-dddd-dddddddddddd@cairn.internal',
  'backfill leaves an already-stable account''s identity untouched'
);

SELECT is(
  (
    SELECT email FROM auth.users
    WHERE id = '00000000-0000-0000-0000-000000000000'
  ),
  NULL,
  'backfill leaves the tombstone''s NULL e-mail untouched'
);

-- ---------------------------------------------------------------------------
-- Idempotency: a second run migrates nothing and disturbs nothing.
-- ---------------------------------------------------------------------------
SELECT is(
  public.backfill_legacy_identity(), 0,
  'backfill is idempotent — a second run migrates nothing'
);
SELECT is(
  (
    SELECT username FROM public.profiles
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  'LaraCroft',
  'backfill''s second run leaves alice''s username unchanged'
);

-- ---------------------------------------------------------------------------
-- Data-loss guard: an eligible account whose user_settings row is missing must
-- abort the whole call — the identity rewrite must never run for an account
-- whose recovery address could not be captured. Seeded after the happy path so
-- the migrated accounts are excluded and this is the only eligible row.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES (
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'legacy-eee@example.test'
)
ON CONFLICT (id) DO NOTHING;
DELETE FROM public.user_settings
WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

SELECT throws_ok(
  $$SELECT public.backfill_legacy_identity()$$,
  'P0001',
  NULL,
  'backfill aborts when an eligible account has no user_settings row'
);
SELECT is(
  (
    SELECT email FROM auth.users
    WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
  ),
  'legacy-eee@example.test',
  'backfill leaves the real e-mail intact when it aborts (no data loss)'
);

-- ---------------------------------------------------------------------------
-- Grant-layer denial: both functions are owner-only (REVOKE EXECUTE FROM
-- public, granted to no role), so anon and authenticated never reach the body.
-- Model: adopt_stable_identity.sql (anon 42501).
-- ---------------------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT public.backfill_legacy_identity()$$,
  '42501',
  NULL,
  'backfill_legacy_identity denies anon at the GRANT layer (42501)'
);
SELECT throws_ok(
  $$SELECT public.username_from_display_name('x')$$,
  '42501',
  NULL,
  'username_from_display_name denies anon at the GRANT layer (42501)'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.backfill_legacy_identity()$$,
  '42501',
  NULL,
  'backfill_legacy_identity denies authenticated at the GRANT layer (42501)'
);
SELECT throws_ok(
  $$SELECT public.username_from_display_name('x')$$,
  '42501',
  NULL,
  'username_from_display_name denies authenticated at the GRANT layer (42501)'
);
RESET ROLE;

SELECT finish();

ROLLBACK;
