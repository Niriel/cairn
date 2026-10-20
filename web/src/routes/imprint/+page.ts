import { redirect } from '@sveltejs/kit';

import { resolve } from '$app/paths';

// The imprint moved under the About hub; this URL was shared before it did.
export function load() {
	redirect(308, resolve('/about/imprint'));
}
