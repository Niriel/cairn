export const TOMBSTONE_UID = '00000000-0000-0000-0000-000000000000';

/**
 * Standard size, in px, for an interactive control's icon glyph (chevrons,
 * top-bar actions, the ⋮ More button, nav-row leads). Paired with the
 * `--tap-target` CSS token: the glyph is this size, centred inside a
 * `--tap-target`-sized hit area. Icon-button components (IconButton,
 * MoreButton, RefreshButton) default to it so call sites don't repeat it.
 * See docs/ui.md → "Tap targets and icon sizing".
 */
export const ICON_SIZE = 24;
