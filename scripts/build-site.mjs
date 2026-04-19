#!/usr/bin/env node

import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = new URL("../", import.meta.url);
const recipesDir = new URL("../recipes/", import.meta.url);
const siteDir = new URL("../site/", import.meta.url);

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

function runCook(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("cook", args, {
      cwd: fileURLToPath(rootDir),
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
        reject(new Error(`cook ${args.join(" ")} failed:\n${stderr}`));
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

async function copyDir(source, target) {
  await fs.mkdir(target, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = `${source}/${entry.name}`;
    const targetPath = `${target}/${entry.name}`;

    if (entry.isDirectory()) {
      await copyDir(sourcePath, targetPath);
      continue;
    }

    await fs.copyFile(sourcePath, targetPath);
  }
}

async function main() {
  const outputDir = resolveOutputDir();

  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(new URL("./api/recipes/", outputDir), { recursive: true });
  await copyDir(fileURLToPath(siteDir), fileURLToPath(outputDir));
  await copyDir(fileURLToPath(recipesDir), fileURLToPath(new URL("./recipes/", outputDir)));
  await fs.writeFile(new URL("./.nojekyll", outputDir), "", "utf8");

  const entries = await fs.readdir(recipesDir, { withFileTypes: true });
  const recipes = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".cook")) {
      continue;
    }

    const relativePath = `recipes/${entry.name}`;
    const parsedJson = await runCook(["recipe", relativePath, "--format", "json"]);
    const parsed = JSON.parse(parsedJson);
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
    const recipe = {
      slug,
      fileName: entry.name,
      title,
      metadata: extractMetadata(map),
      ingredients: parsed.ingredients ?? [],
      cookware: parsed.cookware ?? [],
      timers: parsed.timers ?? [],
      sections,
      rawSource: source,
      summary,
      searchText: [
        title,
        source,
        map.servings_text,
        map.prep_time,
        map.prep_time_text,
        map.cook_time,
        map.cook_time_text,
      ]
        .filter(Boolean)
        .join(" "),
    };

    recipes.push({
      slug,
      fileName: entry.name,
      title,
      metadata: recipe.metadata,
      ingredientCount: recipe.ingredients.length,
      stepCount: allSteps.length,
      summary,
      searchText: recipe.searchText,
    });

    await fs.writeFile(
      new URL(`./api/recipes/${slug}.json`, outputDir),
      `${JSON.stringify(recipe, null, 2)}\n`,
      "utf8",
    );
  }

  recipes.sort((left, right) => left.title.localeCompare(right.title, "fr", { sensitivity: "base" }));

  await fs.writeFile(
    new URL("./api/index.json", outputDir),
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
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
