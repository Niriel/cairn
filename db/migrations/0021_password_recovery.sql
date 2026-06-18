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
-- sub-step; this first task locks direct writes to recovery_email.

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

COMMIT;
