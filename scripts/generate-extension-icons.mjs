import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

mkdirSync('extension/icons', { recursive: true });

function createPNG(size) {
  // Simple uncompressed or deflate PNG generator
  const width = size;
  const height = size;

  // RGBA buffer with filter byte 0 at start of each scanline
  const scanlines = Buffer.alloc(height * (width * 4 + 1));

  let offset = 0;
  const center = size / 2;
  const radius = size * 0.42;

  for (let y = 0; y < height; y++) {
    scanlines[offset++] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radius) {
        // Gradient from vibrant Indigo/Purple (79, 70, 229) to Sky Blue (14, 165, 233)
        const t = (x + y) / (width + height);
        const r = Math.round(79 * (1 - t) + 14 * t);
        const g = Math.round(70 * (1 - t) + 165 * t);
        const b = Math.round(229 * (1 - t) + 233 * t);

        // Keyhole or shield symbol in the center (white)
        const inKeyCircle = Math.sqrt(dx * dx + (dy + size * 0.08) * (dy + size * 0.08)) < size * 0.16;
        const inKeyBar = Math.abs(dx) < size * 0.06 && dy >= -size * 0.04 && dy <= size * 0.22;
        const inKeyTeeth = dx >= 0 && dx <= size * 0.14 && dy >= size * 0.10 && dy <= size * 0.20;

        if (inKeyCircle || inKeyBar || inKeyTeeth) {
          scanlines[offset++] = 255;
          scanlines[offset++] = 255;
          scanlines[offset++] = 255;
          scanlines[offset++] = 255;
        } else {
          // Antialiased edge
          const edgeAlpha = dist > radius - 1 ? Math.round(255 * (radius - dist)) : 255;
          scanlines[offset++] = r;
          scanlines[offset++] = g;
          scanlines[offset++] = b;
          scanlines[offset++] = Math.max(0, Math.min(255, edgeAlpha));
        }
      } else {
        scanlines[offset++] = 0;
        scanlines[offset++] = 0;
        scanlines[offset++] = 0;
        scanlines[offset++] = 0;
      }
    }
  }

  const compressed = deflateSync(scanlines);

  // Helper to create chunk
  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);

    const typeBuf = Buffer.from(type, 'ascii');
    const crc = crc32(Buffer.concat([typeBuf, data]));
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc, 0);

    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  // Simple CRC32 implementation
  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let k = 0; k < 8; k++) {
        c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
      }
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth: 8
  ihdr[9] = 6; // Color type: RGBA
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace

  const ihdrChunk = chunk('IHDR', ihdr);
  const idatChunk = chunk('IDAT', compressed);
  const iendChunk = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

for (const size of [16, 48, 128]) {
  const png = createPNG(size);
  writeFileSync(`extension/icons/icon${size}.png`, png);
  console.log(`Created icon${size}.png (${png.length} bytes)`);
}
