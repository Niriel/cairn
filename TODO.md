# TODO

1. [ ] **API query hygiene: omit user_id when RLS already scopes the row** —
   PostgREST queries that operate on rows the RLS policy already restricts to
   the current user should not repeat `user_id=eq.<me>` (or equivalent) in the
   query string. RLS is the enforcement layer; duplicating its conditions in
   application code blurs the boundary and creates a maintenance coupling.
   Concrete case already fixed: `DELETE /votes?item_id=eq.<uuid>`. Audit sweep:
   when building new API calls, check whether the targeted rows are already
   scoped by an `authenticated`-role policy keyed on `public.uid()`. Only
   include identity filters where they add information RLS doesn't already
   enforce (e.g. `PATCH /profiles?id=eq.<my-uid>` is fine — PostgREST needs
   the PK to address the right row, not as a security gate).

2. [ ] **Audit inline object types in model files** — scan `src/lib/*/model/*.ts`
   for anonymous inline shapes on exported types (e.g. `{ user_id: string; display_name: string; value: number }[]`)
   and consider extracting them as named exported types. Named types are easier
   to follow at call sites and can be imported by tests and components without
   repeating the shape. Do on a quiet branch; no behaviour change needed.

3. [ ] **Font size setting must scale the whole app, not just the container
   width** — the Settings font-size preference (XS/S/M/L/XL, stored in
   `localStorage`) currently only affects `--app-max-w`. All pixel values in
   the design JSX are specified at Medium; the full app — type sizes, padding,
   row heights, icon sizes, spacing — should scale proportionally when the
   user changes the setting. The mechanism is a single scale factor on the
   root `font-size` with all sizes expressed in `rem` (per `docs/ui.md`
   "Appearance"). Exceptions: the FAB and chrome icon-buttons (back arrow,
   gear) stay at a fixed size regardless of font scale. This is a
   cross-cutting change touching every screen and is out of scope until all
   screens are built.
