import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createActions } from '../src/actions.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { installFetch, json, montrealRoutes } from './helpers/fakeFetch.js';

let fake;
afterEach(() => fake?.restore());

const watcherAt = (house) => ({ findHouse: () => house });
const MONTREAL_HOUSE = { name: 'Maison', latitude: 45.5017, longitude: -73.5673 };

test('the test button reports every source', async () => {
  fake = installFetch(montrealRoutes());
  const { test_sources: run } = createActions({
    watcher: watcherAt(MONTREAL_HOUSE),
    getConfig: () => DEFAULT_CONFIG,
  });
  const message = await run();
  assert.match(message.fr, /^MétéoMédia : OK \(\d+ °C\) · Environnement Canada : OK \(Montréal\)/);
  assert.match(message.en, /ECCC alerts: OK, 0 active$/);
});

test('a failing source is reported, not thrown', async () => {
  fake = installFetch(montrealRoutes({ routes: [[/pelmorex/, () => json({}, 500)]] }));
  const { test_sources: run } = createActions({
    watcher: watcherAt(MONTREAL_HOUSE),
    getConfig: () => ({ ...DEFAULT_CONFIG, fallback_source: 'none', eccc_alerts: false }),
  });
  assert.equal((await run()).en, 'MétéoMédia: failed (HTTP 500 on /api/v1/hourly)');
});

test('without a located house, the user is told what to do', async () => {
  fake = installFetch([]);
  const { test_sources: run } = createActions({ watcher: watcherAt(undefined) });
  assert.match((await run()).fr, /placez votre maison/);
});

test('outside Canada, the ECCC parts are skipped', async () => {
  fake = installFetch(montrealRoutes());
  const { test_sources: run } = createActions({
    watcher: watcherAt({ latitude: 48.85, longitude: 2.35 }),
    getConfig: () => DEFAULT_CONFIG,
  });
  assert.match((await run()).en, /Outside Canada/);
  assert.ok(!fake.calls.some((c) => c.url.includes('weather.gc.ca')));
});
