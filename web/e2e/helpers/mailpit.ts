// Read recovery / reset-code e-mails out of Mailpit during E2E runs. Mailpit's
// API is two-step (list → fetch body); this helper hides that so the spec stays
// readable.

const MAILPIT_BASE = 'http://localhost:8025';

interface MailpitListMessage {
	ID: string;
	To: Array<{ Address: string }>;
	Subject: string;
}

interface MailpitListResponse {
	messages: MailpitListMessage[];
}

interface MailpitMessage {
	Text: string;
}

/**
 * Poll Mailpit until a message addressed to `email` whose subject contains
 * `subjectIncludes` arrives, then return its six-digit code.
 *
 * The recovery verify/reset mails are plain text with no link, and both go to
 * the same recovery address, so the subject disambiguates which step's code
 * this is. Filtering by the (unique-per-run) recipient keeps it safe under
 * parallel specs.
 */
export async function waitForRecoveryCode(
	email: string,
	subjectIncludes: string,
	timeoutMs = 10_000
): Promise<string> {
	const target = email.toLowerCase();
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		const listRes = await fetch(`${MAILPIT_BASE}/api/v1/messages`);
		if (listRes.ok) {
			const list = (await listRes.json()) as MailpitListResponse;
			const match = list.messages.find(
				(m) =>
					m.To.some((to) => to.Address.toLowerCase() === target) &&
					m.Subject.includes(subjectIncludes)
			);
			if (match) {
				const msgRes = await fetch(`${MAILPIT_BASE}/api/v1/message/${match.ID}`);
				if (!msgRes.ok) {
					throw new Error(
						`Mailpit returned ${msgRes.status} fetching message ${match.ID} for ${email}`
					);
				}
				const msg = (await msgRes.json()) as MailpitMessage;
				return extractCode(msg.Text, email);
			}
		}
		await sleep(200);
	}

	throw new Error(
		`Timed out after ${timeoutMs}ms waiting for "${subjectIncludes}" email to ${email}`
	);
}

/**
 * Resolve `true` if NO message to `email` with a subject containing
 * `subjectIncludes` shows up within `windowMs`. Used to assert the
 * anti-enumeration guarantee: a forgot-password for an unknown username must
 * send nothing.
 */
export async function expectNoRecoveryMail(
	email: string,
	subjectIncludes: string,
	windowMs = 3000
): Promise<boolean> {
	try {
		await waitForRecoveryCode(email, subjectIncludes, windowMs);
		return false;
	} catch {
		return true;
	}
}

function extractCode(text: string, email: string): string {
	const codeMatch = text.match(/\b\d{6}\b/);
	if (!codeMatch) {
		throw new Error(`No six-digit code found in recovery e-mail to ${email}`);
	}
	return codeMatch[0];
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
