import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { WeatherProvider } from '../src/provider.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { USER_AGENT } from '../src/constants.js';
import {
  FIXTURE_NOW,
  MONTREAL,
  fixture,
  installFetch,
  json,
  montrealRoutes,
} from './helpers/fakeFetch.js';

let fake;
afterEach(() => fake?.restore());

function createProvider(config = {}, clock = { now: FIXTURE_NOW }) {
  const statuses = [];
  const provider = new WeatherProvider({
    getConfig: () => ({ ...DEFAULT_CONFIG, ...config }),
    now: () => clock.now,
    onStatus: (s) => statuses.push(s),
    logger: { info() {}, warn() {}, error() {}, debug() {} },
  });
  return { provider, statuses, clock };
}

const request = { ...MONTREAL, language: 'fr', units: 'metric' };
const pelmorexCalls = (calls) => calls.filter((c) => c.url.includes('pelmorex')).length;

test('MétéoMédia answers, enriched with the ECCC UV index, with our User-Agent', async () => {
  fake = installFetch(montrealRoutes());
  const { provider, statuses } = createProvider();
  const weather = await provider.getWeather(request);
  assert.equal(
    weather.temperature,
    fixture('pelmorex-montreal-observation.json').observation.temperature,
  );
  assert.ok(Number.isFinite(weather.uv_index));
  assert.deepEqual(statuses.at(-1), { ok: true, source: 'pelmorex' });
  assert.ok(fake.calls.every((c) => c.headers['User-Agent'] === USER_AGENT));
  assert.deepEqual(
    weather.images.map((i) => i.key),
    ['radar'],
  );
});

test('the snapshot is cached 10 minutes; concurrent requests share one fetch', async () => {
  fake = installFetch(montrealRoutes());
  const { provider, clock } = createProvider();
  await Promise.all([provider.getWeather(request), provider.getWeather(request)]);
  assert.equal(pelmorexCalls(fake.calls), 3);
  clock.now += 9 * 60_000;
  await provider.getWeather({ ...request, units: 'us', language: 'en' });
  assert.equal(pelmorexCalls(fake.calls), 3, 'served from the cache, whatever the units');
  clock.now += 2 * 60_000;
  await provider.getWeather(request);
  assert.equal(pelmorexCalls(fake.calls), 6);
});

test('the ECCC city page takes over when MétéoMédia fails', async () => {
  fake = installFetch(montrealRoutes({ routes: [[/pelmorex/, () => json({}, 503)]] }));
  const { provider, statuses } = createProvider();
  const weather = await provider.getWeather(request);
  const cc = fixture('eccc-citypage-montreal.json').properties.currentConditions;
  assert.equal(weather.temperature, cc.temperature.value.en);
  assert.deepEqual(statuses.at(-1), { ok: true, source: 'eccc' });
});

test('without fallback, a MétéoMédia failure is an error', async () => {
  fake = installFetch(montrealRoutes({ routes: [[/pelmorex/, () => json({}, 503)]] }));
  const { provider, statuses } = createProvider({ fallback_source: 'none' });
  await assert.rejects(provider.getWeather(request), /HTTP 503/);
  assert.equal(statuses.at(-1).ok, false);
  assert.ok(!fake.calls.some((c) => c.url.includes('citypage')));
});

test('when every source fails, the last snapshot is served for 3 hours', async () => {
  let down = false;
  const failing = () => (down ? json({}, 500) : undefined);
  fake = installFetch([
    [/pelmorex|citypage/, (url) => failing() ?? montrealRoutes().find(([p]) => p.test(url))[1]()],
    ...montrealRoutes(),
  ]);
  const { provider, clock } = createProvider();
  const fresh = await provider.getWeather(request);
  down = true;
  clock.now += 60 * 60_000;
  const stale = await provider.getWeather(request);
  assert.equal(stale.temperature, fresh.temperature);
  clock.now += 3 * 60 * 60_000;
  await assert.rejects(provider.getWeather(request));
});

test('official alerts at the house, cached 5 minutes, and kept on a failed refresh', async () => {
  const quebec = { latitude: 46.8, longitude: -70.8, language: 'fr', units: 'metric' };
  let alertsDown = false;
  fake = installFetch([
    [/weather-alerts/, () => (alertsDown ? json({}, 500) : json(fixture('eccc-alerts.json')))],
    ...montrealRoutes(),
  ]);
  const { provider, clock } = createProvider();
  const weather = await provider.getWeather(quebec);
  assert.deepEqual(
    weather.alerts.map((a) => [a.event, a.severity, a.type]),
    [['Avis de gel', 'moderate', 'cold']],
  );
  alertsDown = true;
  clock.now += 6 * 60_000;
  const again = await provider.getWeather(quebec);
  assert.equal(again.alerts.length, 1, 'a failed call does not erase an alert');
});

test('alerts disabled: no call, no alert', async () => {
  fake = installFetch(montrealRoutes());
  const { provider } = createProvider({ eccc_alerts: false });
  const weather = await provider.getWeather({ ...request, latitude: 46.8, longitude: -70.8 });
  assert.deepEqual(weather.alerts, []);
  assert.ok(!fake.calls.some((c) => c.url.includes('weather-alerts')));
});

test('outside Canada: MétéoMédia only, no ECCC call, no radar', async () => {
  fake = installFetch(montrealRoutes());
  const { provider } = createProvider();
  const weather = await provider.getWeather({ ...request, latitude: 48.85, longitude: 2.35 });
  assert.ok(!fake.calls.some((c) => c.url.includes('weather.gc.ca')));
  assert.equal(weather.images, undefined);
});

test('synthetic feels-like alerts are opt-in and untyped', async () => {
  const cold = fixture('pelmorex-iqaluit-observation.json');
  cold.observation.temperature = -30;
  cold.observation.wind.speed = 40;
  fake = installFetch(
    montrealRoutes({ routes: [[/pelmorex\.com\/api\/v1\/observation/, () => json(cold)]] }),
  );
  const off = createProvider().provider;
  assert.deepEqual((await off.getWeather(request)).alerts, []);
  const on = createProvider({ feels_like_alerts: true }).provider;
  const [alert] = (await on.getWeather(request)).alerts;
  assert.equal(alert.severity, 'severe'); // wind chill -45: very high risk
  assert.equal(alert.type, undefined);
  assert.match(alert.event, /Refroidissement éolien/);
});

test('invalid coordinates are refused', async () => {
  fake = installFetch([]);
  const { provider } = createProvider();
  await assert.rejects(provider.getWeather({ ...request, latitude: null }), /coordinates/);
});

test('only the radar image key is served', async () => {
  fake = installFetch([]);
  const { provider } = createProvider();
  await assert.rejects(provider.getImage('other'), /Unknown image/);
  await assert.rejects(provider.getImage('radar'), /No location/);
  const disabled = createProvider({ radar_image: false }).provider;
  await assert.rejects(disabled.getImage('radar'), /Unknown image/);
});
