// Cairn — avatar feature screens.
// New: photo-aware Avatar, Edit profile screen, Avatar edit sheet, Crop step,
// Upload states (uploading / error / success), Settings v3 with editable chip.
//
// Storage decision lives in the proposal: file on disk at /avatars/{uid}.webp,
// referenced via profiles.avatar_version (int, default 0). 0 = render initials.
// The components below treat `photoUrl` as already-resolved by a parent helper.

const { useState: useStateAv } = React;

// A subtly-striped placeholder photo so we don't hand-draw faces.
function PlaceholderPhoto({ size = 96, hue = 50, label = "photo" }) {
  // Use SVG stripes — neutral, doesn't pretend to be a real photo.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{
        display: "block",
        borderRadius: "50%",
      }}
    >
      <defs>
        <pattern
          id={`ph-${hue}`}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(35)"
        >
          <rect width="6" height="6" fill={`oklch(72% 0.10 ${hue})`} />
          <rect width="3" height="6" fill={`oklch(66% 0.11 ${hue})`} />
        </pattern>
      </defs>
      <circle cx="50" cy="50" r="50" fill={`url(#ph-${hue})`} />
      <text
        x="50"
        y="54"
        textAnchor="middle"
        fill="rgba(255,255,255,0.85)"
        style={{
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          fontSize: 8,
          fontWeight: 600,
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </text>
    </svg>
  );
}

// Photo-aware avatar. Falls back to initials disc when avatar_version === 0
// or photoUrl is null/missing. Same outer shape as the existing initials disc.
function AvatarPhoto({ user, size = 28, theme, photoUrl, hue }) {
  const u = SEED_USERS[user];
  if (!u) return null;
  if (!photoUrl) {
    // Reuse the existing initials visual exactly.
    return <Avatar user={user} size={size} theme={theme} />;
  }
  // Render a subtly-striped placeholder in the photo's place.
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 99,
        overflow: "hidden",
        flexShrink: 0,
        display: "inline-flex",
        boxShadow: `0 0 0 1px ${theme.rule}`,
      }}
    >
      <PlaceholderPhoto size={size} hue={hue || 50} label="" />
    </span>
  );
}

// ───────────────────────────────────────────────────────────
// 1) Edit profile — display name + avatar in one place
// ───────────────────────────────────────────────────────────
function EditProfileScreen({ theme, hasPhoto = true }) {
  return (
    <ScreenShell
      theme={theme}
      header={
        <TopBar
          theme={theme}
          left={<IconBtn theme={theme} icon="x" label="cancel" />}
          title="Edit profile"
          right={
            <button
              style={{
                padding: "8px 14px",
                border: "none",
                borderRadius: 10,
                background: theme.ink,
                color: theme.paper,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Save
            </button>
          }
        />
      }
    >
      <div style={{ padding: "24px 18px" }}>
        {/* Avatar + change/remove buttons */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ position: "relative" }}>
            {hasPhoto ? (
              <AvatarPhoto
                user="alice"
                size={112}
                theme={theme}
                photoUrl="x"
                hue={50}
              />
            ) : (
              <Avatar user="alice" size={112} theme={theme} />
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              style={{
                padding: "8px 14px",
                border: `1px solid ${theme.ink}`,
                borderRadius: 99,
                background: theme.paper,
                color: theme.ink,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Icon
                name="pencil"
                size={13}
                color="currentColor"
                strokeWidth={2}
              />
              {hasPhoto ? "Change picture" : "Add a picture"}
            </button>
            {hasPhoto && (
              <button
                style={{
                  padding: "8px 14px",
                  border: `1px solid ${theme.rule}`,
                  borderRadius: 99,
                  background: theme.paper,
                  color: theme.ember,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Remove
              </button>
            )}
          </div>
        </div>

        {/* Display name */}
        <label
          style={{
            display: "block",
            marginTop: 28,
            fontSize: 11.5,
            color: theme.stone,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          Display name
        </label>
        <div
          style={{
            marginTop: 6,
            padding: "12px 14px",
            border: `1px solid ${theme.ink}`,
            borderRadius: 12,
            background: theme.paper,
            fontSize: 16,
            color: theme.ink,
          }}
        >
          Alice
          <span
            style={{
              display: "inline-block",
              width: 1.5,
              height: 18,
              background: theme.accent,
              verticalAlign: "middle",
              marginLeft: 2,
              animation: "cairnBlink 1s infinite",
            }}
          />
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: 12,
            color: theme.stone,
            lineHeight: 1.5,
          }}
        >
          What other list members see. E-mail stays private.
        </div>

        <div
          style={{
            marginTop: 24,
            padding: "12px 14px",
            background: theme.paperAlt,
            borderRadius: 12,
            border: `1px solid ${theme.rule}`,
            fontSize: 12,
            color: theme.inkSoft,
            lineHeight: 1.55,
          }}
        >
          <b style={{ color: theme.ink }}>Where your picture appears.</b> Next
          to your name on shared lists, in the members screen, and on items
          you've added. A photo, a doodle, your cat — whatever you'd like other
          people in your lists to see.
        </div>
      </div>
    </ScreenShell>
  );
}

// ───────────────────────────────────────────────────────────
// 3) Avatar source sheet — choose / take / remove
// ───────────────────────────────────────────────────────────
function AvatarSourceSheet({ theme }) {
  return (
    <ScreenShell theme={theme}>
      <div
        style={{
          filter: "brightness(0.85)",
          opacity: 0.7,
          pointerEvents: "none",
        }}
      >
        <EditProfileScreen theme={theme} hasPhoto={true} />
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(20,15,10,0.35)",
          display: "flex",
          alignItems: "flex-end",
        }}
      >
        <div
          style={{
            background: theme.paper,
            width: "100%",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: "22px 0 28px",
            boxShadow: "0 -8px 30px rgba(0,0,0,0.15)",
          }}
        >
          <div
            style={{
              width: 36,
              height: 4,
              borderRadius: 99,
              background: theme.stoneLt,
              margin: "0 auto 14px",
            }}
          />
          <div
            style={{
              padding: "0 22px 14px",
              borderBottom: `1px solid ${theme.rule}`,
            }}
          >
            <div
              style={{
                fontFamily: '"Newsreader", Georgia, serif',
                fontSize: 18,
                fontWeight: 500,
                color: theme.ink,
              }}
            >
              Profile picture
            </div>
            <div style={{ fontSize: 12, color: theme.stone, marginTop: 2 }}>
              A photo, doodle, or anything else · JPG, PNG, WebP, or HEIC · up
              to 8 MB
            </div>
          </div>
          {/* "Remove picture" lives on the Edit profile screen
              (avatars.md → "Edit profile screen"), not in the source
              sheet. The sheet is strictly the picker. */}
          {[
            { icon: "camera", label: "Take photo" },
            { icon: "image", label: "Choose from library" },
            { icon: "x", label: "Cancel", tone: theme.stone },
          ].map((row, i, arr) => (
            <div
              key={row.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "14px 22px",
                borderBottom:
                  i < arr.length - 1 ? `1px solid ${theme.rule}` : "none",
                color: row.tone || theme.ink,
              }}
            >
              <Icon
                name={row.icon}
                size={18}
                color="currentColor"
                strokeWidth={1.75}
              />
              <span style={{ fontSize: 15, fontWeight: 500 }}>{row.label}</span>
            </div>
          ))}
        </div>
      </div>
    </ScreenShell>
  );
}

// ───────────────────────────────────────────────────────────
// 4) Crop step — fixed circular mask, drag/zoom hinted
// ───────────────────────────────────────────────────────────
function AvatarCropScreen({ theme }) {
  return (
    <ScreenShell
      theme={theme}
      header={
        <TopBar
          theme={theme}
          left={<IconBtn theme={theme} icon="arrow-left" label="back" />}
          title="Crop"
          right={
            <button
              style={{
                padding: "8px 14px",
                border: "none",
                borderRadius: 10,
                background: theme.ink,
                color: theme.paper,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Save
            </button>
          }
        />
      }
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "24px 18px",
        }}
      >
        {/* Crop stage — square, with circular cutout */}
        <div
          style={{
            width: 320,
            height: 320,
            position: "relative",
            background: "#1a1614",
            borderRadius: 16,
            overflow: "hidden",
          }}
        >
          {/* the "photo" placeholder */}
          <div style={{ position: "absolute", inset: 0 }}>
            <PlaceholderPhoto size={320} hue={50} label="user photo" />
          </div>
          {/* dim outside the circle */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(circle at center, transparent 0 49.5%, rgba(0,0,0,0.55) 50%)",
            }}
          />
          {/* circle outline */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: 280,
              height: 280,
              marginLeft: -140,
              marginTop: -140,
              borderRadius: 99,
              border: "1.5px solid rgba(255,255,255,0.85)",
            }}
          />
          {/* corner hints */}
          {[
            [10, 10],
            [10, "auto"],
            ["auto", 10],
            ["auto", "auto"],
          ].map((pos, i) => (
            <span
              key={i}
              style={{
                position: "absolute",
                top: pos[0] === 10 ? 10 : "auto",
                bottom: pos[0] === "auto" ? 10 : "auto",
                left: pos[1] === 10 ? 10 : "auto",
                right: pos[1] === "auto" ? 10 : "auto",
                width: 18,
                height: 18,
                borderTop: i < 2 ? "2px solid rgba(255,255,255,0.7)" : "none",
                borderBottom:
                  i >= 2 ? "2px solid rgba(255,255,255,0.7)" : "none",
                borderLeft:
                  i === 0 || i === 2
                    ? "2px solid rgba(255,255,255,0.7)"
                    : "none",
                borderRight:
                  i === 1 || i === 3
                    ? "2px solid rgba(255,255,255,0.7)"
                    : "none",
              }}
            />
          ))}
        </div>
        <div
          style={{
            marginTop: 18,
            fontSize: 13,
            color: theme.stone,
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          Drag to position. Pinch to zoom.
          <br />
          We'll save it as a 256 × 256 square — small, fast, and easy to back
          up.
        </div>

        {/* preview row at multiple sizes */}
        <div
          style={{
            marginTop: 22,
            padding: "14px 16px",
            background: theme.paperAlt,
            borderRadius: 12,
            border: `1px solid ${theme.rule}`,
            display: "flex",
            alignItems: "center",
            gap: 16,
            width: "100%",
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: theme.stone,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            Preview
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginLeft: "auto",
            }}
          >
            <AvatarPhoto
              user="alice"
              size={16}
              theme={theme}
              photoUrl="x"
              hue={50}
            />
            <AvatarPhoto
              user="alice"
              size={28}
              theme={theme}
              photoUrl="x"
              hue={50}
            />
            <AvatarPhoto
              user="alice"
              size={44}
              theme={theme}
              photoUrl="x"
              hue={50}
            />
          </div>
        </div>
      </div>
    </ScreenShell>
  );
}

// ───────────────────────────────────────────────────────────
// 5) Upload states — uploading / error / too big
// ───────────────────────────────────────────────────────────
function UploadingState({ theme, kind = "uploading" }) {
  const variants = {
    uploading: {
      title: "Uploading…",
      sub: "Resizing to 256 × 256 and saving to your account.",
      tone: "neutral",
      icon: "feather",
      action: "Cancel",
    },
    success: {
      title: "Saved",
      sub: "Your picture will show up next to your name everywhere.",
      tone: "sage",
      icon: "check",
      action: "Done",
    },
    "too-big": {
      title: "That's a big one",
      sub: "That picture is larger than 8 MB. Try another.",
      tone: "ember",
      icon: "x",
      action: "Choose another",
    },
    "wrong-format": {
      title: "Can't read that",
      sub: "Please pick a JPG, PNG, WebP, or HEIC image.",
      tone: "ember",
      icon: "x",
      action: "Choose another",
    },
    network: {
      title: "No connection",
      sub: "Cairn needs the network to save your picture. Try again when you're back online.",
      tone: "ember",
      icon: "slash",
      action: "Try again",
    },
  };
  const v = variants[kind];
  const toneFg =
    v.tone === "sage"
      ? theme.sage
      : v.tone === "ember"
        ? theme.ember
        : theme.stone;
  const toneBg =
    v.tone === "sage"
      ? theme.sageBg
      : v.tone === "ember"
        ? theme.emberBg
        : theme.paperAlt;

  return (
    <ScreenShell
      theme={theme}
      header={
        <TopBar
          theme={theme}
          left={<IconBtn theme={theme} icon="arrow-left" label="back" />}
          title="Profile picture"
        />
      }
    >
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
            background: toneBg,
            color: toneFg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 22,
            ...(kind === "uploading"
              ? { animation: "cairnBlink 1.2s infinite" }
              : {}),
          }}
        >
          <Icon
            name={v.icon}
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
            letterSpacing: "-0.01em",
          }}
        >
          {v.title}
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
          {v.sub}
        </div>
        {v.action && (
          <button
            style={{
              marginTop: 28,
              padding: "11px 22px",
              border: "none",
              borderRadius: 12,
              background: theme.ink,
              color: theme.paper,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {v.action}
          </button>
        )}
      </div>
    </ScreenShell>
  );
}

// ───────────────────────────────────────────────────────────
// 6) Storage decision board — non-screen artboard for the canvas
// ───────────────────────────────────────────────────────────
function StorageDecisionBoard({ theme }) {
  const Mono = ({ children }) => (
    <code
      style={{
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        fontSize: 12,
        background: theme.paperAlt,
        padding: "1px 6px",
        borderRadius: 4,
        border: `1px solid ${theme.rule}`,
        color: theme.ink,
      }}
    >
      {children}
    </code>
  );
  const Col = ({ title, score, children, accent }) => (
    <div
      style={{
        flex: 1,
        padding: "20px 22px",
        background: theme.paper,
        borderRadius: 14,
        border: `1.5px solid ${accent || theme.rule}`,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            fontFamily: '"Newsreader", Georgia, serif',
            fontSize: 18,
            fontWeight: 500,
            color: theme.ink,
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: accent || theme.stone,
          }}
        >
          {score}
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: theme.inkSoft, lineHeight: 1.55 }}>
        {children}
      </div>
    </div>
  );
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: theme.paperAlt,
        borderRadius: 16,
        padding: "28px 32px",
        fontFamily: '"Geist", system-ui, sans-serif',
        color: theme.ink,
        border: `1px solid ${theme.rule}`,
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
        <div
          style={{
            fontFamily: '"Newsreader", Georgia, serif',
            fontSize: 30,
            fontWeight: 500,
            letterSpacing: "-0.02em",
          }}
        >
          Where do avatars live?
        </div>
        <div
          style={{
            fontSize: 13,
            color: theme.stone,
            fontStyle: "italic",
            fontFamily: '"Newsreader", Georgia, serif',
          }}
        >
          Postgres can store binary data, but it's the wrong tool for image
          bytes.
        </div>
      </div>
      <div style={{ display: "flex", gap: 14 }}>
        <Col
          title="Filesystem + version int"
          score="recommended"
          accent={theme.sage}
        >
          One column on <Mono>profiles</Mono>: <Mono>avatar_version int</Mono>{" "}
          (default 0).
          <br />
          <br />
          File on disk: <Mono>/srv/cairn/avatars/&#123;uid&#125;.webp</Mono>.
          <br />
          Caddy serves it as a static file at{" "}
          <Mono>/avatars/&#123;uid&#125;.webp?v=&#123;n&#125;</Mono> — the query
          string handles cache busting.
          <br />
          <br />
          Restic already snapshots <Mono>/srv/cairn</Mono> nightly, so backups
          are free. No new service. No row bloat. RLS untouched.
        </Col>
        <Col title="bytea on profiles" score="don't" accent={theme.ember}>
          Adds 50–250 KB per row to a table read on every screen. Slows full‑row
          scans, doubles backup dump size, forces base64 round-trip for the{" "}
          <Mono>&lt;img&gt;</Mono>.<br />
          <br />
          Postgres handles binary fine — but every <Mono>SELECT *</Mono> on a
          row pays for it. The fix is "always project the columns you need"
          everywhere, forever. Not worth it.
        </Col>
        <Col
          title="S3-compatible blob store"
          score="overkill"
          accent={theme.stone}
        >
          Hetzner Object Storage / MinIO would work and is what we'd reach for
          at scale.
          <br />
          <br />
          But it's another service, another credential, another egress bill. The
          VPS disk has 40 GB. 1 000 users × 30 KB = 30 MB. We're not close to
          needing this.
        </Col>
      </div>
      <div
        style={{
          marginTop: "auto",
          padding: "14px 18px",
          background: theme.paper,
          borderRadius: 12,
          border: `1px solid ${theme.rule}`,
          fontSize: 12.5,
          color: theme.inkSoft,
          lineHeight: 1.55,
        }}
      >
        <b style={{ color: theme.ink }}>What changes:</b>{" "}
        <Mono>profiles.avatar_version int default 0</Mono> · two RPCs (
        <Mono>upload_avatar</Mono>, <Mono>clear_avatar</Mono>) that resize to
        256×256 WebP server-side · one Caddy <Mono>handle_path /avatars/*</Mono>{" "}
        block · one new line in <Mono>delete_account()</Mono> to{" "}
        <Mono>unlink</Mono> the file · the existing <Mono>&lt;Avatar&gt;</Mono>{" "}
        component reads <Mono>avatar_version</Mono> and falls back to the
        initials disc when it's 0. Tombstone user stays at version 0 forever —
        gray disc, exactly as designed.
      </div>
    </div>
  );
}

Object.assign(window, {
  AvatarPhoto,
  PlaceholderPhoto,
  EditProfileScreen,
  AvatarSourceSheet,
  AvatarCropScreen,
  UploadingState,
  StorageDecisionBoard,
});
