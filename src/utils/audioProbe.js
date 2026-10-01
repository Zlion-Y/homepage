/**
 * 并发探活：用隐藏 Audio 探针（preload=metadata 只拉头部、媒体加载不受 CORS 限制）
 * 同时试全部候选源，谁先给出元数据谁可用——挂起源无需逐个等看门狗。
 * 探活只排序不淘汰，全部失败仍走原降级链 + 看门狗兜底。
 */
export function probeAudio(url, ms) {
  return new Promise((resolve) => {
    const a = new Audio();
    a.preload = "metadata";
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      a.removeAttribute("src");
      a.load();
      resolve(ok);
    };
    const t = setTimeout(() => done(false), ms);
    a.addEventListener("loadedmetadata", () => done(true));
    a.addEventListener("error", () => done(false));
    a.src = url;
  });
}
