# TODO

## Open points to validate with the maintainer

- [ ] **Repository name and licence** — `gladys-meteomedia`, Apache-2.0 (the
      template's) for now.
- [ ] **Public store publication** — subject to the Pelmorex terms of use:
      the API is undocumented and reserved for their own apps a priori. Do
      not add the `gladys-assistant-integration` topic before checking.
      The name "MétéoMédia" is a Pelmorex trademark: a neutral name may be
      required.
- [x] **ECCC alert endpoint** — `api.weather.gc.ca/collections/weather-alerts`
      (verified 2026-10-10: polygons, `risk_colour_en`, `alert_type`,
      `status_en`).
- [x] **ECCC radar** — GeoMet WMS `RADAR_1KM_RRAI` + `RADAR_1KM_RSNO`
      (one layer per request), NRCan `CBMT` base map.
- [ ] **Snow conversion** — 10:1 snow-to-liquid ratio (1 cm of snow = 1 mm
      of water), documented; to confirm.
- [ ] **Synthetic alert severities** — great discomfort / high cold →
      moderate, dangerous / very high & severe cold → severe, heat stroke /
      extreme cold → extreme; to confirm.

## Before the first release

- [ ] Check the CI (Docker build, Node 22 and 24).
- [ ] Turn on "Private vulnerability reporting" (SECURITY.md points there).
- [ ] Run the store validator once the image is published.
- [ ] Test on a real Gladys 5.1+: widget rendering, scene trigger in the
      editor, radar in the weather widget, alert nudges.

## Ideas

- [ ] Persist the last snapshot in `/data` so a restart during an outage
      still serves the weather.
- [ ] Monitor the Pelmorex API shape (a scheduled CI job comparing the live
      answer with the fixtures' keys).
- [ ] Air quality (ECCC AQHI collections) and its own widget.
- [ ] Nowcast-like "rain in the next hour" trigger from the radar.
- [ ] Map MétéoMédia `pressure.trendKey` once its values are understood
      (1, 2, 3 observed; not used today).
