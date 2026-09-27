/**
 * 节日倒数文案单测（纯函数，不走网络）。
 *
 * 用的是 2026 年 uapis 逐日数据的真实取值（is_rest_day / legal_holiday_name），
 * 覆盖当初出问题的那几个日子：中秋假期 9/25–9/27 里"距中秋节 1 天"不该再出现。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { festivalParts, holidayPeriods } from '../src/utils/festival.js'

// 真实取值抽样：rest=true 且带节日名才是放假；调休上班日（9/20、2/14、2/28、10/10）与周末（9/19）、
// 节气（9/23 秋分）都不带 legal_holiday_name 或 is_rest_day 为 false
const d = (date, rest, name) => ({ date, is_rest_day: rest, legal_holiday_name: name })
const DAYS = [
  d('2026-01-01', true, '元旦节'), d('2026-01-02', true, '元旦节'), d('2026-01-03', true, '元旦节'),
  d('2026-01-04', false, '元旦节'),
  d('2026-02-14', false, '春节'),
  d('2026-02-15', true, '春节'), d('2026-02-16', true, '春节'), d('2026-02-17', true, '春节'),
  d('2026-02-18', true, '春节'), d('2026-02-19', true, '春节'), d('2026-02-20', true, '春节'),
  d('2026-02-21', true, '春节'), d('2026-02-22', true, '春节'), d('2026-02-23', true, '春节'),
  d('2026-02-28', false, '春节'),
  d('2026-04-04', true, '清明节'), d('2026-04-05', true, '清明节'), d('2026-04-06', true, '清明节'),
  d('2026-05-01', true, '劳动节'), d('2026-05-02', true, '劳动节'), d('2026-05-03', true, '劳动节'),
  d('2026-05-04', true, '劳动节'), d('2026-05-05', true, '劳动节'),
  d('2026-06-19', true, '端午节'), d('2026-06-20', true, '端午节'), d('2026-06-21', true, '端午节'),
  d('2026-09-19', true, undefined), // 普通周六：is_rest_day 也是 true，但没有节日名
  d('2026-09-20', false, '国庆节'), // 调休上班日
  d('2026-09-23', false, undefined), // 秋分：节气不算放假
  d('2026-09-25', true, '中秋节'), d('2026-09-26', true, '中秋节'), d('2026-09-27', true, '中秋节'),
  d('2026-10-01', true, '国庆节'), d('2026-10-02', true, '国庆节'), d('2026-10-03', true, '国庆节'),
  d('2026-10-04', true, '国庆节'), d('2026-10-05', true, '国庆节'), d('2026-10-06', true, '国庆节'),
  d('2026-10-07', true, '国庆节'),
  d('2026-10-10', false, '国庆节'),
]

const LUNAR = { lunar_month_cn: '八月', lunar_day_cn: '十六', ganzhi_year: '丙午', zodiac: '马' }
// 本地时间构造：festivalParts 用本地日期取"今天"，与访客时区一致
const at = (y, m, day) => new Date(y, m - 1, day, 12, 0, 0)
const partsAt = (now, periods = holidayPeriods(DAYS)) =>
  festivalParts({ lunar: LUNAR, periods, now })

test('holidayPeriods：并成 7 段假期，排除调休上班日 / 周末 / 节气', () => {
  assert.deepEqual(holidayPeriods(DAYS), [
    { name: '元旦节', start: '2026-01-01', end: '2026-01-03' },
    { name: '春节', start: '2026-02-15', end: '2026-02-23' },
    { name: '清明节', start: '2026-04-04', end: '2026-04-06' },
    { name: '劳动节', start: '2026-05-01', end: '2026-05-05' },
    { name: '端午节', start: '2026-06-19', end: '2026-06-21' },
    { name: '中秋节', start: '2026-09-25', end: '2026-09-27' },
    { name: '国庆节', start: '2026-10-01', end: '2026-10-07' },
  ])
})

test('假期中：显示节日名，倒数顺延到下一个假期（bug 现场：9/26 不再出现"距中秋节 1 天"）', () => {
  assert.deepEqual(partsAt(at(2026, 9, 26)), ['农历八月十六', '丙午马年', '中秋节', '距国庆节 5 天'])
})

test('中秋正日 9/25：同样是"中秋节 + 距国庆节"', () => {
  assert.deepEqual(partsAt(at(2026, 9, 25)), ['农历八月十六', '丙午马年', '中秋节', '距国庆节 6 天'])
})

test('假前 9/24：倒数到假期首日 9/25，就是 1 天（旧实现算成 2 天）', () => {
  assert.deepEqual(partsAt(at(2026, 9, 24)), ['农历八月十六', '丙午马年', '距中秋节 1 天'])
})

test('假期结束后 9/28：只对国庆倒数', () => {
  assert.deepEqual(partsAt(at(2026, 9, 28)), ['农历八月十六', '丙午马年', '距国庆节 3 天'])
})

test('国庆假期中 10/3：显示国庆节，年内没有下一个假期就不硬凑倒数', () => {
  assert.deepEqual(partsAt(at(2026, 10, 3)), ['农历八月十六', '丙午马年', '国庆节'])
})

test('跨年：12/31 拿到次年元旦（组件会同时加载下一年的区间）', () => {
  const periods = [...holidayPeriods(DAYS), { name: '元旦节', start: '2027-01-01', end: '2027-01-03' }]
  assert.deepEqual(partsAt(at(2026, 12, 31), periods), ['农历八月十六', '丙午马年', '距元旦节 1 天'])
})

test('两年区间混在一起也能按日期排序取最近（组件 flatMap 后不保证有序）', () => {
  const periods = [
    { name: '元旦节', start: '2027-01-01', end: '2027-01-03' },
    { name: '国庆节', start: '2026-10-01', end: '2026-10-07' },
  ]
  assert.deepEqual(partsAt(at(2026, 9, 30), periods), ['农历八月十六', '丙午马年', '距国庆节 1 天'])
})

test('农历字段缺失 → 返回 null（调用方隐藏整行，不拼 undefined）', () => {
  assert.equal(festivalParts({ lunar: {}, periods: holidayPeriods(DAYS), now: at(2026, 9, 26) }), null)
  assert.equal(festivalParts({ lunar: null, periods: [], now: at(2026, 9, 26) }), null)
})

test('假期数据为空也不报错（接口挂了/返回空）', () => {
  assert.deepEqual(partsAt(at(2026, 9, 26), []), ['农历八月十六', '丙午马年'])
  assert.deepEqual(holidayPeriods([]), [])
  assert.deepEqual(holidayPeriods(undefined), [])
})
