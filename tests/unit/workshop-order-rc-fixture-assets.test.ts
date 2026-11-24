import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fixtureDirectory =
  'docs/workshop-order-system/qa-fixture/rc-e2e-20261124';
const manifest = JSON.parse(readFileSync(
  resolve(fixtureDirectory, 'fixture-manifest.json'),
  'utf8',
)) as {
  readonly organizationId: string;
  readonly orderId: string;
  readonly versionLabel: string;
  readonly assets: readonly {
    readonly category: string;
    readonly imageId: string;
    readonly sourceFile: string;
    readonly sha256: string;
    readonly byteSize: number;
    readonly canonicalPath: string;
    readonly uploadOrder: number;
    readonly storageObjectId: null;
    readonly storageObjectVersion: null;
    readonly storageObjectUpdatedAt: null;
  }[];
};

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function verifyPng(bytes: Buffer): boolean {
  if (!bytes.subarray(0, 8).equals(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  )) return false;
  let offset = 8;
  const chunks: string[] = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    const expected = bytes.readUInt32BE(offset + 8 + length);
    const actual = crc32(Buffer.concat([
      bytes.subarray(offset + 4, offset + 8),
      data,
    ]));
    if (actual !== expected) return false;
    chunks.push(type);
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  return offset === bytes.length
    && chunks[0] === 'IHDR'
    && chunks.includes('IDAT')
    && chunks[chunks.length - 1] === 'IEND';
}

assert.equal(manifest.assets.length, 4);
assert.deepEqual(
  manifest.assets.map(asset => asset.category).sort(),
  [
    'CUSTOMER_APPROVED_SAMPLE',
    'FILM_PATTERN',
    'PRODUCT',
    'SIGNED_SAMPLE',
  ],
);
assert.equal(new Set(manifest.assets.map(asset => asset.imageId)).size, 4);
assert.equal(new Set(manifest.assets.map(asset => asset.sha256)).size, 4);

for (const asset of manifest.assets) {
  const bytes = readFileSync(resolve(fixtureDirectory, asset.sourceFile));
  assert.equal(bytes.length, asset.byteSize);
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    asset.sha256,
  );
  assert.equal(verifyPng(bytes), true);
  assert.equal(asset.storageObjectId, null);
  assert.equal(asset.storageObjectVersion, null);
  assert.equal(asset.storageObjectUpdatedAt, null);
  assert(asset.canonicalPath.startsWith(
    `organizations/${manifest.organizationId}/wos/production-order/`
    + `${manifest.orderId}/images/`,
  ));
  assert(asset.canonicalPath.endsWith(`/versions/${manifest.versionLabel}/`
    + `${asset.imageId}/source.png`));
}

console.log('workshop-order-rc-fixture-assets.test.ts: PASS');
