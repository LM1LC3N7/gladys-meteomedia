// -----------------------------------------------------------------------------
// Feels-like assessment of a snapshot: the index that applies now, its risk
// level, the gust variant, the worst hour of the next 24 hours — and the
// optional synthetic alerts built from it.
// -----------------------------------------------------------------------------

import {
  INDEX_KINDS,
  feelsLikeIndex,
  getLevel,
  levelOf,
  windChill,
  worstHour,
} from './feelsLike.js';
import { upcomingHours } from './indicators.js';

const kmh = (ms) => (Number.isFinite(ms) ? ms * 3.6 : undefined);

export function assess(snapshot, now = Date.now()) {
  const current = snapshot?.current;
  if (!current) {
    return undefined;
  }
  const index = feelsLikeIndex({
    temperature: current.temperature,
    dew_point: current.dew_point,
    humidity: current.humidity,
    wind_kmh: kmh(current.wind_speed),
  });
  // "Feels like in the gusts": the same wind chill with the gust speed.
  const gust = windChill(current.temperature, kmh(current.wind_gust));
  return {
    index,
    level: levelOf(index),
    gustWindChill:
      index?.kind === INDEX_KINDS.WIND_CHILL && gust !== undefined ? Math.round(gust) : undefined,
    worst: worstHour(upcomingHours(snapshot, now)),
  };
}

// Synthetic alerts: only from a real risk, never for mere discomfort.
const SYNTHETIC_SEVERITY = {
  heat_great_discomfort: 'moderate',
  heat_danger: 'severe',
  heat_stroke: 'extreme',
  cold_high: 'moderate',
  cold_very_high: 'severe',
  cold_severe: 'severe',
  cold_extreme: 'extreme',
};

// Untyped on purpose: the core keys its alert diff on `type`, and an
// official ECCC heat/cold warning must never be merged with our estimate.
const SYNTHETIC_EVENTS = {
  [INDEX_KINDS.HUMIDEX]: { en: 'High humidex (estimate)', fr: 'Humidex élevé (estimation)' },
  [INDEX_KINDS.WIND_CHILL]: {
    en: 'Wind chill (estimate)',
    fr: 'Refroidissement éolien (estimation)',
  },
};

/** Feels-like alerts of a snapshot (opt-in, `feels_like_alerts`). */
export function syntheticAlerts(assessment) {
  const severity = SYNTHETIC_SEVERITY[assessment?.level];
  if (!severity) {
    return [];
  }
  const { kind, value } = assessment.index;
  const level = getLevel(assessment.level);
  const name =
    kind === INDEX_KINDS.HUMIDEX ? 'Humidex' : { en: 'Wind chill', fr: 'Refroidissement' };
  const label = (lang) => (typeof name === 'string' ? name : name[lang]);
  return [
    {
      id: `synthetic:${kind}`,
      severity,
      event: SYNTHETIC_EVENTS[kind],
      description: {
        en: `${label('en')} ${value}: ${level.label.en}. ${level.advice.en} Computed by the MétéoMédia integration, not an official alert.`,
        fr: `${label('fr')} ${value} : ${level.label.fr}. ${level.advice.fr} Calculé par l’intégration MétéoMédia, ce n’est pas une alerte officielle.`,
      },
    },
  ];
}
