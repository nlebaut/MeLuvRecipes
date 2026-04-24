#!/usr/bin/env node

import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = new URL("../", import.meta.url);
const recipesDir = new URL("../recipes/", import.meta.url);
const hugoDir = new URL("../hugo/", import.meta.url);
const generatedDataDir = new URL("../hugo/data/recipes/", import.meta.url);
const generatedContentDir = new URL("../hugo/content/generated-recipes/", import.meta.url);
const legacyRecipeSectionDir = new URL("../hugo/content/recipes/", import.meta.url);
const generatedStaticCookDir = new URL("../hugo/static/cook/", import.meta.url);
const generatedStaticSearchIndex = new URL("../hugo/static/search.json", import.meta.url);

function resolveOutputDir() {
  const outputArg = process.argv[2] ?? "dist";
  return new URL(`../${outputArg.replace(/\/+$/, "")}/`, import.meta.url);
}

function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function runCommand(command, args, cwd = fileURLToPath(rootDir)) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${command} ${args.join(" ")} failed:\n${stderr}`));
        return;
      }

      resolve(stdout);
    });
  });
}

function formatScalarValue(value) {
  if (value == null) {
    return "";
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value === "string") {
    return value;
  }

  if (value.type === "regular") {
    return formatScalarValue(value.value);
  }

  if (value.type === "fraction") {
    return `${formatScalarValue(value.numerator)}/${formatScalarValue(value.denominator)}`;
  }

  if (value.type === "mixed") {
    const whole = formatScalarValue(value.whole);
    const fraction = formatScalarValue(value.fraction);
    return [whole, fraction].filter(Boolean).join(" ");
  }

  if ("value" in value) {
    return formatScalarValue(value.value);
  }

  return "";
}

function formatQuantity(quantity) {
  if (!quantity) {
    return "";
  }

  const value = formatScalarValue(quantity.value);
  const unit = quantity.unit ?? "";
  return [value, unit].filter(Boolean).join(" ").trim();
}

function parseDurationMinutes(rawValue) {
  if (!rawValue) {
    return null;
  }

  const value = String(rawValue).toLowerCase();

  const hourMatch = value.match(/(\d+)\s*h(?:\s*(\d+))?/);
  if (hourMatch) {
    const hours = Number(hourMatch[1] ?? 0);
    const minutes = Number(hourMatch[2] ?? 0);
    return (hours * 60) + minutes;
  }

  const minuteMatch = value.match(/(\d+)(?:\s*[-aà]\s*\d+)?\s*(?:minutes?|mins?|min)\b/);
  if (minuteMatch) {
    return Number(minuteMatch[1]);
  }

  return null;
}

function parseTags(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  return String(value)
    .split(/[;,|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractMetadata(map = {}) {
  const prepTime = map.prep_time ?? null;
  const prepTimeText = map.prep_time_text ?? null;
  const cookTime = map.cook_time ?? null;
  const cookTimeText = map.cook_time_text ?? null;
  const time = map.time ?? null;
  const timeText = map.time_text ?? null;
  const prepTimeMinutes = parseDurationMinutes(prepTimeText ?? prepTime);
  const cookTimeMinutes = parseDurationMinutes(cookTimeText ?? cookTime);
  const totalTimeMinutes = parseDurationMinutes(timeText ?? time) ?? (
    prepTimeMinutes !== null && cookTimeMinutes !== null
      ? prepTimeMinutes + cookTimeMinutes
      : null
  );

  return {
    title: map.title ?? "",
    servings: map.servings ?? null,
    servingsText: map.servings_text ?? null,
    prepTime,
    prepTimeText,
    prepTimeMinutes,
    cookTime,
    cookTimeText,
    cookTimeMinutes,
    time,
    timeText,
    totalTimeMinutes,
    description: map.description ?? map.summary ?? null,
    difficulty: map.difficulty ?? null,
    tags: parseTags(map.tags),
  };
}

function ingredientLabel(ingredient) {
  const details = formatQuantity(ingredient.quantity);
  return details ? `${ingredient.name} (${details})` : ingredient.name;
}

function renderItem(item, context) {
  if (item.type === "text") {
    return item.value;
  }

  if (item.type === "ingredient") {
    return context.ingredients[item.index]?.name ?? "";
  }

  if (item.type === "timer") {
    return formatQuantity(context.timers[item.index]?.quantity);
  }

  if (item.type === "cookware") {
    return context.cookware[item.index]?.name ?? "";
  }

  if (typeof item.value === "string") {
    return item.value;
  }

  if (item.value && typeof item.value.name === "string") {
    return item.value.name;
  }

  return "";
}

function buildStep(item, context) {
  const items = item?.value?.items ?? [];
  const text = items.map((entry) => renderItem(entry, context)).join("").replace(/\s+/g, " ").trim();
  const timers = items
    .filter((entry) => entry.type === "timer")
    .map((entry) => {
      const timer = context.timers[entry.index];
      const label = formatQuantity(timer?.quantity);

      return {
        label,
        minutes: parseDurationMinutes(label),
      };
    })
    .filter((timer) => timer.label);

  return {
    number: item.value?.number ?? null,
    text,
    timers,
  };
}

function markdownFrontmatter(recipe) {
  return [
    "---",
    `title: ${JSON.stringify(recipe.title)}`,
    `type: "recipes"`,
    `url: ${JSON.stringify(`/recipes/${recipe.slug}/`)}`,
    `recipeSlug: ${JSON.stringify(recipe.slug)}`,
    `summary: ${JSON.stringify(recipe.description || recipe.summary)}`,
    "---",
    "",
  ].join("\n");
}

async function resetGeneratedInputs() {
  await fs.rm(generatedDataDir, { recursive: true, force: true });
  await fs.rm(generatedContentDir, { recursive: true, force: true });
  await fs.rm(generatedStaticCookDir, { recursive: true, force: true });
  await fs.rm(generatedStaticSearchIndex, { force: true });

  await fs.mkdir(generatedDataDir, { recursive: true });
  await fs.mkdir(generatedContentDir, { recursive: true });

  const legacyEntries = await fs.readdir(legacyRecipeSectionDir, { withFileTypes: true }).catch(() => []);
  for (const entry of legacyEntries) {
    if (!entry.isFile() || entry.name === "_index.md") {
      continue;
    }

    await fs.rm(new URL(entry.name, legacyRecipeSectionDir), { force: true });
  }
}

function recipeCardData(recipe) {
  return {
    slug: recipe.slug,
    url: `recipes/${recipe.slug}/`,
    title: recipe.title,
    summary: recipe.summary,
    description: recipe.description,
    metadata: recipe.metadata,
    ingredientNames: recipe.ingredientNames,
    ingredientsCount: recipe.ingredientsCount,
    tags: recipe.tags,
    difficulty: recipe.metadata.difficulty,
    totalTimeMinutes: recipe.metadata.totalTimeMinutes,
    prepTimeMinutes: recipe.metadata.prepTimeMinutes,
    cookTimeMinutes: recipe.metadata.cookTimeMinutes,
    search: recipe.search,
  };
}

function firstRecipesMatching(recipes, predicate, limit = 6) {
  return recipes.filter(predicate).slice(0, limit).map(recipeCardData);
}

async function main() {
  const outputDir = resolveOutputDir();

  await resetGeneratedInputs();

  const entries = await fs.readdir(recipesDir, { withFileTypes: true });
  const recipes = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".cook")) {
      continue;
    }

    const relativePath = `recipes/${entry.name}`;
    const parsedJson = await runCommand("cook", ["recipe", relativePath, "--format", "json"]);
    const schemaJson = await runCommand("cook", ["recipe", relativePath, "--format", "schema"]);
    const parsed = JSON.parse(parsedJson);
    const schema = JSON.parse(schemaJson);
    const filePath = new URL(entry.name, recipesDir);
    const source = await fs.readFile(filePath, "utf8");
    const map = parsed.metadata?.map ?? {};
    const title = map.title ?? entry.name.replace(/\.cook$/, "");
    const slug = slugify(entry.name.replace(/\.cook$/, ""));
    const metadata = extractMetadata(map);
    const ingredientNames = [...new Set((parsed.ingredients ?? []).map((ingredient) => ingredient.name).filter(Boolean))];
    const renderContext = {
      ingredients: parsed.ingredients ?? [],
      timers: parsed.timers ?? [],
      cookware: parsed.cookware ?? [],
    };
    const sections = (parsed.sections ?? []).map((section) => ({
      name: section.name,
      steps: (section.content ?? [])
        .filter((item) => item.type === "step")
        .map((item) => buildStep(item, renderContext)),
    }));
    const allSteps = sections.flatMap((section) => section.steps);
    const summary = allSteps[0]?.text ?? "";
    const description = metadata.description ?? summary;
    const search = {
      title,
      summary,
      description,
      ingredientsText: ingredientNames.join(" "),
      timesText: [
        metadata.servingsText,
        metadata.prepTime,
        metadata.prepTimeText,
        metadata.cookTime,
        metadata.cookTimeText,
        metadata.time,
        metadata.timeText,
      ]
        .filter(Boolean)
        .join(" "),
      bodyText: source,
      tagsText: metadata.tags.join(" "),
    };

    const recipe = {
      slug,
      title,
      description,
      summary,
      metadata,
      tags: metadata.tags,
      ingredientNames,
      ingredientsCount: ingredientNames.length,
      ingredients: (parsed.ingredients ?? []).map((ingredient) => ({
        ...ingredient,
        label: ingredientLabel(ingredient),
      })),
      cookware: parsed.cookware ?? [],
      timers: parsed.timers ?? [],
      sections,
      rawSource: source,
      schema,
      search,
    };

    recipes.push(recipe);

    await fs.writeFile(
      new URL(`${slug}.json`, generatedDataDir),
      `${JSON.stringify(recipe, null, 2)}\n`,
      "utf8",
    );
    await fs.writeFile(
      new URL(`${slug}.md`, generatedContentDir),
      markdownFrontmatter(recipe),
      "utf8",
    );
  }

  recipes.sort((left, right) => left.title.localeCompare(right.title, "fr", { sensitivity: "base" }));

  const ingredientFacets = [...new Set(recipes.flatMap((recipe) => recipe.ingredientNames))]
    .sort((left, right) => left.localeCompare(right, "fr", { sensitivity: "base" }));

  const catalog = {
    generatedAt: new Date().toISOString(),
    count: recipes.length,
    recipes: recipes.map(recipeCardData),
    collections: {
      quick: firstRecipesMatching(recipes, (recipe) => recipe.metadata.totalTimeMinutes !== null && recipe.metadata.totalTimeMinutes <= 35),
      simple: firstRecipesMatching(recipes, (recipe) => recipe.ingredientsCount > 0 && recipe.ingredientsCount <= 6),
      shareable: firstRecipesMatching(recipes, (recipe) => Number(recipe.metadata.servings ?? 0) >= 4),
    },
    facets: {
      ingredients: ingredientFacets,
      servings: [...new Set(recipes.map((recipe) => recipe.metadata.servings).filter((value) => value != null))].sort((left, right) => left - right),
    },
  };

  const searchIndex = {
    count: recipes.length,
    recipes: recipes.map((recipe) => ({
      ...recipeCardData(recipe),
      search: recipe.search,
    })),
  };

  await fs.writeFile(
    new URL("catalog.json", generatedDataDir),
    `${JSON.stringify(catalog, null, 2)}\n`,
    "utf8",
  );

  await fs.writeFile(
    generatedStaticSearchIndex,
    `${JSON.stringify(searchIndex, null, 2)}\n`,
    "utf8",
  );

  await fs.rm(outputDir, { recursive: true, force: true });
  await runCommand("hugo", ["--source", fileURLToPath(hugoDir), "--destination", fileURLToPath(outputDir), "--cleanDestinationDir"]);
  await fs.writeFile(new URL("./.nojekyll", outputDir), "", "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
