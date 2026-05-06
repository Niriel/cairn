// cairn-invite-screens.jsx
// Screens for the invites & circles feature: inbox, privacy, circle,
// blocked, profile sheet, and an updated invite picker.
//
// Depends on globals from cairn-data.jsx, cairn-ui.jsx, cairn-screens.jsx.

// ── Tiny shared bits ───────────────────────────────────────

function SectionLabel({ theme, children, padTop = 22 }) {
  return (
    <div style={{
      fontSize: 11.5, color: theme.stone, fontWeight: 600,
      letterSpacing: '0.06em', textTransform: 'uppercase',
      padding: `${padTop}px 18px 8px`,
    }}>{children}</div>
  );
}

function NavRow({ theme, icon, title, sub, count, ember }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '14px 14px',
      border: `1px solid ${theme.rule}`, borderRadius: 12,
      marginBottom: 10,
    }}>
      {icon && <Icon name={icon} size={18} color={ember ? theme.ember : theme.stone}/>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: ember ? theme.ember : theme.ink }}>
          {title}
        </div>
        {sub && <div style={{ fontSize: 12, color: theme.stone, marginTop: 2 }}>{sub}</div>}
      </div>
      {typeof count === 'number' && (
        <span style={{
          fontSize: 12, color: theme.stone, fontWeight: 600,
          fontFamily: theme.mono, marginRight: 4,
        }}>
          {count}
        </span>
      )}
      <Icon name="chevron-right" size={18} color={ember ? theme.ember : theme.stoneLt}/>
    </div>
  );
}

// ── 1) Inbox row that appears at the top of the Lists screen ──
// This is rendered as a banner above the list of lists.
function InboxBanner({ theme, count = 1, inviter = 'alice', listName = 'Stuff to read' }) {
  if (count === 1) {
    return (
      <div style={{
        margin: '8px 18px 14px',
        padding: '14px 14px',
        background: theme.paperAlt,
        border: `1px solid ${theme.rule}`,
        borderRadius: 12,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar user={inviter} size={28} theme={theme}/>
          <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: theme.ink, lineHeight: 1.4 }}>
            <span style={{ fontWeight: 600 }}>{SEED_USERS[inviter].display_name}</span>
            <span style={{ color: theme.stone }}> invited you to </span>
            <span style={{ fontWeight: 600 }}>{listName}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{
            flex: 1, padding: '8px 0', borderRadius: 999,
            border: `1px solid ${theme.rule}`, background: 'transparent',
            color: theme.stone,
            fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
          }}>Decline</button>
          <button style={{
            flex: 1, padding: '8px 0', borderRadius: 999,
            border: 'none', background: theme.sage, color: '#fff',
            fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
          }}>Accept</button>
        </div>
      </div>
    );
  }
  // Multi-invite collapsed row
  return (
    <div style={{
      margin: '8px 18px 14px',
      padding: '14px 14px',
      background: theme.paperAlt,
      border: `1px solid ${theme.rule}`,
      borderRadius: 12,
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 99,
        background: theme.ink, color: theme.paper,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 700,
      }}>{count}</div>
      <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: theme.ink }}>
        {count} pending invites
      </div>
      <Icon name="chevron-right" size={18} color={theme.stoneLt}/>
    </div>
  );
}

// ── 2) Lists screen variant with the inbox banner ────────
function ListsScreenWithInbox({ theme }) {
  // Reuses the existing ListsScreen body via composition: we render the banner
  // ourselves and then a tight version of the same list rows.
  // For simplicity we duplicate the list-row block here in a minimal form.
  const lists = SEED_LISTS;
  return (
    <ScreenShell
      theme={theme}
      header={
        <TopBar
          theme={theme}
          left={<CairnGlyph size={26} color={theme.accent}/>}
          title="Cairn"
          right={<IconBtn theme={theme} icon="more-vertical" label="menu"/>}
          sub="Signed in as Alice"
        />
      }
    >
      <InboxBanner theme={theme} count={1} inviter="bob" listName="Things to do in Amsterdam"/>
      <div style={{ padding: '0 18px' }}>
        <SectionLabel theme={theme} padTop={4}>Your lists</SectionLabel>
      </div>
      {lists.map((l, i) => (
        <div key={l.id} style={{
          padding: '14px 18px',
          borderTop: i === 0 ? `1px solid ${theme.rule}` : 'none',
          borderBottom: `1px solid ${theme.rule}`,
        }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: theme.ink }}>
            {l.name}
          </div>
          <div style={{
            fontSize: 12.5, color: theme.stone, marginTop: 4, lineHeight: 1.4,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {l.description}
          </div>
          <div style={{
            fontSize: 11, color: theme.stoneLt, marginTop: 6,
            fontFamily: theme.mono,
          }}>
            {l.members.length} members · {l.items.length} stones
          </div>
        </div>
      ))}
    </ScreenShell>
  );
}

// ── 3) Invites inbox screen ───────────────────────────────
function InvitesInboxScreen({ theme }) {
  const invites = [
    { inviter: 'bob',   list: 'Things to do in Amsterdam',  when: 'Today' },
    { inviter: 'carol', list: 'Books for the long weekend', when: 'Yesterday' },
    { inviter: 'bob',   list: 'Birthday gift ideas — Mum',  when: '2 days ago' },
  ];
  return (
    <ScreenShell
      theme={theme}
      header={
        <TopBar
          theme={theme}
          left={<IconBtn theme={theme} icon="arrow-left" label="back"/>}
          title="Invites"
          sub={`${invites.length} pending`}
        />
      }
    >
      <div style={{ padding: '14px 18px 6px' }}>
        <div style={{ fontSize: 12.5, color: theme.stone, lineHeight: 1.5 }}>
          People who've invited you to their lists. Accept to join, or decline to clear.
        </div>
      </div>
      <div style={{ marginTop: 6 }}>
        {invites.map((inv, i) => (
          <div key={i} style={{
            display: 'flex', flexDirection: 'column', gap: 12,
            padding: '14px 18px',
            borderTop: i === 0 ? `1px solid ${theme.rule}` : 'none',
            borderBottom: `1px solid ${theme.rule}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar user={inv.inviter} size={36} theme={theme}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: theme.stone, lineHeight: 1.35 }}>
                  <span style={{ fontWeight: 600, color: theme.ink }}>
                    {SEED_USERS[inv.inviter].display_name}
                  </span>
                  {' invited you to'}
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: theme.ink, marginTop: 2 }}>
                  {inv.list}
                </div>
              </div>
              <span style={{ fontSize: 11, color: theme.stoneLt, fontFamily: theme.mono }}>
                {inv.when}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{
                flex: 1, padding: '9px 0', borderRadius: 999,
                border: `1px solid ${theme.rule}`, background: 'transparent', color: theme.stone,
                fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
              }}>Decline</button>
              <button style={{
                flex: 1, padding: '9px 0', borderRadius: 999,
                border: 'none', background: theme.sage, color: '#fff',
                fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
              }}>Accept</button>
            </div>
          </div>
        ))}
      </div>
    </ScreenShell>
  );
}

// ── 4) Privacy screen ─────────────────────────────────────
function PrivacyScreen({ theme, policy = 'everybody' }) {
  const opts = [
    { k: 'everybody', label: 'Everybody', sub: 'Anyone with a Cairn account' },
    { k: 'circle',    label: 'Your circle', sub: 'Only people in your circle' },
    { k: 'nobody',    label: 'Nobody',    sub: 'You can still create lists and invite others' },
  ];
  const sel = opts.find(o => o.k === policy);

  return (
    <ScreenShell
      theme={theme}
      header={
        <TopBar
          theme={theme}
          left={<IconBtn theme={theme} icon="arrow-left" label="back"/>}
          title="Privacy"
        />
      }
    >
      <SectionLabel theme={theme}>Who can invite you to lists</SectionLabel>
      <div style={{ padding: '0 18px' }}>
        <div style={{
          display: 'flex', flexDirection: 'column',
          border: `1px solid ${theme.rule}`, borderRadius: 12,
          overflow: 'hidden',
        }}>
          {opts.map((o, i) => {
            const isSel = o.k === policy;
            return (
              <div key={o.k} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px',
                background: isSel ? theme.paperAlt : 'transparent',
                borderBottom: i < opts.length - 1 ? `1px solid ${theme.rule}` : 'none',
              }}>
                <span style={{
                  width: 18, height: 18, borderRadius: 99,
                  border: `1.5px solid ${isSel ? theme.ink : theme.stoneLt}`,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {isSel && <span style={{
                    width: 9, height: 9, borderRadius: 99, background: theme.ink,
                  }}/>}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: theme.ink }}>
                    {o.label}
                  </div>
                  <div style={{ fontSize: 12, color: theme.stone, marginTop: 2 }}>
                    {o.sub}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {policy === 'circle' && (
          <button style={{
            marginTop: 10,
            background: 'transparent', border: 'none', padding: 0,
            color: theme.accent, fontSize: 12.5, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
            textDecoration: 'underline', textDecorationStyle: 'dotted',
            textUnderlineOffset: 3,
          }}>What's a circle?</button>
        )}
      </div>

      <SectionLabel theme={theme}>People</SectionLabel>
      <div style={{ padding: '0 18px 24px' }}>
        <NavRow theme={theme} icon="users" title="Your circle"
          sub="People you'll let invite you" count={7}/>
        <NavRow theme={theme} icon="slash" title="Blocked"
          sub="People who can never invite you" count={0}/>
      </div>

      <div style={{
        margin: '0 18px 24px', padding: '14px',
        background: theme.paperAlt, borderRadius: 12,
        fontSize: 12, color: theme.stone, lineHeight: 1.5,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Icon name="lock" size={16} color={theme.stone} style={{ marginTop: 2 }}/>
          <div>
            Your email address is never shown to other people on Cairn — only your
            display name and avatar.
          </div>
        </div>
      </div>
    </ScreenShell>
  );
}

// ── 5) Circle screen ──────────────────────────────────────
function CircleScreen({ theme }) {
  const inMyCircle = [
    { user: 'bob',   when: 'added 12 Apr' },
    { user: 'carol', when: 'added 28 Mar' },
  ];
  return (
    <ScreenShell
      theme={theme}
      header={
        <TopBar
          theme={theme}
          left={<IconBtn theme={theme} icon="arrow-left" label="back"/>}
          title="Your circle"
        />
      }
    >
      <div style={{
        padding: '14px 18px 6px',
        display: 'flex', alignItems: 'flex-start', gap: 14,
      }}>
        <div style={{ flex: 1, fontSize: 12.5, color: theme.stone, lineHeight: 1.5 }}>
          When your privacy is set to <em style={{ fontFamily: theme.serif, fontStyle: 'italic' }}>Your circle</em>,
          these are the only people who can invite you to a list.
        </div>
        <button style={{
          flexShrink: 0,
          background: 'transparent', border: 'none', padding: 0,
          color: theme.accent, fontSize: 12.5, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit',
          textDecoration: 'underline', textDecorationStyle: 'dotted',
          textUnderlineOffset: 3, marginTop: 1,
        }}>What's this?</button>
      </div>

      <SectionLabel theme={theme}>People in your circle · {inMyCircle.length}</SectionLabel>
      <div>
        {inMyCircle.map((m, i) => (
          <div key={m.user} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 18px',
            borderTop: i === 0 ? `1px solid ${theme.rule}` : 'none',
            borderBottom: `1px solid ${theme.rule}`,
          }}>
            <Avatar user={m.user} size={36} theme={theme}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: theme.ink }}>
                {SEED_USERS[m.user].display_name}
              </div>
              <div style={{ fontSize: 11.5, color: theme.stoneLt, marginTop: 2, fontFamily: theme.mono }}>
                {m.when}
              </div>
            </div>
            <button style={{
              padding: '7px 12px', border: `1px solid ${theme.rule}`, borderRadius: 999,
              background: 'transparent', color: theme.stone,
              fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit',
            }}>Remove</button>
          </div>
        ))}
      </div>

      <SectionLabel theme={theme}>Add by email</SectionLabel>
      <div style={{ padding: '0 18px 24px' }}>
        <div style={{
          padding: '14px', border: `1px dashed ${theme.stoneLt}`, borderRadius: 12,
          background: theme.paperAlt,
        }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Icon name="mail" size={18} color={theme.stone}/>
            <span style={{ flex: 1, fontSize: 14, color: theme.stone, fontStyle: 'italic' }}>
              friend@example.net
            </span>
            <button style={{
              padding: '7px 14px', border: 'none', borderRadius: 10,
              background: theme.ink, color: theme.paper,
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit',
            }}>Add</button>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: theme.stone, lineHeight: 1.5 }}>
            They'll be added to your circle. If they have you blocked, the add still
            succeeds on your side — but their side stays untouched.
          </div>
        </div>
      </div>
    </ScreenShell>
  );
}

// ── 6) Blocked screen ─────────────────────────────────────
function BlockedScreen({ theme, empty = false }) {
  const blocked = empty ? [] : [
    { user: 'carol', when: '14 Apr' },
  ];
  return (
    <ScreenShell
      theme={theme}
      header={
        <TopBar
          theme={theme}
          left={<IconBtn theme={theme} icon="arrow-left" label="back"/>}
          title="Blocked"
        />
      }
    >
      <div style={{ padding: '14px 18px 4px' }}>
        <div style={{ fontSize: 12.5, color: theme.stone, lineHeight: 1.5 }}>
          People you've blocked. They can't invite you to any list, regardless of
          your other privacy settings.
        </div>
      </div>

      {blocked.length === 0 ? (
        <div style={{
          margin: '24px 18px',
          padding: '36px 18px',
          textAlign: 'center',
          border: `1px dashed ${theme.stoneLt}`, borderRadius: 14,
          background: theme.paperAlt,
        }}>
          <Icon name="slash" size={28} color={theme.stoneLt}/>
          <div style={{ fontSize: 14, color: theme.stone, marginTop: 10 }}>
            You haven't blocked anyone.
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          {blocked.map((b, i, arr) => (
            <div key={b.user} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '14px 18px',
              borderTop: i === 0 ? `1px solid ${theme.rule}` : 'none',
              borderBottom: `1px solid ${theme.rule}`,
            }}>
              <Avatar user={b.user} size={36} theme={theme}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: theme.ink }}>
                  {SEED_USERS[b.user].display_name}
                </div>
                <div style={{ fontSize: 11.5, color: theme.stoneLt, marginTop: 2, fontFamily: theme.mono }}>
                  blocked {b.when}
                </div>
              </div>
              <button style={{
                padding: '7px 12px', border: `1px solid ${theme.rule}`, borderRadius: 999,
                background: 'transparent', color: theme.stone,
                fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit',
              }}>Unblock</button>
            </div>
          ))}
        </div>
      )}
    </ScreenShell>
  );
}

// ── 7) Profile sheet ──────────────────────────────────────
// Rendered inside an ItemsScreen-like background to show context.
function ProfileSheet({ theme, user = 'bob', state = 'in-circle' }) {
  // state: 'stranger' | 'in-circle' | 'blocked'
  // Shown over a faded backdrop suggesting it's a modal.

  const inCircle = state === 'in-circle';
  const blocked = state === 'blocked';

  return (
    <ScreenShell
      theme={theme}
      header={
        <TopBar
          theme={theme}
          left={<IconBtn theme={theme} icon="arrow-left" label="back"/>}
          title="Members"
          sub="Things to do in Amsterdam"
        />
      }
    >
      {/* Faded backdrop suggesting modality */}
      <div style={{
        padding: '14px 18px',
        opacity: 0.32, pointerEvents: 'none',
      }}>
        {[
          { user: 'alice', sub: 'You · created the list' },
          { user: 'bob',   sub: 'Added by Alice' },
          { user: 'carol', sub: 'Added by Alice' },
        ].map((m, i, arr) => (
          <div key={m.user} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 0',
            borderBottom: i < arr.length - 1 ? `1px solid ${theme.rule}` : 'none',
          }}>
            <Avatar user={m.user} size={32} theme={theme}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: theme.ink }}>
                {SEED_USERS[m.user].display_name}
              </div>
              <div style={{ fontSize: 11.5, color: theme.stone, marginTop: 2 }}>{m.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Sheet */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        background: theme.paper,
        borderTopLeftRadius: 18, borderTopRightRadius: 18,
        boxShadow: `0 -4px 24px rgba(0,0,0,${blocked ? 0.18 : 0.14})`,
        padding: '14px 18px 24px',
      }}>
        {/* Drag handle */}
        <div style={{
          width: 40, height: 4, borderRadius: 99,
          background: theme.stoneLt, margin: '0 auto 16px',
        }}/>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <Avatar user={user} size={68} theme={theme}/>
          <div style={{ fontSize: 18, fontWeight: 600, color: theme.ink, marginTop: 4 }}>
            {SEED_USERS[user].display_name}
          </div>
          {inCircle && (
            <div style={{ fontSize: 12, color: theme.sage, fontWeight: 600, fontFamily: theme.mono }}>
              IN YOUR CIRCLE
            </div>
          )}
          {blocked && (
            <div style={{ fontSize: 12, color: theme.ember, fontWeight: 600, fontFamily: theme.mono }}>
              BLOCKED
            </div>
          )}
        </div>

        <div style={{
          marginTop: 18,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {/* Circle action */}
          {!blocked && (
            <ActionRow theme={theme}
              icon={inCircle ? 'user-check' : 'user-plus'}
              label={inCircle ? 'Remove from your circle' : 'Add to your circle'}
              sub={inCircle ? null : 'Lets you accept invites from them'}/>
          )}
          {/* Block / unblock */}
          <ActionRow theme={theme}
            icon={blocked ? 'shield' : 'slash'}
            label={blocked ? 'Unblock' : `Block ${SEED_USERS[user].display_name}`}
            ember={!blocked}/>
        </div>
      </div>
    </ScreenShell>
  );
}

function ActionRow({ theme, icon, label, sub, ember }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '14px',
      border: `1px solid ${theme.rule}`, borderRadius: 12,
    }}>
      <Icon name={icon} size={18} color={ember ? theme.ember : theme.stone}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: ember ? theme.ember : theme.ink }}>
          {label}
        </div>
        {sub && <div style={{ fontSize: 12, color: theme.stone, marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ── 8) Invite picker (replaces email-only on the Members screen) ──
function InvitePickerScreen({ theme }) {
  const inCircle = [
    { user: 'bob',   sub: 'In your circle' },
  ];
  const coMembers = [
    { user: 'carol', sub: 'On 2 of your other lists' },
  ];
  return (
    <ScreenShell
      theme={theme}
      header={
        <TopBar
          theme={theme}
          left={<IconBtn theme={theme} icon="arrow-left" label="back"/>}
          title="Members"
          sub="Things to do in Amsterdam"
        />
      }
    >
      {/* faded existing members above */}
      <div style={{ padding: '14px 18px', opacity: 0.28, pointerEvents: 'none' }}>
        {[{ user: 'alice', sub: 'You · created the list' }].map((m) => (
          <div key={m.user} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0',
          }}>
            <Avatar user={m.user} size={32} theme={theme}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: theme.ink }}>
                {SEED_USERS[m.user].display_name}
              </div>
              <div style={{ fontSize: 11.5, color: theme.stone, marginTop: 2 }}>{m.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Picker sheet */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, top: 110,
        background: theme.paper,
        borderTopLeftRadius: 18, borderTopRightRadius: 18,
        boxShadow: '0 -4px 24px rgba(0,0,0,0.14)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 18px',
          borderBottom: `1px solid ${theme.rule}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ width: 40, height: 4, borderRadius: 99, background: theme.stoneLt, margin: '0 auto 0' }}/>
        </div>
        <div style={{ padding: '4px 18px 12px' }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: theme.ink }}>
            Add someone
          </div>
          <div style={{ fontSize: 12.5, color: theme.stone, marginTop: 2 }}>
            Tap to invite, or type an email below
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <SectionLabel theme={theme} padTop={6}>Your circle</SectionLabel>
          <PickerRows theme={theme} rows={inCircle}/>

          <SectionLabel theme={theme}>People you share other lists with</SectionLabel>
          <PickerRows theme={theme} rows={coMembers}/>
        </div>

        <div style={{
          padding: '14px 18px',
          borderTop: `1px solid ${theme.rule}`,
          background: theme.paperAlt,
        }}>
          <div style={{
            fontSize: 11.5, color: theme.stone, fontWeight: 600,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            marginBottom: 8,
          }}>By email</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Icon name="mail" size={18} color={theme.stone}/>
            <span style={{ flex: 1, fontSize: 14, color: theme.stone, fontStyle: 'italic' }}>
              friend@example.net
            </span>
            <button style={{
              padding: '7px 14px', border: 'none', borderRadius: 10,
              background: theme.ink, color: theme.paper,
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit',
            }}>Send</button>
          </div>
        </div>
      </div>
    </ScreenShell>
  );
}

function PickerRows({ theme, rows }) {
  return (
    <div>
      {rows.map((r, i, arr) => (
        <div key={r.user} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 18px',
          borderTop: i === 0 ? `1px solid ${theme.rule}` : 'none',
          borderBottom: `1px solid ${theme.rule}`,
        }}>
          <Avatar user={r.user} size={32} theme={theme}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: theme.ink }}>
              {SEED_USERS[r.user].display_name}
            </div>
            <div style={{ fontSize: 11.5, color: theme.stone, marginTop: 2 }}>
              {r.sub}
            </div>
          </div>
          <button style={{
            padding: '7px 14px', border: `1px solid ${theme.ink}`, borderRadius: 999,
            background: 'transparent', color: theme.ink,
            fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit',
          }}>Invite</button>
        </div>
      ))}
    </div>
  );
}

// ── 9) Settings screen v2: with Invites + Privacy entries ──
function SettingsScreenV2({ theme, themeChoice = 'light', fontSize = 'm', invitesPending = 2 }) {
  return (
    <ScreenShell
      theme={theme}
      header={
        <TopBar
          theme={theme}
          left={<IconBtn theme={theme} icon="arrow-left" label="back"/>}
          title="Settings"
        />
      }
    >
      {/* Profile chip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px',
      }}>
        <Avatar user="alice" size={44} theme={theme}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: theme.ink }}>Alice</div>
          <div style={{ fontSize: 12, color: theme.stone, marginTop: 2 }}>
            alice@protonmail.com
          </div>
        </div>
        <Icon name="chevron-right" size={18} color={theme.stoneLt}/>
      </div>

      <SectionLabel theme={theme}>People</SectionLabel>
      <div style={{ padding: '0 18px' }}>
        <NavRow theme={theme} icon="inbox" title="Invites"
          sub={invitesPending > 0 ? `${invitesPending} pending` : 'No pending invites'}
          count={invitesPending > 0 ? invitesPending : undefined}/>
        <NavRow theme={theme} icon="shield" title="Privacy"
          sub="Who can invite you · circle · blocked"/>
      </div>

      <SectionLabel theme={theme}>Appearance</SectionLabel>
      <div style={{ padding: '0 18px' }}>
        <NavRow theme={theme} icon="sun" title="Theme" sub="Light"/>
        <NavRow theme={theme} icon="feather" title="Text size" sub="Medium"/>
      </div>

      <SectionLabel theme={theme}>Recovery</SectionLabel>
      <div style={{ padding: '0 18px' }}>
        <NavRow theme={theme} icon="trash-2" title="Deleted lists"
          sub="Restore lists you've deleted"/>
      </div>

      <SectionLabel theme={theme}>Account</SectionLabel>
      <div style={{ padding: '0 18px 24px' }}>
        <NavRow theme={theme} icon="log-out" title="Sign out"/>
        <NavRow theme={theme} icon="trash" title="Delete account" ember/>
        <div style={{
          fontSize: 11, color: theme.stoneLt, textAlign: 'center',
          marginTop: 18, fontFamily: theme.mono,
        }}>
          Cairn · v0.1 · self-hosted
        </div>
      </div>
    </ScreenShell>
  );
}

// ── 10) Circle explainer sheet ────────────────────────────
// Reachable from the "What's this?" link on the Circle and Privacy screens.
function CircleExplainerSheet({ theme }) {
  return (
    <ScreenShell
      theme={theme}
      header={
        <TopBar
          theme={theme}
          left={<IconBtn theme={theme} icon="arrow-left" label="back"/>}
          title="Your circle"
        />
      }
    >
      {/* faded backdrop hint of the circle screen behind */}
      <div style={{ padding: '14px 18px', opacity: 0.18, pointerEvents: 'none' }}>
        <div style={{ fontSize: 12.5, color: theme.stone, lineHeight: 1.5 }}>
          When your privacy is set to Your circle, these are the only people who
          can invite you to a list.
        </div>
        <div style={{
          marginTop: 24, height: 1, background: theme.rule,
        }}/>
        <div style={{
          marginTop: 18, display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 99, background: theme.stoneLt,
          }}/>
          <div style={{ height: 14, width: 100, background: theme.stoneLt, borderRadius: 4 }}/>
        </div>
      </div>

      {/* Sheet */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        background: theme.paper,
        borderTopLeftRadius: 18, borderTopRightRadius: 18,
        boxShadow: '0 -4px 24px rgba(0,0,0,0.14)',
        padding: '14px 22px 24px',
        maxHeight: '78%', overflowY: 'auto',
      }}>
        <div style={{
          width: 40, height: 4, borderRadius: 99,
          background: theme.stoneLt, margin: '0 auto 14px',
        }}/>

        <div style={{
          fontFamily: theme.serif, fontSize: 26, fontWeight: 500,
          letterSpacing: '-0.01em', color: theme.ink,
          lineHeight: 1.15, marginBottom: 12,
        }}>
          What is a circle?
        </div>

        <div style={{
          fontSize: 14.5, color: theme.ink, lineHeight: 1.55, marginBottom: 14,
        }}>
          Your circle is a private list of people you'll let invite you to lists,
          when your privacy is set to <em style={{
            fontFamily: theme.serif, fontStyle: 'italic',
          }}>Your circle</em>.
        </div>

        <ExplainerPoint theme={theme}
          title="It's yours alone."
          body="Bob doesn't see whether he's in your circle. You don't see whose circle you're in. Each person manages their own."/>

        <ExplainerPoint theme={theme}
          title="It only governs invites coming to you."
          body={<>It does not affect your ability to invite anyone. If Bob's policy is also <em style={{ fontFamily: theme.serif, fontStyle: 'italic' }}>Your circle</em>, what matters for inviting Bob is whether <em style={{ fontFamily: theme.serif, fontStyle: 'italic' }}>you</em> are in <em style={{ fontFamily: theme.serif, fontStyle: 'italic' }}>his</em> circle — not the other way around.</>}/>

        <ExplainerPoint theme={theme}
          title="Adding by email is two-way."
          body="If you add Bob's email here, you go on his circle too — unless he's blocked you, in which case only your side is updated. Either of you can remove the other at any time."/>

        <ExplainerPoint theme={theme}
          title="To stop someone inviting you: block them."
          body="The block always wins — it overrides every circle and policy on either side."/>

        <div style={{
          marginTop: 18, padding: '12px 14px',
          background: theme.paperAlt, borderRadius: 10,
          fontSize: 12.5, color: theme.stone, lineHeight: 1.5,
        }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Icon name="lock" size={14} color={theme.stone} style={{ marginTop: 2 }}/>
            <div>
              Cairn will never tell anyone whose circle they're in.
              The list above is yours; you're the only one who sees it.
            </div>
          </div>
        </div>

        <button style={{
          marginTop: 18, width: '100%', padding: '12px',
          border: 'none', borderRadius: 12,
          background: theme.ink, color: theme.paper,
          fontSize: 14.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
        }}>Got it</button>
      </div>
    </ScreenShell>
  );
}

function ExplainerPoint({ theme, title, body }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        fontSize: 13.5, fontWeight: 600, color: theme.ink, marginBottom: 4,
      }}>{title}</div>
      <div style={{ fontSize: 13, color: theme.stone, lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}

// Make components available to the canvas script (which lives in the HTML file).
Object.assign(window, {
  ListsScreenWithInbox,
  InvitesInboxScreen,
  PrivacyScreen,
  CircleScreen,
  CircleExplainerSheet,
  BlockedScreen,
  ProfileSheet,
  InvitePickerScreen,
  SettingsScreenV2,
  InboxBanner,
  SectionLabel,
  NavRow,
});
