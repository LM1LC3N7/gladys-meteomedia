# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- MétéoMédia (Pelmorex) weather provider: current conditions, 24 hours and
  8 days in the Gladys pivot format, metric and US units, MétéoMédia
  feels-like as apparent temperature.
- Environment Canada fallback when MétéoMédia fails, and the ECCC UV index.
- Official Environment Canada alerts, with a refresh request to Gladys when
  they change (the core "weather alert" scene trigger fires within minutes).
- "Feels like" dashboard widget: humidex or wind chill with its risk level,
  gust wind chill, worst hour of the next 24 hours, time to frostbite, muggy
  night, black ice risk, pressure trend.
- "Feels-like level changed" scene trigger.
- Precipitation radar image (ECCC radar over an NRCan base map).
- Optional synthetic feels-like alerts (off by default).
- "Test the weather sources" button in the Configuration screen.

[Unreleased]: https://github.com/LM1LC3N7/gladys-meteomedia/commits/main
