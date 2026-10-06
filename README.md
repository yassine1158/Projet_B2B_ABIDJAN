# B2B Connect — plateforme entreprises ⇄ fournisseurs

Plateforme B2B tous secteurs, en trois parties :

| Partie | Pages | Pour qui |
|---|---|---|
| **Site vitrine** | `index.html`, `catalogue.html` | Tout le monde : présentation, catégories, catalogue public des fournisseurs validés |
| **Espace entreprise** | `entreprise.html` | Entreprises : catalogue, demandes de devis, comparaison et acceptation des offres |
| **Espace fournisseur** | `fournisseur.html` | Fournisseurs : fiche, produits & services, réponses aux demandes de devis |
| Administration | `admin.html` | Équipe de la plateforme : validation des fournisseurs et des entreprises, membres de l'équipe, demandes, catégories |

Connexion / inscription : `connexion.html` (choix « entreprise » ou « fournisseur »).

## Fonctionnement

1. **Fournisseur** : il s'inscrit, choisit ses catégories, ajoute ses produits. Son compte reste **en attente** jusqu'à la validation par l'administrateur.
2. **Administrateur** : il valide le fournisseur (onglet *Fournisseurs*). Sa fiche et ses produits apparaissent alors dans le catalogue.
3. **Entreprise** : elle s'inscrit, consulte le catalogue et, une fois **validée** par l'équipe, publie des **demandes de devis** (catégorie, quantité, lieu, date limite, budget).
4. Les **fournisseurs validés** voient les demandes ouvertes (filtrées par défaut sur leurs catégories) et envoient **une offre** chacun (prix, délai, validité, conditions). Ils peuvent la modifier ou la retirer tant qu'elle est en attente.
5. L'entreprise compare les offres (triées par prix) et en **accepte** une. Les autres sont refusées automatiquement et la demande passe à « Attribuée ».
6. Les deux parties voient alors les **coordonnées** l'une de l'autre.

## Application Android (`mobile/`)

Une vraie application Android, construite avec Capacitor à partir du site : mêmes pages, même compte, mêmes données.
- **Télécharger l'APK** : onglet *Releases* du dépôt (`B2B-Connect.apk`). Sur le téléphone, ouvrez le fichier, autorisez « Installer des applications inconnues », puis *Installer*.
- **Construction automatique** : à chaque modification du site ou de `mobile/`, GitHub Actions (`.github/workflows/android.yml`) construit l'APK et publie une nouvelle version dans *Releases*. On peut aussi lancer la construction à la main depuis l'onglet *Actions* (« Application Android » → *Run workflow*).
- Dans l'app uniquement (`mobile/app/`) : barre d'onglets en bas, bouton d'action flottant, fenêtres qui montent du bas, tableaux en cartes, bouton retour Android, écran de démarrage et icône aux couleurs ivoiriennes. Le site web n'est pas modifié.
- `mobile/b2b-connect.keystore` est une clé de **test** (les nouvelles versions s'installent par-dessus les anciennes). Pour le **Play Store**, créez une clé privée conservée dans les secrets GitHub et produisez un fichier `.aab` signé (`./gradlew bundleRelease`).
- En local (avec le SDK Android) : `cd mobile && npm install && npm run apk`.

## Technique

- Site statique (HTML/CSS/JavaScript, sans build). Il peut être hébergé sur **Firebase Hosting** ou sur **GitHub Pages**.
- **Firebase Authentication** (e-mail + mot de passe) et base **Cloud Firestore**.
- La sécurité est assurée par `firestore.rules`, côté serveur. Personne ne peut :
  - se déclarer administrateur ;
  - valider son propre compte fournisseur ;
  - lire les demandes de devis sans être un fournisseur validé ;
  - accepter sa propre offre ;
  - voir les offres des autres.

  Ces règles sont couvertes par des tests (`tests/rules.test.mjs`).

### Collections Firestore
`users` (rôle) · `companies` · `suppliers` (statut `pending` / `approved` / `suspended`) · `products` · `rfqs` (demandes de devis) · `offers` (identifiant `{demande}_{fournisseur}`) · `settings/categories`.

## Mise en service

1. **Créer le projet** sur [console.firebase.google.com](https://console.firebase.google.com) (offre gratuite *Spark*).
2. **Authentication** → *Sign-in method* : activer **E-mail/Mot de passe**.
3. **Firestore Database** → *Créer une base de données* (mode production, région proche de vos utilisateurs, par ex. `europe-west1`).
4. **Paramètres du projet** → *Vos applications* → **Web** (`</>`) : copier l'objet `firebaseConfig` dans `assets/js/config.js` (`FIREBASE_CONFIG`). Dans ce même fichier, adapter `APP.name`, `contactEmail`, les devises et les catégories par défaut.
5. **Déployer les règles de sécurité** (indispensable) :
   ```bash
   npm install
   npx firebase login
   npx firebase use --add        # choisir votre projet
   npx firebase deploy --only firestore:rules
   ```
   Sans terminal, vous pouvez aussi copier le contenu de `firestore.rules` dans *Firestore → Règles → Publier*.
6. **Mettre en ligne** avec `npx firebase deploy --only hosting` (adresse `https://<projet>.web.app`) ou avec GitHub Pages. Avec GitHub Pages ou un domaine personnel, ajoutez le domaine dans *Authentication → Paramètres → Domaines autorisés*.
7. **Créer le premier administrateur** (une seule fois) :
   1. inscrivez-vous normalement sur le site (comme entreprise) ;
   2. dans la console Firebase, ouvrez *Firestore → `users` → votre document* ;
   3. remplacez `role` par `admin` ;
   4. reconnectez-vous : vous arrivez sur `admin.html`.
8. **Ajouter l'équipe depuis le site** : chaque membre crée un compte sur le site, puis un administrateur l'ajoute dans *Administration → Équipe* (par e-mail). Le membre se déconnecte et se reconnecte pour accéder à l'administration. « Retirer » lui rend son compte d'origine. Un administrateur ne peut pas se retirer lui-même.

## Développement local

```bash
npm install
npm run dev     # émulateurs Firebase : site sur http://localhost:5000/?emu (données fictives, projet "demo-b2b")
npm test        # tests des règles de sécurité (nécessite Java)
```

## Pistes pour la suite
- Messagerie entreprise ⇄ fournisseur.
- Notifications par e-mail (nouvelle demande, nouvelle offre) via Cloud Functions.
- Pièces jointes (cahier des charges, catalogues PDF) via Firebase Storage.
- Avis et notation des fournisseurs après une commande.
- Abonnements payants pour les fournisseurs (mise en avant, nombre d'offres).
