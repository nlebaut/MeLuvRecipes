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
  const outputArg = process.argv[2] ?? "docs";
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

function extractMetadata(map = {}) {
  return {
    title: map.title ?? "",
    servings: map.servings ?? null,
    servingsText: map.servings_text ?? null,
    prepTime: map.prep_time ?? null,
    prepTimeText: map.prep_time_text ?? null,
    cookTime: map.cook_time ?? null,
    cookTimeText: map.cook_time_text ?? null,
    time: map.time ?? null,
    timeText: map.time_text ?? null,
  };
}

function renderItem(item) {
  if (item.type === "text") {
    return item.value;
  }

  if (typeof item.value === "string") {
    return item.value;
  }

  if (item.value && typeof item.value.name === "string") {
    return item.value.name;
  }

  return "";
}

function stepText(step) {
  const items = step?.value?.items ?? [];
  return items.map(renderItem).join("").replace(/\s+/g, " ").trim();
}

function ingredientLabel(ingredient) {
  const quantity = ingredient.quantity ? `${ingredient.quantity} ` : "";
  const units = Array.isArray(ingredient.units) ? ingredient.units.join("/") : "";
  const details = [quantity.trim(), units].filter(Boolean).join(" ");
  return details ? `${ingredient.name} (${details})` : ingredient.name;
}

function markdownFrontmatter(recipe) {
  return [
    "---",
    `title: ${JSON.stringify(recipe.title)}`,
    `type: "recipes"`,
    `url: ${JSON.stringify(`/recipes/${recipe.slug}/`)}`,
    `recipeSlug: ${JSON.stringify(recipe.slug)}`,
    `summary: ${JSON.stringify(recipe.summary)}`,
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
  await fs.mkdir(generatedStaticCookDir, { recursive: true });

  const legacyEntries = await fs.readdir(legacyRecipeSectionDir, { withFileTypes: true }).catch(() => []);
  for (const entry of legacyEntries) {
    if (!entry.isFile() || entry.name === "_index.md") {
      continue;
    }

    await fs.rm(new URL(entry.name, legacyRecipeSectionDir), { force: true });
  }
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
    const sections = (parsed.sections ?? []).map((section) => ({
      name: section.name,
      steps: (section.content ?? [])
        .filter((item) => item.type === "step")
        .map((item) => ({
          number: item.value?.number ?? null,
          text: stepText(item),
        })),
    }));
    const allSteps = sections.flatMap((section) => section.steps);
    const summary = allSteps[0]?.text ?? "";
    const metadata = extractMetadata(map);
    const recipe = {
      slug,
      fileName: entry.name,
      title,
      metadata,
      ingredients: (parsed.ingredients ?? []).map((ingredient) => ({
        ...ingredient,
        label: ingredientLabel(ingredient),
      })),
      cookware: parsed.cookware ?? [],
      timers: parsed.timers ?? [],
      sections,
      summary,
      rawSource: source,
      schema,
    };

    recipes.push({
      slug,
      url: `/recipes/${slug}/`,
      fileName: entry.name,
      title,
      summary,
      metadata,
      searchText: [
        title,
        summary,
        source,
        metadata.servingsText,
        metadata.prepTime,
        metadata.prepTimeText,
        metadata.cookTime,
        metadata.cookTimeText,
      ]
        .filter(Boolean)
        .join(" "),
    });

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
    await fs.copyFile(filePath, new URL(entry.name, generatedStaticCookDir));
  }

  recipes.sort((left, right) => left.title.localeCompare(right.title, "fr", { sensitivity: "base" }));

  await fs.writeFile(
    new URL("catalog.json", generatedDataDir),
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        count: recipes.length,
        recipes,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await fs.writeFile(
    generatedStaticSearchIndex,
    `${JSON.stringify(
      {
        count: recipes.length,
        recipes,
      },
      null,
      2,
    )}\n`,
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
