// Cairn UI — shared building blocks: theme, type, icons, vote control, list rows.

const CAIRN_LIGHT = {
  paper:    'oklch(98% 0.012 85)',     // warm cream background
  paperAlt: 'oklch(96% 0.014 82)',     // card / row hover
  ink:      'oklch(24% 0.02 65)',      // near-black, warm
  inkSoft:  'oklch(40% 0.02 70)',      // body
  stone:    'oklch(58% 0.018 80)',     // secondary text
  stoneLt:  'oklch(80% 0.012 80)',     // dividers
  rule:     'oklch(88% 0.012 80)',     // hairlines
  sage:     'oklch(52% 0.09 145)',     // positive
  sageBg:   'oklch(94% 0.04 145)',
  ember:    'oklch(56% 0.13 38)',      // negative
  emberBg:  'oklch(94% 0.05 38)',
  accent:   'oklch(45% 0.07 70)',      // wordmark warm
  shadow:   '0 1px 0 rgba(60,40,20,0.04), 0 8px 24px rgba(60,40,20,0.06)',
};

const CAIRN_DARK = {
  paper:    'oklch(20% 0.012 70)',
  paperAlt: 'oklch(24% 0.014 70)',
  ink:      'oklch(94% 0.012 85)',
  inkSoft:  'oklch(82% 0.012 80)',
  stone:    'oklch(62% 0.014 80)',
  stoneLt:  'oklch(38% 0.012 75)',
  rule:     'oklch(30% 0.012 75)',
  sage:     'oklch(72% 0.10 145)',
  sageBg:   'oklch(30% 0.05 145)',
  ember:    'oklch(72% 0.13 38)',
  emberBg:  'oklch(30% 0.07 38)',
  accent:   'oklch(78% 0.06 75)',
  shadow:   '0 1px 0 rgba(0,0,0,0.3), 0 8px 24px rgba(0,0,0,0.35)',
};

function useCairnTheme(dark) { return dark ? CAIRN_DARK : CAIRN_LIGHT; }

// ── Wordmark ─────────────────────────────────────────────────
function CairnGlyph({ size = 22, color }) {
  // three stacked stones, slightly off-center
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block' }}>
      {/* base stone */}
      <ellipse cx="12" cy="19" rx="9" ry="2.6" fill={color}/>
      {/* middle stone */}
      <ellipse cx="11.2" cy="13.5" rx="6.3" ry="2.4" fill={color}/>
      {/* top stone */}
      <ellipse cx="12.6" cy="8.5" rx="3.6" ry="2.0" fill={color}/>
      {/* tiny topper */}
      <circle cx="12.2" cy="4.6" r="1.1" fill={color}/>
    </svg>
  );
}

function CairnWordmark({ size = 22, color, theme }) {
  const t = theme || CAIRN_LIGHT;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      fontFamily: '"Newsreader", Georgia, serif', fontWeight: 500,
      fontSize: size + 4, letterSpacing: '-0.01em',
      color: color || t.ink,
    }}>
      <CairnGlyph size={size} color={color || t.accent}/>
      <span>Cairn</span>
    </span>
  );
}

// ── Icon set (lucide-style line icons, hand-picked) ────────
// Inlined so we don't depend on a runtime UMD. All paths from lucide.dev (ISC).
const ICON_PATHS = {
  'arrow-up':       'M12 19V5 M5 12l7-7 7 7',
  'arrow-down':     'M12 5v14 M19 12l-7 7-7-7',
  'chevron-right':  'm9 18 6-6-6-6',
  'chevron-down':   'm6 9 6 6 6-6',
  'chevron-left':   'm15 18-6-6 6-6',
  'plus':           'M5 12h14 M12 5v14',
  'x':              'M18 6 6 18 M6 6l12 12',
  'check':          'M20 6 9 17l-5-5',
  'pencil':         'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z M15 5l4 4',
  'trash':          'M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M10 11v6 M14 11v6',
  'mail':           'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6',
  'mail-check':     'M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8 M22 6l-10 7L2 6 M16 19l2 2 4-4',
  'user-plus':      'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 8v6 M19 11h6',
  'users':          'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  'more-horizontal':'M5 12h.01 M12 12h.01 M19 12h.01',
  'more-vertical':  'M12 5h.01 M12 12h.01 M12 19h.01',
  'log-out':        'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  'arrow-left':     'M19 12H5 M12 19l-7-7 7-7',
  'search':         'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3',
  'list-plus':      'M11 12H3 M16 6H3 M16 18H3 M18 9v6 M21 12h-6',
  'star':           'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z',
  'compass':        'm16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
  'film':           'M7 3v18 M3 7.5h4 M3 12h18 M3 16.5h4 M17 3v18 M17 7.5h4 M17 16.5h4 M3 21h18a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2z',
  'book-open':      'M12 7v14 M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z',
  'map-pin':        'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0 M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  'gift':           'M20 12v10H4V12 M2 7h20v5H2z M12 22V7 M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7 M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7',
  'utensils':       'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2 M7 2v20 M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3z',
  'sun':            'M12 2v2 M12 20v2 M4.93 4.93l1.41 1.41 M17.66 17.66l1.41 1.41 M2 12h2 M20 12h2 M4.93 19.07l1.41-1.41 M17.66 6.34l1.41-1.41 M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  'moon':           'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z',
  'feather':        'M12.67 19a2 2 0 0 0 1.416-.586l6.154-6.172a6 6 0 0 0-8.49-8.49L5.586 9.914A2 2 0 0 0 5 11.328V18a1 1 0 0 0 1 1z M16 8 2 22 M17.5 15H9',
  'smartphone':     'M5 2h14a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z M12 18h.01',
  'trash-2':        'M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M10 11v6 M14 11v6',
  'rotate-ccw':     'M3 12a9 9 0 1 0 3-6.7L3 8 M3 3v5h5',
  'circle':         'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
  'shield':         'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
  'slash':          'M22 2 2 22 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
  'user-x':         'M14.5 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8z M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2 M17 5l5 5 M22 5l-5 5',
  'user-check':     'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M16 11l2 2 4-4',
  'inbox':          'M22 12h-6l-2 3h-4l-2-3H2 M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
  'bell':           'M10.268 21a2 2 0 0 0 3.464 0 M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326z',
  'lock':           'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z M7 11V7a5 5 0 0 1 10 0v4',
};
function Icon({ name, size = 20, color = 'currentColor', strokeWidth = 1.75, style }) {
  const d = ICON_PATHS[name];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'inline-block', flexShrink: 0, ...style }}>
      {d && d.split(' M').map((seg, i) => (
        <path key={i} d={i === 0 ? seg : 'M' + seg}/>
      ))}
    </svg>
  );
}

// ── Vote indicator ──────────────────────────────────────────
// style: 'ascii' | 'weighted' | 'bar'
function VoteIndicator({ value, style = 'ascii', theme, width = 44 }) {
  const t = theme || CAIRN_LIGHT;
  const color = value > 0 ? t.sage : value < 0 ? t.ember : t.stone;

  if (style === 'bar') {
    // 7 dots, center is "0" position; fill outward
    const dots = [];
    for (let i = -3; i <= 3; i++) {
      let active = false, dotColor = t.stoneLt;
      if (value > 0 && i > 0 && i <= value) { active = true; dotColor = t.sage; }
      if (value < 0 && i < 0 && i >= value) { active = true; dotColor = t.ember; }
      if (i === 0 && value === 0) { active = true; dotColor = t.stone; }
      dots.push(
        <span key={i} style={{
          width: i === 0 ? 4 : 5, height: i === 0 ? 4 : 5,
          borderRadius: 99, background: active ? dotColor : t.stoneLt,
          opacity: active ? 1 : 0.4,
          transition: 'background 120ms, opacity 120ms',
        }}/>
      );
    }
    return (
      <span style={{
        width, display: 'inline-flex', justifyContent: 'center',
        alignItems: 'center', gap: 3,
      }}>{dots}</span>
    );
  }

  const labels = { '-3': '---', '-2': '--', '-1': '-', '0': '=', '1': '+', '2': '++', '3': '+++' };
  const weight = style === 'weighted' ? 300 + Math.abs(value) * 130 : 600;
  return (
    <span style={{
      width, display: 'inline-flex', justifyContent: 'center', alignItems: 'center',
      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      fontSize: 16, fontWeight: weight, color,
      letterSpacing: value === 0 ? 0 : '-0.04em',
      transition: 'color 120ms, font-weight 200ms',
    }}>{labels[value]}</span>
  );
}

// ── Vote control (thumbs + indicator) ──────────────────────
function VoteControl({ value, onChange, style, theme, animate = true }) {
  const t = theme || CAIRN_LIGHT;
  const btn = (dir) => {
    const disabled = (dir > 0 && value === 3) || (dir < 0 && value === -3);
    return (
      <button
        onClick={(e) => { e.stopPropagation(); if (!disabled) onChange(value + dir); }}
        style={{
          width: 36, height: 36, border: 'none', background: 'transparent',
          borderRadius: 10, color: t.inkSoft, cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.35 : 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 120ms, transform 120ms',
        }}
        onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = t.paperAlt; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
      >
        <Icon name={dir > 0 ? 'arrow-up' : 'arrow-down'} size={18} color="currentColor" strokeWidth={2}/>
      </button>
    );
  };
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      {btn(-1)}
      <VoteIndicator value={value} style={style} theme={t}/>
      {btn(+1)}
    </div>
  );
}

Object.assign(window, {
  CAIRN_LIGHT, CAIRN_DARK, useCairnTheme,
  CairnGlyph, CairnWordmark, Icon,
  VoteIndicator, VoteControl,
});
