-- Dev seed data. Loaded only by `./scripts/seed.sh`; never runs in
-- production.
--
-- We deliberately do *not* insert into auth.users directly: GoTrue's
-- real schema has version-dependent NOT NULL columns that a bare
-- two-column insert can't satisfy, and any row we hand-craft would
-- be one GoTrue refuses to authenticate against. Instead,
-- `scripts/seed.sh` POSTs `/signup` to GoTrue for each seed user
-- (dev password: `cairn-dev`), which lets GoTrue satisfy its own
-- schema and fires `tg_profile_on_signup` to create the matching
-- public.profiles + user_settings rows.
--
-- The trigger seeds every row with `display_name = 'New user'`
-- (see db/migrations/0004_domain_schema.sql `tg_profile_on_signup`).
-- The UPDATEs below overwrite that placeholder for the three
-- well-known dev users so they render as Alice / Bob / Carol in the
-- UI. If a matching auth user is missing the UPDATE is a no-op,
-- which keeps the file idempotent.

UPDATE public.profiles
SET display_name = 'Alice'
WHERE id = (
  SELECT id FROM auth.users
  WHERE email = 'alice@example.test'
);

UPDATE public.profiles
SET display_name = 'Bob'
WHERE id = (
  SELECT id FROM auth.users
  WHERE email = 'bob@example.test'
);

UPDATE public.profiles
SET display_name = 'Carol'
WHERE id = (
  SELECT id FROM auth.users
  WHERE email = 'carol@example.test'
);
