import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { buildFeelsLikeContent, createWidgets, levelColor } from '../src/widgets.js';
import { WeatherProvider } from '../src/provider.js';
import { Watcher } from '../src/watcher.js';
import { parsePelmorex } from '../src/sources/pelmorex.js';
import { parseCityPage } from '../src/sources/ecccCitypage.js';
import { createFakeGladys } from './helpers/fakeGladys.js';
import { FIXTURE_NOW, fixture, installFetch, montrealRoutes } from './helpers/fakeFetch.js';

let fake;
afterEach(() => fake?.restore());

const load = (city) =>
  parsePelmorex({
    observation: fixture(`pelmorex-${city}-observation.json`),
    hourly: fixture(`pelmorex-${city}-hourly.json`),
    longterm: fixture(`pelmorex-${city}-longterm.json`),
  });

// A hot, humid afternoon derived from the Montréal fixture.
function heatWave() {
  const snapshot = load('montreal');
  const warm = (h) => ({ ...h, temperature: h.temperature + 24, dew_point: 22, is_day: h.is_day });
  return {
    ...snapshot,
    current: { ...warm(snapshot.current), apparent_temperature: 38 },
    hours: snapshot.hours.map(warm),
  };
}

// A cold snap with freezing rain derived from the Iqaluit fixture.
function coldSnap() {
  const snapshot = load('iqaluit');
  return {
    ...snapshot,
    current: { ...snapshot.current, temperature: -32, wind_speed: 30 / 3.6, wind_gust: 60 / 3.6 },
    hours: snapshot.hours.map((h, i) =>
      i === 3 ? { ...h, temperature: -1, weather: 'freezing-rain', rain: 1, precipitation: 1 } : h,
    ),
  };
}

const cases = {
  'Montréal (mild)': load('montreal'),
  'Iqaluit (cold)': load('iqaluit'),
  'heat wave': heatWave(),
  'cold snap': coldSnap(),
  'ECCC fallback': parseCityPage(fixture('eccc-citypage-montreal.json'), 45.51, -73.55, -240),
};

for (const [name, snapshot] of Object.entries(cases)) {
  for (const units of ['metric', 'us']) {
    test(`the widget content is rendered exactly as sent: ${name}, ${units}`, () => {
      const content = buildFeelsLikeContent(snapshot, { units, now: FIXTURE_NOW });
      assert.deepEqual(validateWidgetContent(content), []);
    });
  }
}

test('heat: humidex heading, dew point tile, muggy night', () => {
  const content = buildFeelsLikeContent(heatWave(), { units: 'metric', now: FIXTURE_NOW });
  assert.match(content.components[0].text.fr, /^Humidex \d+$/);
  const tiles = content.components.filter((c) => c.type === 'value');
  assert.ok(tiles.some((t) => t.label.fr === 'Point de rosée'));
  const status = content.components.find((c) => c.type === 'status');
  assert.ok(status.items.some((i) => i.label.fr === 'Nuit étouffante'));
});

test('cold: wind chill heading, gust tile, frostbite delay, black ice', () => {
  const content = buildFeelsLikeContent(coldSnap(), { units: 'metric', now: FIXTURE_NOW });
  assert.match(content.components[0].text.fr, /^Refroidissement éolien −\d+°C$/);
  const tiles = content.components.filter((c) => c.type === 'value');
  assert.ok(tiles.some((t) => t.label.fr === 'Dans les rafales'));
  const items = content.components.find((c) => c.type === 'status').items;
  const frostbite = items.find((i) => i.label.fr === 'Délai de gelure');
  assert.equal(frostbite.value.fr, '2 à 5 min'); // -32 °C at 30 km/h: wind chill -48
  assert.match(items.find((i) => i.label.fr === 'Verglas').value.fr, /^Probable · \d\d:\d\d$/);
  assert.equal(items.find((i) => i.label.fr === 'Source').value.fr, 'MétéoMédia');
});

test('level colors', () => {
  assert.equal(levelColor('comfortable'), 'success');
  assert.equal(levelColor('cold_moderate'), 'info');
  assert.equal(levelColor('heat_discomfort'), 'warning');
  assert.equal(levelColor('cold_very_high'), 'danger');
});

test('the widget resolves the house from its setting', async () => {
  fake = installFetch(montrealRoutes());
  const gladys = createFakeGladys({
    houses: [{ id: '1', name: 'Maison', selector: 'maison', latitude: 45.5, longitude: -73.57 }],
  });
  const provider = new WeatherProvider({ now: () => FIXTURE_NOW });
  const watcher = new Watcher({ gladys, provider, getPreferences: () => ({}) });
  await watcher.refreshHouses();
  const seen = [];
  const { feels_like: widget } = createWidgets({
    provider,
    watcher,
    rememberPreferences: (p) => seen.push(p),
  });
  const content = await widget.get({ settings: {}, language: 'fr', units: 'metric' });
  assert.ok(content.components.length > 3);
  assert.deepEqual(seen, [{ language: 'fr', units: 'metric' }]);
  const missing = await widget.get({
    settings: { house: 'Chalet' },
    language: 'fr',
    units: 'metric',
  });
  assert.match(missing.components[0].text.fr, /Chalet/);
  assert.deepEqual(validateWidgetContent(missing), []);
});
