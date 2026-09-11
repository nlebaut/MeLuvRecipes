#!/usr/bin/env node

import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = new URL("../", import.meta.url);
const recipesDir = new URL("../recipes/", import.meta.url);
const hugoDir = new URL("../hugo/", import.meta.url);
const generatedDataDir = new URL("../hugo/data/recipes/", import.meta.url);
const generatedContentDir = new URL("../hugo/content/generated-recipes/", import.meta.url);
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

function extractMetadata(map = {}) {
  const prepTime = map.prep_time ?? null;
  const prepTimeText = map.prep_time_text ?? null;
  const cookTime = map.cook_time ?? null;
  const cookTimeText = map.cook_time_text ?? null;
  const time = map.time ?? null;
  const timeText = map.time_text ?? null;
  return {
    title: map.title ?? "",
    servings: map.servings ?? null,
    servingsText: map.servings_text ?? null,
    prepTime,
    prepTimeText,
    cookTime,
    cookTimeText,
    time,
    timeText,
    description: map.description ?? map.summary ?? null,
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

      return { label };
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
  await fs.rm(generatedStaticSearchIndex, { force: true });

  await fs.mkdir(generatedDataDir, { recursive: true });
  await fs.mkdir(generatedContentDir, { recursive: true });
  await fs.writeFile(new URL("_index.md", generatedContentDir), "---\nbuild:\n  render: never\n  list: never\n---\n", "utf8");
}

function recipeCardData(recipe) {
  return {
    slug: recipe.slug,
    url: `recipes/${recipe.slug}/`,
    title: recipe.title,
    summary: recipe.summary,
    description: recipe.description,
    metadata: recipe.metadata,
  };
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
      bodyText: source,
    };

    const recipe = {
      slug,
      title,
      description,
      summary,
      metadata,
      ingredients: (parsed.ingredients ?? []).map((ingredient) => ({
        ...ingredient,
        label: ingredientLabel(ingredient),
      })),
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

  const catalog = {
    generatedAt: new Date().toISOString(),
    count: recipes.length,
    recipes: recipes.map(recipeCardData),
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
