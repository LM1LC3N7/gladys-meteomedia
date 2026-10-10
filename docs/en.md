# MétéoMédia for Gladys

This integration makes **MétéoMédia** (The Weather Network) the weather
provider of Gladys: the dashboard weather widget and the assistant ("what
will the weather be tomorrow?") use its forecasts. It is built for Québec
and Canada: humidex in summer, wind chill in winter, official Environment
Canada alerts, precipitation radar.

## Installation

1. Install the integration from the Gladys catalog (Gladys 5.1 or later).
2. Accept the access to the **location of your houses**: the weather is the
   one of the house, nothing else to enter.
3. Make sure your house is on the map (**Settings → Houses**). No location,
   no weather.
4. In the **Configuration** screen, click **Test the weather sources**: the
   message tells what each source answered.

Once installed, the integration takes precedence over the OpenWeather
service built into Gladys. The weather widget can also pin it explicitly.

## Configuration

- **Environment Canada alerts** (on by default) — official warnings,
  watches, advisories and statements covering your house. They show in the
  weather widget and feed the Gladys "Weather alert" scene trigger. When an
  alert appears, changes level or ends, the integration tells Gladys within
  minutes instead of waiting for its 30-minute check.
- **Feels-like alerts (estimates)** (off by default) — adds an alert when
  the computed humidex or wind chill reaches a real risk (great discomfort,
  high frostbite risk...). They are not official, and they mix with the
  Environment Canada alerts.
- **Fallback source** — Environment Canada (default) or none. Used when
  MétéoMédia does not answer; it also provides the UV index, which
  MétéoMédia does not give.
- **Precipitation radar** (on by default) — an Environment Canada radar
  image of 300 × 200 km centered on your house. Turn on the "provider
  images" option of the weather widget to see it.

## The "Feels like" widget

Add the **Feels like** widget to a dashboard. It shows:

- the index that applies now: **humidex** from 20 °C, otherwise **wind
  chill**, with its **risk level** on the Environment Canada scales;
- the MétéoMédia feels-like, the temperature and, in winter, the wind chill
  **in the gusts** (in summer, the dew point);
- the feels-like and the temperature over the next 24 hours, with the
  **worst hour**;
- the **time to frostbite** of exposed skin, the **muggy night** (night dew
  point of 18 °C or more), the **black ice risk** (freezing rain, freezing
  fog or precipitation around 0 °C) and the 3-hour **pressure trend**.

**House** setting: the name of the house to show. Empty: the first located
house.

### Levels

| Level                | Index                                                  |
| -------------------- | ------------------------------------------------------ |
| Extreme cold         | wind chill of −55 or colder (frostbite in under 2 min) |
| Severe cold          | −48 to −54 (frostbite in 2 to 5 min)                   |
| Very high cold       | −40 to −47 (frostbite in 5 to 10 min)                  |
| High cold            | −28 to −39 (frostbite in 10 to 30 min)                 |
| Moderate cold        | −10 to −27                                             |
| Low risk             | anything else                                          |
| Some discomfort      | humidex 30 to 39                                       |
| Great discomfort     | humidex 40 to 45                                       |
| Dangerous            | humidex 46 to 53                                       |
| Heat stroke imminent | humidex 54 or more                                     |

## Scenes: "Feels-like level changed"

This trigger starts a scene when the feels-like level of a house changes.
It is checked every 5 minutes. Filters, all optional:

- **Level reached** — e.g. "High cold". The scene fires even when the index
  jumps over this level (from "moderate" to "very high").
- **Direction** — "Getting worse" or "Getting better".
- **House** — the exact name of the house in Gladys (empty = every house).

The following actions can read `{{triggerEvent.data.summary}}` (a sentence
ready to send), `{{triggerEvent.data.value}}`,
`{{triggerEvent.data.current_level}}`, etc.

Examples: close the blinds and start the air conditioning at "Great
discomfort"; turn on the block heater or send a notification at "High
cold".

To avoid bursts, a level is only left with a one-degree margin, and the
first evaluation after a start fires nothing.

## Good to know

- **Snow**: snow amounts are converted to their water equivalent with the
  usual 10:1 ratio (10 cm of snow = 10 mm of water).
- **Outside Canada**: MétéoMédia answers, but there is no Environment
  Canada fallback, alert nor radar.
- **MétéoMédia has no public API**: the integration uses the one of its
  website, which may change without notice. The Environment Canada fallback
  then takes over, and the last known weather stays displayed for up to 3
  hours if everything fails.
- Data is cached 10 minutes (5 for the alerts).

## Sources and licences

Forecasts: MétéoMédia / The Weather Network (Pelmorex). Alerts, fallback,
UV index and radar: Environment and Climate Change Canada. Radar base map:
Natural Resources Canada. The data of both federal agencies is published
under the Open Government Licence – Canada. This integration is neither
affiliated with nor endorsed by Pelmorex.
