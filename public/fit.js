// Co giãn khung game 1080x1920 cho vừa cửa sổ nguồn (TikTok LIVE Studio / OBS) với bất kỳ kích thước nào.
// Giữ đúng tỉ lệ 9:16, căn giữa, phần thừa trong suốt.
(function () {
  const W = 1080, H = 1920;
  function fit() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const s = Math.min(vw / W, vh / H);
    const b = document.body;
    if (!b) return;
    b.style.transform = `translate(${(vw - W * s) / 2}px, ${(vh - H * s) / 2}px) scale(${s})`;
  }
  window.addEventListener('resize', fit);
  document.addEventListener('DOMContentLoaded', fit);
  fit();
})();
