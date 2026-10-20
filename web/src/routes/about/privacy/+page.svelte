<script lang="ts">
	import LegalPage from '$lib/legal/components/LegalPage.svelte';
	import { formatLegalDate } from '$lib/legal/model/format-date';
	import {
		HOSTING_COUNTRY,
		OPERATOR,
		POLICY_DATES,
		PROCESSORS,
		SUPERVISORY_AUTHORITY
	} from '$lib/legal/model/operator';

	// Every statement on this page is backed by an entry in the claims table in
	// docs/legal.md. Change the system it describes, and this page changes too.
</script>

<LegalPage
	title="Privacy policy"
	sub={`Last updated ${formatLegalDate(POLICY_DATES.privacy)}`}
	data-test="privacy-screen"
>
	<p class="lede">
		Cairn is built with privacy as its first constraint. This page tells you what that means in
		practice — no jargon, no hedging.
	</p>

	<section data-test="privacy-controller">
		<h2>Who's responsible</h2>
		<p>
			Cairn is run by {OPERATOR.name}, {OPERATOR.addressLines.join(', ')}, {OPERATOR.country}, who
			is the data controller for everything on this page. Write to
			<a href="mailto:{OPERATOR.email}">{OPERATOR.email}</a> with any question about your data.
		</p>
	</section>

	<section>
		<h2>What we store</h2>
		<h3>About you</h3>
		<ul>
			<li>Your username, which anyone signed in to Cairn can see.</li>
			<li>Your display name.</li>
			<li>
				Your profile photo, if you upload one. We keep a small square copy; the original you
				uploaded is discarded.
			</li>
			<li>Your password, stored only as a one-way hash. Nobody can read it back.</li>
			<li data-test="privacy-recovery-email">
				A recovery e-mail address, if you choose to add one. We use it to send password-reset codes
				and, rarely, essential service notices such as a shutdown — never for marketing. It is never
				shown to anyone, including the people you share lists with.
			</li>
		</ul>
		<h3>About what you do</h3>
		<p>
			The lists you create or join, their items and notes, your votes, your memberships and
			invitations, the people in your circle and the people you've blocked, and when each of these
			happened.
		</p>
		<h3>Technical</h3>
		<p>
			Our servers keep short technical logs to keep Cairn running. Each service keeps at most about
			50 MB; older lines are deleted automatically. The logs never contain what you write — no list
			names, item names, notes or votes — and they hold no IP addresses. There is no web access log.
		</p>
		<p data-test="privacy-rate-limit">
			When someone tries to sign in or register, the server uses the IP address the attempt came
			from to slow down repeated attempts. That address is held in the server's memory only and is
			never written to disk; it stops counting after 15 minutes.
		</p>
	</section>

	<section>
		<h2>Public lists</h2>
		<p>
			Any member of a list can turn on its public link. Anyone who has that link can then see the
			list's name and description, and each item's name, notes, score and age — without signing in.
			A public link never shows who is a member, who voted or how, or who added or changed anything.
			Turning the link off ends access straight away.
		</p>
	</section>

	<section>
		<h2>Why, and on what basis</h2>
		<p>
			We process your data to run the service you signed up for (GDPR Art. 6(1)(b)). Keeping it
			secure — the in-memory rate limiting, the technical logs and the moderation records below — is
			our legitimate interest (Art. 6(1)(f)).
		</p>
	</section>

	<section>
		<h2>Where it lives</h2>
		<p>These companies process data on our behalf:</p>
		<ul>
			{#each PROCESSORS as processor (processor.name)}
				<li>{processor.name} — {processor.role.toLowerCase()}, {processor.country}.</li>
			{/each}
		</ul>
		<p>
			Cairn runs on one server in {HOSTING_COUNTRY}; everything stays inside the EU. Nothing touches
			Google, Amazon, Microsoft, or any other hyperscaler. There are currently no off-site backups.
		</p>
	</section>

	<section>
		<h2>Who sees it</h2>
		<ul>
			<li>
				The people you share a list with see that list's contents, and who added and voted on what.
			</li>
			<li>Anyone signed in can see your username, display name and photo.</li>
			<li>
				The operator can technically read the database, and only does so to fix problems, to act on
				abuse reports, or when the law requires it.
			</li>
			<li>
				When the operator moderates content, suspends an account or acts on a data request, the
				action is recorded with a reason in an internal audit log that only the operator can read.
			</li>
		</ul>
	</section>

	<section>
		<h2>How long we keep it</h2>
		<ul>
			<li>Your data stays for as long as you have an account.</li>
			<li>
				Deleting your account takes effect immediately. Your profile, photo, password, recovery
				e-mail, votes, memberships, circle, blocks and invitations are erased, along with any list
				you were the only member of. Items and lists you shared with others stay for them, credited
				to "Deleted user".
			</li>
			<li>
				Things you delete inside a list go to that list's bin, where its members can restore them.
			</li>
			<li>
				Audit-log records of moderation and data requests are kept as proof that the action was
				carried out. A record of an account erasure keeps only the account's identifier, not the
				erased data.
			</li>
		</ul>
	</section>

	<section>
		<h2>Your rights</h2>
		<p>Under the GDPR you can:</p>
		<ul>
			<li>
				get a copy of your data, in a portable format — <em
					>Settings → Privacy &amp; data → Download my data</em
				>;
			</li>
			<li>correct it — edit your profile in Settings;</li>
			<li>erase it — <em>Settings → Account → Delete account</em>;</li>
			<li>restrict or object to how we process it — write to us.</li>
		</ul>
		<p>
			If you think we've got something wrong, you can complain to the
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external site (the data protection authority), not an app route -->
			<a href={SUPERVISORY_AUTHORITY.url} rel="noopener">{SUPERVISORY_AUTHORITY.name}</a>, or to the
			data protection authority where you live.
		</p>
	</section>

	<section data-test="privacy-storage">
		<h2>Cookies and on-device storage</h2>
		<p>Cairn keeps a few things on your device, all needed for the app to work for you:</p>
		<ul>
			<li>
				<strong>Two cookies</strong>: one keeps you signed in (it lasts about 30 days and renews
				while you use Cairn), and a short-lived one, about 5 minutes, carries your access to the
				data. Scripts can't read either of them.
			</li>
			<li>
				<strong>Four small settings in your browser's local storage</strong>: your theme, your text
				size, your user id and username (so the app can open offline), and whether you've dismissed
				the install hint. They stay on that device.
			</li>
			<li>
				<strong>An offline cache</strong> of the app's files and the lists you viewed recently, so Cairn
				opens when the network doesn't.
			</li>
		</ul>
		<p>
			All of these are strictly necessary for the service you asked for, which is why there's no
			consent banner (ePrivacy Directive Art. 5(3)). If we ever store anything that isn't, you'll
			see a real consent choice first.
		</p>
	</section>

	<section>
		<h2>No tracking</h2>
		<p>
			No analytics, no tracking pixels, no third-party scripts, no fingerprinting. Fonts are served
			from our own server.
		</p>
	</section>

	<section>
		<h2>Changes</h2>
		<p>
			If this policy changes, the date at the top changes. If a change affects you materially, we'll
			tell you in the app before it takes effect.
		</p>
	</section>
</LegalPage>
