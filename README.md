# MétéoMédia for Gladys Assistant

> **Unofficial connector, for personal use.** This project is neither
> affiliated with nor endorsed by Pelmorex, owner of MétéoMédia and The
> Weather Network. It reads the data of their website, whose
> [terms of use](https://www.theweathernetwork.com/terms-of-use) restrict
> automated access to personal, non-commercial use: each user is
> responsible for complying with them. "MétéoMédia" is a registered
> trademark of Pelmorex Weather Networks (Television) Inc., used here only to
> name the service the connector talks to.

A **weather provider** external integration for
[Gladys Assistant](https://gladysassistant.com), fed by **MétéoMédia / The
Weather Network** (Pelmorex), with **Environment and Climate Change Canada**
(ECCC) for the official alerts, the UV index, the radar and a fallback.
Built for Québec and Canada, where no other provider of the Gladys store
lives: humidex in summer, wind chill in winter.

> 🇫🇷 Documentation utilisateur en français : [`docs/fr.md`](docs/fr.md).
> User documentation in English: [`docs/en.md`](docs/en.md).

## Features

| Priority | Feature                                                                                      | Where                                         |
| -------- | -------------------------------------------------------------------------------------------- | --------------------------------------------- |
| P1       | Current conditions, 24 hours, 8 days in the Gladys pivot format (metric or US units)         | `src/provider.js`, `src/pivot.js`             |
| P1       | `apparent_temperature` = MétéoMédia feels-like                                               | `src/sources/pelmorex.js`                     |
| P1       | ECCC city page fallback (+ UV index enrichment)                                              | `src/sources/ecccCitypage.js`                 |
| P2       | Official ECCC alerts (CAP severities and types) + `requestWeatherRefresh()` when they change | `src/sources/ecccAlerts.js`, `src/watcher.js` |
| P2       | Scene triggers "alert issued" / "alert ended" (house, levels 1–4, types), memory in `/data`  | `src/alertTracker.js`, `src/store.js`         |
| P2       | Scene action "current weather alerts": summary ready to send, levels now and later           | `src/scenes.js`                               |
| P2       | "Weather alerts" widget: levels now and later, period, badge, official text, minute clock    | `src/widgets.js`                              |
| P2       | "Feels like" widget: humidex / wind chill, risk level, worst hour, time to frostbite         | `src/widgets.js`, `src/feelsLike.js`          |
| P2       | Scene trigger "feels-like level changed" (discrete levels, one event per crossed level)      | `src/sceneTriggers.js`                        |
| P3       | ECCC precipitation radar over an NRCan base map (provider image `radar`)                     | `src/sources/ecccRadar.js`                    |
| P3       | Muggy night, black ice risk, pressure trend in the widget                                    | `src/indicators.js`                           |
| Option   | Synthetic feels-like alerts (off by default)                                                 | `src/assessment.js`                           |

## How it works

```
onWeatherGet(lat, lon, language, units)
  └─ WeatherProvider.getWeather
       ├─ getSnapshot (cache 10 min, shared in-flight promise)
       │    ├─ MétéoMédia /observation /hourly /longterm   (primary)
       │    ├─ ECCC city page, in parallel                  (UV index + fallback)
       │    └─ last snapshot ≤ 3 h when both fail
       ├─ getAlerts (ECCC weather-alerts, cache 5 min, point-in-polygon)
       └─ toPivot (metric snapshot -> requested units and language)

Watcher, every 5 min, per located house (getHouses, manifest location: true)
  ├─ alerts changed           -> requestWeatherRefresh(), requestWidgetRefresh('alerts')
  ├─ alert kind new / raised  -> publishSceneEvent('alert_issued'), memory in /data
  ├─ alert kind gone (confirmed) -> publishSceneEvent('alert_ended')
  ├─ feels-like level crossed -> publishSceneEvent('feels_like_level_changed')
  └─ new data                 -> requestWidgetRefresh('feels_like')
```

Internally every value is kept in the pivot metric units (°C, m/s, hPa, mm,
km); the conversion to the unit system of the request happens last, so one
cache entry serves every user.

### Sources

| Source                                                                 | Used for           | Notes                                                                                            |
| ---------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------ |
| `weatherapi.pelmorex.com/api/v1` (`observation`, `hourly`, `longterm`) | forecasts          | **Undocumented**, no key, always by coordinates. `daily`, `nowcast`, `alerts`, `uv`… answer 404. |
| `api.weather.gc.ca/collections/citypageweather-realtime`               | fallback, UV index | Nearest city page (bbox search, then read by id, cached 24 h).                                   |
| `api.weather.gc.ca/collections/weather-alerts`                         | alerts             | One feature per (alert, region) polygon; colour → severity, name → type.                         |
| `geo.weather.gc.ca/geomet` (`RADAR_1KM_RRAI`, `RADAR_1KM_RSNO`)        | radar              | One layer per request; composed with `pngjs`.                                                    |
| `maps.geogratis.gc.ca/wms/CBMT`                                        | radar base map     | NRCan "Canada Base Map – Transportation".                                                        |

Conversions: wind km/h ÷ 3.6 → m/s, pressure kPa × 10 → hPa, snow cm →
water mm at 10:1, `is_day` from the MétéoMédia `bgImage` (`…day` /
`…night`). Conditions come from the MétéoMédia **icon number** (1–45, read
from the icon set) with the letter code as fallback, and from the documented
ECCC icon codes (0–48). Fog at or below 0 °C is sent as `freezing-fog`;
`night` is never sent.

Feels-like formulas (pure functions, tested): ECCC humidex, JAG/TI 2001
wind chill (with ECCC's low-wind form under 5 km/h), Magnus dew point when
the hourly forecast omits it. Sunrise and sunset are computed locally.

## Development

```bash
npm install
npm test                 # node --test, no network (fetch is faked, fixtures in test/fixtures)
npm run lint             # ESLint
npm run format:check     # Prettier
npm run audit            # npm audit of the production dependencies
npx github:GladysAssistant/integration-store .   # store admission checks
```

Run against a Gladys instance:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="<selector>" \
LOG_LEVEL=debug npm start
```

The fixtures were recorded from the live APIs on 2026-10-10 (Montréal,
Iqaluit, ECCC). To refresh them, re-run the `curl` calls listed in
[`CLAUDE.md`](CLAUDE.md).

## Release

Describe the changes under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md),
then **Actions → Release → Run workflow** (`patch` / `minor` / `major`): it
bumps the versions, tags, builds the multi-arch image to
`ghcr.io/lm1lc3n7/gladys-meteomedia` and publishes the GitHub Release.
The GitHub topic `gladys-assistant-integration` publishes the connector in
the Gladys store (indexed hourly); it is set, see [`TODO.md`](TODO.md).

## Licence

Apache-2.0. Forecast data © Pelmorex; ECCC and NRCan data under the Open
Government Licence – Canada. Not affiliated with nor endorsed by Pelmorex.
