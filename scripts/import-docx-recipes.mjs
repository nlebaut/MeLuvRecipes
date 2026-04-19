#!/usr/bin/env node

import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = new URL("../", import.meta.url);
const recipesDir = new URL("../recipes/", import.meta.url);

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

function decodeXmlEntities(value) {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)));
}

function cleanParagraph(value) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\u202f/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRunSize(runXml) {
  const match = runXml.match(/<w:sz[^>]*w:val="([^"]+)"/);
  if (!match) {
    return null;
  }

  const numeric = Number.parseFloat(match[1].replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function isBoldRun(runXml) {
  return /<w:b(?:\s*\/>|>)/.test(runXml) && !/<w:b[^>]*w:val="false"/.test(runXml);
}

function isItalicRun(runXml) {
  return /<w:i(?:\s*\/>|>)/.test(runXml) && !/<w:i[^>]*w:val="false"/.test(runXml);
}

function parseParagraphFragments(paragraphXml) {
  const fragments = [];
  const runs = paragraphXml.match(/<w:r[\s\S]*?<\/w:r>/g) ?? [];
  let currentKind = "body";
  let currentText = "";

  const flush = () => {
    const cleaned = cleanParagraph(currentText);
    if (cleaned) {
      fragments.push(cleaned);
    }
    currentText = "";
  };

  for (const runXml of runs) {
    const texts = [...runXml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
      .map((match) => decodeXmlEntities(match[1]))
      .join("");

    if (!texts) {
      continue;
    }

    let runKind = "body";
    if (isBoldRun(runXml) && (parseRunSize(runXml) ?? 0) >= 12) {
      runKind = "title";
    } else if (isItalicRun(runXml)) {
      runKind = "metadata";
    }

    if (runKind !== currentKind) {
      flush();
      currentKind = runKind;
    }

    currentText += texts;
  }

  flush();
  return fragments;
}

function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isDateLine(value) {
  return /^(Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche)\b/.test(value);
}

function isMetadataLine(value) {
  return /^(Pour\b|Préparation\b)/i.test(value);
}

function isRecipeTitle(paragraphs, index) {
  const current = paragraphs[index];
  const next = paragraphs[index + 1];

  return Boolean(
    current &&
      next &&
      !isDateLine(current) &&
      !isMetadataLine(current) &&
      isMetadataLine(next),
  );
}

function parseDocxParagraphs(xml) {
  const paragraphs = [];
  const paragraphMatches = xml.match(/<w:p[\s\S]*?<\/w:p>/g) ?? [];

  for (const paragraphXml of paragraphMatches) {
    for (const fragment of parseParagraphFragments(paragraphXml)) {
      if (fragment) {
        paragraphs.push(fragment);
      }
    }
  }

  return paragraphs;
}

function splitRecipes(paragraphs) {
  const recipes = [];

  for (let index = 0; index < paragraphs.length; index += 1) {
    if (!isRecipeTitle(paragraphs, index)) {
      continue;
    }

    const title = paragraphs[index];
    const bodyParagraphs = [];
    const metadataCandidates = [];
    let cursor = index + 1;

    while (cursor < paragraphs.length && isMetadataLine(paragraphs[cursor])) {
      metadataCandidates.push(paragraphs[cursor]);
      cursor += 1;
    }

    const metadataLine = [...metadataCandidates].sort((left, right) => left.length - right.length)[0];
    if (!metadataLine) {
      continue;
    }

    for (const candidate of metadataCandidates) {
      if (candidate.length === metadataLine.length) {
        continue;
      }

      if (candidate.startsWith(metadataLine)) {
        const remainder = candidate.slice(metadataLine.length).trim();
        if (remainder) {
          bodyParagraphs.push(remainder);
        }
      }
    }

    while (cursor < paragraphs.length) {
      if (isDateLine(paragraphs[cursor]) || isRecipeTitle(paragraphs, cursor)) {
        break;
      }

      if (!isMetadataLine(paragraphs[cursor])) {
        bodyParagraphs.push(paragraphs[cursor]);
      }

      cursor += 1;
    }

    recipes.push({
      title,
      metadataLine,
      body: bodyParagraphs.join("\n\n").trim(),
    });

    index = cursor - 1;
  }

  return recipes;
}

function parseServingsText(metadataLine) {
  const match = metadataLine.match(/^Pour\s*:?\s*([^-]+?)(?:\s*-\s*|$)/i);
  return match ? match[1].trim() : null;
}

function parseSimpleServings(servingsText) {
  if (!servingsText) {
    return null;
  }

  const normalized = servingsText.replace(/\s+/g, " ").trim();
  const simpleMatch = normalized.match(/^(\d+)\s+(personnes?|parts?|portions?|flans?|galettes|feuilletés)$/i);
  return simpleMatch ? Number.parseInt(simpleMatch[1], 10) : null;
}

function parseLabeledValue(metadataLine, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = metadataLine.match(new RegExp(`${escapedLabel}\\s*:?\\s*([^\\-]+?)(?=\\s*-\\s*[A-ZÀ-ÿ]|$)`, "i"));
  return match ? match[1].trim() : null;
}

function normalizeTimeValue(value) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  let match = normalized.match(/^(\d+)\s*min(?:utes?)?$/i);
  if (match) {
    return `${match[1]} min`;
  }

  match = normalized.match(/^(\d+)\s*h(?:eures?)?\s*(\d+)\s*$/i);
  if (match) {
    return `${match[1]} h ${match[2]} min`;
  }

  match = normalized.match(/^(\d+)\s*h(?:eures?)?$/i);
  if (match) {
    return `${match[1]} h`;
  }

  match = normalized.match(/^(\d+)\s*h\s*(\d+)\s*min(?:utes?)?$/i);
  if (match) {
    return `${match[1]} h ${match[2]} min`;
  }

  return null;
}

function buildFrontmatter(recipe) {
  const servingsText = parseServingsText(recipe.metadataLine);
  const servings = parseSimpleServings(servingsText);
  const prepTimeText = parseLabeledValue(recipe.metadataLine, "Préparation");
  const cookTimeText = parseLabeledValue(recipe.metadataLine, "Cuisson");
  const restTime = parseLabeledValue(recipe.metadataLine, "Repos marinade au frais");
  const noCook = /Sans cuisson/i.test(recipe.metadataLine);
  const prepTime = normalizeTimeValue(prepTimeText);
  const cookTime = normalizeTimeValue(cookTimeText);
  const lines = ["---", `title: ${JSON.stringify(recipe.title)}`];

  if (servings !== null) {
    lines.push(`servings: ${servings}`);
  }

  if (servingsText) {
    lines.push(`servings_text: ${JSON.stringify(servingsText)}`);
  }

  if (prepTime) {
    lines.push(`prep_time: ${JSON.stringify(prepTime)}`);
  }

  if (prepTimeText) {
    lines.push(`prep_time_text: ${JSON.stringify(prepTimeText)}`);
  }

  if (cookTime) {
    lines.push(`cook_time: ${JSON.stringify(cookTime)}`);
  }

  if (cookTimeText) {
    lines.push(`cook_time_text: ${JSON.stringify(cookTimeText)}`);
  } else if (restTime) {
    lines.push(`cook_time_text: ${JSON.stringify(`Repos marinade au frais ${restTime}`)}`);
  } else if (noCook) {
    lines.push(`cook_time_text: ${JSON.stringify("Sans cuisson")}`);
  }

  lines.push("---", "");
  return lines.join("\n");
}

async function findDocxFile() {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const match = entries.find((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".docx"));

  if (!match) {
    throw new Error("No DOCX file found at repository root.");
  }

  return new URL(match.name, rootDir);
}

async function clearRecipesDirectory() {
  const entries = await fs.readdir(recipesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".cook")) {
      await fs.rm(new URL(entry.name, recipesDir), { force: true });
    }
  }
}

async function main() {
  const docxFile = await findDocxFile();
  const xml = await runCommand("unzip", ["-p", fileURLToPath(docxFile), "word/document.xml"]);
  const paragraphs = parseDocxParagraphs(xml);
  const recipes = splitRecipes(paragraphs);

  if (recipes.length === 0) {
    throw new Error("No recipes were parsed from the DOCX.");
  }

  await clearRecipesDirectory();

  const usedFileNames = new Set();
  for (const recipe of recipes) {
    let baseName = slugify(recipe.title);
    if (!baseName) {
      baseName = "recipe";
    }

    let fileName = `${baseName}.cook`;
    let suffix = 2;
    while (usedFileNames.has(fileName)) {
      fileName = `${baseName}_${suffix}.cook`;
      suffix += 1;
    }
    usedFileNames.add(fileName);

    const output = `${buildFrontmatter(recipe)}${recipe.body}\n`;
    await fs.writeFile(new URL(fileName, recipesDir), output, "utf8");
  }

  console.log(`Imported ${recipes.length} recipes from ${path.basename(fileURLToPath(docxFile))}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
