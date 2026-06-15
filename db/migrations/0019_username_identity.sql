-- 0019_username_identity.sql — the DB foundation for username identity.
--
-- Adds `profiles.username` (the public identity: case-preserving storage,
-- ASCII letters/digits, length 3–30, case-insensitively unique), seeds a
-- throwaway provisional value into every existing row and every future
-- signup, makes it NOT NULL, and rebinds the profiles modified_at trigger
-- so a username change bumps modified_at.
--
-- Mirrors docs/data-model.md §profiles and §Triggers. Single
-- BEGIN; … COMMIT; so a mid-migration abort leaves no half-applied state
-- (matches 0014_delete_account.sql). Order is load-bearing: add the
-- column nullable → backfill every existing row (dev seeds *and* the
-- tombstone) → add the format CHECK (every row is now valid) → SET NOT
-- NULL → create the case-fold unique index → reseed the signup trigger →
-- rebind t20_set_modified_at.

BEGIN;

-- 1. Add the column nullable so the backfill can populate it before the
-- NOT NULL and CHECK land.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;

-- 2. Backfill every existing row with a provisional handle derived
-- deterministically from the row's id: `u` + the first 29 hex digits of
-- the dash-stripped uid. Always CHECK-valid; collision is negligible
-- (≈110 random bits survive the truncation) but not provably impossible.
-- Covers dev seeds and the `Deleted user` tombstone at id = 00000000-….
-- Guarded on NULL so a re-run is a no-op.
UPDATE public.profiles
SET username = substr('u' || replace(id::text, '-', ''), 1, 30)
WHERE username IS NULL;

-- 3. Format CHECK: ASCII letters/digits only, length 3–30.
ALTER TABLE public.profiles
ADD CONSTRAINT profiles_username_format
CHECK (username ~ '^[A-Za-z0-9]{3,30}$');

-- 4. A username is the identity — it is always present.
ALTER TABLE public.profiles ALTER COLUMN username SET NOT NULL;

-- 5. Case-fold uniqueness — `LaraCroft` blocks `Laracroft`. Non-partial
-- (username is NOT NULL), mirroring the lower()-index idiom from
-- invitations_target_email_uniq. citext is deliberately not introduced.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_uniq
ON public.profiles (lower(username));

-- 6. Reseed the signup trigger so every new auth user gets a provisional
-- username alongside the profile. Tombstone-skip and the user_settings
-- insert are unchanged.
CREATE OR REPLACE FUNCTION public.tg_profile_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF new.id = '00000000-0000-0000-0000-000000000000' THEN
    RETURN new;
  END IF;
  INSERT INTO public.profiles (id, display_name, username)
  VALUES (
    new.id,
    'New user',
    substr('u' || replace(new.id::text, '-', ''), 1, 30)
  )
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_settings (id, invite_policy)
  VALUES (new.id, 'everybody')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

-- 7. Rebind t20_set_modified_at to include username in its OF clause so a
-- username change bumps modified_at (consistent with display_name /
-- avatar_version). ALTER TRIGGER cannot change the OF list, so DROP +
-- CREATE — the same pattern 0007 used to add avatar_version.
DROP TRIGGER t20_set_modified_at ON public.profiles;

CREATE TRIGGER t20_set_modified_at
BEFORE UPDATE OF display_name, avatar_version, username ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_set_modified_at();

-- 8. set_username — change the caller's username and the synthetic GoTrue
-- e-mail derived from it, atomically. The synthetic e-mail
-- (lower(username) || '@users.cairn.invalid') *is* the GoTrue identity,
-- so the two writes must happen in one transaction or the next sign-in
-- (computed client-side from the new username) breaks. Writes
-- auth.users.email directly under SECURITY DEFINER (precedent:
-- admin.ban_user writing auth.users.banned_until) rather than routing
-- through GoTrue's e-mail-change confirmation API. Guards and grant
-- mirror set_display_name / delete_account.
--
-- DRIFT HAZARD: the '@users.cairn.invalid' domain is the pinned canonical
-- value. Any client that computes the synthetic e-mail (step 2002) must
-- reuse the identical constant, or sign-in breaks.
CREATE OR REPLACE FUNCTION public.set_username(p_username text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  uid uuid := public.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF uid = '00000000-0000-0000-0000-000000000000' THEN
    RAISE EXCEPTION 'cannot act as the tombstone user'
    USING errcode = '28000';
  END IF;

  -- Distinguishable rejections: 23514 (invalid) vs 23505 (taken) vs
  -- 28000 (unauth/tombstone) — the UI maps each to a different message.
  IF p_username !~ '^[A-Za-z0-9]{3,30}$' THEN
    RAISE EXCEPTION 'invalid username' USING errcode = '23514';
  END IF;

  -- Availability — someone else already holds this handle case-insensitively.
  -- Self is excluded so a case-only change to one's own handle is allowed.
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE lower(username) = lower(p_username)
      AND id <> uid
  ) THEN
    RAISE EXCEPTION 'username taken' USING errcode = '23505';
  END IF;

  -- The two writes move in lockstep. The nested block maps a TOCTOU
  -- unique-collision (another tx claimed the handle between the check and
  -- the write) onto the same 'username taken' error. The auth.users.email
  -- collision branch only fires in prod (GoTrue's unique index on email);
  -- the profiles lower(username) index is the load-bearing guarantee.
  BEGIN
    UPDATE auth.users
    SET email = lower(p_username) || '@users.cairn.invalid'
    WHERE id = uid;
    UPDATE public.profiles
    SET username = p_username
    WHERE id = uid;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'username taken' USING errcode = '23505';
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.set_username(text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_username(text) TO authenticated;

COMMIT;
