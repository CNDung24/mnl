// Danh sách nhân vật. Mỗi entry: [id, name, emoji]
// id là chuỗi tùy ý (ví dụ 'char_51'). Nếu không truyền id, tự sinh 'char_<index>'.
// Mỗi đội gắn đúng 1 nhân vật mặc định (xem TEAMS trong config.js).
const RAW = [
  ['char_51', 'Nv1', '✨'],   // sprite 7 frame 64x64 từ client/img/avatar/nv_1.png
  ['char_52', 'Nv2', '⚡'],   // sprite 7 frame 64x64 từ client/img/avatar/nv_2.png
  ['char_53', 'Nv3', '🌸'],   // sprite 7 frame 64x64 từ client/img/avatar/nv_3.png
  ['char_54', 'Nv4', '🌟'],   // sprite 7 frame 64x64 từ client/img/avatar/nv_4.png
  ['char_55', 'Nv5', '🔥']    // sprite 7 frame 64x64 từ client/img/avatar/nv_5.png
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
  char_53: { image: 'img/characters/char_53.png', frames: 7, fw: 64, fh: 64, baseFacing: -1 },
  char_54: { image: 'img/characters/char_54.png', frames: 9, fw: 64, fh: 64, baseFacing: -1 },
  char_55: { image: 'img/characters/char_55.png', frames: 9, fw: 64, fh: 64, baseFacing: -1 }
};

// Sprite hoạt ảnh "tấn công" (dùng khi đội thắng vòng tung chiêu vào đội bị chọn).
// Cùng khung 64x64, baseFacing giống sprite đi bộ ở trên.
// lastFrame: frame cuối cùng THỰC SỰ có hình để đứng lại sau khi animation chạy xong
// (mặc định = frames - 1).
const ATTACK_SPRITES = {
  char_51: { image: 'img/characters/char_51_attack.png', frames: 7, fw: 64, fh: 64 },
  char_52: { image: 'img/characters/char_52_attack.png', frames: 7, fw: 64, fh: 64 },
  char_53: { image: 'img/characters/char_53_attack.png', frames: 7, fw: 64, fh: 64 },
  char_54: { image: 'img/characters/char_54_attack.png', frames: 7, fw: 64, fh: 64 },
  char_55: { image: 'img/characters/char_55_attack.png', frames: 7, fw: 64, fh: 64 }
};

const CHARACTERS = RAW.map((c, i) => {
  const id = c[0] || ('char_' + (i + 1));
  const custom = CUSTOM_SPRITES[id];
  const attack = ATTACK_SPRITES[id];
  return {
    id,
    name: c[1],
    emoji: c[2],
    color: PALETTE[i % PALETTE.length],
    image: (custom && custom.image) || 'img/characters/char_' + (i + 1) + '.png',
    frames: (custom && custom.frames) || 4,
    fw: (custom && custom.fw) || 32,
    fh: (custom && custom.fh) || 32,
    baseFacing: (custom && custom.baseFacing) || 1,
    attackImage: attack ? attack.image : null,
    attackFrames: attack ? attack.frames : 0,
    attackFw: attack ? attack.fw : 0,
    attackFh: attack ? attack.fh : 0,
    attackLastFrame: attack ? (attack.lastFrame ?? attack.frames - 1) : 0
  };
});

module.exports = CHARACTERS;
