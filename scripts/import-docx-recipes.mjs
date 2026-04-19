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
  let currentSegments = [];

  const flush = () => {
    const cleaned = cleanParagraph(currentText);
    if (cleaned) {
      fragments.push({
        kind: currentKind,
        text: cleaned,
        segments: currentKind === "body" ? currentSegments : null,
      });
    }
    currentText = "";
    currentSegments = [];
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

    if (runKind === "body") {
      currentSegments.push({
        text: decodeXmlEntities(texts),
        bold: isBoldRun(runXml),
      });
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
  const current = paragraphs[index]?.text;
  const next = paragraphs[index + 1]?.text;

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
      if (fragment?.text) {
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

    while (cursor < paragraphs.length && isMetadataLine(paragraphs[cursor].text)) {
      metadataCandidates.push(paragraphs[cursor]);
      cursor += 1;
    }

    const metadataLine = [...metadataCandidates].sort((left, right) => left.text.length - right.text.length)[0];
    if (!metadataLine) {
      continue;
    }

    for (const candidate of metadataCandidates) {
      if (candidate.text.length === metadataLine.text.length) {
        continue;
      }

      if (candidate.text.startsWith(metadataLine.text)) {
        const remainder = candidate.text.slice(metadataLine.text.length).trim();
        if (remainder) {
          bodyParagraphs.push({
            text: remainder,
            segments: [{ text: remainder, bold: false }],
          });
        }
      }
    }

    while (cursor < paragraphs.length) {
      if (isDateLine(paragraphs[cursor]) || isRecipeTitle(paragraphs, cursor)) {
        break;
      }

      if (!isMetadataLine(paragraphs[cursor].text)) {
        bodyParagraphs.push(paragraphs[cursor]);
      }

      cursor += 1;
    }

    recipes.push({
      title: title.text,
      metadataLine: metadataLine.text,
      bodyParagraphs,
    });

    index = cursor - 1;
  }

  return recipes;
}

function splitAffixes(value) {
  const match = value.match(/^(\s*)(.*?)([\s,.;:]*)$/s);
  return {
    leading: match?.[1] ?? "",
    core: match?.[2] ?? value,
    trailing: match?.[3] ?? "",
  };
}

function normalizeIngredientName(value) {
  return value
    .trim()
    .replace(/^(?:la|le|les|du|de la|de l'|d'|des|un|une)\s+/i, "")
    .replace(/^(?:beau|bel|belle|beaux|belles|gros|grosse|grosses|grand|grande|grandes|petit|petite|petites|quelques|fine|fines)\s+/i, "")
    .replace(/\s+du panier\b.*$/i, "")
    .replace(/\s+\((?:[^)(]+|\([^)(]*\))*\)\s*$/u, "")
    .replace(/\s+(?:haché|hachée|hachés|hachées|ciselé|ciselée|ciselés|ciselées|coupé|coupée|coupés|coupées|rincé|rincée|rincés|rincées|lavé|lavée|lavés|lavées|égoutté|égouttée|égouttés|égouttées|émietté|émiettée|émiettés|émiettées|concassé|concassée|concassés|concassées|grillé|grillée|grillés|grillées|pelé|pelée|pelés|pelées|frais|fraîche|frais|fraîches)\b.*$/i, "")
    .replace(/^(?:de|d')\s+/i, "")
    .trim();
}

function isSimpleIngredientSpan(value) {
  const normalized = value.trim();
  return Boolean(
    normalized &&
      !/[.!?]/.test(normalized) &&
      !/,/.test(normalized) &&
      !/\bavec\b/i.test(normalized) &&
      !/\bet\b.+\bet\b/i.test(normalized),
  );
}

function formatIngredientRef(name, quantity = null, unit = null) {
  const normalizedName = normalizeIngredientName(name);
  if (!normalizedName) {
    return null;
  }

  if (quantity && unit) {
    return normalizedName.includes(" ")
      ? `@${normalizedName}{${quantity}%${unit}}`
      : `@${normalizedName}{${quantity}%${unit}}`;
  }

  if (quantity) {
    return normalizedName.includes(" ")
      ? `@${normalizedName}{${quantity}}`
      : `@${normalizedName}{${quantity}}`;
  }

  return normalizedName.includes(" ") ? `@${normalizedName}{}` : `@${normalizedName}`;
}

function renderPlainIngredient(name, quantity = null, unit = null) {
  if (quantity && unit) {
    return `${quantity} ${unit} de ${name}`;
  }

  if (quantity) {
    return `${quantity} ${name}`;
  }

  return name;
}

function normalizeIngredientToken(name, quantity = null, unit = null) {
  const cleanedName = normalizeIngredientName(name);
  if (!cleanedName) {
    return null;
  }

  if (
    /\b(?:ou|de votre choix|selon|facultatif|optionnel|optionnellement)\b/i.test(cleanedName) ||
    /^(?:préparer|mélanger|couper|ajouter|faire|rincer|laver|égoutter|parsemer|servir)\b/i.test(cleanedName) ||
    /,/.test(cleanedName)
  ) {
    return { plain: renderPlainIngredient(cleanedName, quantity, unit) };
  }

  const unitFromNameMatch = cleanedName.match(/^(càs|cas|càc|cac|verre|verres|boule|boules|gousse|gousses|tranche|tranches|filet|filets|dos|pavé|pavés|poignée|poignées|pincée|pincées|bouquet|bouquets|blanc|blancs|bloc|blocs|bûche|buche|bûches|buches|rouleau|rouleaux|feuille|feuilles|sachet|sachets|barquette|barquettes|paquet|paquets|cube|cubes|part|parts|portion|portions|galette|galettes|escalope|escalopes|steak|steaks|filet|filets|oeuf|oeufs)\s+d['e]\s+(.+)$/iu);
  if (unitFromNameMatch && quantity) {
    return {
      name: normalizeIngredientName(unitFromNameMatch[2]),
      quantity,
      unit: unitFromNameMatch[1],
    };
  }

  if (/^(?:càs|cas|càc|cac|g|kg|ml|cl|l)\b/i.test(cleanedName)) {
    return { plain: renderPlainIngredient(cleanedName, quantity, unit) };
  }

  return {
    name: cleanedName,
    quantity,
    unit,
  };
}

function renderNormalizedIngredient(name, quantity = null, unit = null) {
  const normalized = normalizeIngredientToken(name, quantity, unit);
  if (!normalized) {
    return renderPlainIngredient(name, quantity, unit);
  }

  if (normalized.plain) {
    return normalized.plain;
  }

  return formatIngredientRef(normalized.name, normalized.quantity, normalized.unit);
}

function hasExtraQuantity(value) {
  return /\b\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?(?:\s*[A-Za-zÀ-ÿŒœÆæ]+)?\b/u.test(value);
}

function convertBoldSegmentToCooklang(value, nextText = "") {
  const { leading, core, trailing } = splitAffixes(value);
  const normalized = core.trim();
  if (
    !isSimpleIngredientSpan(normalized) ||
    /^\s*sous\b/i.test(nextText) ||
    /\b(?:ou|de votre choix|selon|facultatif|optionnel|optionnellement)\b/i.test(normalized) ||
    /^(?:préparer|mélanger|couper|ajouter|faire|rincer|laver|égoutter|parsemer|servir)\b/i.test(normalized)
  ) {
    return value;
  }

  let match = normalized.match(/^(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?)\s*(?:(?:beau|bel|belle|beaux|belles|gros|grosse|grand|grande|petit|petite)\s+)?(càs|cas|càc|cac|g|kg|ml|cl|l|verre|verres|boule|boules|gousse|gousses|tranche|tranches|filet|filets|dos|pavé|pavés|poignée|poignées|pincée|pincées|bouquet|bouquets|blanc|blancs|bloc|blocs|bûche|buche|bûches|buches|rouleau|rouleaux|feuille|feuilles|sachet|sachets|barquette|barquettes|paquet|paquets|cube|cubes|part|parts|portion|portions|galette|galettes|escalope|escalopes|steak|steaks)\s+de\s+(.+)$/iu);
  if (match) {
    if (hasExtraQuantity(match[3])) {
      return value;
    }
    const rendered = renderNormalizedIngredient(match[3], match[1], match[2]);
    return rendered ? `${leading}${rendered}${trailing}` : value;
  }

  match = normalized.match(/^(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?)\s*d['’](.+)$/u);
  if (match) {
    if (hasExtraQuantity(match[2])) {
      return value;
    }
    const rendered = renderNormalizedIngredient(match[2], match[1]);
    return rendered ? `${leading}${rendered}${trailing}` : value;
  }

  match = normalized.match(/^(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?)\s+(.+)$/u);
  if (match) {
    if (hasExtraQuantity(match[2])) {
      return value;
    }
    const rendered = renderNormalizedIngredient(match[2], match[1]);
    return rendered ? `${leading}${rendered}${trailing}` : value;
  }

  const rendered = renderNormalizedIngredient(normalized);
  return rendered ? `${leading}${rendered}${trailing}` : value;
}

function renderBodyParagraph(paragraph) {
  if (!paragraph.segments?.length) {
    return paragraph.text;
  }

  return paragraph.segments
    .map((segment, index) => (
      segment.bold
        ? convertBoldSegmentToCooklang(segment.text, paragraph.segments[index + 1]?.text ?? "")
        : segment.text
    ))
    .join("")
    .replace(/\u00a0/g, " ")
    .replace(/\u202f/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function renderCooklangBody(recipe) {
  return recipe.bodyParagraphs.map(renderBodyParagraph).filter(Boolean).join("\n\n");
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

    const output = `${buildFrontmatter(recipe)}${renderCooklangBody(recipe)}\n`;
    await fs.writeFile(new URL(fileName, recipesDir), output, "utf8");
  }

  console.log(`Imported ${recipes.length} recipes from ${path.basename(fileURLToPath(docxFile))}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
