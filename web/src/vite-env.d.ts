/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_API_BASE: string;
	readonly VITE_AUTH_BASE: string;
	readonly VITE_DEV_LOGIN_SHORTCUT: string;
	readonly VITE_DEV_LOGIN_PASSWORD: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
