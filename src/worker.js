// Loaner cars — Cloudflare Worker + D1.
// The app (public/) is a built React bundle that stores its data as three JSON
// documents in D1 (app_state) through /api/state/<key>. This Worker:
//   - checks Cloudflare Access login on every request (replaces the old shared password)
//   - serves the app and the state API to staff
//   - serves /api/summary (past-due loaners, expirations) to staff and to the
//     morning-report service token — nothing else is open to the service token.

import { identify } from './auth.js';
import { buildSummary, localToday } from './summary.js';

const STATE_KEYS = new Set(['loanerVehicles2', 'loanerAgreements2', 'loanerReservations2']);

const json = (body, init = {}) => new Response(JSON.stringify(body), {
  ...init,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...(init.headers || {}) },
});

async function readState(env, key) {
  const row = await env.DB.prepare('select value from app_state where key = ?').bind(key).first();
  return row ? JSON.parse(row.value) : null;
}

async function handleStateRequest(request, env, key) {
  if (!STATE_KEYS.has(key)) return json({ error: 'Unknown state key' }, { status: 404 });

  if (request.method === 'GET') {
    const row = await env.DB.prepare('select value, updated_at from app_state where key = ?').bind(key).first();
    return json({ exists: Boolean(row), value: row ? JSON.parse(row.value) : null, version: row ? row.updated_at : null });
  }

  if (request.method === 'PUT') {
    const body = await request.json().catch(() => null);
    if (!body || !('value' in body)) return json({ error: 'Expected JSON body with a value property' }, { status: 400 });
    const baseVersion = body.baseVersion ?? null;
    const value = JSON.stringify(body.value);
    // Optimistic concurrency: only write if nobody else saved since this client loaded.
    const row = baseVersion === null
      ? await env.DB.prepare(
          "insert into app_state (key, value, updated_at) values (?1, ?2, strftime('%Y-%m-%d %H:%M:%f','now')) on conflict(key) do nothing returning updated_at"
        ).bind(key, value).first()
      : await env.DB.prepare(
          "update app_state set value = ?2, updated_at = strftime('%Y-%m-%d %H:%M:%f','now') where key = ?1 and updated_at = ?3 returning updated_at"
        ).bind(key, value, baseVersion).first();
    if (row) return json({ ok: true, version: row.updated_at });
    const current = await env.DB.prepare('select value, updated_at from app_state where key = ?').bind(key).first();
    return json({
      conflict: true,
      exists: Boolean(current),
      value: current ? JSON.parse(current.value) : null,
      version: current ? current.updated_at : null,
    }, { status: 409 });
  }

  return json({ error: 'Method not allowed' }, { status: 405, headers: { allow: 'GET, PUT' } });
}

async function handleSummary(env) {
  const [vehicles, agreements] = await Promise.all([
    readState(env, 'loanerVehicles2'),
    readState(env, 'loanerAgreements2'),
  ]);
  return json(buildSummary(vehicles || [], agreements || [], localToday(env.TZ || 'America/New_York')));
}

function errorPage(status, message) {
  const safe = String(message).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return new Response(`<!doctype html><meta charset="utf-8"><title>Loaner cars</title>
<body style="font-family:system-ui,sans-serif;max-width:420px;margin:15vh auto;padding:0 16px;color:#2a2723">
<p style="color:#7a746b;font-size:12px;margin:0">Consumers Auto Warehouse</p>
<h1 style="font-size:19px;margin:0 0 8px">Loaner cars</h1><p>${safe}</p>
<p><a href="/cdn-cgi/access/logout">Sign out</a></p></body>`, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isApi = url.pathname.startsWith('/api/');

    let who;
    try {
      who = await identify(request, env);
    } catch (e) {
      const status = e.status || 500, message = e.message || 'Error';
      return isApi ? json({ error: message }, { status }) : errorPage(status, message);
    }

    if (url.pathname === '/api/summary') {
      if (request.method !== 'GET') return json({ error: 'Method not allowed' }, { status: 405 });
      return handleSummary(env);
    }

    // Everything below is staff only.
    if (who.kind !== 'staff') return json({ error: 'Not allowed' }, { status: 403 });

    if (url.pathname.startsWith('/api/state/')) {
      const key = decodeURIComponent(url.pathname.slice('/api/state/'.length));
      return handleStateRequest(request, env, key);
    }
    if (isApi) return json({ error: 'Not found' }, { status: 404 });

    return env.ASSETS.fetch(request);
  },
};
