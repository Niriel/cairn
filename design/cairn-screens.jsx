// Cairn — all screen components.
// Each screen returns a chrome-less content body (sized to fit a 402x874 iOS / 412x892 Android frame).
// They consume seed data from window.SEED_LISTS / SEED_USERS and theme via prop.

const { useState, useMemo } = React;

// ── Common chrome ──────────────────────────────────────────
function ScreenShell({
  theme,
  header,
  footer,
  children,
  scrollable = true,
  padBottom = 0,
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: theme.paper,
        color: theme.ink,
        fontFamily: '"Geist", -apple-system, system-ui, sans-serif',
        WebkitFontSmoothing: "antialiased",
      }}
    >
      {header}
      <div
        style={{
          flex: 1,
          overflow: scrollable ? "auto" : "hidden",
          paddingBottom: padBottom,
        }}
      >
        {children}
      </div>
      {footer}
    </div>
  );
}

function TopBar({ theme, left, title, right, sub }) {
  return (
    <div
      style={{
        padding: "14px 18px 12px",
        borderBottom: `1px solid ${theme.rule}`,
        background: theme.paper,
        display: "flex",
        alignItems: "center",
        gap: 10,
        minHeight: 54,
      }}
    >
      {left}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: '"Newsreader", Georgia, serif',
            fontSize: 22,
            fontWeight: 500,
            letterSpacing: "-0.01em",
            color: theme.ink,
            lineHeight: 1.1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </div>
        {sub && (
          <div style={{ fontSize: 12, color: theme.stone, marginTop: 2 }}>
            {sub}
          </div>
        )}
      </div>
      {right}
    </div>
  );
}

function IconBtn({ theme, icon, onClick, label, tone }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        width: 36,
        height: 36,
        border: "none",
        background: "transparent",
        borderRadius: 10,
        color: tone || theme.inkSoft,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name={icon} size={20} color="currentColor" strokeWidth={1.75} />
    </button>
  );
}

function FAB({ theme, icon = "plus", label }) {
  return (
    <div
      style={{
        position: "absolute",
        right: 18,
        bottom: 24,
        zIndex: 5,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      {label && (
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: theme.ink,
            background: theme.paper,
            padding: "6px 10px",
            borderRadius: 99,
            boxShadow: theme.shadow,
            border: `1px solid ${theme.rule}`,
          }}
        >
          {label}
        </span>
      )}
      <button
        style={{
          width: 56,
          height: 56,
          borderRadius: 18,
          border: "none",
          background: theme.ink,
          color: theme.paper,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow:
            "0 8px 24px rgba(60,40,20,0.25), 0 2px 6px rgba(60,40,20,0.15)",
        }}
      >
        <Icon name={icon} size={24} color="currentColor" strokeWidth={2} />
      </button>
    </div>
  );
}

// ── Avatar (initials disc) ─────────────────────────────────
function Avatar({ user, size = 24, theme }) {
  const u = SEED_USERS[user];
  if (!u) return null;
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 99,
        background: u.tone,
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.46,
        fontWeight: 600,
        letterSpacing: "0.02em",
        flexShrink: 0,
        fontFamily: '"Geist", system-ui, sans-serif',
      }}
    >
      {u.initial}
    </span>
  );
}

// ── Scoring helpers ────────────────────────────────────────
function listScore(item) {
  return Object.values(item.votes || {}).reduce((a, b) => a + b, 0);
}
function sortItems(items) {
  return [...items].sort((a, b) => {
    const sa = listScore(a),
      sb = listScore(b);
    if (sa !== sb) return sb - sa;
    return new Date(a.created_at) - new Date(b.created_at);
  });
}

// ╔══════════════════════════════════════════════════════════╗
// ║  Screens                                                 ║
// ╚══════════════════════════════════════════════════════════╝

// 1) LOGIN — request magic link
function LoginRequest({ theme }) {
  return (
    <ScreenShell theme={theme}>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "60px 28px 40px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: 28,
          }}
        >
          <CairnGlyph size={56} color={theme.accent} />
        </div>
        <div
          style={{
            fontFamily: '"Newsreader", Georgia, serif',
            fontSize: 36,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            color: theme.ink,
            textAlign: "center",
            lineHeight: 1.05,
          }}
        >
          Cairn
        </div>
        <div
          style={{
            textAlign: "center",
            marginTop: 10,
            color: theme.stone,
            fontSize: 14,
            lineHeight: 1.5,
            fontStyle: "italic",
            fontFamily: '"Newsreader", Georgia, serif',
          }}
        >
          here's the way,
          <br />
          you'll like this
        </div>

        <div style={{ marginTop: 56 }}>
          <label style={{ fontSize: 13, color: theme.stone, fontWeight: 500 }}>
            E-mail
          </label>
          <div
            style={{
              marginTop: 8,
              padding: "14px 14px",
              border: `1px solid ${theme.rule}`,
              borderRadius: 12,
              background: theme.paperAlt,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Icon name="mail" size={18} color={theme.stone} />
            <span style={{ fontSize: 16, color: theme.ink }}>
              alice@example.net
            </span>
          </div>

          <button
            style={{
              width: "100%",
              marginTop: 16,
              padding: "14px",
              border: "none",
              borderRadius: 12,
              background: theme.ink,
              color: theme.paper,
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Send me a magic link
          </button>

          <div
            style={{
              marginTop: 18,
              fontSize: 12,
              color: theme.stone,
              textAlign: "center",
              lineHeight: 1.5,
            }}
          >
            No password. We'll e-mail you a link to continue.
            <br />
            Your data lives on a small server in Germany.
          </div>
        </div>
      </div>
    </ScreenShell>
  );
}

// 2) LOGIN — check your inbox. The single canonical post-submit screen,
// shown after "Send me a magic link" regardless of what GoTrue actually did:
// link sent, account banned, account unconfirmed, send rate-limited, or
// email doesn't resolve to any account. The indistinguishability is
// structural — same screen, same copy, every time. See admin.md → "What
// the web app shows when a banned user tries to sign in." "Continue" rather
// than "sign in" so the copy reads naturally for first-time users too.
function LoginCheck({ theme }) {
  return (
    <ScreenShell theme={theme}>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "80px 28px 40px",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 84,
            height: 84,
            borderRadius: 99,
            background: theme.sageBg,
            color: theme.sage,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 24,
          }}
        >
          <Icon
            name="mail-check"
            size={36}
            color="currentColor"
            strokeWidth={1.5}
          />
        </div>
        <div
          style={{
            fontFamily: '"Newsreader", Georgia, serif',
            fontSize: 28,
            fontWeight: 500,
            color: theme.ink,
            letterSpacing: "-0.01em",
            lineHeight: 1.2,
          }}
        >
          Check your inbox
        </div>
        <div
          style={{
            marginTop: 14,
            fontSize: 15,
            color: theme.inkSoft,
            lineHeight: 1.5,
            maxWidth: 280,
          }}
        >
          We sent a link to{" "}
          <b style={{ color: theme.ink }}>alice@example.net</b>. Tap it on this
          device to continue.
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 13,
            color: theme.stone,
          }}
        >
          Didn't get it?{" "}
          <span style={{ color: theme.accent, fontWeight: 600 }}>
            Send again
          </span>
        </div>
      </div>
    </ScreenShell>
  );
}

// 2c) Onboarding decision board — documents the anti-enumeration contract:
// the optimistic phone screen above is what the user sees in every one of the
// five GoTrue outcomes. Shape mirrors StorageDecisionBoard.
function MagicLinkRefusedBoard({ theme, Frame }) {
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
  const SectionTitle = ({ children }) => (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: theme.stone,
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
  const Case = ({ icon, color, primary, secondary }) => (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "10px 0",
        borderTop: `1px solid ${theme.rule}`,
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 99,
          flexShrink: 0,
          background: color + "22",
          color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 1,
        }}
      >
        <Icon name={icon} size={13} color="currentColor" strokeWidth={2.25} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            color: theme.ink,
            fontWeight: 500,
            lineHeight: 1.35,
          }}
        >
          {primary}
        </div>
        <div
          style={{
            fontSize: 12,
            color: theme.inkSoft,
            marginTop: 2,
            lineHeight: 1.45,
          }}
        >
          {secondary}
        </div>
      </div>
    </div>
  );
  const Antipattern = ({ text, why }) => (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        background: theme.paper,
        border: `1px solid ${theme.rule}`,
        borderLeft: `3px solid ${theme.ember}`,
        marginBottom: 8,
      }}
    >
      <div
        style={{
          fontFamily: '"Newsreader", Georgia, serif',
          fontStyle: "italic",
          fontSize: 13.5,
          color: theme.ink,
          lineHeight: 1.35,
        }}
      >
        “{text}”
      </div>
      <div
        style={{
          fontSize: 11.5,
          color: theme.stone,
          marginTop: 4,
          lineHeight: 1.4,
        }}
      >
        {why}
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
        padding: "26px 30px",
        fontFamily: '"Geist", system-ui, sans-serif',
        color: theme.ink,
        border: `1px solid ${theme.rule}`,
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      {/* Title row */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            fontFamily: '"Newsreader", Georgia, serif',
            fontSize: 28,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
          }}
        >
          One screen, five outcomes — anti-enumeration by structure
        </div>
        <div
          style={{
            fontSize: 13,
            color: theme.stone,
            fontStyle: "italic",
            fontFamily: '"Newsreader", Georgia, serif',
          }}
        >
          The screen is identical in every case. That's the entire mechanism.
        </div>
      </div>

      {/* Body: phone + rationale columns */}
      <div
        style={{
          display: "flex",
          gap: 24,
          flex: 1,
          minHeight: 0,
          alignItems: "stretch",
        }}
      >
        {/* Phone on the left */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Frame>
            <LoginCheck theme={theme} />
          </Frame>
        </div>

        {/* Two-column rationale on the right */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 16,
            minWidth: 0,
          }}
        >
          {/* What lands here */}
          <div
            style={{
              background: theme.paper,
              borderRadius: 14,
              padding: "18px 20px",
              border: `1px solid ${theme.rule}`,
            }}
          >
            <SectionTitle>What lands on this screen</SectionTitle>
            <Case
              icon="check"
              color={theme.sage}
              primary="Email exists. Link sent."
              secondary="The normal case. The user clicks the link in their inbox."
            />
            <Case
              icon="slash"
              color={theme.ember}
              primary="Email exists. Account is banned."
              secondary={
                <>
                  GoTrue refuses to issue a link for any account whose{" "}
                  <Mono>banned_until</Mono> is in the future. See admin.md →{" "}
                  <i>ban_user</i>.
                </>
              }
            />
            <Case
              icon="mail"
              color={theme.stone}
              primary="Email exists. Account is unconfirmed."
              secondary={
                <>
                  Signup happened but the confirmation link wasn't clicked.{" "}
                  <Mono>GOTRUE_MAILER_AUTOCONFIRM=false</Mono> in production.
                </>
              }
            />
            <Case
              icon="rotate-ccw"
              color={theme.stone}
              primary="Email exists. Send is rate-limited."
              secondary="GoTrue throttles repeated link requests for the same address."
            />
            <Case
              icon="slash"
              color={theme.stone}
              primary="Email doesn't resolve to any account."
              secondary="Typo, never signed up, or already deleted. Nothing is sent. Nothing is said."
            />
          </div>

          {/* What we never show */}
          <div
            style={{
              background: theme.paper,
              borderRadius: 14,
              padding: "18px 20px",
              border: `1px solid ${theme.rule}`,
            }}
          >
            <SectionTitle>What we deliberately never show</SectionTitle>
            <Antipattern
              text="This account has been suspended. Contact support."
              why="Confirms the account exists and reveals the moderation decision to anyone who can guess the email."
            />
            <Antipattern
              text="No Cairn account for that address."
              why="Lets an attacker probe the user database one email at a time."
            />
            <Antipattern
              text="Try again — we couldn't send last time."
              why="Distinguishes the success path from the failure paths, breaking the indistinguishability above."
            />
          </div>

          {/* The rule */}
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              background: theme.ink,
              color: theme.paper,
              fontSize: 12.5,
              lineHeight: 1.55,
              fontStyle: "italic",
              fontFamily: '"Newsreader", Georgia, serif',
            }}
          >
            The web app treats every non-2xx response from{" "}
            <code
              style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontStyle: "normal",
                fontSize: 11.5,
                background: "rgba(255,255,255,0.12)",
                padding: "1px 6px",
                borderRadius: 4,
              }}
            >
              POST /auth/magiclink
            </code>{" "}
            as a success in the UI. Same screen, same copy, same “Send again”
            affordance. The signal lives in GoTrue's logs and in{" "}
            <code
              style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontStyle: "normal",
                fontSize: 11.5,
                background: "rgba(255,255,255,0.12)",
                padding: "1px 6px",
                borderRadius: 4,
              }}
            >
              admin.actions
            </code>
            , not on the screen.
          </div>
        </div>
      </div>
    </div>
  );
}

// 3) LISTS overview
function ListsScreen({ theme, expanded = ["l1", "l3"] }) {
  return (
    <ScreenShell
      theme={theme}
      header={
        <TopBar
          theme={theme}
          left={<CairnGlyph size={26} color={theme.accent} />}
          title="Cairn"
          right={<IconBtn theme={theme} icon="settings" label="settings" />}
          sub="Signed in as Alice"
        />
      }
      padBottom={100}
    >
      <div style={{ padding: "6px 0 0" }}>
        {SEED_LISTS.map((l, i) => {
          const isExpanded = expanded.includes(l.id);
          const hasDesc = !!l.description;
          return (
            <div
              key={l.id}
              style={{
                padding: "14px 18px 14px",
                borderBottom:
                  i < SEED_LISTS.length - 1
                    ? `1px solid ${theme.rule}`
                    : "none",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 12,
                }}
              >
                <Icon
                  name={l.icon}
                  size={18}
                  color={theme.stone}
                  style={{ position: "relative", top: 2 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 17,
                      fontWeight: 600,
                      color: theme.ink,
                      fontFamily: '"Newsreader", Georgia, serif',
                      letterSpacing: "-0.005em",
                    }}
                  >
                    {l.name}
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 13.5,
                      lineHeight: 1.5,
                      color: hasDesc ? theme.inkSoft : theme.stone,
                      fontStyle: hasDesc ? "normal" : "italic",
                      overflow: isExpanded ? "visible" : "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: isExpanded ? "normal" : "nowrap",
                    }}
                  >
                    {hasDesc ? l.description : "(no description)"}
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 11.5,
                      color: theme.stone,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span>{l.items.length} items</span>
                    <span style={{ color: theme.stoneLt }}>•</span>
                    <span>{l.modified_at}</span>
                    <span style={{ color: theme.stoneLt }}>•</span>
                    <span style={{ display: "inline-flex", gap: -4 }}>
                      {l.members.map((m, mi) => (
                        <span key={m} style={{ marginLeft: mi === 0 ? 0 : -6 }}>
                          <Avatar user={m} size={16} theme={theme} />
                        </span>
                      ))}
                    </span>
                  </div>
                </div>
                <Icon name="chevron-right" size={18} color={theme.stoneLt} />
              </div>
            </div>
          );
        })}
      </div>
      <FAB theme={theme} icon="plus" label="New list" />
    </ScreenShell>
  );
}

// 4) Empty lists state
function EmptyListsScreen({ theme }) {
  return (
    <ScreenShell
      theme={theme}
      header={
        <TopBar
          theme={theme}
          left={<CairnGlyph size={26} color={theme.accent} />}
          title="Cairn"
        />
      }
    >
      <div
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 36px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: 99,
            background: theme.paperAlt,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 24,
            border: `1px dashed ${theme.stoneLt}`,
          }}
        >
          <CairnGlyph size={44} color={theme.stone} />
        </div>
        <div
          style={{
            fontFamily: '"Newsreader", Georgia, serif',
            fontSize: 24,
            fontWeight: 500,
            color: theme.ink,
            letterSpacing: "-0.01em",
            marginBottom: 10,
          }}
        >
          Start your first cairn
        </div>
        <div
          style={{
            fontSize: 14,
            color: theme.inkSoft,
            lineHeight: 1.5,
            marginBottom: 28,
            maxWidth: 280,
          }}
        >
          A cairn is a small stack of stones hikers leave to mark the way. Make
          a list of things — movies, books, places — and share it with friends.
        </div>
        <button
          style={{
            padding: "12px 22px",
            border: "none",
            borderRadius: 12,
            background: theme.ink,
            color: theme.paper,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontFamily: "inherit",
          }}
        >
          <Icon name="plus" size={16} color="currentColor" strokeWidth={2.2} />
          Create your first list
        </button>
      </div>
    </ScreenShell>
  );
}

// 5) ITEMS — collapsed
function ItemsScreen({
  theme,
  voteStyle = "ascii",
  showAggregate = false,
  openItemId = null,
  list = SEED_LISTS[0],
}) {
  const sorted = sortItems(list.items);
  return (
    <ScreenShell
      theme={theme}
      header={
        <TopBar
          theme={theme}
          left={<IconBtn theme={theme} icon="arrow-left" label="back" />}
          title={list.name}
          sub={`${list.items.length} items · ${list.members.length} ${list.members.length === 1 ? "member" : "members"}`}
          right={<IconBtn theme={theme} icon="more-vertical" label="menu" />}
        />
      }
      padBottom={90}
    >
      <div>
        {sorted.map((item, i) => (
          <ItemRow
            key={item.id}
            item={item}
            theme={theme}
            voteStyle={voteStyle}
            showAggregate={showAggregate}
            isOpen={item.id === openItemId}
            isLast={i === sorted.length - 1}
          />
        ))}
      </div>
      <FAB theme={theme} icon="plus" label="Add item" />
    </ScreenShell>
  );
}

function ItemRow({ item, theme, voteStyle, showAggregate, isOpen, isLast }) {
  const myVote = item.votes.alice || 0;
  const score = listScore(item);
  return (
    <div
      style={{
        borderBottom: isLast ? "none" : `1px solid ${theme.rule}`,
        background: isOpen ? theme.paperAlt : "transparent",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "14px 18px 14px 20px",
          gap: 10,
          minHeight: 56,
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span
            style={{
              fontSize: 15.5,
              color: theme.ink,
              lineHeight: 1.35,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              fontWeight: isOpen ? 600 : 500,
            }}
          >
            {item.name}
          </span>
          {showAggregate && score !== 0 && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: score > 0 ? theme.sage : theme.ember,
                background: score > 0 ? theme.sageBg : theme.emberBg,
                padding: "2px 6px",
                borderRadius: 6,
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                flexShrink: 0,
              }}
            >
              {score > 0 ? "+" : ""}
              {score}
            </span>
          )}
        </div>
        <VoteControl
          value={myVote}
          onChange={() => {}}
          style={voteStyle}
          theme={theme}
        />
      </div>
      {isOpen && <ItemPanel item={item} theme={theme} />}
    </div>
  );
}

function ItemPanel({ item, theme }) {
  const memberVotes = Object.entries(item.votes);
  return (
    <div
      style={{
        padding: "4px 22px 18px",
        borderTop: `1px dashed ${theme.rule}`,
        background: theme.paperAlt,
      }}
    >
      {item.notes && (
        <div
          style={{
            marginTop: 14,
            fontSize: 14,
            lineHeight: 1.55,
            color: theme.inkSoft,
            fontFamily: '"Newsreader", Georgia, serif',
            fontStyle: "italic",
          }}
        >
          {item.notes}
        </div>
      )}
      <div
        style={{
          marginTop: 14,
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
        }}
      >
        {memberVotes.map(([uid, v]) => (
          <span
            key={uid}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12.5,
              color: theme.inkSoft,
            }}
          >
            <Avatar user={uid} size={18} theme={theme} />
            <span>{SEED_USERS[uid].display_name}</span>
            <span
              style={{
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                fontWeight: 600,
                color: v > 0 ? theme.sage : v < 0 ? theme.ember : theme.stone,
              }}
            >
              {v > 0 ? "+" : ""}
              {v}
            </span>
          </span>
        ))}
      </div>
      <div
        style={{
          marginTop: 14,
          fontSize: 11.5,
          color: theme.stone,
          lineHeight: 1.5,
        }}
      >
        Added by{" "}
        <b style={{ color: theme.inkSoft, fontWeight: 600 }}>
          {SEED_USERS[item.created_by].display_name}
        </b>{" "}
        on {item.created_at}.
        {item.edited_by && (
          <>
            {" "}
            Last edited by{" "}
            <b style={{ color: theme.inkSoft, fontWeight: 600 }}>
              {SEED_USERS[item.edited_by].display_name}
            </b>{" "}
            on {item.edited_at}.
          </>
        )}
      </div>
      <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
        <button
          style={{
            flex: 1,
            padding: "10px 12px",
            border: `1px solid ${theme.rule}`,
            borderRadius: 10,
            background: theme.paper,
            color: theme.ember,
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            fontFamily: "inherit",
          }}
        >
          <Icon name="trash" size={14} color="currentColor" strokeWidth={2} />
          Delete
        </button>
        <button
          style={{
            flex: 1,
            padding: "10px 12px",
            border: `1px solid ${theme.rule}`,
            borderRadius: 10,
            background: theme.paper,
            color: theme.ink,
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            fontFamily: "inherit",
          }}
        >
          <Icon name="pencil" size={14} color="currentColor" strokeWidth={2} />
          Edit
        </button>
      </div>
    </div>
  );
}

// 6) Empty list state
function EmptyListScreen({ theme }) {
  return (
    <ScreenShell
      theme={theme}
      header={
        <TopBar
          theme={theme}
          left={<IconBtn theme={theme} icon="arrow-left" label="back" />}
          title="Wines worth a try"
          sub="0 items · just you"
          right={<IconBtn theme={theme} icon="more-vertical" label="menu" />}
        />
      }
    >
      <div
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 36px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 99,
            background: theme.paperAlt,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 22,
            border: `1px dashed ${theme.stoneLt}`,
          }}
        >
          <Icon
            name="feather"
            size={32}
            color={theme.stone}
            strokeWidth={1.5}
          />
        </div>
        <div
          style={{
            fontFamily: '"Newsreader", Georgia, serif',
            fontSize: 22,
            fontWeight: 500,
            color: theme.ink,
            letterSpacing: "-0.01em",
            marginBottom: 8,
          }}
        >
          Nothing here yet
        </div>
        <div
          style={{
            fontSize: 13.5,
            color: theme.inkSoft,
            lineHeight: 1.5,
            marginBottom: 22,
            maxWidth: 240,
          }}
        >
          Drop the first stone — add an item with a name and (optionally) a
          note.
        </div>
        <button
          style={{
            padding: "11px 20px",
            border: "none",
            borderRadius: 12,
            background: theme.ink,
            color: theme.paper,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontFamily: "inherit",
          }}
        >
          <Icon name="plus" size={15} color="currentColor" strokeWidth={2.2} />
          Add the first item
        </button>
      </div>
    </ScreenShell>
  );
}

// 7) Add item form
function AddItemScreen({ theme }) {
  return (
    <ScreenShell
      theme={theme}
      header={
        <TopBar
          theme={theme}
          left={<IconBtn theme={theme} icon="x" label="cancel" />}
          title="New item"
          sub="in Movies for Bob"
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
              Add
            </button>
          }
        />
      }
    >
      <div style={{ padding: 18 }}>
        <label
          style={{
            fontSize: 12,
            color: theme.stone,
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          Name
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
            minHeight: 22,
          }}
        >
          Notorious
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

        <label
          style={{
            display: "block",
            marginTop: 18,
            fontSize: 12,
            color: theme.stone,
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          Notes{" "}
          <span
            style={{
              textTransform: "none",
              fontWeight: 400,
              color: theme.stoneLt,
            }}
          >
            · optional
          </span>
        </label>
        <div
          style={{
            marginTop: 6,
            padding: "12px 14px",
            border: `1px solid ${theme.rule}`,
            borderRadius: 12,
            background: theme.paperAlt,
            fontSize: 14,
            color: theme.stone,
            minHeight: 88,
            lineHeight: 1.5,
            fontFamily: '"Newsreader", Georgia, serif',
            fontStyle: "italic",
          }}
        >
          Hitchcock. 1946. Cary Grant and Ingrid Bergman in Rio de Janeiro doing
          espionage at parties.
        </div>

        <div
          style={{
            marginTop: 18,
            padding: "10px 12px",
            background: theme.sageBg,
            color: theme.sage,
            borderRadius: 10,
            fontSize: 12,
            lineHeight: 1.5,
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
          }}
        >
          <Icon
            name="feather"
            size={14}
            color="currentColor"
            strokeWidth={2}
            style={{ marginTop: 1 }}
          />
          <span>
            Added items start at <b>=</b> (no vote). Tap thumbs in the list to
            weigh in.
          </span>
        </div>
      </div>
    </ScreenShell>
  );
}

// 8) Edit item
function EditItemScreen({ theme }) {
  return (
    <ScreenShell
      theme={theme}
      header={
        <TopBar
          theme={theme}
          left={<IconBtn theme={theme} icon="x" label="cancel" />}
          title="Edit item"
          sub="in Movies for Bob"
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
      <div style={{ padding: 18 }}>
        <label
          style={{
            fontSize: 12,
            color: theme.stone,
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          Name
        </label>
        <div
          style={{
            marginTop: 6,
            padding: "12px 14px",
            border: `1px solid ${theme.rule}`,
            borderRadius: 12,
            background: theme.paper,
            fontSize: 16,
            color: theme.ink,
          }}
        >
          The Third Man
        </div>

        <label
          style={{
            display: "block",
            marginTop: 18,
            fontSize: 12,
            color: theme.stone,
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          Notes
        </label>
        <div
          style={{
            marginTop: 6,
            padding: "12px 14px",
            border: `1px solid ${theme.ink}`,
            borderRadius: 12,
            background: theme.paper,
            fontSize: 14,
            color: theme.ink,
            minHeight: 88,
            lineHeight: 1.6,
            fontFamily: '"Newsreader", Georgia, serif',
          }}
        >
          Vienna. Zithers. Orson Welles in a doorway. Trust me.
          <span
            style={{
              display: "inline-block",
              width: 1.5,
              height: 16,
              background: theme.accent,
              verticalAlign: "text-bottom",
              marginLeft: 2,
              animation: "cairnBlink 1s infinite",
            }}
          />
        </div>

        <div
          style={{
            marginTop: 18,
            fontSize: 12,
            color: theme.stone,
            lineHeight: 1.5,
          }}
        >
          Added by <b style={{ color: theme.inkSoft }}>Alice</b> on 1 May 2026.
          Editing this will record you as the last editor.
        </div>
      </div>
    </ScreenShell>
  );
}

// 9) Delete item confirmation (modal sheet)
function DeleteItemScreen({ theme }) {
  return (
    <ScreenShell theme={theme}>
      {/* Background list (dimmed) */}
      <div
        style={{
          filter: "blur(0px) brightness(0.92)",
          opacity: 0.55,
          pointerEvents: "none",
        }}
      >
        <ItemsScreen theme={theme} />
      </div>
      {/* Sheet */}
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
            padding: "22px 22px 32px",
            boxShadow: "0 -8px 30px rgba(0,0,0,0.15)",
          }}
        >
          <div
            style={{
              width: 36,
              height: 4,
              borderRadius: 99,
              background: theme.stoneLt,
              margin: "0 auto 16px",
            }}
          />
          <div
            style={{
              display: "flex",
              gap: 14,
              alignItems: "flex-start",
              marginBottom: 16,
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: theme.emberBg,
                color: theme.ember,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon
                name="trash"
                size={18}
                color="currentColor"
                strokeWidth={2}
              />
            </div>
            <div>
              <div
                style={{
                  fontFamily: '"Newsreader", Georgia, serif',
                  fontSize: 19,
                  fontWeight: 500,
                  color: theme.ink,
                  letterSpacing: "-0.005em",
                }}
              >
                Delete "Bringing Up Baby"?
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 13,
                  color: theme.inkSoft,
                  lineHeight: 1.5,
                }}
              >
                Bob and Carol will no longer see this item. You can restore it
                from this list's trash.
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              style={{
                flex: 1,
                padding: "12px",
                border: `1px solid ${theme.rule}`,
                background: theme.paper,
                color: theme.ink,
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Cancel
            </button>
            <button
              style={{
                flex: 1,
                padding: "12px",
                border: "none",
                background: theme.ember,
                color: "#fff",
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </ScreenShell>
  );
}

// 10) Add list
function AddListScreen({ theme }) {
  return (
    <ScreenShell
      theme={theme}
      header={
        <TopBar
          theme={theme}
          left={<IconBtn theme={theme} icon="x" label="cancel" />}
          title="New list"
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
              Create
            </button>
          }
        />
      }
    >
      <div style={{ padding: 18 }}>
        <label
          style={{
            fontSize: 12,
            color: theme.stone,
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          Name
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
          Restaurants in Rotterdam
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

        <label
          style={{
            display: "block",
            marginTop: 18,
            fontSize: 12,
            color: theme.stone,
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          Description{" "}
          <span
            style={{
              textTransform: "none",
              fontWeight: 400,
              color: theme.stoneLt,
            }}
          >
            · optional
          </span>
        </label>
        <div
          style={{
            marginTop: 6,
            padding: "12px 14px",
            border: `1px solid ${theme.rule}`,
            borderRadius: 12,
            background: theme.paperAlt,
            fontSize: 14,
            color: theme.stone,
            minHeight: 70,
            lineHeight: 1.5,
            fontFamily: '"Newsreader", Georgia, serif',
            fontStyle: "italic",
          }}
        >
          A short sentence so future-you remembers what this list is for.
        </div>

        <label
          style={{
            display: "block",
            marginTop: 18,
            fontSize: 12,
            color: theme.stone,
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          Members
        </label>
        <div
          style={{
            marginTop: 6,
            padding: "12px 14px",
            border: `1px solid ${theme.rule}`,
            borderRadius: 12,
            background: theme.paper,
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px 4px 4px",
              borderRadius: 99,
              background: theme.paperAlt,
              fontSize: 13,
              color: theme.ink,
            }}
          >
            <Avatar user="alice" size={20} theme={theme} /> Alice{" "}
            <span style={{ color: theme.stone, fontSize: 11 }}>(you)</span>
          </span>
          <button
            style={{
              border: `1px dashed ${theme.stoneLt}`,
              background: "transparent",
              padding: "6px 12px 6px 8px",
              borderRadius: 99,
              fontSize: 13,
              color: theme.inkSoft,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "inherit",
            }}
          >
            <Icon
              name="user-plus"
              size={14}
              color="currentColor"
              strokeWidth={2}
            />
            Invite
          </button>
        </div>
      </div>
    </ScreenShell>
  );
}

// 11) Edit/Delete list — long-press menu
function ListMenuScreen({ theme }) {
  return (
    <ScreenShell theme={theme}>
      <div
        style={{
          filter: "brightness(0.85)",
          opacity: 0.7,
          pointerEvents: "none",
        }}
      >
        <ListsScreen theme={theme} />
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
              Movies for Bob
            </div>
            <div style={{ fontSize: 12, color: theme.stone, marginTop: 2 }}>
              6 items · 2 members
            </div>
          </div>
          {[
            { icon: "pencil", label: "Rename list" },
            { icon: "feather", label: "Edit description" },
            { icon: "user-plus", label: "Invite a friend" },
            { icon: "users", label: "Manage members" },
            { icon: "trash-2", label: "View trash" },
            { icon: "log-out", label: "Leave this list" },
            { icon: "trash", label: "Delete list", tone: theme.ember },
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

// 12) Members / invite
function MembersScreen({ theme }) {
  return (
    <ScreenShell
      theme={theme}
      header={
        <TopBar
          theme={theme}
          left={<IconBtn theme={theme} icon="arrow-left" label="back" />}
          title="Members"
          sub="Things to do in Amsterdam"
        />
      }
    >
      <div style={{ padding: "18px 18px 6px" }}>
        <div
          style={{
            fontSize: 11.5,
            color: theme.stone,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          3 people on this list
        </div>
      </div>
      <div>
        {[
          { user: "alice", sub: "You · created the list", meta: "1 May 2026" },
          { user: "bob", sub: "Added by Alice", meta: "1 May 2026" },
          { user: "carol", sub: "Added by Alice", meta: "20 Apr 2026" },
        ].map((m, i, arr) => (
          <div
            key={m.user}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "14px 18px",
              borderBottom:
                i < arr.length - 1 ? `1px solid ${theme.rule}` : "none",
            }}
          >
            <Avatar user={m.user} size={36} theme={theme} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: theme.ink }}>
                {SEED_USERS[m.user].display_name}
              </div>
              <div style={{ fontSize: 12, color: theme.stone, marginTop: 2 }}>
                {m.sub}
              </div>
            </div>
            {m.user !== "alice" && (
              <Icon name="more-horizontal" size={18} color={theme.stoneLt} />
            )}
          </div>
        ))}
      </div>
      {/* "Add member" opens the three-section invite picker sheet
          (circle · co-members · by email — see InvitePickerScreen in
          cairn-invite-screens.jsx and ui.md → "Invite picker"). The
          email-only inline form this used to be was a legacy shape. */}
      <div style={{ padding: "24px 18px 18px" }}>
        <button
          style={{
            width: "100%",
            padding: "12px 14px",
            border: `1px dashed ${theme.stoneLt}`,
            borderRadius: 12,
            background: theme.paperAlt,
            color: theme.inkSoft,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <Icon
            name="user-plus"
            size={16}
            color="currentColor"
            strokeWidth={1.75}
          />
          Add member
        </button>
      </div>
    </ScreenShell>
  );
}

// 13) Settings — canonical, consolidated.
// Reachable from the Lists screen gear icon (and any "back to Settings" path).
// Holds profile, people, appearance, privacy & data, recovery, about, account.
function SettingsScreen({
  theme,
  themeChoice = "system",
  fontSize = "m",
  invitesPending = 2,
}) {
  const sizes = [
    { k: "xs", label: "XS", px: 11 },
    { k: "s", label: "S", px: 13 },
    { k: "m", label: "M", px: 15 },
    { k: "l", label: "L", px: 18 },
    { k: "xl", label: "XL", px: 21 },
  ];
  const themes = [
    { k: "light", label: "Light", icon: "sun" },
    { k: "dark", label: "Dark", icon: "moon" },
    { k: "system", label: "System", icon: "smartphone" },
  ];
  const sample = sizes.find((s) => s.k === fontSize) || sizes[2];

  const SectionLabel = ({ children }) => (
    <div
      style={{
        fontSize: 11.5,
        color: theme.stone,
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        padding: "22px 18px 8px",
      }}
    >
      {children}
    </div>
  );

  return (
    <ScreenShell
      theme={theme}
      header={
        <TopBar
          theme={theme}
          left={<IconBtn theme={theme} icon="arrow-left" label="back" />}
          title="Settings"
        />
      }
    >
      {/* Profile chip — tap opens Edit profile (A1) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "16px 18px",
        }}
      >
        <Avatar user="alice" size={44} theme={theme} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: theme.ink }}>
            Alice
          </div>
          <div style={{ fontSize: 12, color: theme.stone, marginTop: 2 }}>
            alice@protonmail.com
          </div>
        </div>
        <Icon name="chevron-right" size={18} color={theme.stoneLt} />
      </div>

      {/* People — invites + privacy live under Settings, not as top-level destinations */}
      <SectionLabel theme={theme}>People</SectionLabel>
      <div style={{ padding: "0 18px" }}>
        <NavRow
          theme={theme}
          icon="inbox"
          title="Invites"
          sub={
            invitesPending > 0
              ? `${invitesPending} pending`
              : "No pending invites"
          }
          count={invitesPending > 0 ? invitesPending : undefined}
        />
        <NavRow
          theme={theme}
          icon="shield"
          title="Privacy"
          sub="Who can invite you · circle · blocked"
        />
      </div>

      {/* Theme */}
      <SectionLabel>Appearance</SectionLabel>
      <div style={{ padding: "0 18px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 8,
          }}
        >
          {themes.map((t) => {
            const sel = t.k === themeChoice;
            return (
              <div
                key={t.k}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  padding: "14px 8px",
                  border: `1px solid ${sel ? theme.ink : theme.rule}`,
                  borderRadius: 12,
                  background: sel ? theme.paperAlt : "transparent",
                }}
              >
                <Icon
                  name={t.icon}
                  size={20}
                  color={sel ? theme.ink : theme.stone}
                />
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: sel ? 600 : 500,
                    color: sel ? theme.ink : theme.stone,
                  }}
                >
                  {t.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Font size */}
      <SectionLabel>Text size</SectionLabel>
      <div style={{ padding: "0 18px 0" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 6,
            padding: "14px 12px",
            border: `1px solid ${theme.rule}`,
            borderRadius: 12,
            background: theme.paperAlt,
          }}
        >
          {sizes.map((s) => {
            const sel = s.k === fontSize;
            return (
              <div
                key={s.k}
                style={{
                  flex: 1,
                  textAlign: "center",
                  padding: "8px 0",
                  borderRadius: 8,
                  background: sel ? theme.ink : "transparent",
                  color: sel ? theme.paper : theme.stone,
                  fontSize: s.px,
                  fontWeight: sel ? 700 : 500,
                  lineHeight: 1,
                }}
              >
                A
              </div>
            );
          })}
        </div>
        <div
          style={{
            marginTop: 14,
            padding: "14px 14px",
            border: `1px solid ${theme.rule}`,
            borderRadius: 12,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: theme.stone,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            Preview
          </div>
          <div
            style={{
              fontSize: sample.px + 1,
              fontWeight: 600,
              color: theme.ink,
              lineHeight: 1.3,
            }}
          >
            Bringing Up Baby
          </div>
          <div
            style={{
              fontSize: sample.px - 2,
              color: theme.stone,
              marginTop: 4,
              lineHeight: 1.45,
            }}
          >
            1938 · screwball · Hawks. Cary Grant + Katharine Hepburn + a
            leopard.
          </div>
        </div>
      </div>

      {/* Privacy & data — GDPR data portability entry */}
      <SectionLabel theme={theme}>Privacy &amp; data</SectionLabel>
      <div style={{ padding: "0 18px" }}>
        <NavRow
          theme={theme}
          icon="download"
          title="Download my data"
          sub="Export everything you've put in Cairn"
        />
      </div>

      {/* Recovery */}
      <SectionLabel theme={theme}>Recovery</SectionLabel>
      <div style={{ padding: "0 18px" }}>
        <NavRow
          theme={theme}
          icon="trash-2"
          title="Deleted lists"
          sub="Restore lists you've deleted"
        />
      </div>

      {/* About */}
      <SectionLabel theme={theme}>About</SectionLabel>
      <div style={{ padding: "0 18px" }}>
        <NavRow
          theme={theme}
          icon="info"
          title="About Cairn"
          sub="Version · privacy · terms · open source"
        />
      </div>

      {/* Account */}
      <SectionLabel theme={theme}>Account</SectionLabel>
      <div style={{ padding: "0 18px 24px" }}>
        <NavRow theme={theme} icon="log-out" title="Sign out" />
        <NavRow theme={theme} icon="trash" title="Delete account" ember />
        <div
          style={{
            fontSize: 11,
            color: theme.stoneLt,
            textAlign: "center",
            marginTop: 18,
            fontFamily: theme.mono,
          }}
        >
          Cairn · v0.1 · self-hosted
        </div>
      </div>
    </ScreenShell>
  );
}

// Legacy alias — older canvas registrations refer to SettingsScreenV2.
// Kept so we don't break anyone still pointing at it; new wiring should use SettingsScreen.
const SettingsScreenV2 = SettingsScreen;

// 14) Trash — soft-deleted items for one list
function TrashScreen({ theme }) {
  const trashed = [
    { name: "The Big Lebowski", by: "Bob", when: "3 May 2026" },
    { name: "Some Like It Hot", by: "Alice", when: "2 May 2026" },
    { name: "His Girl Friday", by: "Carol", when: "28 Apr 2026" },
    { name: "Bringing Up Baby", by: "Bob", when: "24 Apr 2026" },
    { name: "The Lady Eve", by: "Alice", when: "21 Apr 2026" },
  ];
  return (
    <ScreenShell
      theme={theme}
      header={
        <TopBar
          theme={theme}
          left={<IconBtn theme={theme} icon="arrow-left" label="back" />}
          title="Trash"
          sub="Old black-and-white films"
        />
      }
    >
      <div style={{ padding: "14px 18px 6px" }}>
        <div style={{ fontSize: 12.5, color: theme.stone, lineHeight: 1.5 }}>
          Items you delete from this list land here. Tap Restore to bring one
          back.
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        {trashed.map((t, i, arr) => (
          <div
            key={t.name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "14px 18px",
              borderTop: i === 0 ? `1px solid ${theme.rule}` : "none",
              borderBottom: `1px solid ${theme.rule}`,
            }}
          >
            <Icon name="rotate-ccw" size={16} color={theme.stoneLt} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14.5,
                  fontWeight: 600,
                  color: theme.stone,
                  textDecoration: "line-through",
                  textDecorationColor: theme.stoneLt,
                  textDecorationThickness: "1px",
                }}
              >
                {t.name}
              </div>
              <div
                style={{ fontSize: 11.5, color: theme.stoneLt, marginTop: 2 }}
              >
                deleted by {t.by} · {t.when}
              </div>
            </div>
            <button
              style={{
                padding: "7px 12px",
                border: `1px solid ${theme.ink}`,
                borderRadius: 999,
                background: "transparent",
                color: theme.ink,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Restore
            </button>
          </div>
        ))}
      </div>
    </ScreenShell>
  );
}

// 15) Items screen with undo snackbar visible
function ItemsScreenWithUndo({ theme, list = SEED_LISTS[0] }) {
  const sorted = sortItems(list.items);
  return (
    <ScreenShell
      theme={theme}
      header={
        <TopBar
          theme={theme}
          left={<IconBtn theme={theme} icon="arrow-left" label="back" />}
          title={list.name}
          sub={`${list.members.length} members · ${list.items.length} items`}
          right={<IconBtn theme={theme} icon="more-vertical" label="more" />}
        />
      }
    >
      <div style={{ paddingBottom: 96 }}>
        {sorted.map((item, idx) => (
          <ItemRow
            key={item.id}
            item={item}
            theme={theme}
            voteStyle="ascii"
            showAggregate={true}
            isOpen={false}
            isLast={idx === sorted.length - 1}
          />
        ))}
      </div>
      {/* Undo snackbar — replaces the FAB while it's showing (6s) so the
          UNDO affordance isn't covered by the corner action. */}
      <div
        style={{
          position: "absolute",
          left: 12,
          right: 12,
          bottom: 18,
          padding: "12px 14px",
          background: theme.ink,
          color: theme.paper,
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          gap: 12,
          boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          fontSize: 13.5,
        }}
      >
        <Icon name="trash-2" size={16} color={theme.paper} />
        <span style={{ flex: 1, minWidth: 0 }}>
          Deleted{" "}
          <em style={{ fontStyle: "normal", fontWeight: 600 }}>
            Bringing Up Baby
          </em>
        </span>
        <span
          style={{
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            fontSize: 12,
            color: theme.sage,
            padding: "4px 8px",
          }}
        >
          Undo
        </span>
      </div>
    </ScreenShell>
  );
}

// 16) Delete account — full-screen, plain-language explanation
function DeleteAccountScreen({ theme, confirmed = false }) {
  const Block = ({ title, children }) => (
    <div style={{ marginBottom: 18 }}>
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
            fontFamily: theme.serif,
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
            marginBottom: 22,
            fontStyle: "italic",
            fontFamily: theme.serif,
          }}
        >
          We won't ask why. Read what happens, then decide.
        </div>

        {/* Non-blocking nudge: offer a data copy before the irreversible action. */}
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
              style={{
                fontSize: 12.5,
                color: theme.inkSoft || theme.stone,
                lineHeight: 1.5,
              }}
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
          are — the people you share with need that material to keep using those
          lists. Your name on those items changes to{" "}
          <em style={{ fontStyle: "normal", fontWeight: 600 }}>Deleted user</em>
          .
        </Block>

        <Block title="What's deleted with you">
          Lists where you were the only remaining member, along with everything
          on them. Nothing of yours is left in someone else's space.
        </Block>

        <div
          style={{
            marginTop: 8,
            padding: "14px 14px",
            background: theme.paperAlt,
            border: `1px solid ${theme.rule}`,
            borderRadius: 12,
          }}
        >
          <div
            style={{
              fontSize: 12.5,
              color: theme.stone,
              marginBottom: 10,
            }}
          >
            Type{" "}
            <span
              style={{
                fontFamily: theme.mono,
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
              border: `1px solid ${confirmed ? theme.ember : theme.stoneLt}`,
              fontFamily: theme.mono,
              fontSize: 14,
              color: confirmed ? theme.ember : theme.stoneLt,
              display: "flex",
              alignItems: "center",
              minHeight: 22,
            }}
          >
            {confirmed ? (
              "delete"
            ) : (
              <span style={{ fontStyle: "italic" }}>delete</span>
            )}
            <span
              style={{
                display: "inline-block",
                width: 1,
                height: 16,
                background: confirmed ? theme.ember : "transparent",
                marginLeft: 2,
              }}
            />
          </div>
        </div>

        <div
          style={{
            marginTop: 22,
            fontSize: 12,
            color: theme.stone,
            textAlign: "center",
          }}
        >
          This can't be undone.
        </div>
        <button
          style={{
            marginTop: 8,
            width: "100%",
            padding: "14px",
            borderRadius: 12,
            border: "none",
            background: confirmed ? theme.ember : theme.stoneLt,
            color: theme.paper,
            fontSize: 15,
            fontWeight: 700,
            fontFamily: "inherit",
            cursor: confirmed ? "pointer" : "default",
            opacity: confirmed ? 1 : 0.6,
            letterSpacing: "0.01em",
          }}
        >
          Delete my account
        </button>
      </div>
    </ScreenShell>
  );
}

// 17) Items screen with tombstone attribution shown in the accordion
function ItemsScreenTombstone({ theme }) {
  // Synthesize a list whose top item was added by the deleted user
  const list = SEED_LISTS[0];
  const items = list.items.map((it) => ({ ...it }));
  // Put the open item at the top and reattribute it
  const ghosted = { ...items[0], created_by: "ghost", modified_by: "ghost" };
  items[0] = ghosted;
  const sorted = sortItems(items);

  return (
    <ScreenShell
      theme={theme}
      header={
        <TopBar
          theme={theme}
          left={<IconBtn theme={theme} icon="arrow-left" label="back" />}
          title={list.name}
          sub={`${list.members.length} members · ${items.length} items`}
          right={<IconBtn theme={theme} icon="more-vertical" label="more" />}
        />
      }
      footer={<FAB theme={theme} icon="plus" label="Add" />}
    >
      <div>
        {sorted.map((item, idx) => {
          const isOpen = item.id === ghosted.id;
          return (
            <div key={item.id}>
              <ItemRow
                item={item}
                theme={theme}
                voteStyle="ascii"
                showAggregate={true}
                isOpen={isOpen}
                isLast={idx === sorted.length - 1 && !isOpen}
              />
              {isOpen && (
                <div
                  style={{
                    padding: "0 18px 18px",
                    borderBottom: `1px solid ${theme.rule}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "12px 0",
                      borderTop: `1px solid ${theme.rule}`,
                    }}
                  >
                    <Avatar user="ghost" size={28} theme={theme} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12.5,
                          color: theme.stone,
                        }}
                      >
                        Added by{" "}
                        <em
                          style={{
                            fontStyle: "italic",
                            color: theme.stoneLt,
                            fontFamily: theme.serif,
                          }}
                        >
                          Deleted user
                        </em>{" "}
                        on 12 Apr 2026
                      </div>
                    </div>
                  </div>
                  {item.notes && (
                    <div
                      style={{
                        fontSize: 13.5,
                        color: theme.ink,
                        lineHeight: 1.5,
                        marginTop: 4,
                      }}
                    >
                      {item.notes}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ScreenShell>
  );
}

// Make accessible globally
Object.assign(window, {
  ScreenShell,
  TopBar,
  IconBtn,
  FAB,
  Avatar,
  ItemRow,
  ItemPanel,
  LoginRequest,
  LoginCheck,
  MagicLinkRefusedBoard,
  ListsScreen,
  EmptyListsScreen,
  ItemsScreen,
  EmptyListScreen,
  AddItemScreen,
  EditItemScreen,
  DeleteItemScreen,
  AddListScreen,
  ListMenuScreen,
  MembersScreen,
  SettingsScreen,
  SettingsScreenV2,
  TrashScreen,
  ItemsScreenWithUndo,
  DeleteAccountScreen,
  ItemsScreenTombstone,
});
