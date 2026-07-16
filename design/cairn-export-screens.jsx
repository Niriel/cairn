// Cairn — data export screens.
// Five artboards: Privacy hub row, Export hub, Packaging progress, Success/download,
// and the new "Download first?" panel on Delete account.

function ExportShell({ theme, title, sub, children }) {
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
      {children}
    </ScreenShell>
  );
}

// 1) Settings → Privacy & data → Download my data row.
//
// The Download my data row lives under its own "Privacy & data" section
// (see ui.md → "Settings"), not under "People → Privacy" (which is
// invite policy / circle / blocked) and not next to Delete account
// (which is "Account → Delete account"). This artboard shows the row
// in context, with the neighbouring Settings sections faded for
// orientation.
function PrivacyWithExportRow({ theme }) {
  const Row = ({ icon, title, sub, accent, faint }) => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 18px",
        borderBottom: `1px solid ${theme.rule}`,
        opacity: faint ? 0.45 : 1,
      }}
    >
      <Icon name={icon} size={18} color={accent || theme.stone} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14.5,
            fontWeight: 600,
            color: accent || theme.ink,
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 12, color: theme.stone, marginTop: 2 }}>
          {sub}
        </div>
      </div>
      <Icon name="chevron-right" size={18} color={theme.stoneLt} />
    </div>
  );
  const SectionHead = ({ children, faint }) => (
    <div
      style={{
        padding: "20px 18px 6px",
        fontSize: 11.5,
        color: theme.stone,
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        opacity: faint ? 0.45 : 1,
      }}
    >
      {children}
    </div>
  );
  return (
    <ExportShell theme={theme} title="Settings">
      <SectionHead faint>People</SectionHead>
      <Row faint icon="inbox" title="Invites" sub="No pending invites" />
      <Row
        faint
        icon="shield"
        title="Privacy"
        sub="Who can invite you · circle · blocked"
      />

      <SectionHead>Privacy &amp; data</SectionHead>
      <Row
        icon="download"
        title="Download my data"
        sub="A copy of everything Cairn stores"
      />

      <SectionHead faint>Recovery</SectionHead>
      <Row
        faint
        icon="trash-2"
        title="Deleted lists"
        sub="Restore lists you've deleted"
      />

      <SectionHead faint>Account</SectionHead>
      <Row faint icon="log-out" title="Sign out" />
      <Row
        faint
        icon="trash"
        title="Delete account"
        sub="Permanent"
        accent={theme.ember}
      />
    </ExportShell>
  );
}

// 2) Export hub — explanation + the action
function ExportHubScreen({ theme }) {
  return (
    <ExportShell theme={theme} title="Download my data">
      <div style={{ padding: "20px 22px 28px" }}>
        <div
          style={{
            fontFamily: '"Newsreader", Georgia, serif',
            fontSize: 22,
            fontWeight: 500,
            color: theme.ink,
            letterSpacing: "-0.01em",
            lineHeight: 1.25,
            marginBottom: 6,
          }}
        >
          Take everything with you.
        </div>
        <div
          style={{
            fontSize: 14,
            color: theme.inkSoft,
            lineHeight: 1.55,
            marginBottom: 18,
            fontFamily: '"Newsreader", Georgia, serif',
            fontStyle: "italic",
          }}
        >
          A single ZIP file. Yours forever. Nothing in it phones home.
        </div>

        <div
          style={{
            padding: "14px 16px",
            borderRadius: 12,
            border: `1px solid ${theme.rule}`,
            background: theme.paperAlt,
            fontSize: 13,
            color: theme.ink,
            lineHeight: 1.55,
          }}
        >
          <div
            style={{
              fontSize: 11.5,
              color: theme.stone,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            What's inside
          </div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>Your profile & photo</li>
            <li>Every list you own or belong to</li>
            <li>Every item you added, with notes & votes</li>
            <li>Your invites, your circle, your blocklist</li>
          </ul>
          <div
            style={{
              fontSize: 11.5,
              color: theme.stone,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              margin: "14px 0 8px",
            }}
          >
            Two formats
          </div>
          <div style={{ fontSize: 13, color: theme.inkSoft }}>
            <b style={{ color: theme.ink }}>HTML</b> — open any file in a
            browser to read.
            <br />
            <b style={{ color: theme.ink }}>JSON</b> — feed it to another tool,
            or keep it as the canonical record.
          </div>
        </div>

        <button
          style={{
            marginTop: 24,
            width: "100%",
            padding: "14px",
            border: "none",
            borderRadius: 12,
            background: theme.ink,
            color: theme.paper,
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <Icon name="download" size={16} color="currentColor" />
          Prepare my download
        </button>
        <div
          style={{
            marginTop: 10,
            fontSize: 12,
            color: theme.stone,
            textAlign: "center",
          }}
        >
          This may take a few seconds for large accounts.
        </div>
      </div>
    </ExportShell>
  );
}

// 3) Packaging — progress state
function ExportPackagingScreen({ theme }) {
  return (
    <ExportShell theme={theme} title="Download my data">
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 28px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 88,
            height: 88,
            borderRadius: 99,
            background: theme.paperAlt,
            color: theme.stone,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 22,
            animation: "cairnBlink 1.2s infinite",
          }}
        >
          <Icon
            name="feather"
            size={36}
            color="currentColor"
            strokeWidth={1.6}
          />
        </div>
        <div
          style={{
            fontFamily: '"Newsreader", Georgia, serif',
            fontSize: 24,
            fontWeight: 500,
            color: theme.ink,
          }}
        >
          Packaging your data…
        </div>
        <div
          style={{
            marginTop: 12,
            fontSize: 14,
            color: theme.inkSoft,
            lineHeight: 1.5,
            maxWidth: 280,
          }}
        >
          Reading 5 lists, 47 items, 3 invites, your photo. Almost done.
        </div>
      </div>
    </ExportShell>
  );
}

// 4) Success — file ready, browser download
function ExportReadyScreen({ theme }) {
  return (
    <ExportShell theme={theme} title="Download my data">
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px 24px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 88,
            height: 88,
            borderRadius: 99,
            background: theme.sageBg,
            color: theme.sage,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 22,
          }}
        >
          <Icon name="check" size={36} color="currentColor" strokeWidth={1.6} />
        </div>
        <div
          style={{
            fontFamily: '"Newsreader", Georgia, serif',
            fontSize: 24,
            fontWeight: 500,
            color: theme.ink,
          }}
        >
          Ready
        </div>
        <div
          style={{
            marginTop: 12,
            fontSize: 14,
            color: theme.inkSoft,
            lineHeight: 1.5,
            maxWidth: 280,
          }}
        >
          Your browser is saving the file now.
        </div>

        <div
          style={{
            marginTop: 22,
            padding: "12px 14px",
            background: theme.paperAlt,
            borderRadius: 12,
            border: `1px solid ${theme.rule}`,
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: 12.5,
            color: theme.ink,
            display: "flex",
            alignItems: "center",
            gap: 10,
            width: "100%",
          }}
        >
          <Icon name="download" size={14} color={theme.stone} />
          <span style={{ flex: 1, textAlign: "left" }}>
            cairn-export-20260507-9a3f.zip
          </span>
          <span style={{ color: theme.stone }}>2.4 MB</span>
        </div>

        <div
          style={{
            marginTop: 18,
            fontSize: 12,
            color: theme.stone,
            lineHeight: 1.55,
            fontFamily: '"Newsreader", Georgia, serif',
            fontStyle: "italic",
          }}
        >
          Open the README.html first — it explains what each file is.
          <br />
          Your archive is valid until you close this page.
        </div>
      </div>
    </ExportShell>
  );
}

// 5) Delete account — unified into cairn-screens.jsx (DeleteAccountScreen now
// has the "Download first?" panel built in). Stub kept only to satisfy any
// stale imports during transition.
function DeleteAccountWithExportScreen_REMOVED({ theme }) {
  const Block = ({ title, children }) => (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 11.5,
          color: theme.stone,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 14, color: theme.ink, lineHeight: 1.55 }}>
        {children}
      </div>
    </div>
  );
  return (
    <ScreenShell
      theme={theme}
      header={
        <TopBar
          theme={theme}
          left={<IconBtn theme={theme} icon="arrow-left" label="back" />}
          title="Delete account"
        />
      }
    >
      <div style={{ padding: "14px 20px 24px" }}>
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: theme.ink,
            fontFamily: '"Newsreader", Georgia, serif',
            lineHeight: 1.2,
            marginBottom: 6,
          }}
        >
          Delete your Cairn account?
        </div>
        <div
          style={{
            fontSize: 13.5,
            color: theme.stone,
            lineHeight: 1.5,
            marginBottom: 18,
            fontStyle: "italic",
            fontFamily: '"Newsreader", Georgia, serif',
          }}
        >
          We won't ask why. Read what happens, then decide.
        </div>

        {/* New: download first suggestion. Non-blocking, above the irreversible action. */}
        <div
          style={{
            marginBottom: 20,
            padding: "14px 16px",
            borderRadius: 12,
            background: theme.paperAlt,
            border: `1px solid ${theme.rule}`,
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <Icon name="feather" size={18} color={theme.accent} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                color: theme.ink,
                marginBottom: 2,
              }}
            >
              Want a copy of your data first?
            </div>
            <div
              style={{ fontSize: 12.5, color: theme.inkSoft, lineHeight: 1.5 }}
            >
              A few seconds. Yours to keep, even after deletion.
            </div>
          </div>
          <button
            style={{
              padding: "7px 12px",
              border: `1px solid ${theme.ink}`,
              borderRadius: 99,
              background: theme.paper,
              color: theme.ink,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              flexShrink: 0,
            }}
          >
            Download
          </button>
        </div>

        <Block title="What's permanently removed">
          Your email, your profile, and every vote you've cast on any list. None
          of it can be recovered.
        </Block>
        <Block title="What stays on shared lists">
          Items you added on lists you share with other people stay where they
          are. Your name on those items changes to{" "}
          <em style={{ fontStyle: "normal", fontWeight: 600 }}>Deleted user</em>
          .
        </Block>

        <div
          style={{
            marginTop: 8,
            padding: "14px",
            background: theme.paperAlt,
            border: `1px solid ${theme.rule}`,
            borderRadius: 12,
          }}
        >
          <div style={{ fontSize: 12.5, color: theme.stone, marginBottom: 10 }}>
            Type{" "}
            <span
              style={{
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                fontWeight: 700,
                color: theme.ink,
              }}
            >
              delete
            </span>{" "}
            to confirm.
          </div>
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              background: theme.paper,
              border: `1px solid ${theme.stoneLt}`,
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              fontSize: 14,
              color: theme.stoneLt,
              minHeight: 22,
            }}
          >
            <span style={{ fontStyle: "italic" }}>delete</span>
          </div>
        </div>

        <button
          style={{
            marginTop: 16,
            width: "100%",
            padding: "14px",
            borderRadius: 12,
            border: "none",
            background: theme.stoneLt,
            color: theme.paper,
            fontSize: 15,
            fontWeight: 700,
            fontFamily: "inherit",
            opacity: 0.6,
          }}
        >
          Delete my account
        </button>
      </div>
    </ScreenShell>
  );
}

Object.assign(window, {
  PrivacyWithExportRow,
  ExportHubScreen,
  ExportPackagingScreen,
  ExportReadyScreen,
});
