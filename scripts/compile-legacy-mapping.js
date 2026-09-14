#!/usr/bin/env node
/**
 * Local mapping compiler — validates docs/legacy-mapping/legacy-fields.json
 * for duplicates/conflicts. Does NOT read Firestore.
 */
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "../docs/legacy-mapping/legacy-fields.json");
const raw = fs.readFileSync(file, "utf8");
const data = JSON.parse(raw);

if (!Array.isArray(data.fields)) {
  console.error("legacy-fields.json must have a fields array");
  process.exit(1);
}

const ids = new Map();
const collectionField = new Map();
const errors = [];

for (const f of data.fields) {
  if (!f.id || !f.collection || !f.field || !f.confidence) {
    errors.push(`Incomplete field entry: ${JSON.stringify(f).slice(0, 120)}`);
    continue;
  }
  if (ids.has(f.id)) {
    errors.push(`Duplicate id: ${f.id}`);
  }
  ids.set(f.id, f);
  const key = `${f.collection}::${f.field}`;
  if (collectionField.has(key)) {
    const prev = collectionField.get(key);
    if (prev.canonicalConcept && f.canonicalConcept && prev.canonicalConcept !== f.canonicalConcept) {
      errors.push(
        `Conflict on ${key}: ${prev.canonicalConcept} vs ${f.canonicalConcept}`,
      );
    } else {
      errors.push(`Duplicate collection.field: ${key}`);
    }
  }
  collectionField.set(key, f);

  if (
    f.productionReadBlocker &&
    (f.confidence === "low" || f.confidence === "unknown")
  ) {
    // expected for blockers — not an error
  }
}

if (errors.length) {
  console.error("Mapping compiler FAILED:");
  for (const e of errors) console.error(" -", e);
  process.exit(1);
}

console.log(
  `Mapping compiler OK: ${data.fields.length} fields, ${ids.size} unique ids`,
);
