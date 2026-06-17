# HTML email formatting

HTML email is not the web. Email clients are not browsers. The same CSS that
works perfectly in Chrome may be silently discarded by Gmail, mangled by
Outlook, or replaced wholesale by Yahoo Mail. This document records what
Cairn's emails must do to render acceptably across all of them.

## The fundamental constraint: no shared document

When a web browser renders a page, it owns the whole document. When an email
client renders an HTML email, it typically embeds the email inside its own
HTML page. Webmail clients (Gmail, Yahoo, ProtonMail, Outlook.com) cannot have
two `<body>` tags, so they strip yours and replace it with a `<div>`. Desktop
clients (Outlook on Windows, Apple Mail) do similar things — Outlook on Windows
renders HTML using Word's layout engine, not a browser engine.

The practical consequence: **never rely on document-level elements or CSS
cascades**. Styles on `<html>` and `<body>` may or may not survive. External
stylesheets won't be fetched. `<style>` blocks are stripped by Gmail and
several others. Everything must be inline.

## Layout: tables only

`display:flex`, `display:grid`, `display:inline-block`, `float`, `position` —
none of these work reliably. The only layout model with broad support is the
HTML table. Use nested `<table>` elements for every structural decision:
centering content, creating a max-width container, building a button.

```html
<!-- Centering + max-width -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
	<tr>
		<td align="center" style="padding:40px 24px;">
			<table width="480" cellpadding="0" cellspacing="0" border="0">
				<tr>
					<td>Content here.</td>
				</tr>
			</table>
		</td>
	</tr>
</table>
```

Always set `cellpadding="0" cellspacing="0" border="0"` on every `<table>` —
these attributes reset the browser/client defaults that would otherwise add
unwanted spacing and borders.

Use `width="480"` as an HTML attribute (not CSS `width:480px`) on the inner
table. HTML attributes survive client transformations that strip inline styles.

## Spacing: td padding, not margin

`margin` has only ~61% support across email clients. Use `padding` on `<td>`
cells instead. `padding` reaches ~88% — still not perfect, but the degradation
is minor (slightly tighter spacing, not broken layout).

Do not use `margin:0` on headings and paragraphs to override browser defaults.
Instead, avoid `<p>` and heading tags for body text and put plain text directly
in `<td>` cells. Reserve `<h2>` etc. for the brand name where the default
heading size is actually wanted.

## Colour: attributes over CSS

CSS `background` on `<body>` or as a general property reaches only ~56% of
clients. The HTML `bgcolor` attribute on `<td>` is much more reliable — email
clients that strip CSS still honour HTML attributes.

```html
<!-- Unreliable -->
<td style="background:#111;">...</td>

<!-- Reliable -->
<td bgcolor="#111" style="background:#111;">...</td>
```

Setting both is belt-and-braces: clients that support CSS use `background`;
clients that don't fall back to `bgcolor`. For text colour, inline
`style="color:#fff;"` is fine — `color` has broad CSS support in email.

## Typography: tags over CSS where possible

`font-weight:bold` reaches ~77% of clients. The `<b>` tag is older and more
universally understood. Use `<b>` for bold text inside email bodies.
`font-weight` as CSS may still be set alongside it for clients that do support
it, but `<b>` is the load-bearing fallback.

`font-family` and `font-size` as inline CSS on a `<td>` are fine — they have
broad support and degrade gracefully (the client's default font is a reasonable
fallback).

## The `<body>` element

Every webmail client replaces `<body>` with a `<div>` when embedding the email
into its own document. Styles on `<body>` are therefore unreliable. This cannot
be fixed — even a bare `<body>` with no attributes flags the compatibility
checker.

The correct approach: put nothing load-bearing on `<body>`. Only `margin:0;
padding:0` belongs there (to reset the default body margin in clients that do
honour it). Move `font-family`, `color`, and all layout styles to the outermost
wrapper `<td>`.

```html
<!-- Correct -->
<body style="margin:0;padding:0;">
	<table width="100%" ...>
		<tr>
			<td style="font-family:sans-serif;color:#111;padding:40px 24px;">...</td>
		</tr>
	</table>
</body>
```

## Buttons (call-to-action links)

Buttons need the most care. The naive approach — an `<a>` styled with
`display:inline-block`, `background`, `padding`, and `border-radius` — fails
on multiple counts:

- `display:inline-block`: ~57% support
- `border-radius`: ~64% support (zero in Outlook on Windows)
- `background` on `<a>`: ~56% support

The reliable pattern is a nested table where the `<td>` provides the background
and padding, and the `<a>` provides only the link and text styling:

```html
<table cellpadding="0" cellspacing="0" border="0">
	<tr>
		<td bgcolor="#111" style="padding:12px 24px;">
			<a href="{{ .URL }}" style="color:#fff;text-decoration:none;">
				<b>Button text</b>
			</a>
		</td>
	</tr>
</table>
```

This sacrifices rounded corners (Outlook cannot do them without VML, which is
not worth the complexity for Cairn's current emails) but the button looks and
works correctly everywhere.

## What to avoid

| Avoid                                    | Use instead                                |
| ---------------------------------------- | ------------------------------------------ |
| `<style>` blocks                         | Inline `style=""` attributes               |
| CSS `background` alone                   | `bgcolor` attribute + CSS `background`     |
| `margin` for spacing                     | `padding` on `<td>`                        |
| `display:inline-block` / `flex` / `grid` | `<table>` layout                           |
| `border-radius`                          | Accept square corners                      |
| `font-weight:bold` alone                 | `<b>` tag (+ CSS alongside)                |
| Styles on `<body>`                       | Styles on the outermost `<td>`             |
| `<p>` for body text spacing              | Plain text in `<td>` with `padding-bottom` |
| External stylesheets                     | Everything inline                          |
| Images without `alt`                     | Always set `alt=""` at minimum             |

## Realistic expectations

Even with all of the above, a Mailpit HTML check will flag:

- **`<body>` element** — unavoidable; the warning is structural, not a
  reflection of anything wrong with the template.
- **`margin` on headings** (`<h2>`, `<h3>`) — acceptable; heading defaults
  are cosmetic.
- **`padding` on `<td>`** — ~12% partial support; degrades to tighter spacing,
  not broken layout.

A score of ~95% from Mailpit's checker is the practical ceiling for a real
email template. Chasing 100% requires either eliminating all CSS (resulting in
completely unstyled email) or using VML hacks for Outlook that add significant
complexity. Neither is appropriate for Cairn's current needs.

## Reference

- GoTrue template loading and the dev/prod delivery mechanism:
  [`docs/gotrue-templates.md`](gotrue-templates.md)
- Cairn's current magic-link template:
  [`web/static/gotrue/templates/magic_link.html`](../web/static/gotrue/templates/magic_link.html)
