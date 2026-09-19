import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { deflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const colors = {
  navy: [31, 42, 68, 255],
  parchment: [247, 243, 233, 255],
  gold: [154, 123, 46, 255],
};

function createCrcTable() {
  return Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value =
        value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  });
}

const crcTable = createCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function pixelColor(normalizedX, normalizedY, maskable) {
  const dx = normalizedX - 0.5;
  const dy = normalizedY - 0.5;
  const radius = Math.sqrt(dx * dx + dy * dy);

  const fieldRadius = maskable ? 0.34 : 0.405;
  const ruleOuter = maskable ? 0.285 : 0.335;
  const ruleInner = maskable ? 0.265 : 0.31;

  if (radius > fieldRadius) {
    return colors.navy;
  }
  if (radius > ruleOuter) {
    return colors.navy;
  }
  if (radius > ruleInner) {
    return colors.gold;
  }
  if (radius > (maskable ? 0.235 : 0.275)) {
    return colors.parchment;
  }

  // A geometric "C" remains legible at 192 px and inside the maskable safe zone.
  const glyphRadius = Math.sqrt(dx * dx + dy * dy);
  const inGlyphStroke =
    glyphRadius >= (maskable ? 0.105 : 0.125) &&
    glyphRadius <= (maskable ? 0.19 : 0.22);
  const inOpening =
    dx > (maskable ? 0.045 : 0.055) &&
    Math.abs(dy) < (maskable ? 0.09 : 0.105);

  if (inGlyphStroke && !inOpening) {
    return colors.navy;
  }

  return colors.parchment;
}

function createPng(size, maskable = false) {
  const stride = 1 + size * 4;
  const raw = Buffer.alloc(stride * size);

  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * stride;
    raw[rowOffset] = 0;
    for (let x = 0; x < size; x += 1) {
      const color = pixelColor(
        (x + 0.5) / size,
        (y + 0.5) / size,
        maskable,
      );
      const pixelOffset = rowOffset + 1 + x * 4;
      raw.set(color, pixelOffset);
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const iconDirectory = path.resolve(process.cwd(), 'public', 'icons');
await mkdir(iconDirectory, { recursive: true });

await Promise.all([
  writeFile(path.join(iconDirectory, 'icon-192.png'), createPng(192)),
  writeFile(path.join(iconDirectory, 'icon-512.png'), createPng(512)),
  writeFile(
    path.join(iconDirectory, 'icon-maskable-512.png'),
    createPng(512, true),
  ),
]);

console.log(`[icons] Generated accessible high-contrast icons in ${iconDirectory}.`);
