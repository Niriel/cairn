-- triggers_profile_on_signup.sql — locks in `tg_profile_on_signup`'s
-- two-row insert (profile + user_settings) on new signups, the
-- SECURITY DEFINER attribute, and the **separate** skip-branches
-- for the tombstone id.
--
-- Why separate skip-branches: a regression that drops only the
-- user_settings tombstone-skip would silently start creating
-- tombstone settings rows after the migration's seed has happened,
-- and the migration's `ON CONFLICT (id) DO NOTHING` on profiles
-- would mask a parallel profiles regression too if the skip
-- branches weren't tested independently.
--
-- Strategy: use a fresh non-fixture user id `dddddddd-…` to keep
-- assertions about *this test's* trigger invocation rather than
-- whatever fired when the users fixture loaded. The fixture is
-- deliberately not included.
--
-- See PLAN.md → Architecture → Test files row
-- `triggers_profile_on_signup.sql` and Risk #9 (tombstone insert
-- idempotency) for the rationale behind assertion (4).

BEGIN;

SELECT plan(7);

-- Fresh signup: insert Dave into auth.users. The AFTER-INSERT
-- trigger fires, creates Dave's profile + user_settings rows.
INSERT INTO auth.users (id, email) VALUES
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'dave@test');

-- 1. profile row created with the placeholder display_name -------
SELECT is(
  (
    SELECT display_name FROM public.profiles
    WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
  ),
  'New user',
  'tg_profile_on_signup inserts a profile row with display_name = ''New user'''
);

-- 2. user_settings row created with the default invite_policy ----
-- The trigger writes `'everybody'` *explicitly* in the INSERT,
-- not by leaning on the column DEFAULT — so a future migration
-- changing the default doesn't silently change the signup shape.
SELECT is(
  (
    SELECT invite_policy FROM public.user_settings
    WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
  ),
  'everybody',
  'tg_profile_on_signup inserts a user_settings row with '
  'invite_policy = ''everybody'''
);

-- 3. SECURITY DEFINER (catalog probe) ----------------------------
-- The trigger is the only `security definer` trigger in the
-- schema — it must escalate because gotrue (the inserter) has no
-- INSERT grants on profiles/user_settings. A regression flipping
-- this back to `security invoker` would break every signup.
SELECT is(
  (
    SELECT prosecdef FROM pg_proc
    WHERE proname = 'tg_profile_on_signup'
  ),
  TRUE,
  'tg_profile_on_signup is SECURITY DEFINER'
);

-- 4. Tombstone profile insert is idempotent ----------------------
-- The 0004 migration seeds the tombstone profile row with `ON
-- CONFLICT (id) DO NOTHING`; re-running the same INSERT must not
-- error. Without idempotency, a re-run or a future migration
-- touching the same id would explode.
SELECT lives_ok(
  $$INSERT INTO public.profiles (id, display_name)
    VALUES ('00000000-0000-0000-0000-000000000000', 'Deleted user')
    ON CONFLICT (id) DO NOTHING$$,
  'tombstone profile INSERT is idempotent via ON CONFLICT DO NOTHING'
);

-- 5. Tombstone profile row exists with `Deleted user` -----------
SELECT is(
  (
    SELECT display_name FROM public.profiles
    WHERE id = '00000000-0000-0000-0000-000000000000'
  ),
  'Deleted user',
  'tombstone profile row exists with display_name = ''Deleted user'''
);

-- 6 + 7. Skip-branch tests ---------------------------------------
-- DELETE the tombstone from auth.users — this cascades both
-- profiles.id and user_settings.id (if a row exists), wiping
-- whatever the migration seeded. Then re-INSERT the tombstone;
-- the trigger fires, sees `new.id = tombstone`, and *must* take
-- the skip branch — no profile, no user_settings row inserted.
DELETE FROM auth.users
WHERE id = '00000000-0000-0000-0000-000000000000';

INSERT INTO auth.users (id, email) VALUES
('00000000-0000-0000-0000-000000000000', 'tombstone@test');

-- 6. profiles skip-branch -----------------------------------------
-- The trigger must NOT insert a 'New user' profile row for the
-- tombstone — without an independent assertion, a regression that
-- drops only the user_settings skip would still appear green here
-- because the migration's profile seed had already been wiped.
SELECT is(
  (
    SELECT count(*)::int FROM public.profiles
    WHERE id = '00000000-0000-0000-0000-000000000000'
  ),
  0,
  'tg_profile_on_signup skip-branch for profiles '
  '(re-INSERT of tombstone creates no profile row)'
);

-- 7. user_settings skip-branch -----------------------------------
-- Parallel assertion: without this, a regression dropping only
-- the user_settings skip-branch would silently start creating
-- tombstone settings rows and no migration-inserted row would
-- exist for `ON CONFLICT` to suppress against.
SELECT is(
  (
    SELECT count(*)::int FROM public.user_settings
    WHERE id = '00000000-0000-0000-0000-000000000000'
  ),
  0,
  'tg_profile_on_signup skip-branch for user_settings '
  '(re-INSERT of tombstone creates no user_settings row)'
);

SELECT finish();

ROLLBACK;
