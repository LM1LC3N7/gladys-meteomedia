// -----------------------------------------------------------------------------
// Dashboard widget "Feels like" (manifest `widgets`, Gladys 5.1+).
//
// What the native weather widget does not show: WHICH index applies (humidex
// in summer, wind chill in winter) with its ECCC risk level, the gust
// variant, the worst hour of the next 24 hours, the time to frostbite, and
// the derived indicators (muggy night, black ice, pressure trend).
//
// The content is declarative (core vocabulary, no HTML); `onWidgetGet`
// receives no coordinates: the house comes from the `house` setting (name or
// selector, empty = first house), resolved against getHouses().
// -----------------------------------------------------------------------------

import { WIDGET_COLORS, createLogger } from '@gladysassistant/integration-sdk';
import { FEELS_LIKE_WIDGET } from './constants.js';
import { assess } from './assessment.js';
import { INDEX_KINDS, getLevel } from './feelsLike.js';
import { iceRisk, muggyNight, pressureTrend, upcomingHours } from './indicators.js';
import {
  ICE_LABELS,
  INDEX_NAMES,
  INDEX_SHORT_NAMES,
  MUGGY_LABELS,
  PRESSURE_LABELS,
  SOURCE_LABELS,
  localClock,
  signed,
} from './i18n.js';
import { UNITS, converters } from './pivot.js';

const logger = createLogger({ name: 'widgets' });

const CONTENT_TTL = 600;
const MESSAGE_TTL = 60;

/** Theme color of a risk level. */
export function levelColor(levelKey) {
  const rank = getLevel(levelKey)?.rank ?? 0;
  if (rank === 0) {
    return WIDGET_COLORS.SUCCESS;
  }
  if (Math.abs(rank) >= 3) {
    return WIDGET_COLORS.DANGER;
  }
  if (rank === -1) {
    return WIDGET_COLORS.INFO;
  }
  return WIDGET_COLORS.WARNING;
}

const both = (fn) => ({ en: fn('en'), fr: fn('fr') });

// Whether `a` (an hour) is more severe than `b` (now): rank, then extremity.
function isWorse(a, b) {
  if (b.index.kind === INDEX_KINDS.NONE) {
    return true;
  }
  const rank = (x) => Math.abs(getLevel(x.level).rank);
  const extremity = (x) =>
    x.index.kind === INDEX_KINDS.WIND_CHILL ? -x.index.value : x.index.value;
  return rank(a) > rank(b) || (rank(a) === rank(b) && extremity(a) > extremity(b));
}

function message(text) {
  return { ttl_seconds: MESSAGE_TTL, components: [{ type: 'text', variant: 'body', text }] };
}

/**
 * Build the widget content of a snapshot (pure: tested without network).
 * @param {object} snapshot
 * @param {{ units?: string, now?: number }} options
 */
export function buildFeelsLikeContent(snapshot, { units, now = Date.now() } = {}) {
  const assessment = assess(snapshot, now);
  const convert = converters(units);
  const unit = units === UNITS.US ? '°F' : '°C';
  const temperature = (c) => Math.round(convert.temperature(c));
  const offset = snapshot.utcOffsetMinutes ?? 0;
  const { current } = snapshot;
  const { index } = assessment;
  const level = getLevel(assessment.level);
  const color = levelColor(assessment.level);
  // Humidex has no unit; the wind chill reads as a temperature.
  const indexValue = (i) => (i.kind === INDEX_KINDS.HUMIDEX ? i.value : temperature(i.value));
  const indexUnit = (i) => (i.kind === INDEX_KINDS.HUMIDEX ? '' : unit);

  const components = [
    {
      type: 'text',
      variant: 'heading',
      text: both(
        (lang) =>
          `${INDEX_NAMES[index.kind][lang]} ${signed(indexValue(index))}${indexUnit(index)}`,
      ),
    },
  ];

  // Tiles: MétéoMédia's own feels-like first (the value of the native
  // widget), then the official index computed here.
  if (Number.isFinite(current.apparent_temperature)) {
    components.push({
      type: 'value',
      label: { en: 'Feels like (MétéoMédia)', fr: 'Ressenti (MétéoMédia)' },
      value: temperature(current.apparent_temperature),
      unit,
      icon: 'thermometer',
      color,
    });
  }
  if (index.kind !== INDEX_KINDS.NONE) {
    components.push({
      type: 'value',
      label: INDEX_SHORT_NAMES[index.kind],
      value: indexValue(index),
      ...(indexUnit(index) ? { unit } : {}),
      icon: index.kind === INDEX_KINDS.HUMIDEX ? 'sun' : 'wind',
      color,
    });
  }
  components.push({
    type: 'value',
    label: { en: 'Temperature', fr: 'Température' },
    value: temperature(current.temperature),
    unit,
    icon: 'thermometer',
  });
  if (assessment.gustWindChill !== undefined) {
    components.push({
      type: 'value',
      label: { en: 'In the gusts', fr: 'Dans les rafales' },
      value: temperature(assessment.gustWindChill),
      unit,
      icon: 'wind',
    });
  } else if (Number.isFinite(current.dew_point)) {
    components.push({
      type: 'value',
      label: { en: 'Dew point', fr: 'Point de rosée' },
      value: temperature(current.dew_point),
      unit,
      icon: 'droplet',
    });
  }

  // Focal chart: feels-like and temperature over the next 24 hours.
  const hours = upcomingHours(snapshot, now).filter((h) => Number.isFinite(h.temperature));
  if (hours.length > 1) {
    const series = [
      {
        name: { en: 'Feels like', fr: 'Ressenti' },
        points: hours
          .filter((h) => Number.isFinite(h.apparent_temperature))
          .map((h) => ({ t: h.datetime, v: temperature(h.apparent_temperature) })),
      },
      {
        name: { en: 'Temperature', fr: 'Température' },
        points: hours.map((h) => ({ t: h.datetime, v: temperature(h.temperature) })),
      },
    ].filter((s) => s.points.length > 0);
    const chart = {
      type: 'chart',
      chart_type: 'line',
      title: { en: 'Next 24 hours', fr: 'Prochaines 24 h' },
      unit,
      now_marker: true,
      series,
    };
    if (assessment.worst) {
      chart.annotations = [
        {
          t: assessment.worst.hour.datetime,
          label: { en: 'Worst', fr: 'Pire' },
          color: levelColor(assessment.worst.level),
        },
      ];
    }
    components.push(chart);
  }

  // Status rows.
  const items = [
    {
      label: { en: 'Risk level', fr: 'Niveau de risque' },
      value: level.label,
      icon: 'alert-triangle',
      color,
    },
  ];
  if (assessment.worst) {
    // Now may be worse than any coming hour: say so rather than show a
    // milder "worst" hour.
    const nowIsWorst = !isWorse(assessment.worst, assessment);
    const worst = nowIsWorst ? assessment : assessment.worst;
    const at = nowIsWorst
      ? { en: 'Now', fr: 'Maintenant' }
      : both(() => localClock(assessment.worst.hour.datetime, offset));
    items.push({
      label: { en: 'Worst hour (24 h)', fr: 'Pire heure (24 h)' },
      value: both(
        (lang) =>
          `${at[lang]} · ${INDEX_SHORT_NAMES[worst.index.kind][lang]} ${signed(indexValue(worst.index))}${indexUnit(worst.index)}`,
      ),
      icon: 'clock',
      color: levelColor(worst.level),
    });
  }
  if (level.frostbite) {
    items.push({
      label: { en: 'Time to frostbite', fr: 'Délai de gelure' },
      value: level.frostbite,
      icon: 'alert-octagon',
      color,
    });
  }
  const muggy = muggyNight(snapshot, now);
  if (muggy && muggy.level !== 'none') {
    items.push({
      label: { en: 'Muggy night', fr: 'Nuit étouffante' },
      value: MUGGY_LABELS[muggy.level],
      icon: 'moon',
      color: muggy.level === 'oppressive' ? WIDGET_COLORS.DANGER : WIDGET_COLORS.WARNING,
    });
  }
  const ice = iceRisk(snapshot, now);
  if (ice.level !== 'none') {
    items.push({
      label: { en: 'Black ice', fr: 'Verglas' },
      value: ice.hour
        ? both(
            (lang) => `${ICE_LABELS[ice.level][lang]} · ${localClock(ice.hour.datetime, offset)}`,
          )
        : ICE_LABELS[ice.level],
      icon: 'alert-circle',
      color: ice.level === 'likely' ? WIDGET_COLORS.DANGER : WIDGET_COLORS.WARNING,
    });
  }
  const pressure = pressureTrend(snapshot, now);
  if (pressure) {
    items.push({
      label: { en: 'Pressure (3 h)', fr: 'Pression (3 h)' },
      value: both(
        (lang) =>
          `${PRESSURE_LABELS[pressure.trend][lang]} (${pressure.change > 0 ? '+' : ''}${signed(pressure.change)} hPa)`,
      ),
      icon: { rising: 'trending-up', steady: 'minus' }[pressure.trend] ?? 'trending-down',
      color: pressure.trend === 'falling_fast' ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
    });
  }
  items.push({
    label: { en: 'Source', fr: 'Source' },
    value: SOURCE_LABELS[snapshot.source] ?? snapshot.source,
    icon: 'cloud',
    color: snapshot.source === 'pelmorex' ? WIDGET_COLORS.NEUTRAL : WIDGET_COLORS.WARNING,
  });
  components.push({ type: 'status', items });
  components.push({ type: 'text', variant: 'caption', text: level.advice });

  return { ttl_seconds: CONTENT_TTL, components };
}

/**
 * @param {{ provider: object, watcher: object, rememberPreferences: Function }} deps
 */
export function createWidgets({ provider, watcher, rememberPreferences }) {
  return {
    [FEELS_LIKE_WIDGET]: {
      async get({ settings = {}, language, units }) {
        rememberPreferences({ language, units });
        const house = watcher.findHouse(settings.house);
        if (!house) {
          return message(
            settings.house
              ? {
                  en: `No located house named "${settings.house}".`,
                  fr: `Aucune maison localisée nommée « ${settings.house} ».`,
                }
              : {
                  en: 'No location yet: place your house on the map in Gladys.',
                  fr: 'Aucune position : placez votre maison sur la carte dans Gladys.',
                },
          );
        }
        try {
          const snapshot = await provider.getSnapshot(house.latitude, house.longitude);
          return buildFeelsLikeContent(snapshot, { units });
        } catch (err) {
          logger.warn(`Feels-like widget: ${err.message}`);
          return message({
            en: 'Weather unavailable for now, retrying soon.',
            fr: 'Météo indisponible pour le moment, nouvel essai bientôt.',
          });
        }
      },
    },
  };
}

export const WIDGET_KEYS = [FEELS_LIKE_WIDGET];
