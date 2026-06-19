// Danh sách nhân vật. Mỗi entry: [id, name, emoji]
// id là chuỗi tùy ý (ví dụ 'char_51'). Nếu không truyền id, tự sinh 'char_<index>'.
const RAW = [
  ['char_51', 'Nv1', '✨'],   // sprite 7 frame 64x64 từ client/img/avatar/nv_1.png
  ['char_52', 'Nv2', '⚡'],   // sprite 7 frame 64x64 từ client/img/avatar/nv_2.png
  ['char_53', 'Nv3', '🌸']    // sprite 7 frame 64x64 từ client/img/avatar/nv_3.png
];

const PALETTE = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#a78bfa', '#fb923c',
                 '#34d399', '#60a5fa', '#f472b6', '#facc15', '#22d3ee'];

// Sprite tùy biến cho một số nhân vật.
// baseFacing: hướng mặt của sprite trong ảnh gốc (1=phải, -1=trái).
// Sprite avatar nguồn vẽ mặt quay sang trái nên đặt baseFacing = -1
// để khi di chuyển sang phải sẽ lật hình (đúng hướng đi).
const CUSTOM_SPRITES = {
  char_51: { image: 'img/characters/char_51.png', frames: 7, fw: 64, fh: 64, baseFacing: -1 },
  char_52: { image: 'img/characters/char_52.png', frames: 7, fw: 64, fh: 64, baseFacing: -1 },
  char_53: { image: 'img/characters/char_53.png', frames: 7, fw: 64, fh: 64, baseFacing: -1 }
};

const CHARACTERS = RAW.map((c, i) => {
  const id = c[0] || ('char_' + (i + 1));
  const custom = CUSTOM_SPRITES[id];
  return {
    id,
    name: c[1],
    emoji: c[2],
    color: PALETTE[i % PALETTE.length],
    image: (custom && custom.image) || 'img/characters/char_' + (i + 1) + '.png',
    frames: (custom && custom.frames) || 4,
    fw: (custom && custom.fw) || 32,
    fh: (custom && custom.fh) || 32,
    baseFacing: (custom && custom.baseFacing) || 1
  };
});

module.exports = CHARACTERS;
