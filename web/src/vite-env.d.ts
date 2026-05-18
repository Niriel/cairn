/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_API_BASE: string;
	readonly VITE_AUTH_BASE: string;
	readonly VITE_DEV_LOGIN_SHORTCUT: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
