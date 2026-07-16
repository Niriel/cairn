import { describe, expect, test } from 'vitest';

import {
	BEARER_AUTH_PATHS,
	COOKIE_PLANT_PATHS,
	LOGOUT_PATHS,
	PUBLIC_AUTH_PATHS,
	SIGNED_IN_REDIRECT_PATHS,
	isSegmentMatch
} from './auth-paths';

describe('isSegmentMatch against PUBLIC_AUTH_PATHS', () => {
	test('exact match on /auth/signin', () => {
		expect(isSegmentMatch('/auth/signin', PUBLIC_AUTH_PATHS)).toBe(true);
	});

	test('trailing slash on /auth/signin/', () => {
		expect(isSegmentMatch('/auth/signin/', PUBLIC_AUTH_PATHS)).toBe(true);
	});

	test('query string on /auth/reset-password?code=x', () => {
		expect(isSegmentMatch('/auth/reset-password?code=x', PUBLIC_AUTH_PATHS)).toBe(true);
	});

	test('sibling-prefix /auth/signinx is NOT a match', () => {
		expect(isSegmentMatch('/auth/signinx', PUBLIC_AUTH_PATHS)).toBe(false);
	});

	test('the retired /auth/login, /auth/check, /auth/callback are NOT public paths', () => {
		expect(isSegmentMatch('/auth/login', PUBLIC_AUTH_PATHS)).toBe(false);
		expect(isSegmentMatch('/auth/check', PUBLIC_AUTH_PATHS)).toBe(false);
		expect(isSegmentMatch('/auth/callback', PUBLIC_AUTH_PATHS)).toBe(false);
	});

	test('unrelated /auth/unknown is not in PUBLIC_AUTH_PATHS', () => {
		expect(isSegmentMatch('/auth/unknown', PUBLIC_AUTH_PATHS)).toBe(false);
	});
});

describe('isSegmentMatch against SIGNED_IN_REDIRECT_PATHS', () => {
	test('matches /auth/signin', () => {
		expect(isSegmentMatch('/auth/signin', SIGNED_IN_REDIRECT_PATHS)).toBe(true);
	});

	test('matches /auth/register', () => {
		expect(isSegmentMatch('/auth/register', SIGNED_IN_REDIRECT_PATHS)).toBe(true);
	});

	test('the retired /auth/login and /auth/check are NOT redirect paths', () => {
		expect(isSegmentMatch('/auth/login', SIGNED_IN_REDIRECT_PATHS)).toBe(false);
		expect(isSegmentMatch('/auth/check', SIGNED_IN_REDIRECT_PATHS)).toBe(false);
	});
});

describe('isSegmentMatch against BEARER_AUTH_PATHS', () => {
	test('matches /auth/user', () => {
		expect(isSegmentMatch('/auth/user', BEARER_AUTH_PATHS)).toBe(true);
	});

	test('matches /auth/user?id=x', () => {
		expect(isSegmentMatch('/auth/user?id=x', BEARER_AUTH_PATHS)).toBe(true);
	});

	test('sibling-prefix /auth/userx is NOT a match', () => {
		expect(isSegmentMatch('/auth/userx', BEARER_AUTH_PATHS)).toBe(false);
	});

	test('/auth/unknown is not in BEARER_AUTH_PATHS', () => {
		expect(isSegmentMatch('/auth/unknown', BEARER_AUTH_PATHS)).toBe(false);
	});
});

describe('isSegmentMatch against COOKIE_PLANT_PATHS', () => {
	test('matches /auth/verify', () => {
		expect(isSegmentMatch('/auth/verify', COOKIE_PLANT_PATHS)).toBe(true);
	});

	test('matches /auth/token', () => {
		expect(isSegmentMatch('/auth/token', COOKIE_PLANT_PATHS)).toBe(true);
	});

	test('matches /auth/token?grant_type=password', () => {
		expect(isSegmentMatch('/auth/token?grant_type=password', COOKIE_PLANT_PATHS)).toBe(true);
	});

	test('does NOT match /auth/signup (adversarial — signup also returns access_token)', () => {
		expect(isSegmentMatch('/auth/signup', COOKIE_PLANT_PATHS)).toBe(false);
	});

	test('sibling-prefix /auth/verifyx is NOT a match', () => {
		expect(isSegmentMatch('/auth/verifyx', COOKIE_PLANT_PATHS)).toBe(false);
	});
});

describe('isSegmentMatch against LOGOUT_PATHS', () => {
	test('matches /auth/signout', () => {
		expect(isSegmentMatch('/auth/signout', LOGOUT_PATHS)).toBe(true);
	});

	test('sibling-prefix /auth/signouts is NOT a match', () => {
		expect(isSegmentMatch('/auth/signouts', LOGOUT_PATHS)).toBe(false);
	});
});

describe('isSegmentMatch with undefined url', () => {
	test('undefined url is never a match', () => {
		expect(isSegmentMatch(undefined, PUBLIC_AUTH_PATHS)).toBe(false);
	});
});
