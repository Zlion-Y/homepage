import { siteConfig } from "./config";

/* 站名可选手写体注册表：config.js 里 siteFont 的取值对应这里的 key。
   文件都在 public/font/，均为 Google Fonts 的 SIL OFL 开源字体，
   已按 ASCII + Latin-1 子集化（44~168KB），连笔所需的 OpenType 特性完整保留。
   新增字体：把子集化后的 TTF 放进 public/font/，在这里和 style.css 各加一条即可。 */
export const SITE_FONTS = {
  pacifico: { file: "Pacifico-Regular.ttf", css: '"Pacifico", system-ui, sans-serif' },
  dancing: { file: "DancingScript.ttf", css: '"Dancing Script", system-ui, sans-serif' },
  greatvibes: { file: "GreatVibes.ttf", css: '"Great Vibes", system-ui, sans-serif' },
  lobster: { file: "Lobster.ttf", css: '"Lobster", system-ui, sans-serif' },
  kaushan: { file: "KaushanScript.ttf", css: '"Kaushan Script", system-ui, sans-serif' },
  sacramento: { file: "Sacramento.ttf", css: '"Sacramento", system-ui, sans-serif' },
  caveat: { file: "Caveat.ttf", css: '"Caveat", system-ui, sans-serif' },
};

/* 取配置对应的字体描述，未配置/写错 key 时回退到 Pacifico（现役默认）。
   支持 ?font=<key> URL 参数临时覆盖——换字体预览不用改配置重新构建。 */
export function currentSiteFont() {
  const q = new URLSearchParams(location.search).get("font");
  return SITE_FONTS[q] || SITE_FONTS[siteConfig.siteFont] || SITE_FONTS.pacifico;
}
