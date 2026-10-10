# MétéoMédia pour Gladys

Cette intégration fait de **MétéoMédia** le fournisseur météo de Gladys :
le widget météo du tableau de bord et l'assistant (« quel temps fera-t-il
demain ? ») utilisent ses prévisions. Elle est pensée pour le Québec et le
Canada : humidex l'été, refroidissement éolien l'hiver, alertes officielles
d'Environnement Canada, radar de précipitations.

## Installation

1. Installez l'intégration depuis le catalogue de Gladys (Gladys 5.1 ou plus
   récent).
2. Acceptez l'accès à la **position de vos maisons** : la météo est celle de
   la maison, rien d'autre à saisir.
3. Vérifiez que votre maison est placée sur la carte (**Paramètres →
   Maisons**). Sans position, il n'y a pas de météo.
4. Dans l'écran **Configuration**, cliquez sur **Tester les sources météo** :
   le message indique ce que chaque source a répondu.

Une fois installée, l'intégration passe devant le service OpenWeather
intégré à Gladys. Le widget météo peut aussi la choisir explicitement.

## Configuration

- **Alertes d'Environnement Canada** (activé par défaut) — avertissements,
  veilles, avis et bulletins officiels qui couvrent votre maison. Ils
  s'affichent dans le widget météo et alimentent le déclencheur de scène
  « Alerte météo » de Gladys. Quand une alerte apparaît, change de niveau ou
  se termine, l'intégration prévient Gladys en quelques minutes au lieu
  d'attendre sa vérification de 30 minutes.
- **Alertes de ressenti (estimations)** (désactivé par défaut) — ajoute une
  alerte quand l'humidex ou le refroidissement éolien calculé atteint un
  risque réel (grand inconfort, risque élevé de gelure…). Ce ne sont pas des
  alertes officielles, et elles se mêlent à celles d'Environnement Canada.
- **Source de repli** — Environnement Canada (par défaut) ou aucune. Utilisée
  quand MétéoMédia ne répond pas ; elle fournit aussi l'indice UV, que
  MétéoMédia ne donne pas.
- **Radar de précipitations** (activé par défaut) — une image radar
  d'Environnement Canada de 300 × 200 km centrée sur votre maison. Activez
  l'option « images du fournisseur » du widget météo pour la voir.

## Le widget « Ressenti »

Ajoutez le widget **Ressenti** à un tableau de bord. Il montre :

- l'indice qui s'applique maintenant : **humidex** dès 20 °C, sinon
  **refroidissement éolien**, avec son **niveau de risque** selon les
  échelles d'Environnement Canada ;
- le ressenti donné par MétéoMédia, la température et, l'hiver, le
  refroidissement **dans les rafales** (l'été, le point de rosée) ;
- le ressenti et la température des 24 prochaines heures, avec la **pire
  heure** ;
- le **délai de gelure** de la peau exposée, la **nuit étouffante** (point
  de rosée nocturne d'au moins 18 °C), le **risque de verglas** (pluie
  verglaçante, brouillard givrant ou précipitations autour de 0 °C) et la
  **tendance de la pression** sur 3 heures.

Réglage **Maison** : le nom de la maison à afficher. Vide, c'est la
première maison localisée.

### Les niveaux

| Niveau                   | Indice                                                     |
| ------------------------ | ---------------------------------------------------------- |
| Froid extrême            | refroidissement de −55 ou moins (gelure en moins de 2 min) |
| Froid grave              | −48 à −54 (gelure en 2 à 5 min)                            |
| Froid très élevé         | −40 à −47 (gelure en 5 à 10 min)                           |
| Froid élevé              | −28 à −39 (gelure en 10 à 30 min)                          |
| Froid modéré             | −10 à −27                                                  |
| Risque faible            | le reste                                                   |
| Inconfort                | humidex de 30 à 39                                         |
| Grand inconfort          | humidex de 40 à 45                                         |
| Dangereux                | humidex de 46 à 53                                         |
| Coup de chaleur imminent | humidex de 54 ou plus                                      |

## Scènes : « Niveau de ressenti changé »

Ce déclencheur lance une scène quand le niveau de ressenti d'une maison
change. Il est vérifié toutes les 5 minutes. Filtres, tous facultatifs :

- **Niveau atteint** — par exemple « Froid élevé ». La scène se déclenche
  même si l'indice saute ce niveau (de « modéré » à « très élevé »).
- **Sens** — « Aggravation » ou « Amélioration ».
- **Maison** — le nom exact de la maison dans Gladys (vide = toutes).

Les actions suivantes peuvent lire `{{triggerEvent.data.summary}}` (une
phrase prête à envoyer), `{{triggerEvent.data.value}}`,
`{{triggerEvent.data.current_level}}`, etc.

Exemples : fermer les stores et lancer la climatisation à « Grand
inconfort » ; allumer le chauffe-bloc ou envoyer une notification à « Froid
élevé ».

Pour éviter les déclenchements en rafale, un niveau n'est quitté qu'avec
une marge d'un degré, et le premier calcul après un démarrage ne déclenche
rien.

## Bon à savoir

- **Neige** : les quantités de neige sont converties en équivalent eau avec
  le rapport usuel de 10 pour 1 (10 cm de neige = 10 mm d'eau).
- **Hors du Canada** : MétéoMédia répond, mais il n'y a ni repli, ni
  alertes, ni radar d'Environnement Canada.
- **MétéoMédia n'a pas d'API publique** : l'intégration utilise celle de
  son site, qui peut changer sans préavis. Le repli Environnement Canada
  prend alors le relais, et la dernière météo connue reste affichée jusqu'à
  3 heures si tout échoue.
- Les données sont mises en cache 10 minutes (5 pour les alertes).

## Sources et licences

Prévisions : MétéoMédia / The Weather Network (Pelmorex). Alertes, repli,
indice UV et radar : Environnement et Changement climatique Canada. Fond de
carte du radar : Ressources naturelles Canada. Les données des deux
organismes fédéraux sont publiées sous la Licence du gouvernement ouvert –
Canada. Cette intégration n'est ni affiliée à Pelmorex ni approuvée par
elle.
