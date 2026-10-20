# Legal

This document describes Cairn's legal surface: the About hub and the pages under it, the legal framework they're written against, where the deployment-specific facts live, and — most importantly — which part of the system backs each statement the privacy policy makes. It's the doc to read before changing anything the privacy policy describes: device storage, logging, processors, backups, deletion, export, or the public-list surface.

The visual reference is `design/cairn-legal-screens.jsx` (screens L1–L7). Its _layout_ is authoritative; its _copy_ predates several decisions recorded here and is not.

## Routes

| Screen                    | Route                 | Design ref |
| ------------------------- | --------------------- | ---------- |
| About hub                 | `/about`              | L1         |
| Privacy policy            | `/about/privacy`      | L2         |
| Terms of service          | `/about/terms`        | L3         |
| Imprint                   | `/about/imprint`      | L4         |
| Open source               | `/about/open-source`  | L5         |
| Contact                   | `/about/contact`      | L6         |
| Source code / licence     | `/about/license`      | L7         |
| Third-party licence texts | `/legal/licenses.txt` | —          |

Every route is **public**: a signed-out visitor sees it without being bounced to sign-in. The `/about` prefix sits in `PUBLIC_CONTENT_PATHS` (`web/src/lib/shared/model/public-paths.ts`), never in the drift-guarded `auth-paths.ts`. The legacy `/imprint` URL — shared before this surface existed — redirects to `/about/imprint`. `/legal/licenses.txt` is a static file, not a route.

Because they render for signed-out visitors, these screens use the plain `TopBar`, not `AppTopBar` (which names the signed-in user). Entry points: Settings → About → About Cairn, and the Imprint · Privacy · Terms links in the sign-in and registration footers — the privacy notice has to be reachable before anyone hands over data.

## Jurisdiction

Cairn is run by a **private individual established in the Netherlands** (Groningen), free of charge, without commercial intent. Anyone can register; lists are shared by invitation. The servers are in **Germany** (Hetzner).

Which law applies follows from where the operator is _established_, not where the server stands. The framing throughout is therefore Dutch and EU law:

- **Data protection:** the GDPR, with the **Autoriteit Persoonsgegevens** (Dutch DPA) as supervisory authority. Users may also complain to the authority where they live.
- **Device storage:** the ePrivacy Directive Art. 5(3) strictly-necessary exemption (implemented in the Netherlands by Telecommunicatiewet art. 11.7a) — see `architecture.md` → "Client-side storage and the consent question".
- **Imprint:** the provider-information duty of the e-Commerce Directive Art. 5, implemented in Dutch Civil Code art. 3:15d. Whether it applies to a non-commercial private service is uncertain; publishing the information anyway costs nothing.
- **Terms:** Dutch law, the competent court in Groningen (Rechtbank Noord-Nederland), without prejudice to the mandatory consumer protections of the user's country of residence.

The German statutes the design cites (TMG, DDG, RStV, MStV, TDDDG) and the German federal DPA (BfDI) do **not** apply, and the EU ODR platform the design links to closed in July 2025. The pages carry no statute citations in their subtitles; the precise citations are for the lawyer review (see "Open items").

## Single source for deployment facts

Every fact that changes when someone else runs Cairn lives in **`web/src/lib/legal/model/operator.ts`**: the operator's name, postal address, country and contact e-mail; the town in the About footer; the hosting country; the processor list; the supervisory authority; the governing law and court; the source-repository URL; and each policy's "last updated" date. Pages import these values; they never spell them out.

A Vitest guard (`web/src/lib/legal/model/single-source.test.ts`) fails if the operator's name, e-mail, address or the repository URL appears anywhere under `web/src` outside that module and its own test. A fork edits one file — and rewrites the jurisdiction-specific prose (Dutch law, GDPR basis), which can't meaningfully be parameterised.

## Claims table

Each statement the privacy policy makes, the doc or file that makes it true, and the change that makes it stale. **If you make a change in the right-hand column, update `/about/privacy` (and bump its date in `operator.ts`) in the same PR.**

| Claim in the policy                                                                                                         | Backed by                                                                                                                                                                                       | Update the policy when…                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Two cookies (sliding ~30-day session, ~5-min access), four `localStorage` keys, a service-worker cache; nothing else        | `architecture.md` → "Client-side storage and the consent question"                                                                                                                              | a cookie, storage key, or cache is added, removed, or changes lifetime                                                                        |
| Container logs are size-capped (~50 MB per service, oldest lines dropped); no web access log; request contents never logged | `logging.md`; the `x-logging` options in `docker-compose.prod.yml`; `caddy/Caddyfile.prod` (no `log` directive); `log_error_verbosity=terse` and `PGRST_LOG_LEVEL=crit` in `docker-compose.yml` | log options, a `log` directive, Postgres error verbosity, PostgREST log level, or any service's log content changes                           |
| No client IP address, e-mail address, or username reaches a log                                                             | `logging.md` → "Audit" (step 14); the client-IP headers in `SKIP_REQUEST_HEADERS` (`auth-proxy/src/index.ts`), tested in `auth-proxy/test/shim.test.ts`                                         | a service starts logging request metadata, the auth-proxy forwards new headers to GoTrue, or `X-Forwarded-For` / `X-Real-IP` handling changes |
| Rate-limit counters are kept in memory only                                                                                 | `auth-proxy/src/lib/rate-limit.ts`; `logging.md`                                                                                                                                                | throttle state is persisted anywhere                                                                                                          |
| Processors: Hetzner Online GmbH (hosting, Germany); Gandi SAS (outgoing e-mail, France); everything inside the EU           | `PROCESSORS` in `operator.ts`; `SMTP_HOST` in `.env.prod.example`; `deployment.md`                                                                                                              | the host, the SMTP provider, or any other service touching personal data changes                                                              |
| **No off-site backups** at present                                                                                          | `deployment.md` → "Backups" (not yet in place)                                                                                                                                                  | master-plan step 21 (`plans/2100_backups/`) lands — then state location, encryption, and retention instead                                    |
| Username public to signed-in users; recovery e-mail optional, used only for reset codes, never shown                        | `data-model.md` (`profiles`, `user_settings`); `invites.md` (e-mail privacy); `architecture.md` → "Password recovery is Cairn-orchestrated"                                                     | the identity model or recovery flow changes                                                                                                   |
| Profile photo stored as a small square WebP; the original upload is discarded                                               | `avatars.md` → "What we settled on", "The sidecar"                                                                                                                                              | avatar processing or storage changes                                                                                                          |
| What a public link exposes, and to whom                                                                                     | `data-model.md` → "Public read access" (`public_list_view`)                                                                                                                                     | the public snapshot gains or loses fields                                                                                                     |
| Account deletion is immediate; what's erased and what stays on shared lists under "Deleted user"                            | `account-deletion.md` → "What gets deleted, anonymized, or kept"                                                                                                                                | the deletion function's scope changes                                                                                                         |
| Access and portability via Settings → Privacy & data → Download my data                                                     | `data-export.md`                                                                                                                                                                                | the export moves or its scope changes                                                                                                         |
| No analytics, no third-party scripts, fonts self-hosted                                                                     | `architecture.md` → "Goals and non-goals"; `@fontsource-variable/*` in `web/package.json`                                                                                                       | any third-party script, font CDN, or telemetry is introduced                                                                                  |
| Legal bases: Art. 6(1)(b) for the service, Art. 6(1)(f) for security logging and rate limiting                              | this document                                                                                                                                                                                   | a new processing purpose appears                                                                                                              |

## Licence

Cairn is **AGPL-3.0-or-later**: the full text is `LICENSE` at the repository root, the copyright notice is in the root `README.md`, and every `package.json` declares the licence. `/about/license` states it in plain words and links to the source repository.

Third-party code that ships to the browser carries notice obligations (MIT, BSD, and similar licences for code; the SIL OFL for the two self-hosted fonts). `/about/open-source` lists the main components by name and licence; `web/static/legal/licenses.txt` carries the full texts. That file is generated from `node_modules` by `pnpm gen:licenses` (`web/scripts/gen-licenses.mjs`) and committed; a Vitest drift guard fails when it no longer matches the installed dependencies, and another fails when a runtime dependency is missing from the curated list (`web/src/lib/legal/model/attributions.json`).

## Open items

- **Lawyer review.** The Imprint, Privacy policy, and Terms should be reviewed under Dutch/EU law before Cairn is treated as publicly launched — including the exact statute citations. Tracked in `open-questions.md`.
- **DSA applicability.** Whether the Digital Services Act's point-of-contact and notice-and-action duties apply to a private, free service with open registration. The Contact page already invites reports of illegal content.
- **Backups.** The "no off-site backups" line changes when master-plan step 21 lands (see the claims table).
