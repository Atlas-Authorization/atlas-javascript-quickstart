// Atlas vanilla-JS quickstart — no framework, just @atlasauth/js.
//
// NOTE: the prebuilt <SignIn> / <UserButton> widgets live in @atlasauth/react
// (they render DOM via React). @atlasauth/js is the framework-agnostic layer
// beneath them: a `FapiClient` plus the flow / OAuth / session helpers those
// widgets are built from. This app wires those primitives by hand.
import {
  FapiClient,
  initialFlow,
  advance,
  startOauthRedirect,
  readRedirectResult,
  stripRedirectParams,
} from '@atlasauth/js';

const client = new FapiClient({
  publishableKey: import.meta.env.VITE_ATLAS_PUBLISHABLE_KEY ?? '',
  baseUrl: import.meta.env.VITE_ATLAS_FRONTEND_API ?? 'https://atlasauth.net',
});

const $ = (id) => document.getElementById(id);
const out = (v) => ($('out').textContent = typeof v === 'string' ? v : JSON.stringify(v, null, 2));

// Read the current session: GET /v1/client returns { session, user, jwt }.
// The session cookie rides along automatically (credentials:'include').
async function render() {
  const res = await client.get('/v1/client');
  const user = res.ok ? res.data?.user : null;
  if (user) {
    $('signed-out').classList.add('hidden');
    $('signed-in').classList.remove('hidden');
    $('who').textContent = `Signed in as ${user.first_name ?? user.id}`;
    out({ user, sessionId: res.data?.session?.id });
  } else {
    $('signed-in').classList.add('hidden');
    $('signed-out').classList.remove('hidden');
    out('Signed out.');
  }
}

// Exchange a completed attempt's one-time ticket for session cookies.
async function exchange(attempt, ticket) {
  await client.post('/v1/client/tickets/exchange', { attempt_id: attempt.id, ticket });
  await render();
}

// Email + password (+ optional emailed/MFA code), driven one step at a time.
async function emailSignIn() {
  let flow = initialFlow;
  flow = await advance(client, flow, { identifier: $('identifier').value });
  if (flow.errors.length) return out(flow.errors);

  flow = await advance(client, flow, { password: $('password').value });
  if (flow.errors.length) return out(flow.errors);

  // If the instance demands a second factor, submit the code field.
  if (flow.attempt && flow.attempt.status !== 'complete' && $('code').value) {
    flow = await advance(client, flow, { code: $('code').value });
  }

  if (flow.attempt?.status === 'complete' && flow.ticket) {
    return exchange(flow.attempt, flow.ticket);
  }
  out({ status: flow.attempt?.status ?? 'unknown', note: 'Enter the code you were sent, if any.' });
}

// Social sign-in via a full-page redirect back to this app.
async function googleSignIn() {
  const start = await startOauthRedirect(client, {
    provider: 'google',
    redirectUrl: window.location.origin,
  });
  if (start) window.location.href = start.authorizationUrl;
  else out('Could not start Google sign-in.');
}

async function signOut() {
  const res = await client.get('/v1/client');
  const sid = res.data?.session?.id;
  if (sid) await client.post(`/v1/client/sessions/${sid}/revoke`);
  await render();
}

// On load, finish an OAuth redirect if we just came back from the provider.
async function boot() {
  const result = readRedirectResult(window.location.search);
  if (result?.ticket) {
    await exchange({ id: result.attemptId }, result.ticket);
    history.replaceState(null, '', stripRedirectParams(window.location.href));
  }
  await render();
}

$('signin').addEventListener('click', () => void emailSignIn());
$('google').addEventListener('click', () => void googleSignIn());
$('signout').addEventListener('click', () => void signOut());
void boot();
