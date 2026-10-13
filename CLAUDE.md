# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for
human contributors.

## What this is

A Gladys Assistant **external integration** of type `weather`: a Node.js
service (Node 22+, ESM, no build step) in its own sandboxed Docker container,
talking to Gladys through `@gladysassistant/integration-sdk` (v0.15). It
answers `onWeatherGet` with the pivot weather format (contract B.18 of the
Gladys spec `docs/specs/external-integrations/capabilities/weather-type.md`),
from MétéoMédia (Pelmorex) with an ECCC fallback, and adds a dashboard widget
and a scene trigger. Started from `GladysAssistant/integration-template-js`.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/provider.test.js         # one file
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npm run audit                             # npm audit --omit=dev
npx github:GladysAssistant/integration-store .   # store admission checks
```

Run `format:check`, `lint`, `test` and `audit` before every commit.

## Architecture

```
index.js                    SDK wiring only (handlers registered before connect())
src/provider.js             caches, primary/fallback, alerts, images -> pivot
src/pivot.js                metric snapshot -> pivot (units, language, limits)
src/sources/pelmorex.js     MétéoMédia API -> snapshot
src/sources/ecccCitypage.js ECCC city pages -> snapshot (fallback, UV)
src/sources/ecccAlerts.js   ECCC weather alerts -> bilingual alerts
src/sources/ecccRadar.js    radar PNG (GeoMet + NRCan base map, pngjs)
src/feelsLike.js            humidex, wind chill, levels (pure)
src/assessment.js           index/level of a snapshot, synthetic alerts
src/indicators.js           muggy night, black ice, pressure trend (pure)
src/sun.js                  sunrise/sunset, day/night (pure)
src/conditions.js           icon codes -> pivot conditions
src/watcher.js              5-min loop: alerts nudge, scene events, widget nudge
src/sceneTriggers.js        feels-like level tracker (baseline, hysteresis)
src/widgets.js              "feels_like" widget content
src/actions.js              "test_sources" button
src/i18n.js                 runtime texts (fr/en)
test/fixtures/              recorded API answers (2026-10-10)
test/helpers/fakeFetch.js   fake fetch: tests never touch the network
```

A **snapshot** is the source-independent internal model: always metric
pivot units (°C, m/s, hPa, mm, km), no language. Conversions to the request
happen only in `src/pivot.js` (and in the widget / scene texts).

## Rules

- **Unofficial, personal use.** Pelmorex's terms of use forbid automated
  access without written consent. The maintainer chose (2026-10-12) to
  keep the project public in the Gladys store (topic
  `gladys-assistant-integration`): never remove the topic. Every
  user-facing surface (manifest description and intro, cover, README, docs)
  says "unofficial connector, personal use". Never use MétéoMédia logos or
  icons, and keep the "not affiliated with Pelmorex" notice.

- **Keys are forever**: manifest `config_schema`, `actions`, widget,
  scene-trigger and level keys (`cold_high`…) are stored in user scenes and
  dashboards. Never rename them.
- **Gladys awaits `onWeatherGet` under 15 s**: keep the timeouts in
  `src/constants.js` (5 s primary, 4 s fallback) and the cache.
- **The Pelmorex API is undocumented**: parse defensively (`num()`, optional
  chaining), never trust a field to exist. Always query by coordinates.
- **Read-only rootfs**: write nothing outside `/data` (we write nothing).
- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag.
- **Changelog**: every user-visible change adds a line under
  `## [Unreleased]` in `CHANGELOG.md`.
- **Manifest texts** are `{ en, fr }` objects; the catalog description holds
  10 to 100 characters per language; `test/manifest.test.js` ties the
  manifest to the code. `source: "houses"` is refused by the store schema:
  houses are matched by name.
- **User-facing text** is bilingual, `docs/en.md` and `docs/fr.md` kept in
  sync. Comments explain why, in English.
- **Tests never touch the network** (`installFetch` throws on an unknown URL).

## CI and pushes

- Group the commits and push **at most once a day**, unless the maintainer
  explicitly asks otherwise: the GitHub Actions quota is limited.
- If every CI job fails in under 2 seconds, the quota is exhausted: it is
  not a bug in the code.
- The Docker image cannot be built in the Claude Code cloud container (no
  network for `apk` inside `docker build`): the CI builds it.

## Refreshing the fixtures

```bash
UA="gladys-meteomedia/dev (+https://github.com/LM1LC3N7/gladys-meteomedia)"
for e in observation hourly longterm; do
  curl -sA "$UA" "https://weatherapi.pelmorex.com/api/v1/$e?locale=en-CA&lat=45.5017&long=-73.5673&unit=metric" \
    | python3 -m json.tool --indent 1 > test/fixtures/pelmorex-montreal-$e.json
done
curl -s "https://api.weather.gc.ca/collections/citypageweather-realtime/items/qc-147?f=json" \
  | python3 -m json.tool --indent 1 > test/fixtures/eccc-citypage-montreal.json
```

`FIXTURE_NOW` in `test/helpers/fakeFetch.js` must then follow the recording
time. `eccc-alerts.json` holds real alert properties with their polygons
simplified to bounding boxes.
