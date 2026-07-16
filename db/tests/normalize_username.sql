-- normalize_username.sql — the read-side '@' peel shared by every username
-- resolver (sign-in via resolve_username, password reset, invite, and
-- circle-add). Added by migration 0020. A pure function: it peels exactly one
-- leading '@' — the sigil the public identity is shown and pasted with — leaves
-- everything else untouched, and (being STRICT) maps NULL to NULL so a missing
-- argument still falls through to a lookup miss. Centralising the rule here is
-- what keeps "@ is optional on input" identical across all four entry points.

BEGIN;

SELECT plan(6);

-- (a) peels a single leading '@' — the sigil the public identity is shown with.
SELECT is(
  public.normalize_username('@BobHandle'),
  'BobHandle',
  'normalize_username peels a single leading @'
);

-- (b) a bare handle is unchanged (the common case is a no-op).
SELECT is(
  public.normalize_username('BobHandle'),
  'BobHandle',
  'normalize_username leaves a bare handle unchanged'
);

-- (c) exactly one '@' is peeled — a second leading sigil survives (and then
--     misses the lookup, since a stored username never contains '@').
SELECT is(
  public.normalize_username('@@BobHandle'),
  '@BobHandle',
  'normalize_username peels exactly one leading @, not all'
);

-- (d) an interior '@' is untouched — only the anchored leading one is peeled.
SELECT is(
  public.normalize_username('Bob@Handle'),
  'Bob@Handle',
  'normalize_username does not touch a non-leading @'
);

-- (e) the sigil alone normalises to the empty string (which misses the lookup).
SELECT is(
  public.normalize_username('@'),
  '',
  'normalize_username maps a lone @ to the empty string'
);

-- (f) STRICT: NULL in → NULL out, without executing the body.
SELECT is(
  public.normalize_username(NULL),
  NULL,
  'normalize_username returns NULL for NULL input (STRICT)'
);

SELECT finish();

ROLLBACK;
