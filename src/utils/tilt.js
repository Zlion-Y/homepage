// 卡片 3D 倾联动效（手感对齐 FluentPlayer 播放页封面 useCoverTilt）：
// 鼠标移入卡片后，按鼠标在卡内的相对位置做 3D 倾斜 + 1.02 放大 + 光泽跟随；
// 移出后归零回弹。未悬停时卡片完全静止。
// delay：绑定延迟（主页面需等进场动画结束，动态挂载的面板传 0 立即绑定）
export function applyTilt(delay = 1500) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!window.matchMedia("(hover: hover)").matches) return;

  // 等最长进场过渡（0.8s + delay 0.55s）播完再绑定，避免打断上滑进场
  setTimeout(() => {
    document.querySelectorAll(".glass").forEach((el) => {
      if (el._tiltBound) return;
      el._tiltBound = true;

      el.addEventListener("mouseenter", () => {
        // 跟手短过渡（FluentPlayer 同款曲线）
        el.style.transition =
          "transform 240ms cubic-bezier(0.22, 1, 0.36, 1), background 0.3s ease, border-color 0.3s ease";
      });

      el.addEventListener("mousemove", (e) => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        const cx = r.width / 2;
        const cy = r.height / 2;
        const maxRotate = 12;
        const rx = -((y - cy) / cy) * maxRotate;
        const ry = ((x - cx) / cx) * maxRotate;
        el.style.transform = `perspective(1000px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale3d(1.02, 1.02, 1.02)`;
        el.style.setProperty("--mx", `${((x / r.width) * 100).toFixed(1)}%`);
        el.style.setProperty("--my", `${((y / r.height) * 100).toFixed(1)}%`);
      });

      el.addEventListener("mouseleave", () => {
        el.style.transition =
          "transform 240ms cubic-bezier(0.22, 1, 0.36, 1), background 0.3s ease, border-color 0.3s ease";
        el.style.transform = "";
      });
    });
  }, 1500);
}
