// -----------------------------------------------------------------------------
// Weather codes of the sources -> conditions of the Gladys pivot enum.
//
// MétéoMédia: the `icon` number is the stable classifier (its icon set,
// https://icons.twnmm.com/wx_icons/v2/<n>.png, 1 to 45); the letter code
// (C, S+N, -OVC...) is the fallback when an icon number is unknown.
// ECCC: the documented icon codes of the city pages (00 to 48, see
// dd.weather.gc.ca/today/citypage_weather/docs/).
//
// A condition the source cannot tell apart is sent as the broader value
// (the doctrine of the pivot), and "night" is never sent: the real condition
// goes with `is_day: false`.
// -----------------------------------------------------------------------------

export const CONDITIONS = {
  CLEAR: 'clear',
  PARTLY_CLOUDY: 'partly-cloudy',
  CLOUD: 'cloud',
  FOG: 'fog',
  DRIZZLE: 'drizzle',
  RAIN: 'rain',
  POURING: 'pouring',
  SLEET: 'sleet',
  HAIL: 'hail',
  SNOW: 'snow',
  THUNDERSTORM: 'thunderstorm',
  WIND: 'wind',
  UNKNOWN: 'unknown',
  FREEZING_RAIN: 'freezing-rain',
  FREEZING_FOG: 'freezing-fog',
  SNOW_THUNDERSTORM: 'snow-thunderstorm',
  SANDSTORM: 'sandstorm',
  TORNADO: 'tornado',
  HURRICANE: 'hurricane',
};

const C = CONDITIONS;

// Icon number -> condition, read from the icon drawings themselves.
const PELMOREX_ICONS = {
  1: C.CLEAR, // sun
  2: C.PARTLY_CLOUDY, // mainly sunny, a few clouds
  3: C.PARTLY_CLOUDY, // a mix of sun and clouds
  4: C.CLOUD, // mostly cloudy, sunny breaks
  5: C.SLEET, // ice pellets (grésil)
  6: C.RAIN, // chance of a shower
  7: C.THUNDERSTORM, // sun, rain and lightning
  8: C.CLOUD, // cloudy, overcast
  9: C.DRIZZLE, // drizzle
  10: C.POURING, // rain at times heavy
  11: C.THUNDERSTORM, // thunderstorms
  12: C.SLEET, // snow-rain showers
  13: C.SLEET, // mixed precipitation
  14: C.SNOW, // a few flurries
  15: C.SNOW, // snow
  16: C.SNOW, // light snow, scattered flurries
  17: C.FOG, // fog patches
  18: C.CLEAR, // clear night
  19: C.PARTLY_CLOUDY, // mainly clear night
  20: C.PARTLY_CLOUDY, // partly cloudy night
  21: C.CLOUD, // mostly cloudy night
  22: C.SNOW, // blowing snow
  23: C.RAIN, // night shower
  24: C.THUNDERSTORM, // night thunderstorm
  25: C.SLEET, // night rain and snow
  26: C.SNOW, // night flurries
  27: C.WIND, // a whirl: sent as the broader "wind", never guessed as a tornado
  28: C.RAIN, // light rain
  29: C.RAIN, // rain
  30: C.RAIN, // a few showers
  31: C.RAIN, // a few showers, night
  32: C.RAIN, // showers
  33: C.RAIN, // showers, night
  34: C.THUNDERSTORM, // risk of a thunderstorm
  35: C.THUNDERSTORM, // risk of a thunderstorm, day
  36: C.THUNDERSTORM, // risk of a thunderstorm, night
  37: C.FREEZING_RAIN, // freezing rain
  38: C.FREEZING_RAIN, // freezing drizzle
  39: C.SNOW, // snow and blowing snow
  40: C.FOG, // haze, day
  41: C.FOG, // smoke, day
  42: C.FOG, // haze, night
  43: C.FOG, // smoke, night
  44: C.SNOW, // blowing snow
  45: C.SANDSTORM, // dust, sand
};

// First letter of the code (night suffix and intensity signs removed).
const PELMOREX_LETTERS = {
  C: C.CLEAR,
  S: C.PARTLY_CLOUDY,
  B: C.PARTLY_CLOUDY,
  O: C.CLOUD,
  F: C.FOG,
  L: C.DRIZZLE,
  R: C.RAIN,
  A: C.RAIN,
  Q: C.THUNDERSTORM,
  T: C.THUNDERSTORM,
  N: C.SNOW,
  P: C.SNOW,
  V: C.SNOW,
  W: C.SNOW,
  Y: C.SNOW,
  M: C.SLEET,
  I: C.SLEET,
  Z: C.FREEZING_RAIN,
};

// Observation codes are METAR cloud covers.
const METAR_COVERS = { CLR: C.CLEAR, SCT: C.PARTLY_CLOUDY, BKN: C.PARTLY_CLOUDY, OVC: C.CLOUD };

function fromPelmorexCode(code) {
  if (typeof code !== 'string' || code.length === 0) {
    return C.UNKNOWN;
  }
  const bare = code.replace(/^[-+]/, '');
  const cover = METAR_COVERS[bare.replace(/N$/, '')];
  if (cover) {
    return cover;
  }
  return PELMOREX_LETTERS[bare[0]] ?? C.UNKNOWN;
}

/**
 * Condition of a MétéoMédia `weatherCode` object.
 * Fog at or below 0 °C is freezing fog (supercooled droplets that glaze the
 * roads): the pivot has a dedicated value for it, MétéoMédia does not.
 */
export function pelmorexCondition(weatherCode, temperature) {
  const condition = PELMOREX_ICONS[weatherCode?.icon] ?? fromPelmorexCode(weatherCode?.value);
  if (condition === C.FOG && Number.isFinite(temperature) && temperature <= 0) {
    return C.FREEZING_FOG;
  }
  return condition;
}

/** Day/night of a MétéoMédia `weatherCode` (`bgImage`: clearday, rainnight...). */
export function pelmorexIsDay(weatherCode) {
  const background = weatherCode?.bgImage ?? weatherCode?.bgimage;
  if (typeof background === 'string') {
    if (background.endsWith('night')) {
      return false;
    }
    if (background.endsWith('day')) {
      return true;
    }
  }
  return undefined;
}

const ECCC_ICONS = {
  0: C.CLEAR,
  1: C.PARTLY_CLOUDY,
  2: C.PARTLY_CLOUDY,
  3: C.CLOUD,
  4: C.CLOUD, // increasing cloudiness
  5: C.PARTLY_CLOUDY, // clearing
  6: C.RAIN,
  7: C.SLEET,
  8: C.SNOW,
  9: C.THUNDERSTORM,
  10: C.CLOUD,
  11: C.RAIN, // precipitation, squalls
  12: C.RAIN,
  13: C.RAIN,
  14: C.FREEZING_RAIN,
  15: C.SLEET,
  16: C.SNOW,
  17: C.SNOW,
  18: C.SNOW, // heavy snow, blizzard
  19: C.THUNDERSTORM,
  20: C.FOG,
  21: C.FOG,
  22: C.PARTLY_CLOUDY,
  23: C.FOG, // haze
  24: C.FOG,
  25: C.SNOW, // drifting snow
  26: C.SNOW, // ice crystals
  27: C.SLEET, // ice pellets
  28: C.DRIZZLE,
  29: C.UNKNOWN, // not available
  30: C.CLEAR,
  31: C.PARTLY_CLOUDY,
  32: C.PARTLY_CLOUDY,
  33: C.CLOUD,
  34: C.CLOUD,
  35: C.PARTLY_CLOUDY,
  36: C.RAIN,
  37: C.SLEET,
  38: C.SNOW,
  39: C.THUNDERSTORM,
  40: C.SNOW, // blowing snow
  41: C.TORNADO, // funnel cloud
  42: C.TORNADO,
  43: C.WIND,
  44: C.FOG, // smoke
  45: C.SANDSTORM, // dust storm, sandstorm
  46: C.HAIL, // thunderstorm with hail
  47: C.THUNDERSTORM, // thunderstorm with dust storm
  48: C.TORNADO, // waterspout
};

export function ecccCondition(iconCode, temperature) {
  const condition = ECCC_ICONS[Number(iconCode)] ?? C.UNKNOWN;
  if (condition === C.FOG && Number.isFinite(temperature) && temperature <= 0) {
    return C.FREEZING_FOG;
  }
  return condition;
}

/** ECCC icon codes 30 to 39 are night-only drawings. */
export function ecccIsNightIcon(iconCode) {
  const code = Number(iconCode);
  return code >= 30 && code <= 39;
}
