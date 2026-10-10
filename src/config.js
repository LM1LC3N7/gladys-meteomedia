// -----------------------------------------------------------------------------
// Integration configuration (manifest `config_schema`).
//
// The house coordinates are NOT configuration: Gladys sends them with every
// weather request, and the background loop reads them with getHouses().
// -----------------------------------------------------------------------------

export const FALLBACK_SOURCES = { ECCC: 'eccc', NONE: 'none' };

// MUST stay consistent with the `default` values of the manifest
// (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  eccc_alerts: true,
  feels_like_alerts: false,
  fallback_source: FALLBACK_SOURCES.ECCC,
  radar_image: true,
};

// A form may send "true"/"false" strings.
function bool(value, fallback) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 'true' || value === 'false') {
    return value === 'true';
  }
  return fallback;
}

/** Merge the user config with the defaults, coercing the types. */
export function normalizeConfig(raw = {}) {
  return {
    eccc_alerts: bool(raw.eccc_alerts, DEFAULT_CONFIG.eccc_alerts),
    feels_like_alerts: bool(raw.feels_like_alerts, DEFAULT_CONFIG.feels_like_alerts),
    fallback_source: Object.values(FALLBACK_SOURCES).includes(raw.fallback_source)
      ? raw.fallback_source
      : DEFAULT_CONFIG.fallback_source,
    radar_image: bool(raw.radar_image, DEFAULT_CONFIG.radar_image),
  };
}
