# Étude : intégrations Gladys Assistant pour les transports en commun au Canada

*Date : 10 octobre 2026. Gladys v5.1.4 est la dernière version (2 octobre 2026). Sauf mention contraire, chaque point d'accès (endpoint) cité a été appelé le 10 octobre 2026. Les points non vérifiés sont signalés par ⚠.*

## 1. Verdict

**Oui, c'est faisable. Le Canada s'y prête même mieux que la France.**

- **Côté Gladys.** Il faut passer par une **intégration externe** : un conteneur Docker publié depuis ton propre dépôt GitHub. Elle est indexée automatiquement dans le store, sans PR ni validation du mainteneur. Les horaires de transport sont explicitement exclus du cœur de Gladys (voir §2).
- **Côté données.** Presque tout le Canada utilise un seul standard, **GTFS / GTFS-RT**. Une grande partie de ces flux temps réel est **ouverte et sans clé** : TTC, MiWay, YRT, Hamilton, London, Calgary, Edmonton, Halifax, BC Transit, Saskatoon, Saguenay. Un seul lecteur GTFS-RT générique couvre donc des dizaines de réseaux. En France, il fallait jongler entre SIRI, SIRI-Lite et GTFS-RT.
- **Personne ne l'a encore fait.** Le store Gladys ne contient aucune intégration de transport canadienne. La seule intégration de transport existante concerne Lyon (`prohand/gladys-transport-commun-lyonnais`). Elle sert de modèle.
- **Le cas Montréal (STM) est le plus intéressant, et le plus exigeant.** Il faut une clé par utilisateur et un quota de 10 000 appels/jour. L'état du métro passe par une API JSON à part (« i3 »). Le fichier d'horaires statiques est très lourd (voir §3.1).

## 2. Le modèle « intégration externe » de Gladys

| Élément | Détail |
|---|---|
| Versions minimales | 4.84.0 pour les intégrations externes, **5.1.0** pour les widgets, déclencheurs et actions de scène |
| Point de départ | template [`GladysAssistant/integration-template-js`](https://github.com/GladysAssistant/integration-template-js), SDK `@gladysassistant/integration-sdk`, Node ≥ 22 |
| Manifeste | `gladys-assistant-integration.json`, plus `docs/fr.md` et `docs/en.md`. Ces deux langues suffisent pour un public canadien. |
| Publication | topic GitHub `gladys-assistant-integration`, indexé toutes les heures par [integration-store](https://github.com/GladysAssistant/integration-store) |
| Sandbox | **256 Mo de RAM**, 0,5 CPU, système de fichiers en lecture seule sauf `/data`, réseau sortant libre |

Documentation : <https://gladysassistant.com/docs/dev/external-integrations/>

**Ce qu'une intégration peut exposer**

- **Features.** Il n'existe pas de catégorie « transport ». On utilise `duration/integer` en minutes pour les temps d'attente (avec `keep_history: false`) et `text/text` pour la ligne, la destination ou l'état du métro.
- **Widgets.** Jusqu'à 5, avec des composants déclaratifs : `status`, `card-list`, `value`, etc. Exemples : un tableau des prochains départs ou l'état des lignes de métro.
- **Déclencheurs de scène.** Exemples : « bus dans N min », « interruption ligne orange », « station BIXI vide ».
- **Actions.** Par exemple « rechercher un arrêt ».

**Pourquoi pas le cœur de Gladys ?** La spec officielle cite « transport schedules » et « next departures » parmi ce qui relève de l'externe. Une PR de widget « Sorties Cinéma » a d'ailleurs été refusée pour cette raison de périmètre.

**Prototyper sans code.** Une scène Gladys peut appeler une API à intervalle régulier avec une requête HTTP et utiliser la réponse via `{{data.xxx}}`. Ça marche pour du JSON, comme l'état du métro i3 ou Winnipeg v4. Ça ne marche **pas** pour le GTFS-RT, qui est du protobuf.

## 3. Sources de données

### 3.1 Québec

| Réseau | Temps réel | Authentification et quota | Licence et attribution |
|---|---|---|---|
| **STM Montréal** | GTFS-RT TripUpdates et VehiclePositions (**bus seulement**), plus l'API **i3 « état du service »** (métro et bus, en JSON) | en-tête `apiKey`, compte personnel sur le [portail développeurs](https://portail.developpeurs.stm.info/apihub). **10 req/s et 10 000/jour par compte, toutes applis confondues.** | CC BY 4.0, citer la STM. ⚠ Les conditions interdisent de développer une appli d'*horaires de métro* à partir de leurs horaires. |
| **exo** (trains de banlieue, bus des couronnes) et **RTL** Longueuil | GTFS-RT (trip, vehicle, alert) par secteur via **Chrono SAEIV** | en-tête `Ocp-Apim-Subscription-Key` ou `?token=`, inscription sur [portail-developpeur.chrono-saeiv.com](https://portail-developpeur.chrono-saeiv.com/). Quota ⚠ non publié. | CC BY 4.0 (exo), conditions propres à RTL |
| **REM** | GTFS-RT **alertes seulement** | aucune | Le flux est hébergé par l'appli Transit : son statut officiel n'est pas établi ⚠. |
| **STL** Laval | GTFS-RT sur demande par courriel, ou ancien flux XML Umo (ex-NextBus) sans clé | Umo : aucune | Ses conditions interdisent l'usage commercial ; Données Québec affiche pourtant CC-BY. Les deux se contredisent ⚠. |
| **RTC** Québec | **aucun temps réel public trouvé** ⚠ (seulement des GTFS statiques de 32 Mo) | — | La mention d'attribution est obligatoire. |
| **STO** Gatineau | GTFS-RT (trip, vehicle, alert) | clé publique, plus un hash SHA-256 (clé privée + date UTC). **120 téléchargements par tranche de 10 min.** Une clé par utilisateur, non transférable. | La mention d'attribution est obligatoire. |
| **STS** Sherbrooke | GTFS-RT | sans clé selon le catalogue ; serveur injoignable depuis mon environnement, donc ⚠ | CC BY 4.0 |
| **Saguenay** | GTFS-RT | **aucune (vérifié)** | ⚠ non précisée |
| Petits réseaux (Saint-Jean-sur-Richelieu, Pierre-De Saurel, L'Inter des Laurentides, Saint-Hyacinthe…) | GTFS-RT via Zenbus ou Hubup | aucune | variable |
| **VIA Rail** | pas de temps réel officiel. Il existe un JSON non officiel, `tsimobile.viarail.ca/data/allData.json`. | aucune | GTFS sous Licence du gouvernement ouvert – Canada. Le JSON n'a **aucune licence** : réservé à un usage personnel. |
| **BIXI** / **àVélo** | GBFS : `gbfs.velobixi.com/gbfs/2-2/gbfs.json` et `quebec.publicbikesystem.net/customer/gbfs/v3.0/gbfs.json` | aucune | ⚠ non précisée |
| **Routes (MTMD / Québec 511)** | Flux WFS en GeoJSON : `evenements`, `chantiers_mtmdet`, `conditions_routieres` (conditions hivernales), `infos_cameras` | aucune | CC BY 4.0 |

**Taille des horaires statiques.** Le fichier GTFS de la STM fait 43 Mo compressé, et son `stop_times.txt` **202 Mo décompressé**. Pour la RTC, c'est 174 Mo. Avec 256 Mo de RAM, il faut lire ces fichiers en flux et ne garder que les arrêts choisis par l'utilisateur.

**Catalogues de flux.**
- [Données Québec](https://www.donneesquebec.ca/recherche/api/3/action/package_search?q=gtfs) recense 22 jeux GTFS, consultables par une API sans clé. Plusieurs liens sont périmés (exo, STS).
- La [Mobility Database](https://files.mobilitydatabase.org/feeds_v2.csv) (MobilityData, basée à Montréal) fournit un CSV complet sans jeton, qui indique pour chaque flux s'il faut une clé et sous quel nom. Son API, elle, demande un compte.

### 3.2 Reste du Canada

| Réseau | Temps réel | Authentification et quota | Remarques |
|---|---|---|---|
| **TTC Toronto** | GTFS-RT sur `gtfsrt.ttc.ca` : `/trips/update`, `/trips/subway` (métro depuis juin 2026), `/vehicles/position`, `/alerts/*` | **aucune** | Licence du gouvernement ouvert – Toronto (attribution). Le GTFS complet pèse 84 Mo compressé et 432 Mo décompressé, et doit être rechargé chaque mois. Le flux `gtfsrt.ttc.ca` correspond au fichier `completegtfs.zip`, et `bustime.ttc.ca` à `surfacegtfs.zip`. |
| **GO Transit / UP Express** (Metrolinx) | GTFS-RT et API JSON (`NextService`, `UnionDepartures`, alertes) | `?key=`, compte gratuit. La clé peut être coupée en cas d'abus. | Licence du gouvernement ouvert – Ontario |
| MiWay, Brampton, YRT, Hamilton (HSR), London (LTC), Durham, Burlington, Barrie, Kingston | GTFS-RT | **aucune** | Le flux TripUpdates de London pèse 4,4 Mo, ce qui pèse lourd en mémoire. Le GRT (Waterloo) n'a pas pu être vérifié : son serveur filtre les adresses IP hors Canada ⚠. |
| **OC Transpo** Ottawa | GTFS-RT VehiclePositions et TripUpdates (environnement « beta »), sans flux d'alertes | `Ocp-Apim-Subscription-Key`, compte gratuit. Quota ⚠ non publié. | L'ancienne API 2.0 a été retirée le 30 avril 2025. Le GTFS pèse 70 Mo. |
| **TransLink** Vancouver | GTFS-RT v3 | `?apikey=`, inscription soumise à approbation. **1 000 appels/jour.** | L'ancienne API RTTI a disparu. Mention obligatoire : « Some of the data used in this product or service is provided by permission of TransLink ». |
| **BC Transit** (Victoria, Kelowna, etc.) | GTFS-RT | aucune | Citer BC Transit. |
| **Calgary, Edmonton, Saskatoon, Halifax** | GTFS-RT | aucune | Calgary met son flux à jour toutes les 30 s. Saskatoon a changé d'hôte et le catalogue n'est pas à jour. |
| **Regina** | GTFS-RT, **alertes seulement** | aucune | |
| **Winnipeg Transit** | pas de GTFS-RT, mais une API REST v4 en JSON (horaires des arrêts, avis de service) | `?api-key=`, **100 req/min** | données sous licence PDDL (domaine public) |
| Nouveau-Brunswick, Terre-Neuve | GTFS statique seulement | — | |
| **Vélos en libre-service** | GBFS : Bike Share Toronto, Mobi Vancouver, Hamilton. Lime et Bird à Ottawa, Calgary et Edmonton. | aucune | Ottawa n'a pas de vélopartage municipal. |

### 3.3 Agrégateurs

- **Transitous** ([API MOTIS](https://transitous.org/api/), sans clé) :
  - Ses données incluent du temps réel pour exo, MiWay, YRT, London, Calgary, Edmonton, Halifax, Saskatoon, Victoria, TransLink et OC Transpo.
  - **Elles n'en incluent pas pour la STM, la RTC, la STO, la STS ni la TTC.**
  - Le service est réservé aux projets open source non commerciaux. Il faut envoyer un User-Agent avec un contact et prévenir l'équipe avant un usage par beaucoup d'utilisateurs.
  - C'est un bon **complément** sans clé, mais ça ne suffit pas pour Montréal.
- **Appli Transit** : le palier gratuit de son API (5 appels/min, 1 500/mois) est trop faible pour du polling.

## 4. Contraintes techniques (256 Mo de RAM)

- **Mémoire au décodage.** Mesures sous Node 22 : décoder le TripUpdates de la TTC (531 Ko) fait monter la mémoire du processus à environ 84 Mo, et celui de London (4,4 Mo) à environ 158 Mo. Pour tenir dans 256 Mo :
  - décoder **un flux à la fois** ;
  - filtrer tout de suite sur les arrêts suivis, puis libérer l'objet décodé ;
  - demander les réponses compressées (gzip) et utiliser les ETag.
- **Bibliothèque protobuf.** `gtfs-realtime-bindings` 2.2 ajoute environ 28 Mo de dépendances. `protobufjs` avec le `.proto` officiel, ou `gtfs-rt-bindings`, sont plus légers.
- **GTFS statique.** Ne jamais charger `stop_times` en mémoire ni en SQLite. Il faut le lire en flux (`yauzl` et `csv-parse`) en ne gardant que les arrêts choisis. Une alternative : ne prendre que `stops.txt` pour les noms, et les heures prévues directement dans les TripUpdates.
- **Quotas, budget de polling par réseau :**
  - **STM :** TripUpdates toutes les 30 s et i3 toutes les 2 min ≈ 6 500 appels/jour, sur 10 000 autorisés.
  - **TransLink :** 1 000 appels/jour, soit un appel toutes les 90 s environ.
  - **STO :** 120 téléchargements par tranche de 10 min.
  - Il faut donc des intervalles configurables, avec éventuellement des plages horaires (par exemple « matin 7 h–9 h »).
- **Clés API.** Une clé saisie par chaque utilisateur, jamais de clé embarquée dans le code. Les quotas sont comptés par compte (STM, TransLink), et les conditions de la STO interdisent de transférer sa clé.
- **Attribution.** Il faut afficher la mention exigée par chaque réseau dans la doc et dans le widget : RTC, STO, TransLink, Toronto, Halifax, Metrolinx…

## 5. Options et recommandation

| Option | Contenu | Avantages | Inconvénients |
|---|---|---|---|
| **A. Intégration générique « Transit Canada »** | un lecteur GTFS-RT, plus des préréglages par réseau (URL, type de clé, attribution) | une seule base de code pour plus de 25 réseaux ; GTFS-RT est déjà le standard commun | configuration plus riche ; ne couvre pas les API spécifiques (i3 de la STM, Winnipeg v4, API JSON de GO) |
| **B. Intégrations dédiées** | `gladys-stm`, `gladys-ttc`, `gladys-go`… | une expérience sur mesure pour chaque réseau | code dupliqué |
| **C. Prototype par scène HTTP** | sans code | immédiat | JSON seulement, donc i3 et Winnipeg uniquement |

**Recommandation.** C'est l'inverse de la France : **commencer par une intégration dédiée à Montréal, puis généraliser.**

1. **`gladys-stm` (Montréal).** C'est la plus forte valeur et elle n'existe pas :
   - **Prochains passages de bus.** GTFS-RT avec la clé de l'utilisateur. Une feature `duration` par passage.
   - **État des lignes de métro** (verte, orange, jaune, bleue). Via i3 : une feature texte par ligne, et un déclencheur « interruption de service ». Ce cas est utile, simple, et ne dépend pas des horaires de métro que les conditions de la STM excluent.
   - **Bonus : stations BIXI** via GBFS, sans clé.
   - **Widgets :** « Prochains départs », « État du métro », « BIXI ».
2. **`gladys-transit-canada` (générique GTFS-RT)** :
   - préréglages sans clé : TTC, MiWay, YRT, Hamilton, London, Calgary, Edmonton, Halifax, BC Transit, Saskatoon, Saguenay ;
   - préréglages avec clé : exo et RTL (Chrono), STO (clé et hash), OC Transpo, TransLink, GO ;
   - découverte des flux possible via le CSV de la Mobility Database.
   - Le lecteur GTFS-RT et le filtrage par arrêt écrits pour l'étape 1 sont réutilisés ici.
3. **`gladys-velos` (GBFS)** : BIXI, àVélo, Bike Share Toronto, Mobi, Lime et Bird.
4. **Piste en synergie avec `gladys-meteomedia`** : les **conditions routières hivernales et les entraves du MTMD** (WFS ouvert, CC BY 4.0). On les présente avec la météo : « Météo et routes ». Déclencheur possible : « chaussée glacée sur mon trajet ».

**À écarter ou à garder en option personnelle :**
- l'ancien flux NextBus/Umo de la TTC, officiellement retiré même s'il répond encore ;
- le JSON non officiel de VIA Rail ;
- le temps réel de la RTC, qui n'existe pas publiquement.

## 6. Prochaines étapes

1. Lire le code de l'intégration TCL (Lyon) et du template JS.
2. Créer un compte développeur STM, vérifier le quota et le format réel d'i3. Le format actuel vient de code communautaire ⚠.
3. Écrire un prototype de `gladys-stm` : un arrêt de bus et l'état des 4 lignes de métro, en mesurant la mémoire dans un conteneur limité à 256 Mo.
4. Ouvrir un sujet sur le forum Gladys pour annoncer le projet.
5. Avant l'option générique, contacter Transitous et vérifier les conditions de Chrono et d'OC Transpo.

## Points non vérifiés (⚠)

- Quotas et conditions de Chrono (exo, RTL) et d'OC Transpo ; couverture de l'O-Train.
- Format exact d'i3 v2 de la STM.
- Disponibilité en direct des flux STS et GRT (serveurs injoignables depuis une adresse IP hors Canada).
- Absence réelle de temps réel à la RTC ; statut officiel du flux d'alertes du REM.
- Licences de Saguenay, BIXI, àVélo, Brampton, Edmonton, Saskatoon et Mobi.
- Position de VIA Rail sur la réutilisation de son JSON `tsimobile`.

## Sources principales

- Gladys, intégrations externes : <https://gladysassistant.com/docs/dev/external-integrations/>. Spec : <https://github.com/GladysAssistant/Gladys/tree/master/docs/specs/external-integrations>
- Intégration de référence (Lyon) : <https://github.com/prohand/gladys-transport-commun-lyonnais>
- STM développeurs : <https://www.stm.info/fr/a-propos/developpeurs>. Conditions : <https://www.stm.info/fr/a-propos/developpeurs/condition-dutilisation>
- exo, données ouvertes : <https://exo.quebec/fr/a-propos/donnees-ouvertes>. Chrono : <https://portail-developpeur.chrono-saeiv.com/>
- RTC : <https://www.rtcquebec.ca/donnees-ouvertes>. STO : <https://sto.ca/en/business/developer-space-open-data/terms-of-use-stos-open-data-and-api-key/>. STL : <https://stlaval.ca/affaires/donnees-ouvertes>
- Données Québec : <https://www.donneesquebec.ca/>. Mobility Database : <https://files.mobilitydatabase.org/feeds_v2.csv>
- TTC GTFS-RT : <https://gtfsrt.ttc.ca/>. Metrolinx : <https://api.openmetrolinx.com/OpenDataAPI/>. OC Transpo : <https://nextrip-public-api.developer.azure-api.net/>
- TransLink : <https://www.translink.ca/about-us/doing-business-with-translink/app-developer-resources>. Winnipeg : <https://api.winnipegtransit.com/>
- VIA Rail : <https://www.viarail.ca/en/developer-resources>
- Transitous : <https://transitous.org/api/>. Configuration Canada : <https://github.com/public-transport/transitous/tree/main/feeds>

## Annexe : rappel pour la France (première version de l'étude)

- Île-de-France (PRIM) : clé par utilisateur, environ 1 000 appels/jour.
- SNCF : jeton personnel, 5 000/jour, ou flux GTFS-RT ouverts sur transport.data.gouv.fr.
- Ailleurs : 219 jeux GTFS-RT recensés sur transport.data.gouv.fr.
- Lyon est déjà couvert par l'intégration TCL. Le détail est dans l'historique git de ce fichier (premier commit).
