# Requirements: Legal & About surface

Master-plan step 14. It adds Cairn's About hub and six legal sub-screens:

- Privacy policy
- Terms of service
- Imprint
- Open source
- Contact
- Source code / licence

These replace the placeholder `/imprint` stub that shipped with the production rollout. `cairn.lynnscape.eu` is live, and an operator imprint and a privacy notice that tells the truth are launch-blockers. Building the screens also requires making the live system match what the policy says: container log caps, a logging audit, and an actual LICENSE file.

## R1. The About hub lists Cairn's legal and project pages

A screen at `/about` titled "About" shows, in order:

1. A centred identity block: the Cairn wordmark, the tagline _"here's the way, you'll like this"_, and a monospace version line `v<version> · build <YYYY-MM-DD>` (R10). A `--rule` border runs below it.
2. Six navigation rows. Each has a leading icon, a title and a one-line subtitle:
   - **Privacy policy**: "What we store and why"
   - **Terms of service**: "The deal, in plain English"
   - **Imprint**: "Who runs this"
   - **Open source**: "Libraries we use, with thanks"
   - **Contact**: "Bugs, security, data requests"
   - **Source code**: "Cairn is open source"

   Each row opens the matching sub-screen (R4–R9).

3. An italic footer line: _"Made with care in `<operator town>` · hosted in `<hosting country>` · no trackers"_, with both values taken from the operator module (R3).

The row is titled "Privacy policy", not "Privacy", so it can't be confused with the existing Settings → People → Privacy (invite-privacy) screen.

## R2. Every About and legal page is reachable while signed out

`/about` and every route beneath it render for a signed-out visitor. Nobody is bounced to `/auth/signin`.

- **Public prefix.** The prefix `/about` is added to the signed-out content allowlist `PUBLIC_CONTENT_PATHS`. It must **not** go into the drift-guarded `auth-paths.ts`, which the production auth-proxy mirrors.
- **Old imprint URL.** The legacy `/imprint` URL redirects to `/about/imprint`, because it has already been shared. It stays signed-out-viewable so the redirect can fire.
- **Header bar.** All of these screens use the plain `TopBar`, not `AppTopBar`. There may be no signed-in user to name.

## R3. Deployment-specific facts live in one module

Every fact that would change if someone else ran Cairn is defined once, in `web/src/lib/legal/model/operator.ts`. Pages import these facts; they never write them out as literal text:

- operator name
- postal address lines
- country
- contact e-mail
- the town used in the About footer
- the hosting country
- the data processors (name, role, country)
- the supervisory authority (name and URL)
- the governing law and competent court
- the source repository URL
- the "last updated" date of each policy

A Vitest guard fails if the operator's name, e-mail, or the repository URL appears anywhere under `web/src` outside `operator.ts` and its own test. Someone forking Cairn edits one file. Rewriting the jurisdiction-specific legal prose is their job, not this module's.

The values for this deployment:

- **Operator:** Bertrand Delforge, van Imhoffstraat 26, 9721 CP Groningen, Netherlands. A private individual.
- **E-mail:** `bdelforge@protonmail.com`
- **Supervisory authority:** Autoriteit Persoonsgegevens
- **Governing law:** Dutch law, with the competent court in Groningen (Rechtbank Noord-Nederland)
- **Hosting:** Germany
- **Processors:** Hetzner Online GmbH for hosting, in Germany; Gandi SAS for outgoing e-mail, in France
- **Source repository:** `https://github.com/Niriel/cairn`

## R4. The Imprint names the operator with real values

`/about/imprint` (title "Imprint", subtitle "Who runs this") shows:

- the operator's name, postal address and country, and a contact e-mail, all from R3;
- a "Responsible for content" line stating it is the same person.

It shows no VAT ID or chamber-of-commerce number, because the operator is a private individual running a free, non-commercial service. It shows no EU ODR-platform block, because that platform was shut down in July 2025. No statute is cited in the subtitle; the legal citation is left for the lawyer review (see Non-requirements). No placeholder text ships (R15).

## R5. The Privacy policy describes what Cairn actually does

`/about/privacy` (title "Privacy policy", subtitle "Last updated `<date>`") is a plain-language GDPR Art. 13 notice. Every statement in it must be true of the live deployment, and backed by an entry in the claims table in `docs/legal.md` (R16). It covers:

- **Who is responsible:** the controller's identity and contact, from R3.
- **What we store:**
  - username (visible to signed-in users), display name, and profile photo (a 256px WebP; the original upload is discarded);
  - a password hash;
  - an optional recovery e-mail, used only for password resets and never shown to anyone;
  - lists, items, notes, votes, memberships, invitations, circle and block lists, and their timestamps.
- **Public lists:** what anyone holding a public list's link can see, as defined by `public_list_view`.
- **Why, and on what legal basis:** Art. 6(1)(b) to provide the service; Art. 6(1)(f) for security logging and rate limiting.
- **Logs:** what the server logs actually contain (R13), that they are size-capped (R12), and that request contents are never logged.
- **Where it lives:** the processors from R3. Everything stays within the EU. There are **no off-site backups at present**.
- **Who sees it:** fellow list members; other signed-in users, who see profile basics only; and the operator.
- **How long we keep it:** for the life of the account. Account deletion is immediate. What stays behind on shared lists, attributed to "Deleted user", is as described in `docs/account-deletion.md`.
- **Your rights:** access, rectification, erasure, restriction, objection and portability, with the in-app path for each where one exists. Complaints go to the Autoriteit Persoonsgegevens or the user's own data protection authority.
- **On-device storage:** the complete inventory from `docs/architecture.md`:
  - the cookies `__Host-cairn_session` (slides forward, about 30 days) and `__Host-cairn_access` (about 5 minutes);
  - the `localStorage` keys `cairn.theme`, `cairn.font_size`, `cairn.user` and `cairn.install_hint_dismissed`;
  - the service-worker cache.

  These are strictly necessary under ePrivacy Art. 5(3), so there is no consent banner.

- **No tracking:** no analytics, no third-party scripts, and self-hosted fonts.
- **Changes:** the date at the top changes, and material changes are announced in advance where possible.

## R6. The Terms of service are short and jurisdiction-correct

`/about/terms` (title "Terms of service", subtitle "Last updated `<date>`") covers:

- **What Cairn is:** free and ad-free; anyone can register, and lists are shared by invitation.
- **The user's responsibilities:** nothing illegal or harassing, nothing that infringes someone else's rights, and no attacks on the service.
- **Content ownership:** users keep their rights to their content, and grant only what is needed to store it and show it to the people they share with.
- **No warranty:** "as-is", to the extent the law allows.
- **Suspension:** suspension for abuse, with reasons given unless the law forbids.
- **Ending:** the user can delete their account at any time. The operator may shut the service down with at least 30 days' notice, given in the app and also by e-mail to anyone who has set a recovery address.
- **Liability:** limited to the extent the law allows.
- **Governing law:** Dutch law and the court from R3, without prejudice to mandatory consumer protections in the user's country of residence.

## R7. Contact offers one address with routing guidance

`/about/contact` (title "Contact", subtitle "Real humans read these") shows:

- **The R3 contact e-mail** as a `mailto:` link, with guidance on what to write about:
  - bugs, questions and feedback;
  - security reports, with a promise not to take legal action against good-faith research;
  - privacy and data requests, noting that most of them can be done in Settings;
  - reports of illegal content.
- **A "Postal" card** that points to the Imprint.

There is no PGP-key claim, because no key is published.

## R8. Cairn is AGPL-3.0-or-later, stated in the repo and in the app

- **Licence file.** A `LICENSE` file at the repository root contains the full text of the GNU AGPL v3.
- **Package metadata.** `web/`, `auth-proxy/` and `sidecar/` each have `package.json` `"license": "AGPL-3.0-or-later"`.
- **Copyright notice.** The repository README carries a copyright notice naming the operator.
- **In-app page.** `/about/license` (title "Source code", subtitle "Cairn is open source") states the licence and links to the source repository from R3. It also explains:
  - what the AGPL means for the reader (read, run, modify; network-service modifications must be published; no warranty);
  - why Cairn uses the AGPL and not MIT.

## R9. Open-source attributions are complete and the licence texts ship

`/about/open-source` (title "Open source", subtitle "Standing on shoulders") lists, by name and licence:

- **Browser-shipped packages:** every package in the browser bundle, including the two self-hosted font packages (SIL OFL);
- **Server stack (courtesy credit):** PostgreSQL, PostgREST, GoTrue, Caddy, and the sidecar's and auth-proxy's runtime npm dependencies.

Version numbers are not shown; they would drift with every dependency bump.

A static file at `/legal/licenses.txt` contains the full licence text for every browser-shipped package and its runtime dependencies. The screen links to it. The file is generated from `node_modules` by a committed script and committed to the repo. Two Vitest drift guards protect it:

- one fails if a `web/package.json` runtime dependency (or `svelte` or `@sveltejs/kit`) is missing from the attribution list;
- the other fails if regenerating `licenses.txt` would change it.

## R10. The app shows its version and build date

The web bundle exposes `web/package.json`'s `version` and the build date in ISO `YYYY-MM-DD` format, injected at build time. The About hub renders these as `v<version> · build <date>`. The injection doesn't depend on git metadata, because the Docker build context has none. Vitest sees the same values as the production build.

## R11. The legal pages can be reached from Settings and from the sign-in screens

- **Settings.** Settings gains an **About** section, placed between Recovery and Account. Its one row, "About Cairn", opens `/about`.
- **Sign-in screens.** The sign-in and registration footers each link to Imprint, Privacy and Terms (`/about/imprint`, `/about/privacy`, `/about/terms`). That way the privacy notice is reachable before a user hands over any data.

## R12. Production container logs are size-capped

Every service in the production compose stack uses the `json-file` log driver with `max-size: 10m` and `max-file: 5`. That caps each service at about 50 MB, after which the oldest lines are discarded. `docs/deployment.md` and `docs/logging.md` say so. Caddy keeps no access log in production.

## R13. The logs' personal-data content is audited, not assumed

Before the privacy policy is written, the actual log output of every container is inspected after exercising sign-in, registration, password recovery and avatar upload. The prod request path (Caddy → auth-proxy / PostgREST / GoTrue / sidecar) is also checked for whether real client IP addresses can reach any log. The findings are recorded in `docs/logging.md` and in the `docs/legal.md` claims table.

The policy describes the findings. If real client IPs, e-mail addresses or usernames do appear, the work stops and the user decides what to do. Wording the policy around the problem is not an option.

## R14. Legal pages share one shell and one long-form text style

Every legal sub-screen is built from a shared `LegalPage` component: a screen, a plain `TopBar` with a title and an optional subtitle, and a body styled by a new global `.prose` type role.

- **`.prose`:** serif body, generous line height, and bullets restored for `ul`, since the globals reset them.
- **Intro:** each page opens with an italic intro paragraph in `--ink-soft`.
- **Headings:** section headings use the global `h2`.

Colours come only from design tokens. All copy is British English, with "e-mail" hyphenated. "Licence" is the noun in copy; routes and identifiers keep `license`.

## R15. No placeholder text ships

No legal page renders bracketed placeholder text such as `[Operator name]`. Each page's Vitest test asserts this. The stub's old "every field is a placeholder" deploy-gate test is removed.

## R16. Docs describe the legal surface and the facts behind it

- **New `docs/legal.md`:**
  - the legal surface and its routes;
  - the jurisdictional framing: the operator is a private individual established in the Netherlands, so Dutch and EU law apply; the servers are in Germany;
  - the single-source rule (R3);
  - a **claims table** mapping each privacy-policy statement to the doc or file that backs it, so whoever changes storage, logging or processors knows to update the policy.
- **Existing docs corrected:**
  - Restic backups are planned (master-plan step 21), not in place.
  - The design of `logging.md` changes: no access log, container caps, no IP-strip cron.
  - Stale step numbers and the stale cookie description are fixed.
  - The legal open question now calls for a review under Dutch/EU law, not by a "German-speaking lawyer".

## Non-requirements (explicitly excluded)

- **Lawyer review**: a human action after merge, tracked in `docs/open-questions.md`, not code.
- **Restic backups**: master-plan step 21 (`plans/2100_backups/`). If it lands first, this plan's policy describes the backups instead. The policy says plainly that there are none yet, and the claims table flags the line to change.
- **Caddy access log and IP-stripping cron**: dropped in favour of keeping no access log at all, which is simpler and more private.
- **DSA notice-and-action mechanism**: whether the DSA's point-of-contact and notice duties apply to a private, free service with open registration and invitation-only lists is an open question for the lawyer review. Contact (R7) already invites reports of illegal content.
- **Consent banner**: all device storage is strictly necessary (R5), so none is required.
- **Translations (Dutch, German)**: Cairn's UI is English-only. A legal translation would need a lawyer anyway.
- **Back-arrow fallback for legal pages opened in a fresh tab**: matches the existing imprint and the global `history.back()` rule, and the browser's own back still works.
- **Showing dependency versions on the Open source screen**: they would drift with every bump. `licenses.txt` carries the detail.
- **Git commit hash in the version line**: the Docker build context has no `.git`. Version plus build date is enough.
- **An in-app "policy changed" notice mechanism**: no change is pending. When one is needed, it's a separate plan.
- **Making the repository public**: the operator does this outside the code, after scanning git history for secrets.
