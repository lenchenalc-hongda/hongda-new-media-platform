#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, canonical(value[key])]),
    );
  }
  return value;
}

function sha256(value) {
  return createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(canonical(value)))
    .digest('hex');
}

function parseRows(text) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('SIGNATURE_INPUT_EMPTY');
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed.rows)) {
      return parsed.rows.map(row => {
        if (typeof row.row_json === 'string') return JSON.parse(row.row_json);
        return row;
      });
    }
  } catch {
    // Fall through to row_json-per-line input.
  }
  return trimmed.split(/\r?\n/).map(line => JSON.parse(line));
}

function aggregate(rows) {
  const ordered = [...rows].sort((left, right) =>
    left.category.localeCompare(right.category)
      || left.object_name.localeCompare(right.object_name));
  return sha256(ordered.map(row => [
    row.category,
    row.object_name,
    sha256(row.details),
  ]));
}

function build(inputPath) {
  const rows = parseRows(fs.readFileSync(inputPath, 'utf8'));
  const compactRows = rows
    .map(row => ({
      category: row.category,
      object_name: row.object_name,
      details_sha256: sha256(row.details),
    }))
    .sort((left, right) =>
      left.category.localeCompare(right.category)
        || left.object_name.localeCompare(right.object_name));
  const categories = {};
  for (const row of compactRows) {
    categories[row.category] = (categories[row.category] || 0) + 1;
  }
  return {
    schema_version: 1,
    project_ref: 'amqpvxrurenevniilhtl',
    scope: ['public', 'commercial_private', 'commercial_audit'],
    observed_utc: new Date().toISOString(),
    contains_business_rows: false,
    contains_function_source: false,
    contains_storage_paths: false,
    row_count: compactRows.length,
    categories,
    aggregate_sha256: aggregate(rows),
    rows: compactRows,
  };
}

function verify(inputPath, manifestPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const rows = parseRows(fs.readFileSync(inputPath, 'utf8'));
  if (manifest.project_ref !== 'amqpvxrurenevniilhtl'
    || manifest.contains_business_rows !== false
    || manifest.contains_function_source !== false
    || manifest.contains_storage_paths !== false
    || !Array.isArray(manifest.rows)) {
    throw new Error('SIGNATURE_MANIFEST_SAFETY_INVALID');
  }
  const expected = new Map(manifest.rows.map(row => [
    row.category + '\0' + row.object_name,
    row.details_sha256,
  ]));
  const actual = new Map(rows.map(row => [
    row.category + '\0' + row.object_name,
    sha256(row.details),
  ]));
  const missing = [...expected.keys()].filter(key => !actual.has(key));
  const extra = [...actual.keys()].filter(key => !expected.has(key));
  const changed = [...expected.keys()]
    .filter(key => actual.has(key) && expected.get(key) !== actual.get(key));
  const actualAggregate = aggregate(rows);
  const passed = missing.length === 0
    && extra.length === 0
    && changed.length === 0
    && actualAggregate === manifest.aggregate_sha256;
  return {
    passed,
    expectedRows: manifest.rows.length,
    actualRows: rows.length,
    missing: missing.slice(0, 20),
    extra: extra.slice(0, 20),
    changed: changed.slice(0, 20),
    expectedAggregate: manifest.aggregate_sha256,
    actualAggregate,
  };
}

const [mode, inputPath, outputPath] = process.argv.slice(2);
if (mode === 'build' && inputPath) {
  const manifest = build(inputPath);
  const text = JSON.stringify(manifest, null, 2) + '\n';
  if (outputPath) fs.writeFileSync(outputPath, text);
  else process.stdout.write(text);
} else if (mode === 'verify' && inputPath && outputPath) {
  const result = verify(inputPath, outputPath);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (!result.passed) process.exit(1);
} else {
  throw new Error(
    'usage: schema-signature-manifest.mjs build <input> [output] | verify <input> <manifest>',
  );
}
