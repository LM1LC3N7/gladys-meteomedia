// -----------------------------------------------------------------------------
// MétéoMédia / The Weather Network (Pelmorex) — the primary source.
//
// UNDOCUMENTED API (observed on 2026-10-10): it can change without notice,
// which is why everything is parsed defensively and an ECCC fallback exists.
// No key; always queried by coordinates (city slugs are ambiguous: "montreal"
// once answered Montréal in the Ain, France).
//
//   /observation  current conditions (km/h, kPa, km)
//   /hourly       72 hours (temperature.value, feelsLike, pop, rain mm, snow cm)
//   /longterm     15 days (day/night halves)
//
// The result is a SNAPSHOT in the pivot metric units (°C, m/s, hPa, mm, km),
// independent of the language and of the unit system the user asks for.
// -----------------------------------------------------------------------------

import { PELMOREX_BASE_URL, PELMOREX_LOCALE } from '../constants.js';
import { fetchJson } from '../http.js';
import { pelmorexCondition, pelmorexIsDay } from '../conditions.js';
import { dewPointFromHumidity } from '../feelsLike.js';
import { kmhToMs, kpaToHpa, num, snowCmToWaterMm } from '../units.js';

export const PELMOREX_SOURCE = 'pelmorex';

function url(endpoint, latitude, longitude) {
  const params = new URLSearchParams({
    locale: PELMOREX_LOCALE,
    lat: String(latitude),
    long: String(longitude),
    unit: 'metric',
  });
  return `${PELMOREX_BASE_URL}/${endpoint}?${params}`;
}

// "2026-10-10T11:57" (no zone) -> ISO UTC string.
function utcIso(time) {
  if (typeof time?.utc !== 'string') {
    return undefined;
  }
  const date = new Date(`${time.utc}:00Z`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

// Minutes between the local and the UTC clocks of a `time` object.
function utcOffsetMinutes(time) {
  if (typeof time?.local !== 'string' || typeof time?.utc !== 'string') {
    return undefined;
  }
  const offset = (Date.parse(`${time.local}:00Z`) - Date.parse(`${time.utc}:00Z`)) / 60_000;
  return Number.isFinite(offset) ? offset : undefined;
}

const speed = (kmh) => {
  const value = num(kmh);
  return value === undefined ? undefined : kmhToMs(value);
};

const pressure = (kpa) => {
  const value = num(kpa);
  return value === undefined ? undefined : kpaToHpa(value);
};

function precipitation(rain, snow) {
  const rainMm = num(rain?.value);
  const snowCm = num(snow?.value);
  if (rainMm === undefined && snowCm === undefined) {
    return undefined;
  }
  return (rainMm ?? 0) + snowCmToWaterMm(snowCm ?? 0);
}

export function parseHour(entry) {
  const temperature = num(entry?.temperature?.value ?? entry?.temperature);
  const datetime = utcIso(entry?.time);
  if (temperature === undefined || datetime === undefined) {
    return undefined;
  }
  const humidity = num(entry.relativeHumidity);
  return {
    datetime,
    localTime: entry.time.local,
    temperature,
    apparent_temperature: num(entry.feelsLike),
    dew_point: num(entry.dewPoint) ?? dewPointFromHumidity(temperature, humidity),
    humidity,
    pressure: pressure(entry.pressure?.value ?? entry.pressure),
    wind_speed: speed(entry.wind?.speed),
    wind_direction: num(entry.wind?.degree),
    wind_gust: speed(entry.wind?.gust),
    cloud_cover: num(entry.cloudCover),
    precipitation: precipitation(entry.rain, entry.snow),
    rain: num(entry.rain?.value),
    snow_cm: num(entry.snow?.value),
    precipitation_probability: num(entry.pop),
    thunder_probability: num(entry.potentialForThunder),
    weather: pelmorexCondition(entry.weatherCode, temperature),
    is_day: pelmorexIsDay(entry.weatherCode),
  };
}

export function parseObservation(body, firstHour) {
  const obs = body?.observation;
  const temperature = num(obs?.temperature);
  const datetime = utcIso(obs?.time);
  if (temperature === undefined || datetime === undefined) {
    return undefined;
  }
  const humidity = num(obs.relativeHumidity);
  return {
    datetime,
    localTime: obs.time.local,
    temperature,
    apparent_temperature: num(obs.feelsLike),
    dew_point: num(obs.dewPoint) ?? dewPointFromHumidity(temperature, humidity),
    humidity,
    pressure: pressure(obs.pressure?.value),
    wind_speed: speed(obs.wind?.speed),
    wind_direction: num(obs.wind?.degree),
    wind_gust: speed(obs.wind?.gust),
    visibility: num(obs.visibility),
    // Not observed: the first forecast hour is the best estimate.
    cloud_cover: firstHour?.cloud_cover,
    weather: pelmorexCondition(obs.weatherCode, temperature),
    is_day: pelmorexIsDay(obs.weatherCode),
  };
}

export function parseDay(entry) {
  const date = typeof entry?.time?.local === 'string' ? entry.time.local.slice(0, 10) : undefined;
  const half = entry?.day ?? entry?.night;
  const max = num(entry?.maxTemperature) ?? num(entry?.day?.temperature?.value);
  const min = num(entry?.minTemperature) ?? num(entry?.night?.temperature?.value);
  if (!date || max === undefined || min === undefined) {
    return undefined;
  }
  return {
    date,
    temperature_min: Math.min(min, max),
    temperature_max: Math.max(min, max),
    weather: half ? pelmorexCondition(half.weatherCode, num(half.temperature?.value)) : undefined,
    humidity: num(half?.relativeHumidity),
    wind_speed: speed(half?.wind?.speed),
    wind_direction: num(half?.wind?.degree),
    wind_gust: speed(half?.wind?.gust),
    precipitation: precipitation(entry.rain, entry.snow),
    precipitation_probability: num(entry.pop),
    hours_of_sun: num(entry.hoursOfSun),
  };
}

/**
 * Parse the three raw answers into a snapshot. `hourly` is mandatory; a
 * missing observation is replaced by the first forecast hour, missing days
 * are simply absent.
 */
export function parsePelmorex({ observation, hourly, longterm }) {
  const hours = (hourly?.hourly ?? []).map(parseHour).filter(Boolean);
  if (hours.length === 0) {
    throw new Error('MétéoMédia: no hourly forecast in the answer');
  }
  const current = parseObservation(observation, hours[0]) ?? { ...hours[0] };
  const days = (longterm?.longTerm ?? []).map(parseDay).filter(Boolean);
  return {
    source: PELMOREX_SOURCE,
    utcOffsetMinutes:
      utcOffsetMinutes(observation?.observation?.time) ??
      utcOffsetMinutes(hourly?.hourly?.[0]?.time),
    current,
    hours,
    days,
  };
}

/** Fetch the three endpoints in parallel and parse them. */
export async function fetchPelmorex(latitude, longitude, { timeout } = {}) {
  const get = (endpoint) => fetchJson(url(endpoint, latitude, longitude), { timeout });
  const [observation, hourly, longterm] = await Promise.allSettled([
    get('observation'),
    get('hourly'),
    get('longterm'),
  ]);
  if (hourly.status === 'rejected') {
    throw hourly.reason;
  }
  return parsePelmorex({
    observation: observation.status === 'fulfilled' ? observation.value : undefined,
    hourly: hourly.value,
    longterm: longterm.status === 'fulfilled' ? longterm.value : undefined,
  });
}
