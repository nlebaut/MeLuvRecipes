# Croq'actus Cooklang

Ce dépôt contient les recettes de Croq'actus au format [Cooklang](https://cooklang.org/).

## Structure

- `recipes/` : Contient toutes les recettes au format `.cook`.
- `hugo/` : Projet Hugo utilisé pour générer le site statique.
- `scripts/migrate-recipes-frontmatter.mjs` : Convertit l'ancien format `>> key: value` vers le frontmatter YAML actuel.
- `scripts/build-site.mjs` : Génère les données Hugo depuis les `.cook`, puis construit le site dans `docs/` ou `dist/`.
- `docs/` : Version statique commitée pour GitHub Pages en mode "Deploy from a branch".
- `.github/workflows/deploy.yml` : Gère la validation et le déploiement automatique sur GitHub Pages.

## Déploiement

GitHub Pages ne peut pas exécuter `cook server` comme un processus permanent : la plateforme ne sert que des fichiers statiques.

Le dépôt est donc construit ainsi :

1. Les recettes `.cook` sont validées avec CookCLI pendant la CI.
2. Un build génère des fichiers JSON par recette pour Hugo ainsi que des pages statiques.
3. GitHub Pages publie `docs/`, qui contient une page HTML par recette.

Le dépôt contient aussi `docs/` pour rester compatible avec le mode GitHub Pages "Deploy from a branch". Dans ce cas, configurez Pages sur `main` + `/docs`.

Si vous voulez que **chaque nouveau fichier `.cook` poussé sur `main`** soit automatiquement pris en compte par le site sans regénérer `docs/` à la main, configurez GitHub Pages avec :

- `Source: GitHub Actions`

Le workflow du dépôt installe CookCLI et Hugo, rebâtit le site à chaque push sur `main`, puis publie le résultat sur GitHub Pages.

## Comment ajouter une recette

Créer un nouveau fichier `.cook` dans `recipes/` en suivant la [syntaxe Cooklang](https://cooklang.org/docs/spec/) avec un frontmatter YAML, par exemple :

```cooklang
---
title: "Tarte aux pommes"
servings: 6
servings_text: "6 parts"
prep_time: "20 min"
cook_time: "35 min"
---

Couper les @pommes{4} en quartiers et les disposer dans un moule.
```

## Développement local

Pour regénérer le site statique localement :

```bash
node scripts/build-site.mjs
```

Pour regénérer la version commitée pour Pages en mode branche :

```bash
node scripts/build-site.mjs docs
```

Prérequis locaux :

```bash
brew install hugo
```

Pour lancer l'interface web embarquée de CookCLI sur votre machine :

```bash
cook server recipes
```
