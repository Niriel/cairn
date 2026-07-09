// Cairn — legal & about screens.
// About hub + six sub-screens: Privacy · Terms · Imprint · Open source · Contact · License.
// Copy is intentionally placeholder where it requires real legal/personal info —
// marked clearly so it isn't shipped as-is.

// Shared building blocks ─────────────────────────────────────
function LegalShell({ theme, title, sub, children }) {
  return (
    <ScreenShell
      theme={theme}
      header={
        <TopBar
          theme={theme}
          left={<IconBtn theme={theme} icon="arrow-left" label="back" />}
          title={title}
          sub={sub}
        />
      }
    >
      <div
        style={{
          padding: "20px 22px 36px",
          fontSize: 14,
          color: theme.ink,
          lineHeight: 1.6,
          fontFamily: '"Newsreader", Georgia, serif',
        }}
      >
        {children}
      </div>
    </ScreenShell>
  );
}

function LegalH({ theme, children }) {
  return (
    <div
      style={{
        fontFamily: '"Newsreader", Georgia, serif',
        fontSize: 18,
        fontWeight: 500,
        color: theme.ink,
        letterSpacing: "-0.01em",
        marginTop: 22,
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function LegalLabel({ theme, children }) {
  return (
    <div
      style={{
        fontSize: 11,
        color: theme.stone,
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        marginTop: 18,
        marginBottom: 6,
        fontFamily: '"Geist", system-ui, sans-serif',
      }}
    >
      {children}
    </div>
  );
}

function Placeholder({ theme, children }) {
  return (
    <span
      style={{
        background: theme.emberBg,
        color: theme.ember,
        padding: "1px 6px",
        borderRadius: 4,
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  );
}

// 1) About hub ───────────────────────────────────────────────
function AboutScreen({ theme }) {
  const rows = [
    { icon: "shield", label: "Privacy", sub: "What we store and why" },
    {
      icon: "book-open",
      label: "Terms of service",
      sub: "The deal, in plain English",
    },
    { icon: "feather", label: "Imprint", sub: "Who runs this" },
    {
      icon: "star",
      label: "Open source",
      sub: "Libraries we use, with thanks",
    },
    {
      icon: "mail",
      label: "Contact",
      sub: "security@ · bugs · deletion requests",
    },
    { icon: "compass", label: "Source code", sub: "Cairn is on GitHub" },
  ];
  return (
    <ScreenShell
      theme={theme}
      header={
        <TopBar
          theme={theme}
          left={<IconBtn theme={theme} icon="arrow-left" label="back" />}
          title="About"
        />
      }
    >
      {/* Wordmark + version */}
      <div
        style={{
          padding: "28px 22px 22px",
          textAlign: "center",
          borderBottom: `1px solid ${theme.rule}`,
        }}
      >
        <div
          style={{
            fontFamily: '"Newsreader", Georgia, serif',
            fontSize: 34,
            fontWeight: 500,
            color: theme.ink,
            letterSpacing: "-0.02em",
          }}
        >
          Cairn
        </div>
        <div
          style={{
            fontFamily: '"Newsreader", Georgia, serif',
            fontStyle: "italic",
            fontSize: 13,
            color: theme.stone,
            marginTop: 4,
          }}
        >
          here's the way, you'll like this
        </div>
        <div
          style={{
            marginTop: 12,
            fontSize: 12,
            color: theme.stoneLt,
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          }}
        >
          v0.4.2 · build 2026.05.07
        </div>
      </div>

      <div style={{ padding: "8px 0" }}>
        {rows.map((r, i, arr) => (
          <div
            key={r.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "14px 22px",
              borderBottom:
                i < arr.length - 1 ? `1px solid ${theme.rule}` : "none",
            }}
          >
            <Icon name={r.icon} size={18} color={theme.stone} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{ fontSize: 14.5, fontWeight: 600, color: theme.ink }}
              >
                {r.label}
              </div>
              <div style={{ fontSize: 12, color: theme.stone, marginTop: 2 }}>
                {r.sub}
              </div>
            </div>
            <Icon name="chevron-right" size={18} color={theme.stoneLt} />
          </div>
        ))}
      </div>

      <div
        style={{
          padding: "20px 22px",
          textAlign: "center",
          fontSize: 11.5,
          color: theme.stoneLt,
          fontFamily: '"Newsreader", Georgia, serif',
          fontStyle: "italic",
        }}
      >
        Made with care in Berlin · hosted in Germany · no third parties
      </div>
    </ScreenShell>
  );
}

// 2) Privacy policy ──────────────────────────────────────────
function PrivacyPolicyScreen({ theme }) {
  return (
    <LegalShell theme={theme} title="Privacy" sub="Last updated 7 May 2026">
      <p style={{ marginTop: 0, fontStyle: "italic", color: theme.inkSoft }}>
        Cairn is built with privacy as its first constraint. This page tells you
        what that means in practice — no jargon, no hedging.
      </p>
      <LegalH theme={theme}>What we store</LegalH>
      <LegalLabel theme={theme}>About you</LegalLabel>
      Your e-mail address (so you can sign in), your display name, and your
      profile photo if you uploaded one.
      <LegalLabel theme={theme}>About what you do</LegalLabel>
      The lists you create or join, the items on them, your votes, and the
      timestamp of each action.
      <LegalLabel theme={theme}>Technical</LegalLabel>
      Server access logs (request path, status, timestamp) kept for 30 days;
      container logs (database, auth, API) for 7 days. Your IP address appears
      in the access log for 1 hour to handle abuse, then is stripped. No
      analytics. No tracking pixels. No fingerprinting.
      <LegalH theme={theme}>Where it lives</LegalH>
      One PostgreSQL database on one VPS in Falkenstein, Germany, operated by
      Hetzner Online GmbH. Profile photos are files on the same server.
      Encrypted backups at the same provider. Nothing leaves the EU. Nothing
      touches Google, Amazon, Microsoft, or any other hyperscaler.
      <LegalH theme={theme}>Who sees it</LegalH>
      Other members of lists you share. That's it. We — the operator — can
      technically read the database, but we don't, except to fix bugs you
      report.
      <LegalH theme={theme}>Your rights (GDPR)</LegalH>
      You can <b>access</b>, <b>correct</b>, <b>export</b>, or <b>delete</b>{" "}
      your data at any time from Settings. Deletion is immediate and permanent —
      see the warning text on the Delete account screen for details on what
      stays on shared lists. To file a complaint, contact your local data
      protection authority (in Germany, the BfDI).
      <LegalH theme={theme}>Cookies and on-device storage</LegalH>
      Three small things, all required for the app to work for you:
      <ul style={{ paddingLeft: 18, margin: "8px 0 12px" }}>
        <li style={{ marginBottom: 4 }}>
          <b>A session cookie</b> set when you sign in, so you stay signed in.
          HttpOnly — JavaScript can't read it.
        </li>
        <li style={{ marginBottom: 4 }}>
          <b>Two preferences in your browser's local storage</b> — your theme
          and your text size. You set these in Settings; they stay on the device
          you set them on and never reach our server.
        </li>
        <li>
          <b>An offline cache</b> of the app's files, kept by your browser when
          you install Cairn as a PWA, so it launches when the network doesn't.
        </li>
      </ul>
      No tracking cookies. No analytics. No third-party scripts. All three are
      exempt from cookie-consent rules (ePrivacy Directive Art. 5(3), §25 TDDDG
      in Germany) because they're strictly necessary for the service you asked
      for — no consent banner is required, but this disclosure is. If we ever
      store anything that isn't strictly necessary, you'll see a real consent
      surface before it happens.
      <LegalH theme={theme}>Changes</LegalH>
      If we change this in a way that affects you, we'll show a notice in the
      app before the change takes effect.
    </LegalShell>
  );
}

// 3) Terms of service ────────────────────────────────────────
function TermsScreen({ theme }) {
  return (
    <LegalShell theme={theme} title="Terms" sub="Last updated 7 May 2026">
      <p style={{ marginTop: 0, fontStyle: "italic", color: theme.inkSoft }}>
        The deal between you and us, kept short.
      </p>
      <LegalH theme={theme}>What Cairn is</LegalH>A small app for sharing lists
      with people you know. Free. No ads.
      <LegalH theme={theme}>Your account</LegalH>
      You're responsible for what you put on lists and who you invite. Don't
      upload anything illegal, harassing, or that infringes someone else's
      rights. Don't try to break the service for other users.
      <LegalH theme={theme}>Our promises</LegalH>
      We'll do our best to keep Cairn running and your data safe. But Cairn is
      provided <b>as-is</b>, with no warranty. We're a small operation; treat it
      as such.
      <LegalH theme={theme}>Suspension</LegalH>
      If you abuse the service — spam, harassment, attempts to break it — we may
      suspend or delete your account. We'll tell you why, unless we're legally
      required not to.
      <LegalH theme={theme}>Ending the deal</LegalH>
      You can delete your account anytime from Settings. We can shut down Cairn
      anytime, with at least 30 days' notice via the app and e-mail so you can
      export your data.
      <LegalH theme={theme}>Liability</LegalH>
      To the extent the law allows, we're not liable for indirect or
      consequential losses from using Cairn. Mandatory consumer rights under
      German and EU law are unaffected.
      <LegalH theme={theme}>Governing law</LegalH>
      German law. Disputes go to the courts of{" "}
      <Placeholder theme={theme}>YOUR CITY</Placeholder>, unless mandatory
      consumer-protection rules say otherwise.
    </LegalShell>
  );
}

// 4) Imprint (Impressum) ─────────────────────────────────────
function ImprintScreen({ theme }) {
  return (
    <LegalShell theme={theme} title="Imprint" sub="§5 TMG · §55 RStV">
      <p style={{ marginTop: 0, fontStyle: "italic", color: theme.inkSoft }}>
        German law requires this page. Real values must replace every red
        placeholder before launch.
      </p>
      <LegalH theme={theme}>Operator</LegalH>
      <Placeholder theme={theme}>FULL LEGAL NAME</Placeholder>
      <br />
      <Placeholder theme={theme}>STREET + NUMBER</Placeholder>
      <br />
      <Placeholder theme={theme}>POSTCODE + CITY</Placeholder>
      <br />
      Germany
      <LegalH theme={theme}>Contact</LegalH>
      Email: <Placeholder theme={theme}>contact@cairn.example</Placeholder>
      <br />
      Telephone:{" "}
      <Placeholder theme={theme}>
        OPTIONAL — only if you want public phone contact
      </Placeholder>
      <LegalH theme={theme}>Responsible for content (§55 Abs. 2 RStV)</LegalH>
      <Placeholder theme={theme}>NAME</Placeholder>, address as above.
      <LegalH theme={theme}>VAT ID</LegalH>
      <Placeholder theme={theme}>
        UMSATZSTEUER-IDNR. — or "Not applicable; service is provided free of
        charge in a private capacity."
      </Placeholder>
      <LegalH theme={theme}>EU dispute resolution</LegalH>
      The European Commission provides an online dispute resolution platform:{" "}
      <b>https://ec.europa.eu/consumers/odr</b>. We are not obliged and not
      willing to participate in dispute settlement proceedings before a consumer
      arbitration board.
    </LegalShell>
  );
}

// 5) Open source ─────────────────────────────────────────────
function OpenSourceScreen({ theme }) {
  const deps = [
    { name: "SvelteKit", ver: "2.x", license: "MIT" },
    { name: "Svelte", ver: "5.x", license: "MIT" },
    { name: "Vite", ver: "5.x", license: "MIT" },
    { name: "PostgreSQL", ver: "16.3", license: "PostgreSQL" },
    { name: "PostgREST", ver: "12.2", license: "MIT" },
    { name: "GoTrue", ver: "2.158", license: "MIT" },
    { name: "Caddy", ver: "2.8", license: "Apache 2.0" },
    { name: "Restic", ver: "0.16", license: "BSD 2-Clause" },
    { name: "date-fns", ver: "3.6", license: "MIT" },
    { name: "Newsreader", ver: "OFL", license: "SIL Open Font" },
    { name: "JetBrains Mono", ver: "OFL", license: "SIL Open Font" },
  ];
  return (
    <LegalShell theme={theme} title="Open source" sub="Standing on shoulders">
      <p style={{ marginTop: 0, fontStyle: "italic", color: theme.inkSoft }}>
        Cairn would not exist without these. Thanks to everyone who works on
        them.
      </p>
      <div
        style={{
          marginTop: 18,
          border: `1px solid ${theme.rule}`,
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {deps.map((d, i, arr) => (
          <div
            key={d.name}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 12,
              padding: "12px 14px",
              borderBottom:
                i < arr.length - 1 ? `1px solid ${theme.rule}` : "none",
              fontFamily: '"Geist", system-ui, sans-serif',
            }}
          >
            <div
              style={{
                flex: 1,
                fontSize: 14,
                fontWeight: 600,
                color: theme.ink,
              }}
            >
              {d.name}
            </div>
            <div
              style={{
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                fontSize: 11.5,
                color: theme.stone,
              }}
            >
              {d.ver}
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: theme.stone,
                minWidth: 80,
                textAlign: "right",
              }}
            >
              {d.license}
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16, fontSize: 12.5, color: theme.inkSoft }}>
        Full license texts are bundled with the app at{" "}
        <code
          style={{
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: 12,
            background: theme.paperAlt,
            padding: "1px 5px",
            borderRadius: 4,
          }}
        >
          /legal/licenses.txt
        </code>{" "}
        and on the source repository.
      </div>
    </LegalShell>
  );
}

// 6) Contact ─────────────────────────────────────────────────
function ContactScreen({ theme }) {
  const Row = ({ label, addr, sub }) => (
    <div
      style={{
        padding: "14px 16px",
        border: `1px solid ${theme.rule}`,
        borderRadius: 12,
        marginBottom: 10,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: theme.stone,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          fontFamily: '"Geist", system-ui, sans-serif',
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 4,
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          fontSize: 14,
          color: theme.accent,
          fontWeight: 600,
        }}
      >
        {addr}
      </div>
      <div
        style={{
          marginTop: 4,
          fontSize: 12.5,
          color: theme.inkSoft,
          lineHeight: 1.5,
          fontFamily: '"Newsreader", Georgia, serif',
        }}
      >
        {sub}
      </div>
    </div>
  );
  return (
    <LegalShell theme={theme} title="Contact" sub="Real humans read these">
      <p
        style={{
          marginTop: 0,
          fontStyle: "italic",
          color: theme.inkSoft,
          marginBottom: 18,
        }}
      >
        Pick the address that fits. We answer within a few days, usually faster.
      </p>
      <Row
        label="General"
        addr="hello@cairn.example"
        sub="Bug reports, questions, feedback, things you wish Cairn did."
      />
      <Row
        label="Security"
        addr="security@cairn.example"
        sub="Vulnerabilities or concerns about how Cairn handles your data. PGP key on the source repository. We won't pursue legal action against good-faith research."
      />
      <Row
        label="Privacy & data requests"
        addr="privacy@cairn.example"
        sub="GDPR access, correction, export, or deletion requests. Most of these can be done in-app from Settings — but if something isn't working, write here."
      />
      <Row
        label="Postal"
        addr="(see Imprint)"
        sub="If you need to reach the operator on paper — for legal correspondence, takedown requests under §10 TMG, etc."
      />
    </LegalShell>
  );
}

// 7) Cairn's own license ─────────────────────────────────────
function LicenseScreen({ theme }) {
  return (
    <LegalShell theme={theme} title="Source code" sub="Cairn is open source">
      <p style={{ marginTop: 0 }}>
        Cairn itself is published under the <b>AGPL-3.0-or-later</b> license.
        The source — every line that runs on the server and in your browser — is
        on GitHub:
      </p>
      <div
        style={{
          marginTop: 14,
          padding: "14px 16px",
          background: theme.paperAlt,
          borderRadius: 12,
          border: `1px solid ${theme.rule}`,
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          fontSize: 13,
          color: theme.accent,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Icon name="compass" size={16} color="currentColor" />
        github.com/<Placeholder theme={theme}>YOUR-ORG</Placeholder>/cairn
      </div>
      <LegalH theme={theme}>What AGPL means for you</LegalH>
      <ul style={{ paddingLeft: 18, margin: 0 }}>
        <li style={{ marginBottom: 6 }}>
          You can read the code, run your own copy, and modify it.
        </li>
        <li style={{ marginBottom: 6 }}>
          If you run a modified version as a network service, you must publish
          your changes — that's the difference between AGPL and plain GPL.
        </li>
        <li>No warranty. Use at your own risk.</li>
      </ul>
      <LegalH theme={theme}>Why AGPL and not MIT</LegalH>
      <p>
        Cairn is a privacy-first product. Permissive licenses let a hyperscaler
        take Cairn, run it on AWS with telemetry bolted on, and call it Cairn —
        undermining the thing that makes it worth building. AGPL prevents that
        by requiring derivative network services to share their source under the
        same terms.
      </p>
    </LegalShell>
  );
}

Object.assign(window, {
  AboutScreen,
  PrivacyPolicyScreen,
  TermsScreen,
  ImprintScreen,
  OpenSourceScreen,
  ContactScreen,
  LicenseScreen,
});
