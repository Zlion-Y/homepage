/**
 * 农历 + 节日倒数文案（纯函数，便于单测）
 *
 * ⚠️ 别用日粒度接口的 `nearby.next` 当倒数目标。uapis 的日粒度把法定假期的**每一天**都算成一个
 * 节日事件：中秋 2026 的 9/25–9/27 三天都叫"中秋节"，于是假期里每天都算出"距中秋节 1 天"
 * ——中秋都过了还挂着"距中秋节 1 天"就是这么来的；更糟的是它的事件表会漏掉正日
 * （2026 的 9/25 压根不在 nearby 里），连放假前的倒数都会多算一天。
 *
 * 所以改成拿**年/月粒度的逐日数据**自己算"假期区间"（见 holidayPeriods）：先排除周末、节气与
 * 调休上班日，再把连续同名的天并成一段。2026 实测得到 7 段，与国务院放假安排一致。
 */

/** 逐日数据 → 假期区间 [{ name, start, end }]；days 需按日期升序（接口就是升序） */
export function holidayPeriods(days) {
  const out = []
  for (const d of days || []) {
    // is_rest_day 对普通周末也是 true，所以必须有节日名才算数；
    // 调休上班日（type=workday_adjust）与节气（无名字）因此都被排除
    if (d.is_rest_day !== true || !d.legal_holiday_name) continue
    const last = out[out.length - 1]
    const contiguous = last && Date.parse(d.date) - Date.parse(last.end) === 86400000
    if (last && last.name === d.legal_holiday_name && contiguous) last.end = d.date
    else out.push({ name: d.legal_holiday_name, start: d.date, end: d.date })
  }
  return out
}

/** 'YYYY-MM-DD' → UTC 天序（接口日期是 UTC+8 语义，用 UTC 比较，避免访客本地时区差一天） */
function dayNumber(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/**
 * 那行文案的组成部分，如 ["农历八月十六", "丙午马年", "中秋节", "距国庆节 5 天"]：
 *   - 今天在某个假期里 → 显示该节日名，并把倒数顺延到下**一个**假期（不再重复倒数今天这个）；
 *   - 不在假期里 → 直接倒数到下一个假期**首日**。
 * lunar 缺字段（接口 200 但没数据）时返回 null，调用方隐藏整行。
 */
export function festivalParts({ lunar, periods, now = new Date() }) {
  const monthDay = `${(lunar && lunar.lunar_month_cn) || ''}${(lunar && lunar.lunar_day_cn) || ''}`.trim()
  const ganzhi = `${(lunar && lunar.ganzhi_year) || ''}${(lunar && lunar.zodiac) || ''}`
  const parts = []
  if (monthDay) parts.push(`农历${monthDay}`)
  if (ganzhi) parts.push(`${ganzhi}年`)
  if (!parts.length) return null

  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const list = (periods || [])
    .map((p) => ({ name: p.name, s: dayNumber(p.start), e: dayNumber(p.end) }))
    .sort((a, b) => a.s - b.s)

  const inHoliday = list.find((p) => today >= p.s && today <= p.e)
  if (inHoliday) parts.push(inHoliday.name)
  const next = list.find((p) => p.s > today)
  if (next) parts.push(`距${next.name} ${Math.round((next.s - today) / 86400000)} 天`)
  return parts
}
