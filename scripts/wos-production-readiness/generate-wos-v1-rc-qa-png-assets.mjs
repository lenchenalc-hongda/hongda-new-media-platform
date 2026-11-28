import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const root = resolve(import.meta.dirname, '../..');
const outputDir = resolve(
  root,
  'docs/workshop-order-system/qa-fixture/rc-e2e-20261124',
);
const organizationId = '0ff53d93-2b9e-48b9-8113-a4768c39cdd2';
const orderId = '4aa6b131-c247-40e2-8340-473e4493369c';
const versionLabel = 'V1';
const assets = [
  {
    category: 'PRODUCT',
    slug: 'product',
    imageId: 'ee363100-3b41-4c6b-be41-1ff59749c3be',
    color: [220, 62, 45, 255],
    fileName: 'product.png',
  },
  {
    category: 'FILM_PATTERN',
    slug: 'film-pattern',
    imageId: '55e84425-01ea-4b32-bfb6-ff72e8e685f9',
    color: [34, 122, 160, 255],
    fileName: 'film-pattern.png',
  },
  {
    category: 'CUSTOMER_APPROVED_SAMPLE',
    slug: 'customer-approved-sample',
    imageId: 'b977698d-ce41-45f6-b0ae-031d101ac533',
    color: [42, 146, 91, 255],
    fileName: 'customer-approved-sample.png',
  },
  {
    category: 'SIGNED_SAMPLE',
    slug: 'signed-sample',
    imageId: '21a9a702-2012-4671-877e-7180f4d7d095',
    color: [126, 82, 156, 255],
    fileName: 'signed-sample.png',
  },
];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function png(width, height, color) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const row = Buffer.alloc(1 + width * 4);
  for (let x = 0; x < width; x += 1) {
    row.set(color, 1 + x * 4);
  }
  const pixels = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(pixels, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(outputDir, { recursive: true });
const manifestAssets = [];
for (const [index, asset] of assets.entries()) {
  const bytes = png(64, 64, asset.color);
  const outputPath = resolve(outputDir, asset.fileName);
  writeFileSync(outputPath, bytes);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  manifestAssets.push({
    category: asset.category,
    imageId: asset.imageId,
    sourceFile: asset.fileName,
    sha256,
    byteSize: bytes.length,
    canonicalPath:
      `organizations/${organizationId}/wos/production-order/${orderId}`
      + `/images/${asset.slug}/versions/${versionLabel}`
      + `/${asset.imageId}/source.png`,
    storageObjectId: null,
    storageObjectVersion: null,
    storageObjectUpdatedAt: null,
    uploadOrder: index + 1,
  });
}

writeFileSync(
  resolve(outputDir, 'fixture-manifest.json'),
  `${JSON.stringify({
    schemaVersion: 1,
    status: 'LOCAL_ASSETS_READY / UPLOAD_NOT_AUTHORIZED',
    organizationId,
    orderId,
    versionLabel,
    authorizationId: 'WOS-V1-RC-INTEGRATED-HOSTED-QA-E2E',
    assets: manifestAssets,
  }, null, 2)}\n`,
);

console.log(JSON.stringify({
  OUTPUT_DIR: outputDir,
  ASSET_COUNT: manifestAssets.length,
  SHA256: manifestAssets.map(asset => asset.sha256),
}));
