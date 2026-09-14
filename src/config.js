/* ================= 全站个性化配置：只改这个文件 ================= */

export const siteConfig = {
  // 站点名称（左上角 Logo 文字与页脚）
  siteName: "zlion.top",
  // Logo 图标（可选）：留空 = 使用内置的「Z」徽章 SVG；
  // 填图片路径或 URL 即可整体替换（载入页、左上角、浏览器标签页 favicon 同步生效），
  // 例如 "/images/logo.png"（图片放 public/images/ 目录）或 "https://xxx.com/logo.png"
  logo: "",
  // 浏览器标签页标题
  pageTitle: "Shiyan的主页",
  // 问候语（简介卡片大标题）
  greet: "Hello World!",
  // 一句话介绍（也是打字机轮换的第一句）
  desc: "欢迎来到我的个人主页，这里收录了我的博客与资源站。",
  // 打字机轮换标语：填多项则循环打字展示；只保留一项或删掉此项则固定显示 desc
  motto: [
    "记录、分享、创造。",
    "欢迎来到我的个人主页，这里收录了我的博客与资源站。",
    "把折腾当成生活方式。",
  ],
  // 建站日期（页脚显示「本站已运行 N 天」）
  siteStart: "2026-09-12",
  // 署名（页脚版权显示的名字）
  author: "Zlion",
  // 署名链接（可选）：页脚署名会超链接到此地址，如你的主页仓库，留空则显示纯文字
  repo: "https://github.com/Zlion-Y/zlion-home",
  // 鼠标特效：自定义圆点光标 + 移动/点击涟漪
  clickEffect: true,
  // 天气城市（可选）：留空 = 按访客 IP 自动定位（uapis 接口，可精确到县级）；
  // 填城市 adcode 可固定显示该城市，如 "410100" 郑州。
  // adcode 查询：https://lbs.amap.com/api/webservice/download
  weatherCity: "",
  // 背景（可选）：留空 = 默认动态极光渐变。两种用法：
  //  1. 静态图：把图片放到 public/images/background.jpg 即自动生效，无需配置
  //  2. 随机壁纸 API：填接口地址，每次打开页面随机换一张，加载失败自动回退极光渐变，如：
  //     "https://www.dmoe.cc/random.php"   （二次元随机）
  //     "https://t.alcy.cc/ycy"            （二次元随机）
  //     "https://api.paugram.com/wall/"    （二次元随机）
  //     "https://picsum.photos/1920/1080"  （风景随机，国外源国内较慢）
  bgApi: "https://bing.liushen.fun/api/random?redirect=true",

  /* ---------- 主页卡片开关 ---------- */
  // false = 隐藏对应卡片
  homeCards: {
    greet: true, // 欢迎卡（问候语/打字机文案见上方 greet/desc/motto）
    blog: true, // 博客更新卡
    hitokoto: true, // 一言卡
    clock: true, // 时间卡
    weather: true, // 天气卡（城市见 weatherCity）
    siteLinks: true, // 网站列表卡（内容见下方 siteLinks）
  },

  /* ---------- 「探索更多」面板（点击左上角 Logo 进入） ---------- */
  // 面板卡片排列：数组顺序 = 面板内排列顺序；删掉某项 = 隐藏该卡
  // 可选值：news 新闻 / hotlist 热榜 / music 音乐 / epic 限免 / history 历史上的今天 /
  //         monitor 站点监控 / github GitHub
  // 注：github 卡需同时配置 githubUser，music 卡需同时配置 musicPlaylist，
  //     monitor 卡需同时配置 siteMonitors，为空自动隐藏
  panelCards: ["news", "hotlist", "music", "epic", "history", "monitor"],
  // GitHub 用户名（GitHub 卡展示 Followers / Repos 数据；不把 github 加进 panelCards 就不显示）
  githubUser: "Zlion-Y",
  // 网易云音乐歌单 ID（音乐播放卡），从歌单页地址栏 playlist?id=xxx 获取
  musicPlaylist: "12881639195",
  // 播放直链来源：meting=公共 Meting 接口（默认，开箱即用）；
  // proxy=自建代理（https://github.com/Zlion-Y/zlion-music-api）解析直链——代理里可以
  //       上传多个洛雪音源脚本、自动更新并做并行体检，VIP/版权受限曲目也能出流；
  //       代理不可用时会自动退回 Meting 候选链，所以填错地址也不影响播放。
  // 部署好代理后：musicSource 改成 "proxy"，musicProxy 填代理地址（必须 https，不留结尾斜杠）
  musicSource: "proxy",
  // 自建音乐代理地址（musicSource 为 proxy 时生效），不要带结尾斜杠
  musicProxy: "https://home-music.zlion.top:446",
  // 请求代理时使用的音质：128k / 320k / flac / flac24bit
  musicQuality: "320k",
  // 站点监控卡（monitor）：检测各站点是否可访问（访客浏览器直连探测，
  // 显示连通状态与响应耗时，60 秒自动刷新）。url 需带 https://
  siteMonitors: [
    { name: "主页", url: "https://www.zlion.top/" },
    { name: "博客", url: "https://blog.zlion.top/" },
    { name: "资源站", url: "https://alist.zlion.top/" },
    { name: "音乐接口", url: "https://home-music.zlion.top:446//" },
  ],
  // 热榜平台与顺序（hotlist 卡），可用 key：
  //   weibo 微博 / bilibili B站 / v2ex V2EX / ithome IT之家 / hellogithub HelloGitHub
  //   zhihu 知乎 / juejin 掘金 / sspai 少数派
  hotPlatforms: ["weibo", "bilibili", "v2ex", "ithome", "hellogithub"],
};

/* 外域同源代理（Vercel rewrites；本地由 vite server/preview proxy 提供），
   解决浏览器跨域限制：音乐卡高清封面走网易云官方搜索接口 */

// 社交链接
// icon 可选：github / mail / bilibili / telegram / qq / rss
export const socialLinks = [
  {
    name: "GitHub",
    icon: "github",
    tip: "去 GitHub 看看",
    url: "https://github.com/Zlion-Y",
  },
  {
    name: "Email",
    icon: "mail",
    tip: "来封邮件吧",
    url: "mailto:shiyan@zlion.top",
  },
];

// 网站列表（展示在右侧「网站列表」卡片中）
// icon 可选：blog / cloud / music / video / code / star
export const siteLinks = [
  {
    name: "博客",
    desc: "blog.zlion.top",
    icon: "blog",
    url: "https://blog.zlion.top/",
  },
  {
    name: "资源站",
    desc: "alist.zlion.top",
    icon: "cloud",
    url: "https://alist.zlion.top/",
  },
  // 想加更多站点？照着上面的格式复制一份即可，例如：
  // { name: "导航站", desc: "nav.zlion.top", icon: "star", url: "https://nav.zlion.top/" },
];
