# Radar

Personal prospection CRM (PWA) — companies, contacts, follow-ups. 100 %
local data (localStorage), no backend, no accounts, no analytics. French UI.

- **Live app**: https://martin73388.github.io/radar_app/ (deployed from
  `main` by GitHub Actions)
- Design contract: [ARCHITECTURE.md](ARCHITECTURE.md) · Project brief &
  decisions: [CLAUDE.md](CLAUDE.md)

## Dev

```bash
npm install
npm run dev        # local dev server
npm test           # unit tests (Vitest)
npm run build      # production build (dist/)
npm run preview    # serve the build locally
npm run icons      # regenerate PWA icons from public/favicon.svg
```

---

## 📱 Installer Radar sur ton téléphone (Android)

1. Ouvre **Chrome** et va sur
   **https://martin73388.github.io/radar_app/**
2. Menu **⋮** (en haut à droite) → **« Ajouter à l'écran d'accueil »** /
   **« Installer l'application »** → confirme.
3. L'icône **Radar** apparaît sur ton écran d'accueil : l'app s'ouvre en
   plein écran et **fonctionne hors ligne**.

Tes données restent uniquement sur ton téléphone. Pense à faire un export
de temps en temps (⚙️ sur l'écran Tableau → **Télécharger**) — c'est ta
copie de secours.

## 🔄 Synchroniser téléphone ↔ iPad (optionnel)

Radar peut partager tes données entre appareils via un **dépôt GitHub privé
que tu possèdes**. Sans cette configuration, tout reste 100 % local.
À savoir : tes données de prospection seront alors stockées dans ce dépôt
privé (visibles par GitHub et par quiconque aurait accès au dépôt ou au
jeton).

**Une seule fois — créer le dépôt et le jeton :**

1. Sur github.com : **New repository** → nom `radar_core` → visibilité
   **Private** → Create. N'y mets rien d'autre.
2. Crée un jeton *fine-grained* : **Settings → Developer settings →
   Personal access tokens → Fine-grained tokens → Generate new token** :
   - *Repository access* : **Only select repositories** → `radar_core` ;
   - *Permissions → Repository → Contents* : **Read and write** (rien
     d'autre) ;
   - une date d'expiration (à renouveler ensuite) → **Generate** →
     copie le jeton `github_pat_…`.

**Sur chaque appareil (téléphone puis iPad) :**

3. Dans Radar : ⚙️ (écran Tableau) → section **Synchronisation** → saisis
   `tonpseudo/radar_core` + colle le jeton → **Activer la synchro**.
   Le jeton reste sur l'appareil, il n'est jamais publié nulle part.

Ensuite c'est automatique : envoi après chaque modification, récupération à
l'ouverture de l'app. La pastille à côté de ⚙️ indique l'état (vert = à
jour, orange = en cours, rouge = conflit ou erreur — ouvre ⚙️ pour le
détail). En cas de modification des deux côtés en même temps, Radar te fait
choisir la version à garder — jamais de fusion silencieuse.

> iPhone (au cas où) : installe **avant** de saisir des données
> (Safari → Partager → « Sur l'écran d'accueil »), car l'onglet Safari et
> l'app installée ne partagent pas leur stockage ; sinon passe par
> export → import.
