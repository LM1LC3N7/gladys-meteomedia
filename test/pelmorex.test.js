import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePelmorex, parseDay, parseHour } from '../src/sources/pelmorex.js';
import { windChill } from '../src/feelsLike.js';
import { fixture } from './helpers/fakeFetch.js';

const load = (city) => ({
  observation: fixture(`pelmorex-${city}-observation.json`),
  hourly: fixture(`pelmorex-${city}-hourly.json`),
  longterm: fixture(`pelmorex-${city}-longterm.json`),
});

test('current conditions are converted to the pivot metric units', () => {
  const raw = load('montreal');
  const obs = raw.observation.observation;
  const { current, source, utcOffsetMinutes } = parsePelmorex(raw);
  assert.equal(source, 'pelmorex');
  assert.equal(utcOffsetMinutes, -240); // EDT
  assert.equal(current.temperature, obs.temperature);
  assert.equal(current.apparent_temperature, obs.feelsLike);
  assert.equal(current.wind_speed, obs.wind.speed / 3.6); // km/h -> m/s
  assert.equal(current.wind_gust, obs.wind.gust / 3.6);
  assert.equal(current.pressure, obs.pressure.value * 10); // kPa -> hPa
  assert.equal(current.visibility, obs.visibility);
  assert.equal(current.datetime, new Date(`${obs.time.utc}:00Z`).toISOString());
  assert.equal(typeof current.is_day, 'boolean');
});

test('72 hours and 15 days are parsed', () => {
  const { hours, days } = parsePelmorex(load('montreal'));
  assert.equal(hours.length, 72);
  assert.equal(days.length, 15);
  for (const day of days) {
    assert.ok(day.temperature_min <= day.temperature_max);
    assert.match(day.date, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test('snow counts as water equivalent (10:1) in the precipitation', () => {
  const hour = parseHour({
    time: { local: '2026-01-10T08:00', utc: '2026-01-10T13:00' },
    temperature: { value: -5 },
    rain: { value: 0.5 },
    snow: { value: 2 }, // cm
  });
  assert.equal(hour.precipitation, 2.5);
  assert.equal(hour.snow_cm, 2);
});

test('the dew point is computed when the hourly forecast omits it', () => {
  const { hours } = parsePelmorex(load('montreal'));
  assert.ok(hours.every((h) => Number.isFinite(h.dew_point)));
});

test("today's day uses the day and night halves when max/min are null", () => {
  const raw = load('montreal').longterm.longTerm[0];
  assert.equal(raw.maxTemperature, null);
  const day = parseDay(raw);
  assert.equal(
    day.temperature_max,
    Math.max(raw.day.temperature.value, raw.night.temperature.value),
  );
});

test('MétéoMédia feels-like is close to the ECCC wind chill formula in the cold', () => {
  const { current } = parsePelmorex(load('iqaluit'));
  const computed = windChill(current.temperature, current.wind_speed * 3.6);
  assert.ok(Math.abs(computed - current.apparent_temperature) <= 2);
});

test('a missing observation is replaced by the first forecast hour', () => {
  const raw = load('montreal');
  const snapshot = parsePelmorex({ ...raw, observation: undefined });
  assert.equal(snapshot.current.temperature, snapshot.hours[0].temperature);
});

test('an answer without hourly forecast is an error', () => {
  assert.throws(() => parsePelmorex({ hourly: { hourly: [] } }), /no hourly forecast/);
});
