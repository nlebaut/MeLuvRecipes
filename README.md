# Croq'actus Cooklang

Ce dépôt contient les recettes de Croq'actus au format [Cooklang](https://cooklang.org/).

## Structure

- `recipes/` : Contient toutes les recettes au format `.cook`.
- `.github/workflows/deploy.yml` : Gère le déploiement automatique sur GitHub Pages.

## Déploiement

Le site est automatiquement déployé sur GitHub Pages via les GitHub Actions dès qu'un changement est poussé sur la branche `main`.

## Comment ajouter une recette

Il suffit de créer un nouveau fichier `.cook` dans le dossier `recipes/` en suivant la [syntaxe Cooklang](https://cooklang.org/docs/spec/).
