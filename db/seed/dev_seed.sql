-- Dev seed data. Loaded only by `./scripts/seed.sh`; never runs in
-- production. Real seed users (Alice/Bob/Carol with auth.users rows and
-- the dev login shortcut) land alongside the real schema migration.
-- For now: a couple of profile rows so the smoke check can exercise
-- the API path end-to-end.

INSERT INTO public.profiles (display_name)
SELECT v FROM (VALUES ('Alice'), ('Bob')) AS t(v)
WHERE NOT EXISTS (SELECT 1 FROM public.profiles);
