<template>
  <div class="glass greet">
    <span class="q open">“</span>
    <p class="hello">{{ hello }}</p>
    <h2>{{ siteConfig.greet }}</h2>
    <p class="desc" ref="descEl">
      {{ display }}<span v-if="typing" class="caret"></span>
    </p>
    <span class="q close">”</span>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { siteConfig } from "@/config";

// 按时段问候
const hello = computed(() => {
  const h = new Date().getHours();
  if (h < 5) return "夜深了，注意休息";
  if (h < 9) return "早上好，新的一天加油";
  if (h < 12) return "上午好，保持专注";
  if (h < 14) return "中午好，劳逸结合";
  if (h < 18) return "下午好，来杯茶吧";
  if (h < 23) return "晚上好，今天过得如何";
  return "夜深了，注意休息";
});

// 打字机轮换标语（config 里 motto 多于一项时启用）
const lines =
  siteConfig.motto && siteConfig.motto.length > 1
    ? siteConfig.motto
    : [siteConfig.desc];
const typing = lines.length > 1;

const display = ref(lines[0]);
let lineIdx = 0;
let charIdx = lines[0].length;
let deleting = false;
let timer = null;

const descEl = ref(null);

// 视口阻尼跟随文字头部：打字时平滑跟进、停顿期停在句尾（光标闪烁）、回退时平滑收回
let rafId = null;

function scrollFollow() {
  const el = descEl.value;
  if (el) {
    const target = Math.max(0, el.scrollWidth - el.clientWidth);
    const diff = target - el.scrollLeft;
    if (Math.abs(diff) > 0.5) el.scrollLeft += diff * 0.12;
    else el.scrollLeft = target;
  }
  rafId = requestAnimationFrame(scrollFollow);
}

function tick() {
  const line = lines[lineIdx];
  if (!deleting) {
    charIdx++;
    display.value = line.slice(0, charIdx);
    if (charIdx >= line.length) {
      deleting = true;
      timer = setTimeout(tick, 3000);
      return;
    }
    timer = setTimeout(tick, 90);
  } else {
    charIdx--;
    display.value = line.slice(0, charIdx);
    if (charIdx <= 0) {
      deleting = false;
      lineIdx = (lineIdx + 1) % lines.length;
      timer = setTimeout(tick, 500);
      return;
    }
    timer = setTimeout(tick, 35);
  }
}

onMounted(() => {
  if (typing) {
    rafId = requestAnimationFrame(scrollFollow);
    timer = setTimeout(tick, 3000);
  }
});

onUnmounted(() => {
  clearTimeout(timer);
  if (rafId) cancelAnimationFrame(rafId);
});
</script>

<style scoped>
.greet {
  position: relative;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.hello {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--accent1);
  margin-bottom: 6px;
}

.greet h2 {
  font-size: 1.45rem;
  font-weight: 700;
  font-style: italic;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.desc {
  color: var(--text-dim);
  line-height: 1.8;
  font-size: 0.95rem;
  /* 打字机只允许一行：固定单行高度防跳动，超宽时视口巡游展示 */
  min-height: 1.8em;
  white-space: nowrap;
  overflow: hidden;
}

.q {
  /* inline-block 让 transform 生效 */
  display: inline-block;
  position: absolute;
  font-size: 3.4rem;
  line-height: 1;
  font-family: Georgia, "Times New Roman", serif;
  color: rgba(165, 180, 252, 0.35);
  user-select: none;
}

.q.open {
  top: 10px;
  left: 16px;
}

/* ” 字形悬挂在字盒顶部，直接锚底会悬空——下推使其贴住底角，与开场引号对称 */
.q.close {
  bottom: 2px;
  right: 18px;
  transform: translateY(0.5em);
}

/* 打字机光标 */
.caret {
  display: inline-block;
  width: 2px;
  height: 1em;
  margin-left: 2px;
  vertical-align: -0.12em;
  background: var(--text-dim);
  animation: caret-blink 1s steps(2, start) infinite;
}

@keyframes caret-blink {
  50% {
    opacity: 0;
  }
}

/* 手机端卡片窄、文字顶边，缩小引号并加大上下 padding，让文字与引号分区不重叠 */
@media (max-width: 980px) {
  .greet {
    padding: 44px 24px 42px;
  }

  .q {
    font-size: 2.4rem;
  }

  .q.open {
    top: 0;
    left: 14px;
  }

  .q.close {
    bottom: 0;
    right: 14px;
  }
}</style>
