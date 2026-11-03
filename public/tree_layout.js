// Hình học cây thông dùng chung cho server (xếp chỗ) và overlay (vẽ). Toạ độ theo khung 1080 x 1920.
// cx lệch trái 60px và tán hẹp hơn để không bị cột nút tim/quà bên phải của TikTok che (~150px mép phải)
export const TREE = { cx: 480, apexY: 360, baseY: 1440, baseHalf: 420 };
export const GIFT_PILE = { x: 480, y: 1500 };

// Bán kính quả châu theo tầng (5 = ngôi sao)
export const TIER_RADIUS = { 1: 26, 2: 30, 3: 36, 4: 44, 5: 62 };

// Các hàng treo của mỗi tầng: [toạ độ y, số quả châu]. Tầng cao ít chỗ hơn nên khan hiếm hơn.
const ROWS = {
  4: [[580, 2], [670, 4]],
  3: [[760, 4], [835, 5], [910, 6]],
  2: [[985, 7], [1050, 8], [1115, 9]],
  1: [[1175, 10], [1230, 11], [1285, 12], [1340, 12], [1395, 13]],
};
// Tầng trên cho phép quả châu chìa ra ngoài tán cây một chút để không bị chật
const SPREAD = { 4: 1.5, 3: 1.18, 2: 1.0, 1: 0.95 };

export function halfWidthAt(y) {
  return TREE.baseHalf * Math.max(0, (y - TREE.apexY) / (TREE.baseY - TREE.apexY));
}

function hash(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function buildSlots() {
  const slots = { 5: [{ x: TREE.cx, y: TREE.apexY - 10, r: TIER_RADIUS[5] }] };
  for (const t of [1, 2, 3, 4]) {
    const list = [];
    const r = TIER_RADIUS[t];
    ROWS[t].forEach(([y, n], ri) => {
      const w = halfWidthAt(y) * SPREAD[t];
      const step = (2 * w) / n;
      for (let i = 0; i < n; i++) {
        const k = t * 1000 + ri * 50 + i;
        list.push({
          x: Math.round(TREE.cx - w + step * (i + 0.5) + (hash(k) - 0.5) * step * 0.2),
          y: Math.round(y + (hash(k + 7) - 0.5) * 10),
          r,
        });
      }
    });
    slots[t] = list;
  }
  return slots;
}

export const SLOTS = buildSlots();
export const CAPS = Object.fromEntries(Object.entries(SLOTS).map(([t, s]) => [t, s.length]));
