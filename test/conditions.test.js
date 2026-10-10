import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONDITIONS,
  ecccCondition,
  ecccIsNightIcon,
  pelmorexCondition,
  pelmorexIsDay,
} from '../src/conditions.js';

const PIVOT = new Set(Object.values(CONDITIONS));

test('every MétéoMédia icon 1-45 maps to a pivot condition, never "night"', () => {
  for (let icon = 1; icon <= 45; icon += 1) {
    const condition = pelmorexCondition({ icon });
    assert.ok(PIVOT.has(condition), `icon ${icon} -> ${condition}`);
    assert.notEqual(condition, 'unknown', `icon ${icon} is mapped`);
    assert.notEqual(condition, 'night');
  }
});

test('MétéoMédia samples observed on the API', () => {
  assert.equal(pelmorexCondition({ value: 'C', icon: 1 }), CONDITIONS.CLEAR);
  assert.equal(pelmorexCondition({ value: 'CLRN', icon: 18 }), CONDITIONS.CLEAR);
  assert.equal(pelmorexCondition({ value: 'B', icon: 3 }), CONDITIONS.PARTLY_CLOUDY);
  assert.equal(pelmorexCondition({ value: 'R+', icon: 10 }), CONDITIONS.POURING);
  assert.equal(pelmorexCondition({ value: 'L', icon: 9 }), CONDITIONS.DRIZZLE);
  assert.equal(pelmorexCondition({ value: 'Q', icon: 11 }), CONDITIONS.THUNDERSTORM);
  assert.equal(pelmorexCondition({ value: 'I', icon: 13 }), CONDITIONS.SLEET);
  assert.equal(pelmorexCondition({ value: 'YN', icon: 15 }), CONDITIONS.SNOW);
});

test('an unknown icon falls back on the letter code, then on "unknown"', () => {
  assert.equal(pelmorexCondition({ value: '-OVC', icon: 99 }), CONDITIONS.CLOUD);
  assert.equal(pelmorexCondition({ value: 'R-N', icon: 99 }), CONDITIONS.RAIN);
  assert.equal(pelmorexCondition({ value: 'XX', icon: 99 }), CONDITIONS.UNKNOWN);
  assert.equal(pelmorexCondition(undefined), CONDITIONS.UNKNOWN);
});

test('fog at or below 0 °C is freezing fog', () => {
  assert.equal(pelmorexCondition({ icon: 17 }, 2), CONDITIONS.FOG);
  assert.equal(pelmorexCondition({ icon: 17 }, -1), CONDITIONS.FREEZING_FOG);
  assert.equal(ecccCondition(24, -5), CONDITIONS.FREEZING_FOG);
});

test('day/night comes from the background image name', () => {
  assert.equal(pelmorexIsDay({ bgImage: 'clearday' }), true);
  assert.equal(pelmorexIsDay({ bgimage: 'rainnight' }), false);
  assert.equal(pelmorexIsDay({}), undefined);
});

test('ECCC icon codes', () => {
  for (let icon = 0; icon <= 48; icon += 1) {
    assert.ok(PIVOT.has(ecccCondition(icon)), `ECCC icon ${icon}`);
  }
  assert.equal(ecccCondition(14), CONDITIONS.FREEZING_RAIN);
  assert.equal(ecccCondition(42), CONDITIONS.TORNADO);
  assert.equal(ecccCondition('03'), CONDITIONS.CLOUD);
  assert.equal(ecccCondition(99), CONDITIONS.UNKNOWN);
  assert.equal(ecccIsNightIcon(31), true);
  assert.equal(ecccIsNightIcon(1), false);
});
