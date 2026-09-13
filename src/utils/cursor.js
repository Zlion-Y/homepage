// 自定义光标 + 鼠标涟漪系统（触屏/减少动态偏好下自动禁用）：
// - 隐藏系统光标，替换为中心圆点（即时跟随）+ 外圈（缓动跟随）
// - 移动鼠标时每隔一段距离泛起小涟漪，点击时泛起大涟漪
// - 悬停可点击元素时圆点放大提示
export function initCursor() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!window.matchMedia("(hover: hover)").matches) return;

  const dot = document.createElement("div");
  dot.className = "cursor-dot";
  const ring = document.createElement("div");
  ring.className = "cursor-ring";
  document.body.append(dot, ring);
  document.body.classList.add("custom-cursor");

  let mx = innerWidth / 2;
  let my = innerHeight / 2;
  let rx = mx;
  let ry = my;
  let lastX = mx;
  let lastY = my;
  // 鼠标首次移动前不显示光标（否则圆圈默认悬在屏幕中心）
  let shown = false;

  const show = () => {
    if (!shown) {
      shown = true;
      dot.classList.add("visible");
      ring.classList.add("visible");
    }
  };
  const hide = () => {
    shown = false;
    dot.classList.remove("visible");
    ring.classList.remove("visible");
  };

  function spawnRipple(x, y, big = false) {
    const s = document.createElement("span");
    s.className = big ? "mouse-ripple big" : "mouse-ripple";
    s.style.left = `${x}px`;
    s.style.top = `${y}px`;
    document.body.appendChild(s);
    s.addEventListener("animationend", () => s.remove());
  }

  window.addEventListener("mousemove", (e) => {
    show();
    mx = e.clientX;
    my = e.clientY;
    dot.style.transform = `translate(${mx}px, ${my}px)`;

    // 移动超过一定距离泛起一圈小涟漪
    if (Math.hypot(mx - lastX, my - lastY) > 42) {
      spawnRipple(mx, my);
      lastX = mx;
      lastY = my;
    }
  });

  // 鼠标移出窗口时隐藏光标
  document.documentElement.addEventListener("mouseleave", hide);

  window.addEventListener("mousedown", (e) => {
    spawnRipple(e.clientX, e.clientY, true);
  });

  // 悬停可点击元素时外圈放大
  window.addEventListener("mouseover", (e) => {
    const hit = e.target.closest("a, button, [role='button']");
    ring.classList.toggle("hovered", !!hit);
    dot.classList.toggle("hovered", !!hit);
  });

  (function loop() {
    rx += (mx - rx) * 0.18;
    ry += (my - ry) * 0.18;
    ring.style.transform = `translate(${rx}px, ${ry}px)`;
    requestAnimationFrame(loop);
  })();
}
