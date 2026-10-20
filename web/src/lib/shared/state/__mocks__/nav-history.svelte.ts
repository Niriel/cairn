// Controllable stand-in for the real nav-history store. A `$state` proxy (not a
// plain object) so a consumer test can flip `navHistory.canGoBack` and have
// BackOrHome re-render — same rationale as the network mock. Starts as a cold
// load: no Cairn page behind the current one.
export const navHistory = $state<{ canGoBack: boolean }>({ canGoBack: false });
