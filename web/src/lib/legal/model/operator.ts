// Every deployment-specific fact lives here: who runs this Cairn, where it is
// hosted, who processes data on its behalf, and which law applies. The legal
// pages import these values and never spell them out, so a fork edits this one
// file (plus the jurisdiction-specific prose). A guard test rejects these
// values anywhere else under src/. See docs/legal.md.

export const OPERATOR = {
	name: 'Bertrand Delforge',
	addressLines: ['van Imhoffstraat 26', '9721 CP Groningen'],
	country: 'Netherlands',
	email: 'lynn@lynnscape.eu',
	// The town in the About screen's footer line.
	town: 'Groningen',
	// The operator's personal label for their apps — a name, not a legal
	// entity. The legal pages still name the operator as controller and party.
	brand: 'Lynnscape'
} as const;

export const HOSTING_COUNTRY = 'Germany';

export const PROCESSORS = [
	{ name: 'Hetzner Online GmbH', role: 'Server hosting', country: 'Germany' },
	{
		name: 'Gandi SAS',
		role: 'Outgoing e-mail (password-reset codes and service notices)',
		country: 'France'
	}
] as const;

export const SUPERVISORY_AUTHORITY = {
	name: 'Autoriteit Persoonsgegevens',
	url: 'https://www.autoriteitpersoonsgegevens.nl'
} as const;

export const GOVERNING_LAW = {
	law: 'Dutch law',
	court: 'the competent court in Groningen (Rechtbank Noord-Nederland)'
} as const;

export const SOURCE_REPO_URL = 'https://github.com/Niriel/cairn';

// ISO dates; bump one whenever its page's text changes.
export const POLICY_DATES = { privacy: '2026-10-20', terms: '2026-10-20' } as const;
