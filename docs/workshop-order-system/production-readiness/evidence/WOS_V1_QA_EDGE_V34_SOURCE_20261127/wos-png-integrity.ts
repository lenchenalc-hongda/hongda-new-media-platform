// Web-standard, bounded PNG parser shared by QA and Production-neutral Edge functions.
// Magic bytes, MIME or filename alone are never accepted as proof.
const MAX_FILE = 20 * 1024 * 1024;
const MAX_PIXELS = 16 * 1024 * 1024;
const MAX_RAW = 64 * 1024 * 1024;
const MAGIC = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return value >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function u32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) >>> 0)
    + (bytes[offset + 1] << 16)
    + (bytes[offset + 2] << 8)
    + bytes[offset + 3]
  ) >>> 0;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return Array.from(new Uint8Array(digest))
    .map(value => value.toString(16).padStart(2, '0'))
    .join('');
}

export async function pngValid(
  bytes: Uint8Array,
  expectedSha256: string,
): Promise<boolean> {
  if (bytes.length < 60 || bytes.length > MAX_FILE) return false;
  if (!MAGIC.every((value, index) => bytes[index] === value)) return false;
  if (await sha256Hex(bytes) !== expectedSha256) return false;

  let offset = 8;
  let chunks = 0;
  let header = false;
  let seenData = false;
  let idatEnded = false;
  let ended = false;
  let width = 0;
  let height = 0;
  let channels = 0;
  const compressed: Uint8Array[] = [];
  let compressedSize = 0;

  while (offset < bytes.length && chunks++ < 1000) {
    if (offset + 12 > bytes.length) return false;
    const length = u32(bytes, offset);
    const kind = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const end = offset + 8 + length;
    if (length > MAX_FILE
      || end + 4 > bytes.length
      || !/^[A-Za-z]{4}$/.test(kind)
      || crc32(bytes.subarray(offset + 4, end)) !== u32(bytes, end)) return false;
    if (!header && kind !== 'IHDR') return false;
    if (kind === 'IHDR') {
      if (header || length !== 13 || chunks !== 1) return false;
      width = u32(bytes, offset + 8);
      height = u32(bytes, offset + 12);
      const depth = bytes[offset + 16];
      const color = bytes[offset + 17];
      if (!width || !height || width * height > MAX_PIXELS || depth !== 8
        || ![0, 2, 4, 6].includes(color)
        || bytes[offset + 18] !== 0
        || bytes[offset + 19] !== 0
        || bytes[offset + 20] !== 0) return false;
      channels = ({ 0: 1, 2: 3, 4: 2, 6: 4 } as Record<number, number>)[color];
      header = true;
    } else if (kind === 'IDAT') {
      if (ended || idatEnded || length === 0) return false;
      compressed.push(bytes.subarray(offset + 8, end));
      compressedSize += length;
      if (compressedSize > MAX_FILE) return false;
      seenData = true;
    } else if (kind === 'IEND') {
      if (!seenData || ended || length !== 0 || end + 4 !== bytes.length) return false;
      ended = true;
    } else {
      if (seenData) idatEnded = true;
      if (kind === 'acTL' || kind === 'fcTL' || kind === 'fdAT'
        || (kind.charCodeAt(0) >= 65 && kind.charCodeAt(0) <= 90)) return false;
    }
    offset = end + 4;
  }
  if (!ended || !header || !seenData || offset !== bytes.length) return false;
  const rowBytes = 1 + width * channels;
  const expected = rowBytes * height;
  if (!Number.isSafeInteger(expected) || expected > MAX_RAW) return false;
  const input = new Uint8Array(compressedSize);
  let at = 0;
  for (const chunk of compressed) {
    input.set(chunk, at);
    at += chunk.length;
  }
  try {
    const stream = new ReadableStream<BufferSource>({
      start(controller) {
        controller.enqueue(input);
        controller.close();
      },
    }).pipeThrough(new DecompressionStream('deflate'));
    const reader = stream.getReader();
    let produced = 0;
    const raw = new Uint8Array(expected);
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      if (produced + part.value.length > expected) {
        await reader.cancel();
        return false;
      }
      raw.set(part.value, produced);
      produced += part.value.length;
    }
    if (produced !== expected) return false;
    for (let row = 0; row < height; row++) {
      if (raw[row * rowBytes] > 4) return false;
    }
    return true;
  } catch {
    return false;
  }
}
