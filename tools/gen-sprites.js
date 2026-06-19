// tools/gen-sprites.js
// Sinh sprite sheet PNG cho các nhân vật.
// Định dạng mỗi sprite: 4 frame 32x32 nằm ngang -> file 128x32 (RGBA, transparent).
// Frame animation: idle bobbing (nhân vật lắc lư nhẹ theo pháp Y).
// Chạy: node tools/gen-sprites.js

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ====== PNG encoder thuan Node ======
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);   // bit depth
  ihdr.writeUInt8(6, 9);   // color type RGBA
  ihdr.writeUInt8(0, 10);  // compression
  ihdr.writeUInt8(0, 11);  // filter
  ihdr.writeUInt8(0, 12);  // interlace
  // raw with filter byte (0 = none) per scanline
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ====== Pixel helpers ======
function hex(c) {
  if (c.startsWith('#')) c = c.slice(1);
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}
function shade(rgb, factor) {
  return [Math.max(0, Math.min(255, Math.round(rgb[0] * factor))),
          Math.max(0, Math.min(255, Math.round(rgb[1] * factor))),
          Math.max(0, Math.min(255, Math.round(rgb[2] * factor)))];
}
function setPx(buf, w, x, y, rgb, a = 255) {
  if (x < 0 || y < 0 || x >= w || y >= (buf.length / (w * 4))) return;
  const i = (y * w + x) * 4;
  buf[i] = rgb[0]; buf[i + 1] = rgb[1]; buf[i + 2] = rgb[2]; buf[i + 3] = a;
}
function fillRect(buf, w, x0, y0, x1, y1, rgb, a = 255) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) setPx(buf, w, x, y, rgb, a);
}
function fillCircle(buf, w, cx, cy, r, rgb, a = 255) {
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) setPx(buf, w, x, y, rgb, a);
}
function strokeCircle(buf, w, cx, cy, r, rgb) {
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++) {
      const d = (x - cx) ** 2 + (y - cy) ** 2;
      if (d <= r * r && d > (r - 1) * (r - 1)) setPx(buf, w, x, y, rgb, 255);
    }
}

// Vẽ một nhân vật pixel-art 32x32, trả về RGBA buffer (32x32).
// bobY: độ lệch Y (0..1) để tạo animation.
function drawCharacter(rgb, bobY) {
  const W = 32, H = 32;
  const buf = Buffer.alloc(W * H * 4); // mặc định transparent
  const dark = shade(rgb, 0.55);
  const skin = [248, 220, 180];
  const outline = [20, 20, 30];

  // thân (body) - dịch xuống theo bobY
  const bodyY = 17 + Math.round(bobY);
  fillRect(buf, W, 10, bodyY, 21, 27, dark);
  // viền thân
  fillRect(buf, W, 9, bodyY, 9, 27, outline);
  fillRect(buf, W, 22, bodyY, 22, 27, outline);
  fillRect(buf, W, 9, bodyY, 22, bodyY, outline);
  fillRect(buf, W, 9, 27, 22, 27, outline);
  // áo: 1 vạch màu sáng ở giữa
  const light = shade(rgb, 1.15);
  fillRect(buf, W, 13, bodyY + 3, 18, bodyY + 3, light);

  // chân (legs)
  const legY = 28;
  fillRect(buf, W, 12, legY, 14, 31, outline);
  fillRect(buf, W, 17, legY, 19, 31, outline);

  // cổ (neck)
  const headCY = 11 + Math.round(bobY);
  fillRect(buf, W, 14, headCY + 3, 17, headCY + 5, skin);
  // đầu (head)
  fillCircle(buf, W, 16, headCY, 6, skin);
  strokeCircle(buf, W, 16, headCY, 6, outline);
  // tóc (màu nhân vật) phủ nửa trên đầu
  fillCircle(buf, W, 16, headCY - 2, 5, rgb);
  strokeCircle(buf, W, 16, headCY - 2, 5, outline);
  // mắt
  setPx(buf, W, 13, headCY + 1, outline);
  setPx(buf, W, 19, headCY + 1, outline);
  // miệng
  setPx(buf, W, 15, headCY + 3, outline);
  setPx(buf, W, 16, headCY + 3, outline);
  setPx(buf, W, 17, headCY + 3, outline);

  return buf;
}

// Ghép 4 frame thành sprite sheet 128x32 (4 * 32 = 128).
function buildSheet(rgb) {
  const W = 128, H = 32;
  const sheet = Buffer.alloc(W * H * 4);
  // 4 frame với bob khác nhau: 0, 1, 0, 1 (lắc lư nhẹ)
  const bobs = [0, 1, 0, 1];
  for (let f = 0; f < 4; f++) {
    const frame = drawCharacter(rgb, bobs[f]);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < 32; x++) {
        const si = (y * 32 + x) * 4;
        const di = (y * W + (f * 32 + x)) * 4;
        sheet[di] = frame[si];
        sheet[di + 1] = frame[si + 1];
        sheet[di + 2] = frame[si + 2];
        sheet[di + 3] = frame[si + 3];
      }
    }
  }
  return { width: W, height: H, rgba: sheet };
}

// ====== Main ======
const characters = require('../server/data/characters.js');
const outDir = path.join(__dirname, '..', 'client', 'img', 'characters');
fs.mkdirSync(outDir, { recursive: true });

// Bỏ qua nhân vật có sprite tùy biến (frames/fw/fh khác default 4/32/32).
let ok = 0, skip = 0;
for (const c of characters) {
  const isCustom = (c.frames !== 4) || (c.fw !== 32) || (c.fh !== 32);
  if (isCustom) { skip++; continue; }
  const rgb = hex(c.color);
  const { width, height, rgba } = buildSheet(rgb);
  const png = encodePNG(width, height, rgba);
  const file = path.join(outDir, c.id + '.png');
  fs.writeFileSync(file, png);
  ok++;
}
console.log('Đã sinh ' + ok + ' sprite, bỏ qua ' + skip + ' (có file thật).');
