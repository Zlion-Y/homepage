import { siteConfig } from "@/config";
import NewsCard from "@/components/NewsCard.vue";
import HotListCard from "@/components/HotListCard.vue";
import MusicCard from "@/components/MusicCard.vue";
import EpicCard from "@/components/EpicCard.vue";
import HistoryCard from "@/components/HistoryCard.vue";
import GithubCard from "@/components/GithubCard.vue";
import SiteMonitorCard from "@/components/SiteMonitorCard.vue";

// 「探索更多」面板卡片注册表（自 MorePanel 抽出，配置驱动）：
//   cardMap —— key → 组件（key 对应 config.panelCards 里的字符串）
//   needs   —— 依赖配置的卡：对应配置为空时自动隐藏
export const PANEL_CARD_MAP = {
  news: NewsCard,
  hotlist: HotListCard,
  music: MusicCard,
  epic: EpicCard,
  history: HistoryCard,
  monitor: SiteMonitorCard,
  github: GithubCard,
};

export const PANEL_CARD_NEEDS = {
  github: () => !!siteConfig.githubUser,
  music: () => !!siteConfig.musicPlaylist,
  monitor: () => !!(siteConfig.siteMonitors || []).length,
};
