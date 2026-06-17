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

-- 2. adopt_stable_identity — set the caller's permanent GoTrue identity to
-- the stable, uid-derived <uid>@cairn.internal. Registration (the BFF) signs
-- up with a transient <random>@cairn.internal address, then the just-signed-up
-- user calls this to adopt the permanent identity — the BFF holds no GoTrue
-- admin credential, so the write goes through SECURITY DEFINER (precedent:
-- set_username / admin.ban_user writing auth.users directly). The value
-- derives from public.uid(), never a parameter, so a caller can only ever set
-- THEIR OWN identity to the deterministic <uid>@cairn.internal.
--
-- OVERWRITE GUARD (load-bearing, not cosmetic): the
-- `email IS NULL OR email LIKE '%@cairn.internal'` predicate. The function is
-- granted to `authenticated`, so it is reachable by ANY logged-in user via
-- the public PostgREST surface, not just the register handler. Without the
-- predicate it would unconditionally overwrite the caller's email — and a
-- legacy magic-link account (still holding a real, deliverable recovery
-- e-mail) would lose its only reset path. The predicate lets the RPC act only
-- on the transient <random>@cairn.internal (register) and the already-stable
-- <uid>@cairn.internal (idempotent re-call) shapes, refusing any real address.
-- "Calling twice is a no-op" holds only BECAUSE of this guard.
CREATE FUNCTION public.adopt_stable_identity()
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

  UPDATE auth.users
  SET email = uid || '@cairn.internal'
  WHERE id = uid
    AND (email IS NULL OR email LIKE '%@cairn.internal');
END;
$$;

-- The explicit REVOKE is load-bearing: Postgres default-grants EXECUTE on a
-- new function to PUBLIC (which includes anon), so without it the
-- "authenticated only" intent does not hold — and an anon-reachable
-- UPDATE auth.users is exactly the over-grant the project treats as an
-- unverified claim. Mirrors the set_username grant above.
REVOKE EXECUTE ON FUNCTION public.adopt_stable_identity() FROM public;
GRANT EXECUTE ON FUNCTION public.adopt_stable_identity() TO authenticated;

-- 3. resolve_username — turn a typed username into the account's
-- (id, username) via the case-fold lower(username) index. Sign-in (the BFF)
-- runs before any session exists, so the resolver must work for an
-- unauthenticated caller — hence SECURITY DEFINER granted to anon. Returns
-- the stable user id (which the BFF authenticates the password grant against)
-- and the case-preserving STORED handle (so the signed-in identity shows
-- canonical casing, not whatever casing was typed). A miss is an empty result
-- — a permitted, truthful "no such username".
--
-- No deleted_at filter: profiles has no soft-delete column and delete_account
-- hard-deletes the row via cascade, so every stored handle is a live account.
-- The only non-account row is the tombstone, whose provisional handle is
-- unguessable and whose password grant cannot succeed, so resolving it is
-- harmless. Exposing the uuid to anon is acceptable — usernames are public,
-- the uuid is already in attribution everywhere, and the password grant it
-- would otherwise unlock is locked to the BFF.
CREATE FUNCTION public.resolve_username(p_username text)
RETURNS TABLE (id uuid, username text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, username
  FROM public.profiles
  WHERE lower(username) = lower(p_username);
$$;

-- Same explicit revoke-then-grant idiom as the functions above so the grant
-- surface is stated, not inherited from the PUBLIC default. anon is granted
-- here (sign-in is pre-session), so the REVOKE is consistency rather than a
-- boundary — but keeping every new function on the idiom avoids the next one
-- silently over-granting.
REVOKE EXECUTE ON FUNCTION public.resolve_username(text) FROM public;
GRANT EXECUTE ON FUNCTION public.resolve_username(text) TO anon, authenticated;

COMMIT;
