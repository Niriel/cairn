// Recovery mail for the auth BFF. GoTrue can't deliver these — the login handle
// is the non-deliverable <uid>@cairn.internal — so the BFF mails the recovery
// codes itself, reusing the same SMTP_* env GoTrue is configured with (dev points
// at Mailpit on localhost:1025). Two flows share this module: verify (an
// authenticated user proving a new recovery e-mail) and reset (a signed-out user
// redeeming a code). Both mails carry a 6-digit code and no link.
//
// Never log the address, the code, or the message (docs/logging.md).

import nodemailer from 'nodemailer';

// Read per-call (not cached) so tests/redeploys see current env. Dev defaults to
// Mailpit; an empty SMTP_USER means no auth (Mailpit accepts unauthenticated).
function smtp() {
	return {
		host: process.env.SMTP_HOST ?? 'localhost',
		port: Number(process.env.SMTP_PORT ?? '1025'),
		user: process.env.SMTP_USER ?? '',
		pass: process.env.SMTP_PASS ?? '',
		from: process.env.SMTP_FROM ?? 'Cairn <no-reply@cairn.local>'
	};
}

// The minimal shape the send functions need. Decoupled from nodemailer's own
// types so tests can inject a recording stub without constructing a Transporter.
export interface MailTransport {
	sendMail(opts: { from: string; to: string; subject: string; text: string }): Promise<unknown>;
}

// A test override wins; otherwise a real nodemailer transport is built once and
// reused (env is fixed for a process's life in prod). setMailTransport(null)
// restores the real path and clears the cache.
let override: MailTransport | null = null;
let cached: MailTransport | null = null;

export function setMailTransport(t: MailTransport | null): void {
	override = t;
	cached = null;
}

function transport(): MailTransport {
	if (override) return override;
	if (!cached) {
		const c = smtp();
		cached = nodemailer.createTransport({
			host: c.host,
			port: c.port,
			auth: c.user ? { user: c.user, pass: c.pass } : undefined
		});
	}
	return cached;
}

// British-English copy, "e-mail" hyphenated, a 6-digit code (no link), and the
// "ignore this if you didn't ask" reassurance. Pure so they can be asserted
// directly. The code expires in one hour (the token's expires_at, set in the DB).
export function verifyEmailMessage(code: string): { subject: string; text: string } {
	return {
		subject: 'Confirm your recovery e-mail',
		text:
			'Someone asked to add this address as a recovery e-mail for a Cairn ' +
			'account.\n\n' +
			`Your confirmation code is: ${code}\n\n` +
			'Enter it in Cairn to confirm this address. The code expires in one hour.\n\n' +
			"If you didn't ask for this, you can safely ignore this e-mail.\n"
	};
}

export function resetPasswordMessage(code: string): { subject: string; text: string } {
	return {
		subject: 'Reset your Cairn password',
		text:
			'Someone asked to reset the password for a Cairn account linked to this ' +
			'address.\n\n' +
			`Your reset code is: ${code}\n\n` +
			'Enter it in Cairn to set a new password. The code expires in one hour.\n\n' +
			"If you didn't ask for this, you can safely ignore this e-mail — your " +
			'password will not change.\n'
	};
}

export async function sendVerifyCode(to: string, code: string): Promise<void> {
	const { subject, text } = verifyEmailMessage(code);
	await transport().sendMail({ from: smtp().from, to, subject, text });
}

export async function sendResetCode(to: string, code: string): Promise<void> {
	const { subject, text } = resetPasswordMessage(code);
	await transport().sendMail({ from: smtp().from, to, subject, text });
}
