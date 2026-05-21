// Shared `$state`-backed mock for `$app/state`. Tests reassign
// `page.url = new URL(...)` mid-test (or before render) and the change
// propagates through `$derived` / `$effect` because the backing is a
// rune. Used by the callback, login, and check routes' colocated tests.
//
// Imported via the un-suffixed virtual path `$lib/test/app-state-mock.svelte`
// — the `.ts` extension is implied by Vite's resolver.

let _url = $state(new URL('http://localhost/'));

export const page = {
	get url() {
		return _url;
	},
	set url(v: URL) {
		_url = v;
	}
};
