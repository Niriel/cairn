# VPS rollout plan

This is the working plan for bringing up the Hetzner VPS that will host Cairn (and other small apps) under the `lynnscape.eu` domain. It complements `deployment.md`, which describes the _steady state_ of Cairn in production. This document is about the _transition_ — what needs to happen, in roughly what order, and the loose ends that come with it.

The doc is expected to evolve. Add to it as new items surface; strike items as they're done.

## Operator context

- **Sole developer.** Lynn is the only person committing to this repo and the only operator of the VPS. The remote (currently a private repo) is used to sync between machines and as off-laptop backup, not for collaboration.
- **History rewrites are acceptable.** Because no one else pulls from the remote, force-pushing after a `git filter-repo` is a non-event — re-clone any other machine and move on. This is worth stating explicitly because most git advice assumes shared history.
- **Email today vs. tomorrow.** Commits today are authored as `Lynn <bdelforge@protonmail.com>`. Once `lynn@lynnscape.eu` exists, that becomes the canonical identity and prior history will be rewritten to match (see "Git identity migration" below).

## Phase 1 — Domain and email

Before the VPS is useful, the domain and email need to exist. These are independent of the server and can be done first.

### Register `lynnscape.eu`

- Pick a registrar that doesn't make us queasy and supports `.eu`. Gandi and Namecheap both work; Gandi is the safer EU-aligned default.
- Enable WHOIS privacy if the registrar offers it. `.eu` has a natural-person privacy default for non-business registrants, but confirm at registration time.
- Set up DNS at the registrar (or delegate to a separate DNS host). Initial records can be empty — they'll be added in Phase 3 once the VPS has an IP.

### Pick an email host

Mailbox hosting is separate from transactional email (the latter is covered in `deployment.md` under SMTP). For personal mail at `lynn@lynnscape.eu`:

- **Mailbox.org** (German, ~€3/month) — straightforward IMAP/SMTP, no surprises.
- **Migadu** (Swiss, ~€20/year for the smallest plan) — unlimited domains, billed by traffic.
- **Proton** with custom domain — familiar (already using ProtonMail), but locks mail to the Proton client unless you pay for IMAP bridge.

Decide before configuring DNS so MX/SPF/DKIM/DMARC can be set in one pass.

### DNS records to plan for

Anticipated record set once Phase 1 + 3 are both done:

```
@                 MX     <email host MX>
@                 TXT    "v=spf1 include:<host> -all"
<selector>._domainkey  TXT  <DKIM key from email host>
_dmarc            TXT    "v=DMARC1; p=quarantine; rua=mailto:postmaster@lynnscape.eu"
cairn             A      <vps-ipv4>
cairn             AAAA   <vps-ipv6>
```

Other subdomains (one per app on the VPS) get added as those apps come online.

## Phase 2 — VPS bring-up

Mechanically covered by `deployment.md` ("The VPS" → "First-login hardening" → "Docker"). Two notes specific to this rollout:

- **Shared infrastructure.** This box is meant to host more than just Cairn. Provision it under a generic user (`ops` or `lynn` rather than `cairn`), and lay out the filesystem with sibling app directories (`/srv/cairn/`, `/srv/<next-app>/`) rather than nesting under a Cairn-specific home.
- **Caddy as shared front door.** A single Caddy instance terminates TLS for every app's subdomain. The Caddyfile lives outside any individual app's repo — likely `/srv/caddy/Caddyfile` — and `include`s per-app snippets that each app's repo provides.

Both of these diverge slightly from the layout shown in `deployment.md`, which is written as if Cairn were the only tenant. When the divergence becomes real, update `deployment.md` to match rather than letting the two drift.

## Phase 3 — Cairn in production

Follows `deployment.md` end-to-end. Pre-flight checklist:

- [ ] `cairn.lynnscape.eu` A/AAAA records pointing at the VPS, propagated.
- [ ] Transactional email provider chosen and SMTP credentials in hand (Mailjet or Scaleway TEM — see `deployment.md`).
- [ ] `.env.prod` filled in, stored in password manager.
- [ ] First migration applied against an empty production database.
- [ ] Backup repo initialized on the Storage Box, restic password stored separately from `.env.prod`.
- [ ] Test restore performed against a throwaway target before considering the system live.

## Phase 4 — Git identity migration

Triggered when `lynn@lynnscape.eu` exists and is the address Lynn wants attached to commits going forward.

1. **Switch the working identity.** In each repo (or via `~/.gitconfig`):
   ```
   git config user.email lynn@lynnscape.eu
   ```
2. **Rewrite existing history.** With `git-filter-repo` (Fedora: `sudo dnf install git-filter-repo`):
   ```
   git filter-repo --email-callback '
     return b"lynn@lynnscape.eu" if email == b"bdelforge@protonmail.com" else email
   '
   ```
   Run on one canonical clone. Verify with `git log --format='%ae' | sort -u` that only the new address appears.
3. **Force-push.** `git push --force` to the remote. Safe here because no collaborator is pulling.
4. **Re-clone other machines.** Easier and less error-prone than rebasing local clones onto rewritten history. Any uncommitted work on those machines should be stashed/diffed and reapplied.

This applies to every personal repo, not just Cairn. Worth doing them in one sitting.

## Phase 5 — Other apps and shared concerns

Placeholder for the other "many things." To be filled in as they take shape:

- [ ] Second app on the VPS (TBD): subdomain, repo, deploy story.
- [ ] Shared monitoring (Uptime Kuma?) — deferred per `deployment.md` until something matters enough to alert on.
- [ ] Shared secrets approach: `.env.<app>` files vs. SOPS-encrypted-in-git. SOPS becomes worthwhile once there's more than one app's worth of secrets to manage.
- [ ] Off-VPS DNS monitoring or external uptime check — useful once there's a real user other than Lynn.

## Open questions

- Email host: which of mailbox.org / Migadu / Proton-with-custom-domain wins on the day-to-day experience?
- Does the VPS host a personal site at the apex `lynnscape.eu`, or is the apex left empty / redirected?
- Is there a `git filter-repo` mapping file worth keeping in a personal dotfiles repo so the migration can be run uniformly across every personal project?
