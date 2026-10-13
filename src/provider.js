// -----------------------------------------------------------------------------
// The weather provider: caches, primary source, fallback, alerts, images.
//
//   getSnapshot   MétéoMédia first; ECCC city page in parallel (UV index, and
//                 the fallback when MétéoMédia fails); the last good snapshot
//                 (≤ 3 h) when both fail. Cached 10 minutes per location.
//   getAlerts     official ECCC alerts, cached 5 minutes.
//   getWeather    the onWeatherGet answer, in the pivot format.
//   getImage      the onWeatherGetImage answer (radar).
//
// Concurrent requests for one location share the same in-flight promise:
// the dashboard, the chat and the background loop never multiply the calls.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import {
  ALERTS_STALE_MAX_AGE,
  ALERTS_TTL,
  CITY_LOOKUP_TTL,
  FALLBACK_HTTP_TIMEOUT,
  HTTP_TIMEOUT,
  MAX_CACHE_ENTRIES,
  RADAR_IMAGE_KEY,
  RADAR_TTL,
  SNAPSHOT_STALE_MAX_AGE,
  SNAPSHOT_TTL,
} from './constants.js';
import { DEFAULT_CONFIG, FALLBACK_SOURCES } from './config.js';
import { isInCanadaArea, isValidLocation, locationKey } from './geo.js';
import { assess, syntheticAlerts } from './assessment.js';
import { toPivot } from './pivot.js';
import { num } from './units.js';
import { fetchPelmorex } from './sources/pelmorex.js';
import { fetchCityPage, findNearestCity, parseCityPage } from './sources/ecccCitypage.js';
import { fetchAlerts } from './sources/ecccAlerts.js';
import { buildRadarImage } from './sources/ecccRadar.js';

const defaultLogger = createLogger({ name: 'provider' });

export const RADAR_IMAGE = {
  key: RADAR_IMAGE_KEY,
  label: { en: 'Precipitation radar (ECCC)', fr: 'Radar de précipitations (ECCC)' },
};

/** Map with a bounded size: the oldest inserted entry goes first. */
class BoundedMap extends Map {
  set(key, value) {
    this.delete(key);
    super.set(key, value);
    if (this.size > MAX_CACHE_ENTRIES) {
      this.delete(this.keys().next().value);
    }
    return this;
  }
}

/** Copy the ECCC UV index into a MétéoMédia snapshot (it has none). */
export function enrichWithEccc(snapshot, eccc) {
  if (!eccc) {
    return snapshot;
  }
  const uvByHour = new Map(eccc.hours.map((h) => [h.datetime, h.uv_index]));
  const uvByDay = new Map(eccc.days.map((d) => [d.date, d.uv_index]));
  return {
    ...snapshot,
    current: { ...snapshot.current, uv_index: snapshot.current.uv_index ?? eccc.current.uv_index },
    hours: snapshot.hours.map((h) => ({ ...h, uv_index: h.uv_index ?? uvByHour.get(h.datetime) })),
    days: snapshot.days.map((d) => ({ ...d, uv_index: d.uv_index ?? uvByDay.get(d.date) })),
  };
}

export class WeatherProvider {
  /**
   * @param {{ getConfig?: () => object, logger?: object, now?: () => number,
   *   onStatus?: (status: { ok: boolean, source?: string, error?: Error }) => void }} options
   */
  constructor({ getConfig, logger, now, onStatus } = {}) {
    this.getConfig = getConfig ?? (() => DEFAULT_CONFIG);
    this.logger = logger ?? defaultLogger;
    this.now = now ?? Date.now;
    this.onStatus = onStatus ?? (() => {});
    this.snapshots = new BoundedMap();
    this.alerts = new BoundedMap();
    this.cities = new BoundedMap();
    this.inflight = new Map();
    this.radar = undefined;
    this.lastLocation = undefined;
  }

  /** Forget every cached value (config change). */
  clear() {
    this.snapshots.clear();
    this.alerts.clear();
    this.radar = undefined;
  }

  // One shared promise per (kind, location) while a fetch runs.
  share(id, factory) {
    if (!this.inflight.has(id)) {
      const promise = factory().finally(() => this.inflight.delete(id));
      this.inflight.set(id, promise);
    }
    return this.inflight.get(id);
  }

  fallbackEnabled(latitude, longitude) {
    return (
      this.getConfig().fallback_source === FALLBACK_SOURCES.ECCC &&
      isInCanadaArea(latitude, longitude)
    );
  }

  async fetchEccc(latitude, longitude, utcOffsetMinutes) {
    const key = locationKey(latitude, longitude);
    const timeout = FALLBACK_HTTP_TIMEOUT;
    const city = this.cities.get(key);
    let feature;
    if (city && this.now() - city.fetchedAt < CITY_LOOKUP_TTL) {
      feature = await fetchCityPage(city.id, { timeout });
    } else {
      feature = await findNearestCity(latitude, longitude, { timeout });
      this.cities.set(key, { id: feature.id, fetchedAt: this.now() });
    }
    return parseCityPage(feature, latitude, longitude, utcOffsetMinutes);
  }

  /** The cached snapshot of a location, without fetching. */
  cachedSnapshot(latitude, longitude) {
    return this.snapshots.get(locationKey(latitude, longitude));
  }

  async getSnapshot(latitude, longitude, { force = false } = {}) {
    const key = locationKey(latitude, longitude);
    const cached = this.snapshots.get(key);
    if (!force && cached && this.now() - cached.fetchedAt < SNAPSHOT_TTL) {
      return cached.snapshot;
    }
    return this.share(`snapshot:${key}`, () => this.refreshSnapshot(latitude, longitude, cached));
  }

  async refreshSnapshot(latitude, longitude, cached) {
    const key = locationKey(latitude, longitude);
    const withEccc = this.fallbackEnabled(latitude, longitude);
    const [primary, secondary] = await Promise.allSettled([
      fetchPelmorex(latitude, longitude, { timeout: HTTP_TIMEOUT }),
      withEccc
        ? this.fetchEccc(latitude, longitude, cached?.snapshot.utcOffsetMinutes)
        : Promise.reject(new Error('ECCC fallback disabled')),
    ]);
    let snapshot;
    if (primary.status === 'fulfilled') {
      snapshot = enrichWithEccc(
        primary.value,
        secondary.status === 'fulfilled' ? secondary.value : undefined,
      );
    } else {
      this.logger.warn(`MétéoMédia failed: ${primary.reason?.message}`);
      if (secondary.status === 'fulfilled') {
        snapshot = secondary.value;
        this.logger.info(`Using the ECCC fallback (${snapshot.station ?? 'city page'})`);
      } else if (withEccc) {
        this.logger.warn(`ECCC fallback failed: ${secondary.reason?.message}`);
      }
    }
    if (!snapshot) {
      this.onStatus({ ok: false, error: primary.reason });
      if (cached && this.now() - cached.fetchedAt < SNAPSHOT_STALE_MAX_AGE) {
        this.logger.warn('Every source failed: serving the last known weather');
        return cached.snapshot;
      }
      throw primary.reason;
    }
    this.snapshots.set(key, { snapshot, fetchedAt: this.now() });
    this.onStatus({ ok: true, source: snapshot.source });
    return snapshot;
  }

  /** The cached alerts of a location, without fetching (undefined when none). */
  cachedAlerts(latitude, longitude) {
    return this.alerts.get(locationKey(latitude, longitude))?.alerts;
  }

  /** Official ECCC alerts at a location (empty when disabled or abroad). */
  async getAlerts(latitude, longitude, { force = false } = {}) {
    if (!this.getConfig().eccc_alerts || !isInCanadaArea(latitude, longitude)) {
      return [];
    }
    const key = locationKey(latitude, longitude);
    const cached = this.alerts.get(key);
    if (!force && cached && this.now() - cached.fetchedAt < ALERTS_TTL) {
      return cached.alerts;
    }
    return this.share(`alerts:${key}`, async () => {
      try {
        const alerts = await fetchAlerts(latitude, longitude, {
          timeout: HTTP_TIMEOUT,
          now: this.now(),
        });
        const fetchedAt = this.now();
        alerts.fetchedAt = fetchedAt;
        this.alerts.set(key, { alerts, fetchedAt });
        return alerts;
      } catch (err) {
        this.logger.warn(`ECCC alerts failed: ${err.message}`);
        // An alert must not vanish because of one failed call.
        if (cached && this.now() - cached.fetchedAt < ALERTS_STALE_MAX_AGE) {
          return cached.alerts;
        }
        return [];
      }
    });
  }

  /** Official alerts plus, when enabled, the synthetic feels-like ones. */
  combineAlerts(snapshot, official) {
    const synthetic = this.getConfig().feels_like_alerts
      ? syntheticAlerts(assess(snapshot, this.now()))
      : [];
    return [...official, ...synthetic];
  }

  images(latitude, longitude) {
    return this.getConfig().radar_image && isInCanadaArea(latitude, longitude) ? [RADAR_IMAGE] : [];
  }

  /** onWeatherGet: the pivot weather of a location. */
  async getWeather({ latitude, longitude, language, units }) {
    // num(): null and '' are not 0 (the middle of the Atlantic).
    const lat = num(latitude);
    const lon = num(longitude);
    if (!isValidLocation(lat, lon)) {
      throw new Error('The house has no valid coordinates');
    }
    this.lastLocation = { latitude: lat, longitude: lon };
    const [snapshot, official] = await Promise.all([
      this.getSnapshot(lat, lon),
      this.getAlerts(lat, lon),
    ]);
    return toPivot(snapshot, {
      latitude: lat,
      longitude: lon,
      units,
      language,
      alerts: this.combineAlerts(snapshot, official),
      images: this.images(lat, lon),
      now: this.now(),
    });
  }

  /** Location used when Gladys has not asked for the weather yet. */
  setDefaultLocation(location) {
    this.lastLocation ??= location;
  }

  /**
   * onWeatherGetImage: images are instance-global in Gladys (no coordinates
   * in the request): the radar of the last location asked for.
   */
  async getImage(key) {
    if (key !== RADAR_IMAGE_KEY || !this.getConfig().radar_image) {
      throw new Error(`Unknown image "${key}"`);
    }
    if (!this.lastLocation) {
      throw new Error('No location known yet');
    }
    const { latitude, longitude } = this.lastLocation;
    const locKey = locationKey(latitude, longitude);
    if (this.radar?.key === locKey && this.now() - this.radar.fetchedAt < RADAR_TTL) {
      return this.radar.base64;
    }
    return this.share(`radar:${locKey}`, async () => {
      const base64 = await buildRadarImage(latitude, longitude, { timeout: HTTP_TIMEOUT });
      this.radar = { key: locKey, base64, fetchedAt: this.now() };
      return base64;
    });
  }
}
