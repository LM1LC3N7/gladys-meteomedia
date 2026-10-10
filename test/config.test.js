import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig } from '../src/config.js';

test('defaults apply to an empty config', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
  assert.deepEqual(normalizeConfig({}), DEFAULT_CONFIG);
});

test('form values are coerced, unknown values fall back to the default', () => {
  assert.deepEqual(
    normalizeConfig({
      eccc_alerts: 'false',
      feels_like_alerts: 'true',
      fallback_source: 'none',
      radar_image: false,
      unknown: 1,
    }),
    { eccc_alerts: false, feels_like_alerts: true, fallback_source: 'none', radar_image: false },
  );
  assert.equal(normalizeConfig({ fallback_source: 'openweather' }).fallback_source, 'eccc');
  assert.equal(normalizeConfig({ eccc_alerts: 'yes' }).eccc_alerts, true);
});
