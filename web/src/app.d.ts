// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	// Build-time constants injected by build-defines.ts.
	const __APP_VERSION__: string;
	const __BUILD_DATE__: string;

	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		interface PageState {
			cairnGuard?: true;
			cairnGuardId?: string;
		}
		// interface Platform {}
	}
}

export {};
