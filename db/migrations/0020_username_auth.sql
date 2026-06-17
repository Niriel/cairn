-- 0020_username_auth.sql — username + password sign-in on the stable,
-- uid-derived GoTrue identity.
--
-- Revises 2001 forward: the GoTrue login handle is no longer a synthetic
-- address derived from the username. It is the stable <uid>@cairn.internal
-- set once at account creation (by the register flow's adopt_stable_identity)
-- and never rewritten on rename. The BFF resolves a typed username to a user
-- id on every sign-in and authenticates the password grant against that
-- stable identity, so set_username no longer touches auth.users at all.
--
-- Single BEGIN; … COMMIT; so a mid-migration abort leaves no half-applied
-- state (matches 0014/0019). Built up across Tasks 2.1–2.3 of this sub-step.

BEGIN;

-- 1. set_username — profiles-only. Under the stable identity the GoTrue
-- login handle no longer encodes the username, so set_username stops
-- rewriting auth.users.email: dropping that body removes the synthetic-
-- e-mail invariant and the atomic-rewrite hazard, and makes the profiles
-- lower(username) unique index the sole uniqueness guarantee — a rename can
-- never break the credential. Signature, SECURITY DEFINER, the
-- authenticated-only grant, and every guard are unchanged; search_path drops
-- `auth` since the function no longer reaches that schema.
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
  -- load-bearing uniqueness guarantee.
  BEGIN
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
