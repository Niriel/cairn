import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import svelteParser from 'svelte-eslint-parser';

/** @type {import('eslint').Linter.Config[]} */
export default [
	{
		ignores: [
			'.svelte-kit/**',
			'build/**',
			'dist/**',
			'coverage/**',
			'playwright-report/**',
			'test-results/**',
			'node_modules/**'
		]
	},
	js.configs.recommended,
	...ts.configs.recommendedTypeChecked,
	...svelte.configs['flat/recommended'],
	{
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				tsconfigRootDir: import.meta.dirname
			},
			globals: {
				...globals.browser,
				...globals.node
			}
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.js', '**/*.svelte.ts'],
		languageOptions: {
			parser: svelteParser,
			parserOptions: {
				parser: ts.parser
			}
		}
	},
	{
		// Build/test tooling files run in Node and aren't part of the app's typed graph.
		files: [
			'*.config.{js,ts}',
			'svelte.config.js',
			'vite.config.ts',
			'vitest.setup.ts',
			'playwright.config.ts'
		],
		...ts.configs.disableTypeChecked
	},
	{
		// SvelteKit excludes the service worker from the app tsconfig (it needs the
		// WebWorker lib, not DOM), so the typed project service can't resolve it.
		// svelte-check type-checks it separately; here we lint it untyped.
		files: ['src/service-worker.ts'],
		...ts.configs.disableTypeChecked
	},
	{
		rules: {
			'no-console': ['warn', { allow: ['warn', 'error'] }],
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
		}
	},
	prettier
];
