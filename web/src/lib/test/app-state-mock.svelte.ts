// Shared `$state`-backed mock for `$app/state`. Tests reassign
// `page.url = new URL(...)` or `page.params = { ... }` mid-test (or
// before render) and the change propagates through `$derived` / `$effect`
// because the backing is a rune. Used by the callback, login, check, and
// items routes' colocated tests.
//
// Imported via the un-suffixed virtual path `$lib/test/app-state-mock.svelte`
// — the `.ts` extension is implied by Vite's resolver.

let _url = $state(new URL('http://localhost/'));
let _params = $state<Record<string, string>>({});

export const page = {
	get url() {
		return _url;
	},
	set url(v: URL) {
		_url = v;
	},
	get params() {
		return _params;
	},
	set params(v: Record<string, string>) {
		_params = v;
	}
};
