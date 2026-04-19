#!/usr/bin/env node

import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const recipesDir = new URL("../recipes/", import.meta.url);

const servingNumber = /(\d+)/;

function yamlScalar(value) {
  if (typeof value === "number") {
    return String(value);
  }

  return JSON.stringify(value);
}

function parseYamlScalar(rawValue) {
  const value = rawValue.trim();

  if (value.startsWith("\"")) {
    return JSON.parse(value);
  }

  if (/^\d+$/.test(value)) {
    return Number(value);
  }

  return value;
}

function parseLegacyMetadata(lines) {
  const metadata = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.startsWith(">> ")) {
      break;
    }

    const match = line.match(/^>>\s*([a-z_]+)\s*:\s*(.*)$/i);
    if (!match) {
      break;
    }

    metadata.push([match[1], match[2].trim()]);
    index += 1;
  }

  if (metadata.length === 0) {
    return null;
  }

  while (index < lines.length && lines[index].trim() === "") {
    index += 1;
  }

  return {
    metadata: Object.fromEntries(metadata),
    body: lines.slice(index).join("\n").trim(),
  };
}

function parseFrontmatter(source) {
  if (!source.startsWith("---\n")) {
    return null;
  }

  const end = source.indexOf("\n---\n", 4);
  if (end === -1) {
    return null;
  }

  const header = source.slice(4, end);
  const body = source.slice(end + 5).trim();
  const metadata = {};

  for (const line of header.split("\n")) {
    if (!line.trim()) {
      continue;
    }

    const match = line.match(/^([a-z_]+)\s*:\s*(.*)$/i);
    if (!match) {
      continue;
    }

    metadata[match[1]] = parseYamlScalar(match[2]);
  }

  return { metadata, body };
}

function normalizeServings(rawValue) {
  const cleaned = String(rawValue).replace(/^:\s*/, "").trim();
  const match = cleaned.match(servingNumber);

  return {
    servings: match ? Number(match[1]) : null,
    servingsText: cleaned,
  };
}

function normalizeTime(rawValue) {
  const cleaned = String(rawValue)
    .trim()
    .replace(/^(préparation|preparation)\s*:?\s*/i, "")
    .replace(/^cuisson\s*:?\s*/i, "");

  if (/^sans cuisson$/i.test(cleaned)) {
    return { canonical: "0 min", text: cleaned };
  }

  let match = cleaned.match(/^(\d+)\s*-\s*(\d+)\s*(minutes?|mins?|min)$/i);
  if (match) {
    return { canonical: `${match[1]} min`, text: cleaned };
  }

  match = cleaned.match(/^(\d+)\s*à\s*(\d+)\s*(minutes?|mins?|min)$/i);
  if (match) {
    return { canonical: `${match[1]} min`, text: cleaned };
  }

  match = cleaned.match(/^(\d+)h(\d+)$/i) ?? cleaned.match(/^(\d+)\s*h\s*(\d+)\s*(minutes?|mins?|min)?$/i);
  if (match) {
    return { canonical: `${Number(match[1]) * 60 + Number(match[2])} min`, text: cleaned };
  }

  match = cleaned.match(/^(\d+)h$/i) ?? cleaned.match(/^(\d+)\s*h$/i);
  if (match) {
    return { canonical: `${Number(match[1]) * 60} min`, text: cleaned };
  }

  match = cleaned.match(/^(\d+)\s*(minutes?|mins?|min)$/i);
  if (match) {
    return { canonical: `${match[1]} min`, text: cleaned };
  }

  return { canonical: null, text: cleaned };
}

function normalizeMetadata(metadata) {
  const normalized = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (key === "yield") {
      continue;
    }

    if (key === "servings") {
      const { servings, servingsText } = normalizeServings(value);
      if (servings !== null) {
        normalized.servings = servings;
      }
      normalized.servings_text = servingsText;
      continue;
    }

    if (key === "prep_time" || key === "cook_time" || key === "time") {
      const { canonical, text } = normalizeTime(value);
      if (canonical !== null) {
        normalized[key] = canonical;
      }
      if (text !== canonical) {
        normalized[`${key}_text`] = text;
      }
      continue;
    }

    normalized[key] = value;
  }

  return normalized;
}

function serializeRecipe(metadata, body) {
  const lines = ["---"];

  for (const [key, value] of Object.entries(metadata)) {
    lines.push(`${key}: ${yamlScalar(value)}`);
  }

  lines.push("---", "", body.trim(), "");
  return lines.join("\n");
}

async function main() {
  const entries = await fs.readdir(recipesDir, { withFileTypes: true });
  let updated = 0;

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".cook")) {
      continue;
    }

    const filePath = new URL(entry.name, recipesDir);
    const source = (await fs.readFile(filePath, "utf8")).replace(/^\uFEFF/, "");
    const parsed = parseFrontmatter(source) ?? parseLegacyMetadata(source.split(/\r?\n/));

    if (!parsed) {
      continue;
    }

    const nextSource = serializeRecipe(normalizeMetadata(parsed.metadata), parsed.body);
    if (nextSource === source) {
      continue;
    }

    await fs.writeFile(filePath, nextSource, "utf8");
    updated += 1;
  }

  console.log(`Updated ${updated} recipe files in ${fileURLToPath(recipesDir)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
