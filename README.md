# Croq'actus Cooklang

Ce dépôt contient les recettes de Croq'actus au format [Cooklang](https://cooklang.org/).

## Structure

- `recipes/` : Contient toutes les recettes au format `.cook`.
- `site/` : Interface statique servie par GitHub Pages.
- `scripts/migrate-recipes-frontmatter.mjs` : Convertit l'ancien format `>> key: value` vers le frontmatter YAML actuel.
- `scripts/build-site.mjs` : Génère `dist/` à partir des `.cook` via `cook recipe --format json`.
- `.github/workflows/deploy.yml` : Gère la validation et le déploiement automatique sur GitHub Pages.

## Déploiement

GitHub Pages ne peut pas exécuter `cook server` comme un processus permanent : la plateforme ne sert que des fichiers statiques.

Le dépôt est donc construit ainsi :

1. Les recettes `.cook` sont validées avec CookCLI pendant la CI.
2. Un build statique génère une API JSON et copie les fichiers `.cook` bruts dans `dist/`.
3. GitHub Pages publie `dist/`, qui contient une interface web consultable dans le navigateur.

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

Pour lancer l'interface web embarquée de CookCLI sur votre machine :

```bash
cook server recipes
```
