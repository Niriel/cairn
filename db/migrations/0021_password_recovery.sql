-- 0021_password_recovery.sql — Cairn-orchestrated password recovery.
--
-- GoTrue's built-in /recover cannot reach a user because the login handle is
-- the non-deliverable <uid>@cairn.internal, so Cairn owns the whole recovery
-- flow at the BFF: it mails a 6-digit code to the on-file recovery_email and a
-- token-gated pgcrypto function sets the password (no GoTrue admin key). See
-- docs/architecture.md → "Password recovery is Cairn-orchestrated".
--
-- Single BEGIN; … COMMIT; so a mid-migration abort leaves no half-applied
-- state (matches 0014/0019/0020). Built up across Tasks 1.1–1.3 of this
-- sub-step: 1.1 locks direct writes to recovery_email; 1.2 adds the private
-- token record, the scoped BFF role, and the verify-flow RPCs; 1.3 appends
-- the reset-flow RPCs.

BEGIN;

-- 1. Lock direct writes to user_settings.recovery_email.
--
-- Verify-before-effect (a recovery address takes effect only after the
-- emailed code is confirmed) is only real if a signed-in user cannot
-- PATCH /user_settings to set recovery_email directly. The original
-- table-wide `GRANT SELECT, UPDATE ON user_settings TO authenticated`
-- (0004) permitted exactly that, so narrow UPDATE to the freely-editable
-- column (invite_policy) only. recovery_email is then writable solely by
-- the confirm_recovery_email RPC (Task 1.2, SECURITY DEFINER, runs as
-- owner). SELECT is untouched so the owner can still read their own
-- recovery_email for display; owner-only RLS still scopes the rows.
REVOKE UPDATE ON public.user_settings FROM authenticated;
GRANT UPDATE (invite_policy) ON public.user_settings TO authenticated;

-- 2. The private recovery-token record.
--
-- Lives in a dedicated `auth_private` schema that is never added to
-- PGRST_DB_SCHEMAS (PostgREST serves `public` only), so the table is
-- unreachable through the API by construction — the stronger boundary for
-- the pending-address snapshots and code hashes than `public` + RLS (the
-- admin-schema lockdown posture, 0017). The SECURITY DEFINER RPCs below stay
-- in `public` so PostgREST can call them and reach this table by its
-- fully-qualified name, running as the owner (the cairn superuser) which sees
-- auth_private regardless of grants. RLS is enabled with NO policy (deny-all)
-- as belt-and-suspenders, so the rows stay protected even if the schema
-- lockdown were ever loosened.
--
-- A `code_hash` is the SHA-256 hex of the 6-digit code. Hashing keeps the
-- plaintext code out of DB query logs (log hygiene); it is NOT at-rest
-- secrecy — a SHA-256 of a 10^6 space is trivially reversible — so the real
-- protection of the code at rest is auth_private being unreachable.
CREATE SCHEMA IF NOT EXISTS auth_private;
REVOKE ALL ON SCHEMA auth_private FROM public, authenticated, anon;

CREATE TABLE auth_private.recovery_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  purpose text NOT NULL
  CHECK (purpose IN ('verify_recovery_email', 'reset_password')),
  email text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE auth_private.recovery_tokens ENABLE ROW LEVEL SECURITY;

-- Serves both the per-account send cap and the newest-unconsumed-token lookup.
CREATE INDEX recovery_tokens_user_purpose_created_idx
ON auth_private.recovery_tokens (user_id, purpose, created_at);
-- Serves the per-address send throttle.
CREATE INDEX recovery_tokens_email_created_idx
ON auth_private.recovery_tokens (email, created_at);

-- 3. The scoped BFF role.
--
-- The reset-flow RPCs (1.3) are granted to this low-privilege role and to
-- neither anon nor authenticated, so the private on-file address stays off the
-- anon surface and the password write stays off the public surface. In prod the
-- BFF assumes the role via a pre-minted role JWT, so `authenticator` must be
-- able to SET ROLE to it. Roles are cluster-global and survive test-db.sh's
-- per-run DROP DATABASE, so creation is guarded; the GRANT is guarded on
-- `authenticator` existence so the migration is safe in any cluster (the pgTAP
-- DB does have authenticator — 0001 creates it — so the GRANT runs under test).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cairn_auth_bff') THEN
    CREATE ROLE cairn_auth_bff NOLOGIN;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    GRANT cairn_auth_bff TO authenticator;
  END IF;
END$$;

-- Schema USAGE gates every object privilege inside, so the role needs it to
-- reach the public reset RPCs even once they GRANT it EXECUTE (1.3). This is
-- NOT caught by a has_function_privilege assertion (which ignores schema
-- USAGE), so a missing grant here would only surface at runtime as "permission
-- denied for schema public" — hence it is explicit. The role gets no grant on
-- auth_private; the definer RPCs reach that schema as owner.
GRANT USAGE ON SCHEMA public TO cairn_auth_bff;

-- 4. The verify-flow RPCs (authenticated): prove ownership of a recovery
-- e-mail before it takes effect.
--
-- request_recovery_email_verification records a pending verification and (via
-- the BFF) mails a code to the candidate address. The address becomes the
-- account's active recovery_email only when confirm_recovery_email is later
-- called with the matching code. Both are SECURITY DEFINER (so they write the
-- private token table and the locked-down recovery_email column as owner) with
-- a tight `SET search_path = public` and the uid()/tombstone guards from the
-- house pattern (0020).
--
-- The BFF passes the code's hash, never the plaintext, so the code never enters
-- a DB query (statement-log hygiene).
CREATE FUNCTION public.request_recovery_email_verification(
  p_email text, p_code_hash text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := public.uid();
  -- Send caps within a rolling window: at most 3 codes to one address, and at
  -- most 5 verification codes per account — so one signed-in account cannot
  -- spray codes across many distinct addresses (mail-bombing). A refused send
  -- raises CA429 (the BFF maps it to HTTP 429); raising is correct here because
  -- a rejected send persists nothing.
  c_window constant interval := interval '1 hour';
  c_per_address_cap constant int := 3;
  c_per_account_cap constant int := 5;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF v_uid = '00000000-0000-0000-0000-000000000000' THEN
    RAISE EXCEPTION 'cannot act as the tombstone user'
    USING errcode = '28000';
  END IF;
  IF p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'invalid recovery e-mail' USING errcode = '23514';
  END IF;

  IF (
    SELECT count(*) FROM auth_private.recovery_tokens
    WHERE email = p_email
      AND created_at > now() - c_window
  ) >= c_per_address_cap THEN
    RAISE EXCEPTION 'too many recovery e-mail requests'
    USING errcode = 'CA429';
  END IF;

  IF (
    SELECT count(*) FROM auth_private.recovery_tokens
    WHERE user_id = v_uid
      AND purpose = 'verify_recovery_email'
      AND created_at > now() - c_window
  ) >= c_per_account_cap THEN
    RAISE EXCEPTION 'too many recovery e-mail requests'
    USING errcode = 'CA429';
  END IF;

  INSERT INTO auth_private.recovery_tokens (
    user_id, purpose, email, code_hash, expires_at
  )
  VALUES (
    v_uid,
    'verify_recovery_email',
    p_email,
    p_code_hash,
    now() + interval '1 hour'
  );
END;
$$;

REVOKE EXECUTE
ON FUNCTION public.request_recovery_email_verification(text, text) FROM public;
GRANT EXECUTE
ON FUNCTION public.request_recovery_email_verification(text, text)
TO authenticated;

-- confirm_recovery_email returns a status string ('ok' | 'invalid' | 'locked'),
-- it does NOT raise on a wrong code. This is load-bearing, not stylistic:
-- PostgREST runs each RPC in its own transaction and rolls back on a raised
-- error, so a wrong-code path that raised would roll back its own `attempts`
-- bump — the submission-attempt cap would never persist and the brute-force
-- defence against the 10^6 code space would be a no-op. So every outcome that
-- must persist a side effect commits by returning a status; only errors with
-- nothing to persist (unauthenticated / tombstone) still raise.
--
-- The newest matching token is locked FOR UPDATE so concurrent guesses
-- serialise and cannot race past the `attempts >= 5` check. An over-cap token
-- is consumed and reported 'locked' so it cannot be retried.
CREATE FUNCTION public.confirm_recovery_email(p_code_hash text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := public.uid();
  v_tok auth_private.recovery_tokens%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF v_uid = '00000000-0000-0000-0000-000000000000' THEN
    RAISE EXCEPTION 'cannot act as the tombstone user'
    USING errcode = '28000';
  END IF;

  SELECT * INTO v_tok
  FROM auth_private.recovery_tokens
  WHERE user_id = v_uid
    AND purpose = 'verify_recovery_email'
    AND consumed_at IS NULL
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT found THEN
    RETURN 'invalid';
  END IF;

  -- Submission-attempt cap, checked BEFORE the hash compare: treat an over-cap
  -- token as spent so the code space cannot be brute-forced.
  IF v_tok.attempts >= 5 THEN
    UPDATE auth_private.recovery_tokens
    SET consumed_at = now()
    WHERE id = v_tok.id;
    RETURN 'locked';
  END IF;

  IF v_tok.code_hash = p_code_hash THEN
    UPDATE public.user_settings
    SET recovery_email = v_tok.email
    WHERE id = v_uid;
    UPDATE auth_private.recovery_tokens
    SET consumed_at = now()
    WHERE id = v_tok.id;
    RETURN 'ok';
  END IF;

  -- Wrong code: bump the durable attempt counter and report failure. The bump
  -- COMMITS (no raise) — that is the whole point of the status-return contract.
  UPDATE auth_private.recovery_tokens
  SET attempts = attempts + 1
  WHERE id = v_tok.id;
  RETURN 'invalid';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_recovery_email(text) FROM public;
GRANT EXECUTE ON FUNCTION public.confirm_recovery_email(text) TO authenticated;

-- clear_recovery_email is the removal counterpart of the set/confirm flow: the
-- Remove affordance in Settings nulls the on-file address. Task 1.1 narrowed the
-- authenticated UPDATE grant on user_settings to invite_policy only, so a
-- signed-in user cannot null recovery_email directly through PostgREST — removal
-- needs its own authenticated, owner-scoped writer. Unlike SETTING an address
-- (which must prove ownership before it takes effect), REMOVING one's own
-- address needs no verification: it only ever reduces what the account can do
-- (it drops that account's self-serve reset path, which is the user's choice).
-- The target row is derived from uid(), never a parameter, so a caller can only
-- clear their OWN address — the same own-row discipline as the verify RPCs.
-- Clearing when already NULL is a harmless, successful no-op (the UPDATE matches
-- no non-NULL state to change), so the BFF removal endpoint can call it
-- unconditionally. Any pending verify token is deliberately left to expire (it
-- lives in auth_private, is single-use, and expires within the hour) rather than
-- deleted here — keeping this a single-column write.
CREATE FUNCTION public.clear_recovery_email()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := public.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF v_uid = '00000000-0000-0000-0000-000000000000' THEN
    RAISE EXCEPTION 'cannot act as the tombstone user'
    USING errcode = '28000';
  END IF;

  UPDATE public.user_settings SET recovery_email = NULL WHERE id = v_uid;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clear_recovery_email() FROM public;
GRANT EXECUTE ON FUNCTION public.clear_recovery_email() TO authenticated;

-- 5. The reset-flow RPCs (signed-out): resolve a username to its on-file
-- recovery e-mail, mail a code, and set a new password from that code — all
-- without any GoTrue admin credential.
--
-- Both are granted ONLY to the scoped role cairn_auth_bff, never to anon or
-- authenticated. That is the load-bearing R5/R7 boundary: returning the private
-- on-file address (request_password_reset) and writing auth.users.encrypted_password
-- (reset_password) are both safe ONLY because the RPCs are unreachable from the
-- public PostgREST surface — the BFF assumes the role via a pre-minted role JWT.
--
-- request_password_reset resolves p_username → uid via the lower(username)
-- index, reads that account's recovery_email, and — if non-NULL — enforces the
-- per-address send cap, mints a reset_password token, and RETURNS the address so
-- the BFF knows where to mail the code. An unknown username or an account with
-- no recovery_email returns NULL (the BFF then sends nothing; the signed-out
-- forgot-password endpoint always responds with a constant shape, so this NULL
-- never leaks account existence). Returning the address is safe only because the
-- function is granted to the scoped role, not anon. SECURITY DEFINER so it reaches
-- the auth_private token table and the recovery_email column as owner.
CREATE FUNCTION public.request_password_reset(
  p_username text, p_code_hash text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_email text;
  -- Per-address send cap within a rolling window, matching the verify flow.
  c_window constant interval := interval '1 hour';
  c_per_address_cap constant int := 3;
BEGIN
  SELECT id INTO v_uid
  FROM public.profiles
  WHERE lower(username) = lower(p_username);

  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT recovery_email INTO v_email
  FROM public.user_settings
  WHERE id = v_uid;

  IF v_email IS NULL THEN
    RETURN NULL;
  END IF;

  IF (
    SELECT count(*) FROM auth_private.recovery_tokens
    WHERE email = v_email
      AND created_at > now() - c_window
  ) >= c_per_address_cap THEN
    RAISE EXCEPTION 'too many recovery e-mail requests'
    USING errcode = 'CA429';
  END IF;

  INSERT INTO auth_private.recovery_tokens (
    user_id, purpose, email, code_hash, expires_at
  )
  VALUES (
    v_uid,
    'reset_password',
    v_email,
    p_code_hash,
    now() + interval '1 hour'
  );

  RETURN v_email;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_password_reset(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.request_password_reset(text, text)
TO cairn_auth_bff;

-- reset_password returns a status string ('ok' | 'invalid' | 'locked') — it does
-- NOT raise on a wrong code, for the same load-bearing reason as
-- confirm_recovery_email: PostgREST rolls back a raised error, so a wrong-code
-- path that raised would roll back its own `attempts` bump and the submission-
-- attempt cap (R8) would never persist. The one match-path error with nothing to
-- persist — a correct code but a too-short password — still raises 23514 and
-- leaves the token UNCONSUMED so the user can retry with a longer password.
--
-- The newest matching token is locked FOR UPDATE so concurrent guesses serialise
-- and cannot race past the `attempts >= 5` check. Mints NO session — the user
-- signs in afterwards (R6).
--
-- The 8-character minimum here is the authoritative re-check; the same figure is
-- duplicated (no shared const across the web/auth-proxy boundary) in the BFF
-- register flow + reset endpoint and the dev Vite proxy's register + reset
-- handlers — keep all sites in lockstep by hand.
--
-- pgcrypto's crypt()/gen_salt() run in the DB (R6) so the plaintext password
-- arrives as an RPC argument over the PostgREST→Postgres boundary; Postgres
-- statement logging must stay off (default) and the BFF must never log the reset
-- body (docs/logging.md). Writing auth.users via SECURITY DEFINER follows the
-- adopt_stable_identity precedent (0020). pgTAP cannot prove GoTrue *accepts* the
-- written bcrypt hash (its DB has no GoTrue) — that is the Phase-4 canary.
CREATE FUNCTION public.reset_password(
  p_username text, p_code_hash text, p_new_password text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid;
  v_tok auth_private.recovery_tokens%ROWTYPE;
  c_min_password_length constant int := 8;
BEGIN
  SELECT id INTO v_uid
  FROM public.profiles
  WHERE lower(username) = lower(p_username);

  IF v_uid IS NULL THEN
    RETURN 'invalid';
  END IF;

  SELECT * INTO v_tok
  FROM auth_private.recovery_tokens
  WHERE user_id = v_uid
    AND purpose = 'reset_password'
    AND consumed_at IS NULL
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT found THEN
    RETURN 'invalid';
  END IF;

  -- Submission-attempt cap, checked BEFORE the hash compare: treat an over-cap
  -- token as spent so the code space cannot be brute-forced.
  IF v_tok.attempts >= 5 THEN
    UPDATE auth_private.recovery_tokens
    SET consumed_at = now()
    WHERE id = v_tok.id;
    RETURN 'locked';
  END IF;

  IF v_tok.code_hash = p_code_hash THEN
    -- Authoritative password-length re-check. A correct code but a too-short
    -- password is the one match-path error with nothing to persist: raise and
    -- leave the token UNCONSUMED so the user can retry with a longer password.
    IF length(p_new_password) < c_min_password_length THEN
      RAISE EXCEPTION 'password too short' USING errcode = '23514';
    END IF;

    UPDATE auth.users
    SET encrypted_password = crypt(p_new_password, gen_salt('bf'))
    WHERE id = v_uid;
    UPDATE auth_private.recovery_tokens
    SET consumed_at = now()
    WHERE id = v_tok.id;
    RETURN 'ok';
  END IF;

  -- Wrong code: bump the durable attempt counter and report failure. The bump
  -- COMMITS (no raise) — that is the whole point of the status-return contract.
  UPDATE auth_private.recovery_tokens
  SET attempts = attempts + 1
  WHERE id = v_tok.id;
  RETURN 'invalid';
END;
$$;

REVOKE EXECUTE
ON FUNCTION public.reset_password(text, text, text) FROM public;
GRANT EXECUTE
ON FUNCTION public.reset_password(text, text, text) TO cairn_auth_bff;

COMMIT;
