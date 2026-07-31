/**
 * === generate_icons.js ===
 * Standalone Node.js script to create valid PNG icons for Chrome Extension (icon16, icon48, icon128).
 * Uses pure binary PNG encoding without external dependencies (no canvas needed).
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/**
 * Generates an uncompressed raw PNG file buffer with Jira Blue background and white diamond logo.
 * @param {number} size Pixel dimension (e.g. 16, 48, 128).
 * @returns {Buffer} Valid PNG file buffer.
 */
function createPngIconBuffer(size) {
  // Color palette (RGBA)
  // Background Jira Blue: #0052CC (0, 82, 204, 255)
  // White Diamond: #FFFFFF (255, 255, 255, 255)
  // Red Alert Badge: #FF5630 (255, 86, 48, 255)

  const rows = [];
  const half = size / 2;
  const radius = size * 0.42;

  for (let y = 0; y < size; y++) {
    const row = [0]; // Filter byte (0 = None)
    for (let x = 0; x < size; x++) {
      const dx = x - half;
      const dy = y - half;
      const distSq = dx * dx + dy * dy;

      // Check if inside red badge (top right corner)
      const badgeX = size * 0.75;
      const badgeY = size * 0.25;
      const badgeRadius = size * 0.18;
      const distBadge = Math.hypot(x - badgeX, y - badgeY);

      if (distBadge <= badgeRadius) {
        // Red badge color
        row.push(255, 86, 48, 255);
      } else {
        // Check diamond shape: |dx| + |dy| <= radius
        const manhattan = Math.abs(dx) + Math.abs(dy);
        if (manhattan <= radius * 0.6) {
          // White symbol center
          row.push(255, 255, 255, 255);
        } else if (manhattan <= radius * 0.85) {
          // Boosta light red inner highlight
          row.push(255, 77, 94, 255);
        } else if (Math.hypot(dx, dy) <= radius) {
          // Background Boosta Crimson Red (#EA1C2C)
          row.push(234, 28, 44, 255);
        } else {
          // Transparent rounded corner padding
          row.push(0, 0, 0, 0);
        }
      }
    }
    rows.push(Buffer.from(row));
  }

  const rawData = Buffer.concat(rows);
  const compressedData = zlib.deflateSync(rawData);

  // Helper CRC32 calculation
  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let j = 0; j < 8; j++) {
        c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
      }
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const typeAndData = Buffer.concat([typeBuf, data]);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(typeAndData), 0);
    return Buffer.concat([len, typeAndData, crcBuf]);
  }

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR Chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8;  // Bit depth 8
  ihdrData[9] = 6;  // Color type RGBA
  ihdrData[10] = 0; // Compression
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // Interlace
  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // IDAT Chunk
  const idatChunk = makeChunk('IDAT', compressedData);

  // IEND Chunk
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

[16, 48, 128].forEach(size => {
  const filePath = path.join(iconsDir, `icon${size}.png`);
  const buf = createPngIconBuffer(size);
  fs.writeFileSync(filePath, buf);
  console.log(`Generated ${filePath} (${buf.length} bytes)`);
});

console.log('Icon generation complete!');
