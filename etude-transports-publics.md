# Étude : intégrations Gladys Assistant pour les transports publics

*Date : 10 octobre 2026. Gladys v5.1.4 est la dernière version publiée (2 octobre 2026).*

## 1. Verdict

**Oui, c'est faisable**, et c'est même le cas d'usage que Gladys a prévu pour ses **intégrations externes**.

- **Ne pas viser le cœur de Gladys.** La spec officielle cite « transport schedules » et « next departures » parmi les sujets qui relèvent des intégrations externes. La PR #3061 (widget « Sorties Cinéma ») a été fermée pour cette raison de périmètre, alors que son code était propre.
- **L'intégration externe est la bonne voie.** C'est un conteneur Docker publié depuis ton propre dépôt GitHub. Il est indexé automatiquement dans le store, sans PR ni validation du mainteneur.
- **Un précédent existe :** [`prohand/gladys-transport-commun-lyonnais`](https://github.com/prohand/gladys-transport-commun-lyonnais) couvre le réseau TCL de Lyon. C'est l'implémentation de référence à étudier.
- **Rien n'existe encore pour l'Île-de-France, la SNCF ou la France entière.** Ni le store ni le forum ne contiennent d'intégration Île-de-France (IDFM/RATP), SNCF, ou multi-réseaux. La place est libre.

## 2. Le modèle « intégration externe » de Gladys

| Élément | Détail |
|---|---|
| Versions mini | 4.84.0 pour les intégrations externes, **5.1.0** pour les widgets, déclencheurs et actions de scène |
| Point de départ | template [`GladysAssistant/integration-template-js`](https://github.com/GladysAssistant/integration-template-js) et SDK `@gladysassistant/integration-sdk` |
| Manifeste | `gladys-assistant-integration.json` à la racine, plus `docs/fr.md` et `docs/en.md` (300 caractères minimum chacun) |
| Publication | topic GitHub `gladys-assistant-integration`, puis indexation horaire par [integration-store](https://github.com/GladysAssistant/integration-store) |
| Validation locale | `npx github:GladysAssistant/integration-store .` |
| Sandbox | 256 Mo de RAM, 0,5 CPU, système de fichiers en lecture seule sauf `/data`, réseau sortant libre |
| Langage | libre (Docker), mais le SDK n'existe qu'en JS/Node |

Documentation : <https://gladysassistant.com/docs/dev/external-integrations/>

### Ce qu'on peut exposer

- **Devices et features.**
  - Il n'existe pas de catégorie « transport », et il ne faut pas compter en obtenir une : les catégories doivent décrire des capacités et s'appuyer sur les standards Matter ou Zigbee.
  - On utilise donc :
    - `duration/integer` (unité `minutes`) pour les temps d'attente, avec `keep_history: false` ;
    - `text/text` pour la ligne, la destination ou une perturbation.
  - Ces features sont mises à jour avec `publishState`, ou `publishStates` par lot (100 maximum).
- **Widgets de tableau de bord** (type `external-widget`).
  - Le manifeste en déclare jusqu'à 5.
  - Le contenu est un arbre déclaratif (pas de HTML) construit avec les composants `text`, `value`, `gauge`, `status` (10 lignes maximum), `card-list`, `chart`, `image` et `button`.
  - Un rafraîchissement peut être demandé avec `widget.refresh`, limité à une fois toutes les 10 s.
  - C'est idéal pour un tableau des prochains départs.
- **Déclencheurs de scène.** Exemples : « départ imminent (< N min) », « perturbation sur la ligne X ». Ils fournissent des variables utilisables dans les messages : arrêt, ligne, direction, minutes.
- **Actions.** Exemples : « rechercher un arrêt », « rafraîchir maintenant ».
- **Polling.** Le SDK propose `onPoll` aux fréquences du cœur (1 s à 60 s). Il faudra limiter les appels selon les quotas des API (voir §3).

### Alternatives sans développer d'intégration

Elles servent à prototyper, pas à produire une solution durable :

- **Scène + requête HTTP.**
  - Une scène lancée à intervalle régulier appelle l'API ; la réponse est disponible dans les étapes suivantes via `{{data.xxx}}`.
  - On peut ensuite écrire la valeur dans une feature texte ou envoyer un message.
  - Ça suffit pour un seul arrêt SIRI-Lite en JSON, mais pas pour du GTFS-RT, qui est du protobuf.
- **MQTT ou Node-RED.** Un script externe publie sur `gladys/master/device/<device>/feature/<feature>/state` (ou `/text` pour une valeur texte).

## 3. Sources de données transport (France d'abord)

| Source | Authentification | Quota | Temps réel | Format | Couverture | Difficulté |
|---|---|---|---|---|---|---|
| **PRIM IDFM** | clé `apikey` personnelle (compte gratuit) | **~1 000 appels/jour** pour les clés récentes (≈ 1 appel/86 s) | oui | SIRI-Lite JSON, Navitia | Île-de-France, tous opérateurs (RATP, Transilien…) | moyenne |
| **API SNCF** (api.sncf.com, Navitia) | jeton personnel, Basic auth | 5 000/jour | oui | JSON Navitia | trains SNCF | facile |
| **SNCF via le proxy du PAN** | aucune | limite du proxy | oui | GTFS-RT, SIRI-Lite | TGV, Intercités, TER | moyenne (il faut le GTFS pour les identifiants) |
| **transport.data.gouv.fr (PAN)** | souvent aucune | limite du proxy | 219 jeux GTFS-RT, 42 SIRI, 7 SIRI-Lite | GTFS-RT, SIRI(-Lite) | toute la France | moyenne (particularités de chaque réseau) |
| **Transitous** (MOTIS) | aucune, User-Agent obligatoire | usage raisonnable, prévenir l'équipe | oui | JSON | monde entier, dont la majorité de la France | **la plus simple**, mais risque sur la politique d'usage |
| **GBFS** (vélos en libre-service) | aucune | aucun | oui | JSON | 155 systèmes en France (Vélib', Vélo'v…) | facile |
| Navitia.io | jeton | ≈ 5 000/mois (chiffre ancien) | oui | JSON | plusieurs régions | **à éviter** (avenir incertain) |
| iRail (Belgique), transport.opendata.ch (Suisse) | aucune | 3 req/s, ou usage raisonnable | oui | JSON | rail belge, transports suisses | facile |

### Particularités par réseau

| Réseau | Temps réel | Authentification |
|---|---|---|
| Bordeaux TBM | SIRI-Lite et GTFS-RT | clé publique `opendata-bordeaux-metropole-flux-gtfs-rt` |
| Lyon TCL | SIRI-Lite | compte data.grandlyon, Basic auth |
| Strasbourg CTS | SIRI-Lite | jeton demandé par mail |
| Toulouse Tisséo | GTFS-RT | aucune (clé pour l'API v2) |
| Rennes STAR, Nantes Naolib, Montpellier TaM, Grenoble TAG, Lille Ilévia | GTFS-RT | aucune |

**Points pratiques**

- **RATP :** l'API publique historique n'existe plus. Le temps réel de la RATP passe désormais par PRIM.
- **Identifiants d'arrêt PRIM :** `STIF:StopPoint:Q:<id>:`, avec le « : » final. Les identifiants viennent des jeux open data IDFM `arrets` et `zones-d-arrets`, accessibles sans clé.
- **Le GTFS statique IDFM pèse 149 Mo :** c'est inexploitable sur un Raspberry Pi ou dans 256 Mo de RAM. Il faut s'appuyer sur les API temps réel et les jeux d'arrêts.
- **Les GTFS de villes pèsent de 5 à 10 Mo :** ça reste gérable. La lib `gtfs-realtime-bindings` est légère.

### Licences

- **Licence Ouverte :** citer la source suffit.
- **ODbL :** citer la source. Une intégration qui affiche les données localement ne redistribue pas de base de données, donc la clause de partage à l'identique ne s'applique pas. Il ne faut simplement pas embarquer de jeux de données dans le dépôt.
- **Licence Mobilités** (PRIM, Lyon) : le réutilisateur doit être identifié, donc **chaque utilisateur crée son propre compte et saisit sa clé**. Il ne faut jamais livrer de clé partagée dans le code.
- **Transitous :** réservé aux projets open source non commerciaux. Il faut envoyer un User-Agent avec le nom de l'appli et un contact, citer les sources et OSM, et **contacter l'équipe** avant un déploiement multi-utilisateurs.

## 4. Options d'architecture

| Option | Contenu | Avantages | Inconvénients |
|---|---|---|---|
| **A. Une intégration « Transports en France » multi-sources** | providers Transitous (défaut), PRIM, SNCF, GTFS-RT/SIRI-Lite générique, GBFS | un seul dépôt, une UX homogène, toute la France | plus gros chantier ; config plus complexe |
| **B. Plusieurs intégrations ciblées** | `gladys-idfm` (PRIM), `gladys-sncf`, `gladys-velos-gbfs`… | chaque intégration est simple, livrée vite, testée isolément | code SIRI/GTFS-RT dupliqué (sauf en le factorisant dans un paquet npm partagé) |
| **C. Prototype par scène HTTP** | aucune ligne de code | immédiat | un seul arrêt, pas de widget riche, fragile |

**Recommandation : option B, avec une bibliothèque commune.** Le TCL lyonnais existe déjà et marche bien sur ce modèle.

1. **`gladys-idfm` (PRIM).** Rien n'existe et c'est la plus forte demande. Le contenu prévu :
   - choix des arrêts avec l'action `search_stops`, qui interroge le jeu open data IDFM ;
   - une feature `duration` par prochain passage, plus des features texte ;
   - un widget « Prochains départs » et un widget « Perturbations » ;
   - un déclencheur « départ imminent » ;
   - **une stratégie de quota.** Avec 1 000 appels par jour : 1 arrêt toutes les 2 min sur 24 h, ou un intervalle plus court seulement sur des plages horaires (« matin 7 h–9 h »). C'est un réglage clé de l'UX.
2. **`gladys-sncf`** : départs et retards en gare, basés sur l'API SNCF (jeton personnel, 5 000 appels/jour).
3. **`gladys-velos` (GBFS)** : générique, sans clé ; on choisit un système parmi ceux du catalogue du PAN.
4. **Ensuite, un provider générique** couvrant Transitous, GTFS-RT et SIRI-Lite pour les autres villes. Il est à étudier après accord de l'équipe Transitous.

**Paquet commun suggéré :** parsers SIRI-Lite (stop-monitoring, general-message) et GTFS-RT, normalisés vers un format pivot `{ stop, line, direction, expectedAt, realtime, disruption }`, avec cache et gestion des quotas (ETag, backoff sur les 429).

## 5. Contraintes techniques

- **Pile technique :** Node ≥ 22 (le template et le TCL utilisent `node:test`, ESLint et Prettier), image Docker légère, état persistant dans `/data`.
- **Documentation :** obligatoire en français et en anglais, avec l'attribution des sources de données.
- **Intégration au cœur (non recommandée) :** il faudrait Node 24, Mocha, 100 % de couverture du patch et des traductions dans les 4 langues (en, fr, de, es). Ce serait pénible pour un sujet que le mainteneur a déjà jugé hors périmètre.

## 6. Prochaines étapes

1. Lire le code de l'intégration TCL et du template JS.
2. Créer un compte PRIM et vérifier le quota réellement attribué à la clé (les quotas varient selon la date de création).
3. Écrire un prototype minimal de `gladys-idfm` : 1 arrêt, features `duration`, poll toutes les 120 s.
4. Ouvrir un sujet sur le forum Gladys pour annoncer le projet et recueillir les besoins.
5. Contacter Transitous si l'option multi-villes est retenue.

## Points non confirmés

- Conditions actuelles de navitia.io.
- Date officielle de fermeture de l'API RATP.
- Correspondance exacte des identifiants d'arrêt PRIM : elle est rapportée par la communauté, pas par la documentation officielle.
- Acceptation par Transitous d'un grand nombre d'instances Gladys qui interrogent le service.
- Les chiffres de PRIM viennent d'extraits de recherche : le site bloque les robots (Cloudflare).

## Sources principales

- Intégrations externes Gladys : <https://gladysassistant.com/docs/dev/external-integrations/>
- Spec des intégrations externes : <https://github.com/GladysAssistant/Gladys/tree/master/docs/specs/external-integrations>
- Intégration TCL : <https://github.com/prohand/gladys-transport-commun-lyonnais> (forum : <https://community.gladysassistant.com/t/integration-externe-transport-en-commun-lyonnais-tcl/10777>)
- PRIM IDFM : <https://prim.iledefrance-mobilites.fr/fr/apis/idfm-ivtr-requete_unitaire>
- Licence Mobilités : <https://prim.iledefrance-mobilites.fr/en/actualites/article/licence-mobilite>
- API SNCF : <https://numerique.sncf.com/startup/api/>
- SNCF sur le PAN : <https://transport.data.gouv.fr/datasets/horaires-sncf>
- Catalogue du PAN : <https://transport.data.gouv.fr/api/datasets> (doc : <https://transport.data.gouv.fr/swaggerui>)
- Transitous : <https://transitous.org/api/>
- Lib GTFS-RT : <https://www.npmjs.com/package/gtfs-realtime-bindings>
- Scènes HTTP Gladys : <https://gladysassistant.com/docs/scenes/http-request/>
- MQTT Gladys : <https://gladysassistant.com/docs/api/mqtt-api/>
