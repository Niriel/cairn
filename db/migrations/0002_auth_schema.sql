-- 0002_auth_schema.sql — create the auth schema for GoTrue.
-- GoTrue connects with ?search_path=auth and runs CREATE TABLE on first
-- boot to install its own schema_migrations. That fails with "no schema
-- has been selected to create in" unless the schema already exists, so
-- we pre-create it and hand ownership to the gotrue role.

BEGIN;

CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION gotrue;

COMMIT;
