-- resolve_username.sql — locks in the public.resolve_username(text) RPC
-- added by migration 0020: it turns a typed username into the account's
-- (id, username) via the case-fold lower(username) index.
--
-- Sign-in happens before any session exists, so the resolver must work for
-- an unauthenticated caller — hence SECURITY DEFINER granted to anon. It
-- returns the stable user id (which the BFF authenticates the password grant
-- against) and the case-preserving STORED handle (so the signed-in identity
-- shows canonical casing, not whatever casing was typed). A miss is an empty
-- result — a permitted, truthful "no such username".

BEGIN;

SELECT plan(8);

\i /db/tests/fixtures/users_alice_bob_carol.sql

-- Give Alice and Bob known handles. Bob's mixed-case 'LaraCroft' anchors the
-- case-fold lookup.
UPDATE public.profiles SET username = 'AliceHandle'
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
UPDATE public.profiles SET username = 'LaraCroft'
WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

-- (a) an exact handle resolves to the correct (id, username).
SELECT is(
  (SELECT id FROM public.resolve_username('AliceHandle')),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'resolve_username returns the id for an exact handle'
);
SELECT is(
  (SELECT username FROM public.resolve_username('AliceHandle')),
  'AliceHandle',
  'resolve_username returns the stored username for an exact handle'
);

-- (b) case-insensitive: the typed 'laracroft' finds stored 'LaraCroft' and
-- returns the STORED casing, not the typed casing.
SELECT is(
  (SELECT id FROM public.resolve_username('laracroft')),
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
  'resolve_username resolves case-insensitively to the right id'
);
SELECT is(
  (SELECT username FROM public.resolve_username('laracroft')),
  'LaraCroft',
  'resolve_username returns the stored casing, not the typed casing'
);

-- (c) an unknown handle resolves to zero rows (a truthful miss).
SELECT is(
  (SELECT count(*)::int FROM public.resolve_username('NoSuchUser')),
  0,
  'resolve_username returns zero rows for an unknown handle'
);

-- (c2) a pasted '@' sigil resolves the same as the bare handle — the public
-- identity is shown/copied as '@AliceHandle' but stored as 'AliceHandle', so
-- resolve_username peels the leading '@' (via normalize_username) before the
-- lookup. This is the sign-in half of the shared "@ is optional" contract.
SELECT is(
  (SELECT id FROM public.resolve_username('@AliceHandle')),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'resolve_username peels a leading @ (''@AliceHandle'' resolves to Alice)'
);
-- (c3) the peel and the case-fold compose: '@laracroft' finds stored
-- 'LaraCroft'.
SELECT is(
  (SELECT id FROM public.resolve_username('@laracroft')),
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
  'resolve_username peels @ and folds case together (''@laracroft'' → Bob)'
);

-- (d) the resolver is callable by anon — sign-in runs before any session.
SET LOCAL ROLE anon;
SELECT lives_ok(
  $$SELECT public.resolve_username('AliceHandle')$$,
  'resolve_username is executable by the anon role'
);
RESET ROLE;

SELECT finish();

ROLLBACK;
