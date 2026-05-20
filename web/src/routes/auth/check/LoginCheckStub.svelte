<!--
	Test-only stub for `$lib/auth/components/LoginCheck.svelte`. Rendered
	by `page.test.ts` via a `vi.mock(..., factory)` so the route test can
	assert which `email` prop reaches the check screen without exercising
	the real component's resend logic. Single consumer — colocated next
	to the test rather than under `__mocks__/` per
	`.claude/skills/writing-tests.md`'s ≥2-consumer rule.
-->
<script lang="ts">
	type Props = { email: string };
	let { email }: Props = $props();
</script>

<div data-test="login-check-stub" data-test-email={email}></div>
