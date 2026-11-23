import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const safeMigrationPath = /^supabase\/migrations\/[A-Za-z0-9_]+\.sql$/;

export function gitBlobSha1(filePath) {
  const bytes = fs.readFileSync(filePath);
  return createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
}

function manifestSources(manifest) {
  return [
    manifest.legacy_bootstrap_source,
    ...manifest.early_sources,
    ...manifest.production_migrations,
  ];
}

export function updateManifestSourcePins(manifest, root) {
  if (!manifest.legacy_bootstrap_source) {
    manifest.legacy_bootstrap_source = {
      file: 'supabase/migrations/001_initial_schema.sql',
    };
  }
  for (const source of manifestSources(manifest)) {
    if (!source || !safeMigrationPath.test(source.file || '')) {
      throw new Error('UNSAFE_MIGRATION_SOURCE_PATH');
    }
    const absolute = path.resolve(root, source.file);
    if (!absolute.startsWith(root + path.sep) || !fs.statSync(absolute).isFile()) {
      throw new Error('MIGRATION_SOURCE_NOT_FOUND: ' + source.file);
    }
    source.source_blob_sha1 = gitBlobSha1(absolute);
  }
  manifest.source_pins_version = 1;
  return manifest;
}

export function verifyManifestSourcePins(manifest, root) {
  if (manifest.source_pins_version !== 1
    || !manifest.legacy_bootstrap_source?.source_blob_sha1) {
    throw new Error('SOURCE_PIN_MANIFEST_INCOMPLETE');
  }
  for (const source of manifestSources(manifest)) {
    if (!source || !safeMigrationPath.test(source.file || '')
      || !/^[a-f0-9]{40}$/.test(source.source_blob_sha1 || '')) {
      throw new Error('SOURCE_PIN_ENTRY_INVALID');
    }
    const absolute = path.resolve(root, source.file);
    if (!absolute.startsWith(root + path.sep) || !fs.statSync(absolute).isFile()) {
      throw new Error('MIGRATION_SOURCE_NOT_FOUND: ' + source.file);
    }
    const actual = gitBlobSha1(absolute);
    if (actual !== source.source_blob_sha1) {
      throw new Error(`SOURCE_PIN_DRIFT: ${source.file}`);
    }
  }
}

const [mode, manifestPath, rootPath] = process.argv.slice(2);
if (import.meta.url === `file://${process.argv[1]}`) {
  if (mode === 'update' && manifestPath) {
    const root = path.resolve(rootPath || '.');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    updateManifestSourcePins(manifest, root);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`WOS_P8_SOURCE_PINS_UPDATED=${manifestSources(manifest).length}`);
  } else if (mode === 'verify' && manifestPath) {
    const root = path.resolve(rootPath || '.');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    verifyManifestSourcePins(manifest, root);
    console.log(`WOS_P8_SOURCE_PINS_VERIFIED=${manifestSources(manifest).length}`);
  } else {
    throw new Error('usage: source-pins.mjs update|verify <manifest> <root>');
  }
}
