import { redirect } from '@sveltejs/kit';

import { resolve } from '$app/paths';

// The imprint moved under the About hub; this URL was shared before it did.
// The 308 is nominal: under `ssr = false` the redirect runs in the client
// router and never produces an HTTP response.
export function load() {
	redirect(308, resolve('/about/imprint'));
}
