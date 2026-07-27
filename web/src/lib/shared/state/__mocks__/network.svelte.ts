// Controllable stand-in for the real network store. A `$state` proxy (not a
// plain object) so a consumer test can flip `network.online` and have the
// consumer's effects/deriveds re-fire — same rationale as the session mock.
export const network = $state<{ online: boolean }>({ online: true });
