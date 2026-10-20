<script lang="ts">
	import LegalPage from '$lib/legal/components/LegalPage.svelte';
	import { formatLegalDate } from '$lib/legal/model/format-date';
	import { GOVERNING_LAW, POLICY_DATES } from '$lib/legal/model/operator';
</script>

<LegalPage
	title="Terms of service"
	sub={`Last updated ${formatLegalDate(POLICY_DATES.terms)}`}
	data-test="terms-screen"
>
	<p class="lede">The deal between you and us, kept short.</p>

	<section>
		<h2>What Cairn is</h2>
		<p>
			A small app for sharing ranked lists with people you know. Free, no ads. Anyone can register;
			lists are shared by invitation.
		</p>
	</section>

	<section>
		<h2>Your account</h2>
		<p>
			You're responsible for what you put on lists and who you invite. Nothing illegal, harassing,
			or infringing someone else's rights. Don't try to break the service for other people.
		</p>
	</section>

	<section>
		<h2>Your content</h2>
		<p>
			What you write stays yours. You let us store it and show it to the people you share it with,
			and nothing more.
		</p>
	</section>

	<section>
		<h2>Our promises</h2>
		<p>
			We'll do our best to keep Cairn running and your data safe. But Cairn is provided as-is,
			without warranty, to the extent the law allows. It's run by one person; treat it as such.
		</p>
	</section>

	<section>
		<h2>Suspension</h2>
		<p>
			If an account is used for abuse — spam, harassment, attempts to break the service — we may
			suspend or delete it. You won't get a notice in the app; a suspended account simply can't sign
			in. But you can write to us to ask why.
		</p>
	</section>

	<section>
		<h2>Ending the deal</h2>
		<p>
			You can delete your account at any time from Settings. We may shut Cairn down, with at least
			30 days' notice in the app — and by e-mail, if you've added a recovery address — so you can
			download your data first.
		</p>
	</section>

	<section>
		<h2>Liability</h2>
		<p>
			To the extent the law allows, we're not liable for indirect or consequential losses from using
			Cairn. Your mandatory rights as a consumer are unaffected.
		</p>
	</section>

	<section>
		<h2>Governing law</h2>
		<p>
			These terms are governed by {GOVERNING_LAW.law}. Disputes go to {GOVERNING_LAW.court}, unless
			the consumer-protection rules of the country you live in say otherwise.
		</p>
	</section>
</LegalPage>
