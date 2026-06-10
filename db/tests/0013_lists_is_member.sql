-- 0013_lists_is_member.sql — tests for the lists_is_member computed
-- column added by migration 0013.
--
-- The column gates the Lists collection to actual members while
-- leaving the lists_select invitee disjunct (migration 0012) intact:
-- a pending invitee must still be able to SELECT the list row (for the
-- banner's lists(name) embed) yet have it excluded from the collection.
--
-- Coverage:
--   1. member: lists_is_member is TRUE for a list they belong to
--   2. pending invitee: lists_is_member is FALSE for the invited list
--   3. pending invitee: can still SELECT the row (lists_select disjunct
--      unchanged) — proves the gate must live in the column, not RLS
--   4. collection filter excludes the invited list for the invitee
--   5. collection filter keeps the member's own list

BEGIN;

SELECT plan(5);

\i /db/tests/fixtures/list_shared_alice_bob.sql

-- Alice (member) invites Carol (non-member) to the shared list.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;
SELECT public.send_invitation(
  '11111111-1111-1111-1111-111111111111',
  NULL,
  'cccccccc-cccc-cccc-cccc-cccccccccccc'
);
RESET ROLE;

-- 1. Alice is a live member → TRUE.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;
SELECT is(
  (
    SELECT public.lists_is_member(l) -- noqa: RF03
    FROM public.lists AS l
    WHERE l.id = '11111111-1111-1111-1111-111111111111' -- noqa: RF03
  ),
  TRUE,
  'lists_is_member is TRUE for a live member (Alice)'
);
RESET ROLE;

-- Carol (pending invitee) for assertions 2-4.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}',
  TRUE
);
SET LOCAL ROLE authenticated;

-- 2. Invitee is not a member → FALSE.
SELECT is(
  (
    SELECT public.lists_is_member(l) -- noqa: RF03
    FROM public.lists AS l
    WHERE l.id = '11111111-1111-1111-1111-111111111111' -- noqa: RF03
  ),
  FALSE,
  'lists_is_member is FALSE for a pending invitee (Carol)'
);

-- 3. The invitee can still SELECT the row (lists_select disjunct from
-- migration 0012 unchanged) — so the gate must be the column, not RLS.
SELECT is(
  (
    SELECT count(*)::int FROM public.lists
    WHERE id = '11111111-1111-1111-1111-111111111111'
  ),
  1,
  'pending invitee can still SELECT the list row (banner embed)'
);

-- 4. Filtering the collection by the column excludes the invited list.
SELECT is(
  (
    SELECT count(*)::int FROM public.lists AS l -- noqa: AL05
    WHERE public.lists_is_member(l) -- noqa: RF03
  ),
  0,
  'collection filter excludes the invited list for the invitee'
);

RESET ROLE;

-- 5. The same filter keeps Alice's own list.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;
SELECT is(
  (
    SELECT count(*)::int FROM public.lists AS l -- noqa: AL05
    WHERE public.lists_is_member(l) -- noqa: RF03
  ),
  1,
  'collection filter keeps the member''s own list (Alice)'
);

SELECT finish();

ROLLBACK;
