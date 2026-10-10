// -----------------------------------------------------------------------------
// Fake `fetch` for the tests: routes URLs to recorded fixtures, records every
// call, and fails loudly on an unexpected URL. No test touches the network.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { setFetch } from '../../src/http.js';

export function fixture(name) {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
}

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export const binary = (buffer, type = 'image/png') =>
  new Response(buffer, { status: 200, headers: { 'content-type': type } });

/**
 * Install a fake fetch. `routes` is a list of [pattern, handler]: the first
 * pattern (RegExp) matching the URL answers with handler(url, init).
 * Returns { calls, restore }.
 */
export function installFetch(routes) {
  const calls = [];
  const previous = setFetch(async (url, init) => {
    calls.push({ url, headers: init?.headers });
    const route = routes.find(([pattern]) => pattern.test(url));
    if (!route) {
      throw new Error(`Unexpected network call in a test: ${url}`);
    }
    return route[1](url, init);
  });
  return { calls, restore: () => setFetch(previous) };
}

// Routes answering Montréal from the recorded fixtures.
export function montrealRoutes(overrides = {}) {
  return [
    ...(overrides.routes ?? []),
    [
      /pelmorex\.com\/api\/v1\/observation/,
      () => json(fixture('pelmorex-montreal-observation.json')),
    ],
    [/pelmorex\.com\/api\/v1\/hourly/, () => json(fixture('pelmorex-montreal-hourly.json'))],
    [/pelmorex\.com\/api\/v1\/longterm/, () => json(fixture('pelmorex-montreal-longterm.json'))],
    [
      /citypageweather-realtime\/items\?/,
      () => json({ type: 'FeatureCollection', features: [fixture('eccc-citypage-montreal.json')] }),
    ],
    [/citypageweather-realtime\/items\//, () => json(fixture('eccc-citypage-montreal.json'))],
    [/weather-alerts\/items/, () => json(fixture('eccc-alerts.json'))],
  ];
}

// Fixtures were recorded on 2026-10-10 around 12:00 UTC.
export const FIXTURE_NOW = Date.parse('2026-10-10T12:30:00Z');
export const MONTREAL = { latitude: 45.5017, longitude: -73.5673 };
