-- 0024_display_name_default.sql — a new account's display name defaults to
-- its username, and follows the username until the user picks their own.
--
-- The fixed 'New user' placeholder is retired. The username is not known when
-- the signup trigger fires (registration calls GoTrue /signup first and
-- set_username after), so the trigger seeds display_name with the same
-- provisional u<hex> handle it seeds into username, and set_username carries
-- display_name along on every rename for as long as the two still match.
-- Once the user sets a different display name (set_display_name) the two are
-- independent.
--
-- Single BEGIN; … COMMIT; (matches 0019–0023) so a mid-migration abort leaves
-- no half-applied state. Ends with a backfill of rows still carrying the old
-- placeholder; re-running it is a no-op.

BEGIN;

-- 1. tg_profile_on_signup — seed display_name with the provisional handle.
-- Tombstone-skip and the user_settings insert are unchanged from 0019.
CREATE OR REPLACE FUNCTION public.tg_profile_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  provisional text := substr('u' || replace(new.id::text, '-', ''), 1, 30);
BEGIN
  IF new.id = '00000000-0000-0000-0000-000000000000' THEN
    RETURN new;
  END IF;
  INSERT INTO public.profiles (id, display_name, username)
  VALUES (new.id, provisional, provisional)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_settings (id, invite_policy)
  VALUES (new.id, 'everybody')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

-- 2. set_username — the 0020 body, plus: an untouched display name (still
-- equal to the current username, compared exactly) follows the rename.
-- Signature, SECURITY DEFINER, the authenticated-only grant, and every guard
-- are unchanged.
CREATE OR REPLACE FUNCTION public.set_username(p_username text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- The lone write. The exception handler maps a TOCTOU unique-collision
  -- (another tx claimed the handle between the check and the write) onto the
  -- same 'username taken' error. The profiles lower(username) index is the
  -- load-bearing uniqueness guarantee. The CASE reads the pre-update row, so
  -- display_name follows only while it still equals the old username.
  BEGIN
    UPDATE public.profiles
    SET
      username = p_username,
      display_name = CASE
        WHEN display_name = username THEN p_username
        ELSE display_name
      END
    WHERE id = uid;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'username taken' USING errcode = '23505';
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.set_username(text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_username(text) TO authenticated;

-- 3. Backfill — profiles still carrying the retired placeholder take their
-- username. The tombstone ('Deleted user') never matches but is excluded
-- explicitly.
UPDATE public.profiles
SET display_name = username
WHERE
  display_name = 'New user'
  AND id <> '00000000-0000-0000-0000-000000000000';

COMMIT;
