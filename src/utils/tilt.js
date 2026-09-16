// 卡片 3D 倾联动效（手感对齐 FluentPlayer 播放页封面 useCoverTilt）：
// 桌面：鼠标移入卡片后，按鼠标在卡内的相对位置做 3D 倾斜 + 1.02 放大 + 光泽跟随，移出归零回弹；
// 触屏：手指按住卡片移动即倾斜，页面滚动或从内部滚动容器（歌单/歌词等）开始触摸则放弃，
//       抬手归零。合成鼠标事件（触摸后浏览器补发的 mousemove）由 touchUntil 时间窗屏蔽。
// delay：绑定延迟（主页面需等进场动画结束，动态挂载的面板传 0 立即绑定）
import { siteConfig } from "@/config";

export function applyTilt(delay = 1500) {
  if (siteConfig.cardTilt === false) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const bind = (el) => {
    if (el._tiltBound) return;
    el._tiltBound = true;
    let touchUntil = 0; // 触摸抑制窗：屏蔽触摸后浏览器补发的合成鼠标事件，避免倾斜卡死
    let startScrollY = 0;
    let touchAbort = false;

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
    // 触摸起点若在卡片内的滚动容器（歌单/歌词/新闻列表等）里，则不做倾斜，
    // 把手势完整让给内部滚动
    const inScrollable = (node) => {
      while (node && node !== el) {
        if (node.nodeType === 1) {
          const cs = getComputedStyle(node);
          if (/(auto|scroll)/.test(cs.overflowY) && node.scrollHeight > node.clientHeight) {
            return true;
          }
        }
        node = node.parentNode;
      }
      return false;
    };

    // ── 桌面鼠标路径 ──
    el.addEventListener("mouseenter", () => {
      if (performance.now() < touchUntil) return;
      fastTransition();
    });
    el.addEventListener("mousemove", (e) => {
      if (performance.now() < touchUntil) return;
      setTilt(e.clientX, e.clientY);
    });
    el.addEventListener("mouseleave", () => {
      if (performance.now() < touchUntil) return;
      reset();
    });

    // ── 触屏路径 ──
    el.addEventListener(
      "touchstart",
      (e) => {
        startScrollY = window.scrollY;
        touchAbort = inScrollable(e.target);
        fastTransition();
      },
      { passive: true }
    );
    el.addEventListener(
      "touchmove",
      (e) => {
        if (touchAbort) return;
        // 页面已经开始滚动：手势让给滚动，立刻归零
        if (Math.abs(window.scrollY - startScrollY) > 8) {
          touchAbort = true;
          reset();
          return;
        }
        const t = e.touches[0];
        setTilt(t.clientX, t.clientY);
      },
      { passive: true }
    );
    const onTouchEnd = () => {
      touchAbort = false;
      touchUntil = performance.now() + 600;
      reset();
    };
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
  };

  // 等进场动画播完再绑定（动态挂载的面板传 0 立即绑定），避免打断上滑进场
  setTimeout(() => {
    document.querySelectorAll(".glass").forEach(bind);
  }, delay);
}
