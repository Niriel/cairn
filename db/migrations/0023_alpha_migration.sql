-- 0023_alpha_migration.sql — move the live-alpha accounts onto the stable
-- identity, in place, with no data loss and safe re-application.
--
-- The alpha accounts hold a real, deliverable e-mail on auth.users, an
-- unmemorable provisional username (u<hex>), and no password. This migration
-- rewrites each one: grandfather the e-mail into user_settings.recovery_email,
-- derive a memorable username from the display name, and overwrite
-- auth.users.email with the non-deliverable, uid-derived <uid>@cairn.internal.
--
-- adopt_stable_identity() (0020) cannot do this: its guard refuses to touch a
-- real (non @cairn.internal) address, precisely so a legacy recovery address is
-- never clobbered. The backfill therefore does the rewrite itself, owner-only.
--
-- Single BEGIN; … COMMIT; (matches 0014/0019/0020/0021) so a mid-migration
-- abort leaves no half-applied state. Ends by invoking the backfill: on a fresh
-- dev/test/prod database the only auth.users row is the tombstone (NULL e-mail),
-- so the call is a no-op there; on the live box it migrates the alpha accounts.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. username_from_display_name — fold a display name to a CHECK-valid handle.
--
-- Strips everything but ASCII letters/digits (case preserved), then returns the
-- first 30 characters if at least 3 survive, else the literal 'user'. The
-- result is always ^[A-Za-z0-9]{3,30}$-valid, matching profiles_username_format
-- (0019). Pure and IMMUTABLE; owner-only (no caller other than the backfill and
-- the migration needs it) via REVOKE EXECUTE FROM public.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.username_from_display_name(p_display_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_folded text := regexp_replace(
    coalesce(p_display_name, ''), '[^A-Za-z0-9]', '', 'g'
  );
BEGIN
  IF length(v_folded) >= 3 THEN
    RETURN substr(v_folded, 1, 30);
  END IF;
  RETURN 'user';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.username_from_display_name(text) FROM public;

-- ---------------------------------------------------------------------------
-- 2. backfill_legacy_identity — migrate every legacy account in one pass.
--
-- Eligible = a real e-mail (NOT NULL and NOT @cairn.internal), excluding the
-- tombstone. Ordered by id for determinism. Returns the count migrated.
-- SECURITY DEFINER so the owner reaches auth.users and the owner-only
-- recovery_email column (0021 narrowed authenticated's UPDATE to invite_policy);
-- owner-only via REVOKE EXECUTE FROM public and no GRANT, reached as owner by
-- this migration and by pg_prove (the DB owner).
--
-- Order is load-bearing: grandfather the e-mail BEFORE overwriting the identity.
-- The grandfather step verifies it touched a row (the signup trigger guarantees
-- one) and aborts otherwise — the identity rewrite must never run for an account
-- whose only real address could not be captured.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.backfill_legacy_identity()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  r record;
  v_count integer := 0;
  v_rows integer;
  v_base text;
  v_candidate text;
  v_n integer;
BEGIN
  FOR r IN
    SELECT id, email
    FROM auth.users
    WHERE email IS NOT NULL
      AND email NOT LIKE '%@cairn.internal'
      AND id <> '00000000-0000-0000-0000-000000000000'
    ORDER BY id
  LOOP
    -- Grandfather the real e-mail into the owner-only recovery_email column.
    UPDATE public.user_settings
    SET recovery_email = r.email
    WHERE id = r.id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RAISE EXCEPTION
        'backfill_legacy_identity: no user_settings row for account %', r.id;
    END IF;

    -- Derive a memorable username; on a case-insensitive collision with another
    -- account, append the smallest free numeric suffix, keeping length <= 30.
    SELECT public.username_from_display_name(display_name) INTO v_base
    FROM public.profiles
    WHERE id = r.id;
    v_candidate := v_base;
    v_n := 2;
    WHILE EXISTS (
      SELECT 1 FROM public.profiles
      WHERE lower(username) = lower(v_candidate)
        AND id <> r.id
    ) LOOP
      v_candidate := substr(v_base, 1, 30 - length(v_n::text)) || v_n::text;
      v_n := v_n + 1;
    END LOOP;
    UPDATE public.profiles SET username = v_candidate WHERE id = r.id;

    -- Overwrite the login identity with the stable, uid-derived address.
    UPDATE auth.users
    SET email = r.id::text || '@cairn.internal'
    WHERE id = r.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.backfill_legacy_identity() FROM public;

-- 3. Run it. No-op on a fresh database (tombstone only); migrates the alpha
-- accounts on the live box.
SELECT public.backfill_legacy_identity();

COMMIT;
