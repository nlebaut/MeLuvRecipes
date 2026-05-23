# Recettes Cooklang

## Créer une nouvelle recette

Pour écrire la recette, utiliser https://cooklang.github.io/cooklang-rs/

Créer un nouveau fichier `.cook` dans `recipes/` en suivant la [syntaxe Cooklang](https://cooklang.org/docs/spec/) avec un frontmatter YAML, par exemple :

```cooklang
---
title: "Saumon poêlé aux asperges"
servings: 4
servings_text: "4 personnes"
prep_time: "10 min"
prep_time_text: "10 min"
cook_time: "10 min"
cook_time_text: "10 min"
---
Eplucher les @asperges{420g}. Découper les @dos de saumon{4} en fines tranches.

Plonger les asperges dans une casserole d’eau bouillante salée. Les faire cuire ~{5%minutes}.
```

## Ajouter une nouvelle recette

1. Ouvrir Git Bash depuis le répertoire cooklang
2. `git pull`
3. Ajouter manuellement la nouvelle recette au format `.cook` dans le dossier `/recipes`. 
4. `git add .`
5. `git commit -m "nouvelle recette ajoutée"`
6. `git push origin main`

## Structure

- `recipes/` : Contient toutes les recettes au format `.cook`.
- `hugo/` : Projet Hugo utilisé pour générer le site statique.
- `scripts/build-site.mjs` : Génère les données Hugo depuis les `.cook`, puis construit le site statique dans `dist/` par défaut.
- `.github/workflows/deploy.yml` : Gère la validation et le déploiement automatique sur GitHub Pages.

## Déploiement

GitHub Pages ne peut pas exécuter `cook server` comme un processus permanent : la plateforme ne sert que des fichiers statiques.

Le dépôt est donc construit ainsi :

1. Les recettes `.cook` sont validées avec CookCLI pendant la CI.
2. Un build génère des fichiers JSON par recette pour Hugo ainsi que des pages statiques.
3. GitHub Pages publie l'artefact généré, qui contient une page HTML par recette.

Si vous voulez que **chaque nouveau fichier `.cook` poussé sur `main`** soit automatiquement pris en compte par le site, configurez GitHub Pages avec :

- `Source: GitHub Actions`

Le workflow du dépôt installe CookCLI et Hugo, rebâtit le site dans `dist/` à chaque push sur `main`, puis publie le résultat sur GitHub Pages.

## Développement local

Pour regénérer le site statique localement :

```bash
node scripts/build-site.mjs
```

Pour regénérer le site statique dans un dossier explicite :

```bash
node scripts/build-site.mjs dist
```

Prérequis locaux :

```bash
brew install hugo
```

Pour lancer l'interface web embarquée de CookCLI sur votre machine :

```bash
cook server recipes
```
