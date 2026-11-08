// Login via Cloudflare Access (Google). Access blocks anyone not allowed at the edge;
// the Worker re-verifies the Access JWT on every request as a second check.
// Two kinds of identity come through:
//   - staff:   a Google account on an allowed domain (payload.email)
//   - service: an Access service token (payload.common_name, no email) — only allowed
//              to read /api/summary (the morning Slack report).

let jwks = null, jwksAt = 0;

async function getKeys(teamDomain) {
  if (jwks && Date.now() - jwksAt < 3600000) return jwks;
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('Could not load Access certs');
  const body = await res.json();
  jwks = body.keys || [];
  jwksAt = Date.now();
  return jwks;
}

function b64urlBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
const b64urlJson = s => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

export async function verifyAccessJwt(token, env) {
  const [h, p, sig] = token.split('.');
  if (!h || !p || !sig) throw new Error('Malformed token');
  const header = b64urlJson(h);
  const payload = b64urlJson(p);
  if (header.alg !== 'RS256') throw new Error('Unexpected alg');
  const keys = await getKeys(env.ACCESS_TEAM_DOMAIN);
  const jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) { jwks = null; throw new Error('Unknown signing key'); }
  const key = await crypto.subtle.importKey('jwk', jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key,
    b64urlBytes(sig), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new Error('Bad signature');
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error('Token expired');
  if (payload.nbf && payload.nbf > now + 60) throw new Error('Token not yet valid');
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  const allowedAud = String(env.ACCESS_AUD).split(',').map(x => x.trim()).filter(Boolean);
  if (!aud.some(x => allowedAud.includes(x))) throw new Error('Wrong audience');
  if (payload.iss && payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) throw new Error('Wrong issuer');
  return payload;
}

function cookie(req, name) {
  const c = req.headers.get('Cookie') || '';
  const m = c.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : null;
}

// Returns { kind: 'staff', email } or { kind: 'service', clientId }; throws { status, message }.
export async function identify(req, env) {
  if (env.DEV_MODE === '1') {
    return { kind: 'staff', email: (env.DEV_USER_EMAIL || 'dev@cawcaw.com').toLowerCase() };
  }
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    throw { status: 503, message: 'Login is not configured yet (Cloudflare Access settings missing).' };
  }
  const token = req.headers.get('Cf-Access-Jwt-Assertion') || cookie(req, 'CF_Authorization');
  if (!token) throw { status: 401, message: 'Not signed in.' };
  let payload;
  try {
    payload = await verifyAccessJwt(token, env);
  } catch {
    throw { status: 401, message: 'Sign-in could not be verified.' };
  }
  const email = String(payload.email || '').toLowerCase();
  if (email) {
    const domains = (env.ALLOWED_DOMAINS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (!domains.includes(email.split('@')[1] || '')) {
      throw { status: 403, message: `${email} is not allowed. Use a company Google account.` };
    }
    return { kind: 'staff', email };
  }
  if (payload.common_name) {
    const allowed = (env.SUMMARY_CLIENT_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (allowed.length && !allowed.includes(payload.common_name)) {
      throw { status: 403, message: 'This service token is not allowed.' };
    }
    return { kind: 'service', clientId: payload.common_name };
  }
  throw { status: 403, message: 'Unknown identity.' };
}
