# Radar

Personal prospection CRM (PWA) — companies, contacts, follow-ups. 100 %
local data (localStorage), no backend, no accounts, no analytics. French UI.

- **Live app**: https://martin73388.github.io/10_Jobseeker/ (deployed from
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
   **https://martin73388.github.io/10_Jobseeker/**
2. Menu **⋮** (en haut à droite) → **« Ajouter à l'écran d'accueil »** /
   **« Installer l'application »** → confirme.
3. L'icône **Radar** apparaît sur ton écran d'accueil : l'app s'ouvre en
   plein écran et **fonctionne hors ligne**.

Tes données restent uniquement sur ton téléphone. Pense à faire un export
de temps en temps (⚙️ sur l'écran Tableau → **Télécharger**) — c'est ta
copie de secours.

> iPhone (au cas où) : installe **avant** de saisir des données
> (Safari → Partager → « Sur l'écran d'accueil »), car l'onglet Safari et
> l'app installée ne partagent pas leur stockage ; sinon passe par
> export → import.
