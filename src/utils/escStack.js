/**
 * Esc 键统一栈（一次解决 MusicCard 与 MorePanel 的双监听补丁）：
 *
 * 旧实现里全屏播放器和二级面板各自挂 window keydown，靠三道补丁协调——
 *   1. MusicCard 的 stopImmediatePropagation（依赖两个监听器的注册顺序）；
 *   2. MorePanel 查 body.fs-open 类名做双保险；
   3. MorePanel 再查自身 display:none 防空跑。
 * 现在：谁最后打开谁在最顶，Esc 只弹最顶层。监听器全局只挂一个，
 * 覆盖层只做 push/remove，不再有跨组件的时序耦合。
 */

const stack = [];
let bound = false;

function ensureBound() {
  if (bound) return;
  bound = true;
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !stack.length) return;
    stack[stack.length - 1]();
  });
}

/** 压入一个 Esc 处理器（成为当前最顶层），返回移除函数（可重复调用，幂等） */
export function pushEsc(fn) {
  ensureBound();
  stack.push(fn);
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    const i = stack.lastIndexOf(fn);
    if (i >= 0) stack.splice(i, 1);
  };
}
