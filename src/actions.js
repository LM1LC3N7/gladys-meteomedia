// -----------------------------------------------------------------------------
// Configuration screen buttons (manifest `actions`).
//
// `test_sources` asks each source once, bypassing the caches, for the first
// located house, and reports what answered: the quickest way to tell an API
// change at MétéoMédia from a network problem.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { FALLBACK_HTTP_TIMEOUT, HTTP_TIMEOUT } from './constants.js';
import { isInCanadaArea } from './geo.js';
import { signed } from './i18n.js';
import { fetchPelmorex } from './sources/pelmorex.js';
import { fetchAlerts } from './sources/ecccAlerts.js';
import { findNearestCity, parseCityPage } from './sources/ecccCitypage.js';

const logger = createLogger({ name: 'actions' });

async function probe(label, task) {
  try {
    const detail = await task();
    return { ok: true, en: `${label.en}: OK${detail.en}`, fr: `${label.fr} : OK${detail.fr}` };
  } catch (err) {
    logger.warn(`${label.en} test failed: ${err.message}`);
    return {
      ok: false,
      en: `${label.en}: failed (${err.message})`,
      fr: `${label.fr} : échec (${err.message})`,
    };
  }
}

export function createActions({ watcher, getConfig }) {
  return {
    async test_sources() {
      const house = watcher.findHouse();
      if (!house) {
        return {
          en: 'No location: place your house on the map in Gladys, then try again.',
          fr: 'Aucune position : placez votre maison sur la carte dans Gladys, puis réessayez.',
        };
      }
      const { latitude, longitude } = house;
      const results = [
        await probe({ en: 'MétéoMédia', fr: 'MétéoMédia' }, async () => {
          const snapshot = await fetchPelmorex(latitude, longitude, { timeout: HTTP_TIMEOUT });
          const t = `${signed(Math.round(snapshot.current.temperature))} °C`;
          return { en: ` (${t})`, fr: ` (${t})` };
        }),
      ];
      const canada = isInCanadaArea(latitude, longitude);
      if (canada && getConfig().fallback_source === 'eccc') {
        results.push(
          await probe({ en: 'Environment Canada', fr: 'Environnement Canada' }, async () => {
            const feature = await findNearestCity(latitude, longitude, {
              timeout: FALLBACK_HTTP_TIMEOUT,
            });
            const snapshot = parseCityPage(feature, latitude, longitude);
            return { en: ` (${snapshot.station})`, fr: ` (${snapshot.station})` };
          }),
        );
      }
      if (canada && getConfig().eccc_alerts) {
        results.push(
          await probe({ en: 'ECCC alerts', fr: 'Alertes ECCC' }, async () => {
            const n = (await fetchAlerts(latitude, longitude, { timeout: HTTP_TIMEOUT })).length;
            return { en: `, ${n} active`, fr: `, ${n} en cours` };
          }),
        );
      }
      if (!canada) {
        results.push({
          en: 'Outside Canada: no ECCC fallback, alerts nor radar.',
          fr: 'Hors du Canada : pas de repli, d’alertes ni de radar ECCC.',
        });
      }
      return {
        en: results.map((r) => r.en).join(' · '),
        fr: results.map((r) => r.fr).join(' · '),
      };
    },
  };
}
