-- smoke.sql — proves pgTAP is installed and pg_prove is wired up.
-- Replace with real RLS / trigger / view tests as the schema grows;
-- see docs/testing.md → "Database tests (pgTAP)" for what belongs here.

BEGIN;

SELECT plan(1);

SELECT pass('pgTAP loaded');

SELECT finish();

ROLLBACK;
