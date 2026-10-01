import { ref, watch, onUnmounted } from "vue";
import { siteConfig } from "../config.js";
import { firework, tip } from "../utils/fx.js";
import { pushEsc } from "../utils/escStack.js";

/**
 * 二级「探索更多」面板的状态机（自 App.vue 抽出）。
 *
 * 进/离场模型（与旧版逐 ms 一致，勿改时序）：
 *  - 面板本体不做过渡（一动背景就跟着动），动画全在面板内部（卡片错峰浮起/沉下），
 *    靠 App 传下的 anim-in / anim-out 类触发，这里用定时器控类名的存活窗口。
 *    进场 1400ms：卡片错峰浮起（末卡 5*100ms 延迟 + 0.85s 动画）；
 *    离场 380ms：淡出 + 卡片沉下，随后 display:none。
 *  - 首次打开才挂载、之后只切显示由 App 处理；这里只管状态与动画类。
 *
 * Esc：打开时经统一 Esc 栈（utils/escStack）注册关闭处理器，关闭时移除。
 * 全屏播放器打开时它在栈顶先被弹出——旧版「先关全屏，再按一次才关面板」
 * 的优先级天然成立，不再需要跨组件的监听顺序与类名守卫补丁。
 */
export function usePanel() {
  const showMore = ref(false);
  // 返回一级时给主页内容补一次浮起动画（App 样式里的 .panel-return）
  const returning = ref(false);
  // 面板进/离场的动画类
  const panelAnim = ref("");

  let panelAnimTimer = null;
  let closeTimer = null;
  let returnTimer = null;
  let removeEsc = null;

  function setPanelAnim(name, ms) {
    clearTimeout(panelAnimTimer);
    panelAnim.value = name;
    panelAnimTimer = setTimeout(() => (panelAnim.value = ""), ms);
  }

  function closePanel() {
    clearTimeout(closeTimer);
    setPanelAnim("out", 380);
    // 延迟 380ms 再 display:none，让 anim-out 离场动画播完
    closeTimer = setTimeout(() => { showMore.value = false; }, 380);
  }

  function openPanel() {
    clearTimeout(closeTimer);
    setPanelAnim("in", 1400);
    showMore.value = true;
  }

  // 点击进入面板：在鼠标位置放一朵小烟花 + 冒一句提示（文案见 config.panelTips）
  const panelTips = Array.isArray(siteConfig.panelTips) ? siteConfig.panelTips.filter(Boolean) : [];
  let panelTipIdx = 0;

  function enterPanel(ev) {
    // 键盘触发时没有坐标，就用入口元素中心
    let x = ev && typeof ev.clientX === "number" ? ev.clientX : null;
    let y = ev && typeof ev.clientY === "number" ? ev.clientY : null;
    if (x === null) {
      const el = ev && ev.currentTarget;
      const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      if (r) {
        x = r.left + r.width / 2;
        y = r.top + r.height / 2;
      }
    }
    firework(x, y);
    if (panelTips.length) {
      tip(x, y, panelTips[panelTipIdx++ % panelTips.length]);
    }
    openPanel();
  }

  // 面板打开时锁定背景滚动、注册 Esc；关闭时给主页补一次"浮起"接住二级卡片的依次沉下
  watch(showMore, (v) => {
    document.body.style.overflow = v ? "hidden" : "";
    if (v) {
      removeEsc = pushEsc(closePanel);
    } else {
      if (removeEsc) removeEsc();
      returning.value = true;
      clearTimeout(returnTimer);
      returnTimer = setTimeout(() => (returning.value = false), 520);
    }
  });

  onUnmounted(() => {
    clearTimeout(returnTimer);
    clearTimeout(closeTimer);
    clearTimeout(panelAnimTimer);
    if (removeEsc) removeEsc();
  });

  return { showMore, returning, panelAnim, enterPanel, openPanel, closePanel };
}
