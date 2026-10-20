# Plan: Legal & About surface

Master-plan step 14 builds Cairn's About hub and six legal sub-screens, and replaces the placeholder `/imprint` stub that shipped with the production rollout (1500 task 6.1). `cairn.lynnscape.eu` is live, and a real imprint and an honest privacy notice are the last launch-blockers.

## Context

The visual spec is `design/cairn-legal-screens.jsx`: the About hub (L1), Privacy (L2), Terms (L3), Imprint (L4), Open source (L5), Contact (L6) and License (L7). No `docs/` file specifies the surface. Today the only legal page is `web/src/routes/imprint/+page.svelte`, a stub with bracketed placeholders whose test asserts that the placeholders are still there. It is reachable signed out through `PUBLIC_CONTENT_PATHS` in `web/src/lib/shared/model/public-paths.ts` and linked from the SignIn and Register footers.

Comparing the design copy with the live system turned up a lot of drift:

- **Jurisdiction.** The operator is a **private individual established in the Netherlands** (Groningen). Only the server is in Germany. The design and docs assume a German operator throughout: TMG/RStV/DDG citations, the BfDI, "Made in Berlin", and "needs a German-speaking lawyer". Where the operator is established decides which law applies; where the server sits does not. That points to Dutch/EU law, the Autoriteit Persoonsgegevens, and Groningen courts.
- **Logging.** `docs/logging.md` describes a Caddy access log kept for 30 days, an IP-stripping cron, and 7-day / 50 MB container caps. None of it exists in the repo. `caddy/Caddyfile.prod` has no `log` directive, and no compose file sets log options, so container logs grow without limit. The doc also contradicts itself on IP retention (1 h vs 24 h) and on whether PostgREST logs user IDs.
- **Backups.** The docs describe Restic backups as running. They aren't: there is no script, the 1500 plan deferred them, and the operator confirms none are running.
- **Sign-in.** Sign-in is by username now. E-mail is an optional recovery address, so the design's "your e-mail address (so you can sign in)" is wrong.
- **Device storage.** The device-storage inventory in `docs/architecture.md` has two cookies, four `localStorage` keys and a service-worker cache. The design says "three small things".
- **Licence.** There is no LICENSE file, and no `license` field in any `package.json`. The repo is private, but it will go public under AGPL-3.0-or-later.
- **Open-source list.** The design's list is stale (Vite 5, date-fns, Geist), and `/legal/licenses.txt` doesn't exist. The EU ODR platform the design links to was shut down in July 2025.

The operator chose:

- size-capped container logs and no access log, over implementing `logging.md` as written;
- one contact address, over role aliases;
- a curated attribution list plus generated licence texts;
- real imprint values in this plan.

## Decisions

**Everything under `/about`, all public (R2).** The seven screens are `/about`, `/about/{privacy,terms,imprint,open-source,contact,license}`.

- **Public prefix.** One `PUBLIC_CONTENT_PATHS` entry (`'/about'`) covers them all, because the guard's `isSegmentMatch` matches by prefix. They sit outside the `(app)` group, like the existing stub.
- **Why not `/legal/*`.** It would split the hub from its children for no gain.
- **`/imprint`.** It stays as a redirect, because its URL is in the wild.
- **Header bar.** These screens use the plain `TopBar`. `AppTopBar` reads the profile store for "Signed in as …", and there may be no user.

**One module for deployment facts (R3).** The operator asked that a forker be able to retarget the site without hunting through pages. `web/src/lib/legal/model/operator.ts` holds every deployment-specific fact; pages only import them. A Vitest guard scans `web/src` for the operator's name, e-mail and repo URL outside that module, so a later edit can't quietly hard-code them.

- **Why not environment variables.** Building from `.env` would let one image serve several operators. But it adds build plumbing, and it splits facts that belong together (the policy text and the processor list) across files. Nobody needs that.
- **What the module doesn't cover.** The jurisdiction-specific prose (Dutch law, GDPR basis) can't be parameterised in any meaningful way. A forker in another country has to rewrite it anyway.

**Truth before copy (R5, R12, R13).** The privacy policy may only state what is true of the live box, so the plan front-loads making it true:

- **Phase 1.1** caps container logs (`json-file`, 10 MB × 5 per service). This is the cheapest fix that turns "logs grow forever" into a statable retention.
- **Phase 1.2** audits what the logs actually contain. The known suspects are GoTrue's `remote_addr` and Caddy's default `X-Forwarded-For` reaching upstream services.
- **No access log.** We keep no Caddy access log at all, instead of building the 30-day log plus IP-strip cron: it's simpler, more private, and one less thing to disclose. Abuse triage still has the auth-proxy's in-memory rate limiter.
- **If the audit finds real client IPs or e-mail addresses in a log,** the executor stops and the operator decides. The policy is not worded around the problem.

**`docs/legal.md` with a claims table (R16).** The policy is a set of factual claims, and each one is backed by a doc or a file (`architecture.md`'s storage table, `logging.md`, `account-deletion.md`, `operator.ts`'s processor list, `docker-compose.prod.yml`'s log options). Without a map, the next person who adds a `localStorage` key or switches SMTP provider won't know the policy just went stale. The claims table is that map. It also flags the "no off-site backups" line as the one to change when step 21 (off-site backups) lands.

**A shared `LegalPage` shell plus a global `.prose` role (R14).** The JSX's `LegalShell`, `LegalH` and `LegalLabel` turn into:

- **`LegalPage.svelte`:** layout only. It holds `.screen`, the `TopBar` with title and `sub`, and the body padding (the JSX's 20/22/36 px, in rem).
- **`.prose` in `typography.css`:** the visual parts: serif body at a line height of about 1.6, paragraph rhythm, and restored `ul` bullets, since the globals reset lists to `none`.
- **Headings:** section heads use the global `h2`, as the JSX's `LegalH` does. The JSX's uppercase sub-labels become `h3` elements, styled under `.prose h3`, so the document outline stays correct. The existing `Label` component renders a form `<label>`, which would be the wrong element here.

This follows `docs/ui.md`'s "layout local, visual global" rule. The design's `Placeholder` chip is dropped, because nothing ships as a placeholder (R15).

**Page content inline in `+page.svelte`.** Each legal page is static prose. Wrapping each one in a `$lib/legal/components/*Screen.svelte` would only add an import hop. The existing imprint already puts its markup in the route, with a `page.test.ts` beside it, and we keep that pattern. Only reusable pieces go in `$lib/legal/`: the shell, the operator facts, attributions and build info.

**Version from `package.json` plus build date (R10).** Vite `define` injects `__APP_VERSION__` and `__BUILD_DATE__`. `web/vitest.config.ts` is a separate config, so both configs import the define map from one small module. Git SHAs are out, because the Docker build context excludes `.git`.

**Attributions: a curated screen, generated texts (R9).** The screen shows a short human list (main libraries, fonts and server stack), with names and licences but no versions, which would drift on every bump. The legal obligation is the licence texts. MIT requires the notice to travel with the code, and the OFL requires it to travel with the fonts, and both ship to every browser.

- **The script.** `web/scripts/gen-licenses.mjs` walks the runtime dependency closure of `web/package.json`'s `dependencies` plus `svelte` and `@sveltejs/kit` through `node_modules`. It concatenates each package's LICENSE file into the committed `web/static/legal/licenses.txt`. Over-including kit's server-side deps is harmless; under-including would be a breach.
- **Precedent.** The script follows `scripts/generate-icons.mjs` (a committed artefact made by a manual `pnpm` script).
- **Drift guards.** Two Vitest guards catch drift: one checks that the attribution list covers every runtime dependency, and one checks that regenerating `licenses.txt` produces the committed file.

**AGPL-3.0-or-later (R8).** This is the operator's choice and what the design says. AGPL rather than MIT so that a hosted fork must publish its changes; the L7 copy explains why in plain words.

- **The `LICENSE` file** is the verbatim GNU text.
- **The README** gets the copyright line.
- **Package metadata.** All three `package.json` files declare the licence, so `pnpm licenses` and GitHub's licence detection agree.

**Entry points (R11).** Settings gains an About section between Recovery and Account, matching the section list in `docs/ui.md`. The SignIn and Register footers gain Privacy and Terms next to Imprint, because GDPR Art. 13 information must be available when data is collected, and registration is where that happens.

**Renamed and corrected copy (R4–R7).**

- **Hub row.** "Privacy" becomes "Privacy policy", to avoid colliding with Settings → People → Privacy.
- **Footer.** "No third parties" becomes "no trackers", since Hetzner and Gandi are processors.
- **Imprint.** The ODR block is dropped. So are the VAT and register fields, which don't apply to a private, non-commercial operator.
- **Statute citations** in subtitles are dropped in favour of plain-language subtitles. The lawyer review owns the citations.
- **Contact.** The PGP claim is dropped (there is no key), and the three role addresses become one.

## Architecture

### New files

- **`docs/legal.md`:** the surface spec, jurisdiction framing, single-source rule and claims table.
- **`LICENSE`:** the GNU AGPL v3 text.
- **`web/src/lib/legal/model/operator.ts`** and **`operator.test.ts`:** deployment facts, plus a test of their shape.
- **`web/src/lib/legal/model/single-source.test.ts`:** the guard that no operator fact is hard-coded elsewhere in `web/src`.
- **`web/src/lib/legal/model/build-info.ts`** and **`build-info.test.ts`:** `APP_VERSION`, `BUILD_DATE` and `formatBuildLine()`.
- **`web/build-defines.ts`:** the shared `define` map used by `vite.config.ts` and `vitest.config.ts`.
- **`web/src/lib/legal/model/format-date.ts`** and its test: ISO date to "20 October 2026" (en-GB).
- **`web/src/lib/legal/model/attributions.json`**, **`attributions.ts`** and **`attributions.test.ts`:** the curated list, its types, and the coverage guard.
- **`web/src/lib/legal/model/licenses-drift.test.ts`:** checks that the generated text matches the committed file.
- **`web/src/lib/legal/components/LegalPage.svelte`** and **`LegalPage.test.ts`:** the shared shell.
- **`web/scripts/gen-licenses.mjs`:** the generator. It exports a pure `buildLicensesText()` and writes the file when run as `pnpm gen:licenses`.
- **`web/static/legal/licenses.txt`:** the generated, committed licence texts.
- **`web/src/routes/about/+page.svelte`** and **`page.test.ts`:** the L1 hub.
- **`web/src/routes/about/{privacy,terms,imprint,open-source,contact,license}/+page.svelte`**, each with a **`page.test.ts`**: L2–L7.
- **`web/src/routes/imprint/+page.ts`:** the redirect to `/about/imprint`. It replaces the stub `+page.svelte`.
- **`web/e2e/legal.spec.ts`:** signed-out and signed-in journeys through the surface.

### Modified files

- **`docs/logging.md`, `docs/architecture.md`, `docs/deployment.md`, `docs/data-model.md`, `docs/open-questions.md`, `docs/ui.md`, `docs/README.md`, `plans/0000_implementation_order.md`:** Phase 0 reconciliation and Phase 1 audit results.
- **`docker-compose.prod.yml`:** the `x-logging` anchor applied to every service.
- **`README.md`:** the copyright and licence notice.
- **`web/package.json`, `auth-proxy/package.json`, `sidecar/package.json`:** the `license` field. `web/` also gains the `gen:licenses` script.
- **`web/vite.config.ts`, `web/vitest.config.ts`, `web/src/app.d.ts`:** the build-info `define` and its global declarations.
- **`web/src/lib/shared/styles/typography.css`:** the `.prose` role.
- **`web/src/lib/shared/model/public-paths.ts`:** adds `'/about'`.
- **`web/src/routes/layout.test.ts`:** a test that `/about/*` is public.
- **`web/src/routes/imprint/page.test.ts`:** now tests the redirect, replacing the placeholder gate.
- **`web/src/lib/settings/components/SettingsScreen.svelte`** and its test: the About section.
- **`web/src/lib/auth/components/SignIn.svelte`, `Register.svelte`** and their tests: the footer links.
- **`web/e2e/imprint.spec.ts`:** follows the redirect.

### Data flow

```
operator.ts ──► every legal +page.svelte   (facts)
build-defines.ts ──► vite/vitest define ──► build-info.ts ──► /about version line
web/package.json deps + node_modules ──► gen-licenses.mjs ──► static/legal/licenses.txt
                                   └──► attributions.test.ts / licenses-drift.test.ts (guards)
```

### Test layers

- **Vitest:** every model module, `LegalPage`, every route page (copy, links and the no-placeholder check), the layout guard, Settings, and the SignIn/Register footers.
- **Playwright:** `web/e2e/legal.spec.ts` covers the signed-out footer → pages journey, the `/imprint` redirect, Settings → About → each row → back, and that `licenses.txt` is served.
- **pgTAP:** no DB changes; the suite must stay green.

## Phase structure

Every task is RED-before-GREEN inside a single commit. The phases are ordered so that SvelteKit's `resolve()` targets always exist before anything links to them. The sub-pages come before the hub, and the hub comes before the Settings row and the sign-in footers.

0. **Phase 0 — reconcile docs.** Write `docs/legal.md` with the surface spec, the jurisdiction framing, the single-source rule and a first claims table. Correct the existing docs: `logging.md` gets its new design; Restic is marked "not in place" in `architecture.md`, `deployment.md` and `0000`; the stale step numbers and cookie row are fixed; the open question is reframed around Dutch/EU law; `ui.md` gets the About and `.prose` notes. Doc-only commits (Tasks 0.1–0.2).
1. **Phase 1 — production truth.**
   - Cap the logs in `docker-compose.prod.yml`. This is prod-facing, and it takes effect when the containers are recreated.
   - Audit what the logs actually contain, and record the findings in the docs. This is the stop-and-discuss point.
   - Add the LICENSE file, the copyright notice and the `license` fields.

   Tasks 1.1–1.3.

2. **Phase 2 — legal foundation.**
   - The deployment facts (`operator.ts`), build info and the single-source guard.
   - The `.prose` role and the `LegalPage` shell.
   - The `/about` public-path entry.

   Tasks 2.1–2.3.

3. **Phase 3 — screens.**
   - Imprint, including the `/imprint` redirect and the removal of the old placeholder gate.
   - Privacy and Terms.
   - Contact and Licence.
   - Open source, with the generator and both drift guards.
   - The About hub and the Settings row last, once every target route exists.

   Tasks 3.1–3.6.

4. **Phase 4 — entry points and e2e.** Add the sign-in and register footer links, write `legal.spec.ts`, and update `imprint.spec.ts`. Playwright can't run on the current dev machine, so the specs are written and reported as not run. Tasks 4.1–4.2.
5. **Phase 5 — close out.** Tick step 14 in `0000`, update the step-15 note to say the imprint is complete, and run the full check (Task 5.1).
6. **Phase 6 — post-review cleanup.** Fix what the `/simplify` review of this branch skipped.
   - Remove the auth-proxy's generic GoTrue pass-through, with dev parity (R17). Prod-facing: the auth-proxy needs a rebuild.
   - Drop `/imprint` from the public paths; share the sign-in/register footer; share the legal-page test helpers and fold the placeholder checks into one test; make `.lede` global (R15, R19).
   - Enforce the production log cap in `scripts/check.sh` (R18).
   - Small tidy-ups in `gen-licenses.mjs` and the drift test, then close out.

   Tasks 6.1–6.8.

## Reference docs and skills

- **`design/cairn-legal-screens.jsx`:** layout and copy source. Take layout and structure from it; take colours and type from tokens and global roles.
- **`docs/ui.md`:** TopBar rules, NavRow, "layout local, visual global", rem units, button and row conventions, and the Settings section order.
- **`docs/frontend-layout.md`:** where the new `legal/` domain's files go, and filename rules (route tests drop the `+`).
- **`docs/architecture.md` → "Client-side storage and the consent question":** the canonical device-storage inventory behind the privacy policy.
- **`docs/logging.md`:** what the logs contain (after Task 1.2).
- **`docs/account-deletion.md`, `docs/data-export.md`, `docs/data-model.md` → "Public read access":** sources for the privacy policy's retention, rights and public-list sections.
- **`docs/quality.md`:** the toolchain, and the escape for links to routes that don't exist yet. Not needed if the phase order holds.
- **`docs/testing.md`:** the three test layers.
- **`.claude/skills/writing-tests.md`:** test conventions.

## Open questions

- **Lawyer review.** The Imprint, Privacy policy and Terms need a review under Dutch/EU law, including whether the DSA's duties apply. Default: merge, keep it as an open question in `docs/open-questions.md`, and revise the copy afterwards in a small follow-up plan.
- **Log audit outcome.** If Task 1.2 finds real client IPs in GoTrue or sidecar logs, the fix (stripping `X-Forwarded-For` at the proxy, or disclosing short retention) is the operator's call. Default: stop at Task 1.2 and ask.

## Revision: decisions made during execution

These were decided after Phases 0–2 had landed. The task blocks for Phases 3 and 5 were updated to match; Phases 0–2 stay as their historical record.

- **The log audit found real leaks (Task 1.2).**
  - GoTrue was copying forwarded client IPs into its log.
  - Postgres repeated row contents when a write broke a constraint.
  - PostgREST logged full query strings.

  The operator chose to fix all three rather than disclose them: the auth-proxy now strips client-IP headers, Postgres runs with `log_error_verbosity=terse`, and PostgREST runs with `PGRST_LOG_LEVEL=crit`. As a result, the privacy policy can say that logs hold no IP addresses. It still has to disclose that IPs are used in memory for rate limiting.

- **Suspension wording (R6).** `docs/admin.md` deliberately keeps admin actions invisible: a banned user's sign-in looks like a wrong password. So the Terms can't promise to explain a suspension. They say there is no in-app notice, but "you can write to us to ask why". The ban mechanism was not changed.
- **Recovery e-mail scope (R5).** The Terms promise a shutdown notice by e-mail to users who set a recovery address. So the privacy policy says that address is used for reset codes **and essential service notices such as a shutdown**, never for marketing. "Used only for reset codes" would contradict the Terms.
- **Moderation records (R5).** The policy discloses the `admin.actions` audit trail, a processing activity the original outline missed.
- **Type roles.** `docs/ui.md` won over the original task wording:
  - `.prose h3` is the ordinary normal-case `h3`, not an uppercase label;
  - the version line, the contact e-mail and the repo URL are not monospace, because `.mono` is reserved for numerics.
- **Release.** This plan ships **1.0.0**, the official release. Off-site backups (master-plan step 21) remain open.
- **Brand and contact address.** The operator brands their apps as **Lynnscape**, a personal label backed by the `lynnscape.eu` domain and not a legal entity. `operator.ts` gains `brand`, and the single-source guard covers it. The About footer reads "A Lynnscape app · …". The Imprint adds "Lynnscape is the personal label of Bertrand Delforge." The controller and the party to the Terms remain the person. The contact e-mail changed to `lynn@lynnscape.eu`.

## Revision: post-review cleanup (Phase 6)

Decided after Phases 0–5 had landed, from the `/simplify` review of the branch.

- **The pass-through is removed, not allow-listed.** Task 1.2 stripped three client-IP headers from the auth-proxy's generic GoTrue pass-through. The review found that a deny-list depends on naming every IP-ish header correctly. Tracing the traffic showed that nothing uses the pass-through: the web client only POSTs to the dedicated BFF handlers, the dev server doesn't use the auth-proxy, and in production only stray methods (e.g. `GET /auth/refresh`) reach it. Removing it is simpler than allow-listing it, and GoTrue cannot log a request it never receives (R17).
- **Caddy's `@gotrue` matcher stays as is.** It still routes every method on `/auth/signout*` and `/auth/refresh*` to the auth-proxy, which now answers non-POSTs with 404. Narrowing it to POST would be a routing change on the live box for no gain; only its comment is corrected.
- **`/imprint` leaves the public paths.** Under `ssr = false`, SvelteKit's client router runs the route's `load` and follows its redirect before mounting, so the layout guard only ever sees `/about/imprint`.
- **The Export hub's lede changes colour** from `--stone` to `--ink-soft` when `.lede` becomes global. That matches its design reference (`design/cairn-export-screens.jsx`, `theme.inkSoft`).
