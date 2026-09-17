// 卡片 3D 倾联动效（手感对齐 FluentPlayer 播放页封面 useCoverTilt）：
// 桌面：鼠标移入卡片后，按鼠标在卡内的相对位置做 3D 倾斜 + 1.02 放大 + 光泽跟随，移出归零回弹。
// 触屏/粗指针对应在 applyTilt 入口 early-return，不做倾联动效（避免与滚动手势冲突）。
// delay：绑定延迟（主页面需等进场动画结束，动态挂载的面板传 0 立即绑定）
import { siteConfig } from "@/config";

export function applyTilt(delay = 1500) {
  if (siteConfig.cardTilt === false) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  // 移动端（触屏/粗指针）不启用 3D 倾角，避免卡片失控翻转
  if (window.matchMedia("(hover: none), (pointer: coarse)").matches) return;

  const bind = (el) => {
    if (el._tiltBound) return;
    el._tiltBound = true;
    const fastTransition = () => {
      el.style.transition =
        "transform 240ms cubic-bezier(0.22, 1, 0.36, 1), background 0.3s ease, border-color 0.3s ease";
    };
    const setTilt = (clientX, clientY) => {
      const r = el.getBoundingClientRect();
      const x = clientX - r.left; // 转为卡内相对坐标（client 坐标直接参与计算会放大旋转角）
      const y = clientY - r.top;
      const cx = r.width / 2;
      const cy = r.height / 2;
      const maxRotate = 12;
      const rx = -((y - cy) / cy) * maxRotate;
      const ry = ((x - cx) / cx) * maxRotate;
      el.style.transform = `perspective(1000px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale3d(1.02, 1.02, 1.02)`;
      el.style.setProperty("--mx", `${((x / r.width) * 100).toFixed(1)}%`);
      el.style.setProperty("--my", `${((y / r.height) * 100).toFixed(1)}%`);
    };
    const reset = () => {
      fastTransition();
      el.style.transform = "";
    };

    // ── 桌面鼠标路径（触屏设备在 applyTilt 入口已 early-return，无需触屏分支）──
    el.addEventListener("mouseenter", fastTransition);
    el.addEventListener("mousemove", (e) => setTilt(e.clientX, e.clientY));
    el.addEventListener("mouseleave", reset);
  };

  // 等进场动画播完再绑定（动态挂载的面板传 0 立即绑定），避免打断上滑进场
  setTimeout(() => {
    document.querySelectorAll(".glass").forEach(bind);
  }, delay);
}
