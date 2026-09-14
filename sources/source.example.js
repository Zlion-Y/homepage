/**
 * @name 示例音源（网易接口样板）
 * @description 演示洛雪自定义源脚本在 zlion-music-api 宿主里的完整写法：musicUrl / lyric / pic
 * @version 1.0.0
 * @author zlion
 * @homepage https://github.com/Zlion-Y/zlion-music-api
 *
 * 用法（两种都行）：
 *   1) 启动时指定： ./zlion-music-api -script ./source.example.js
 *   2) 管理页上传： http://127.0.0.1:8787/admin  → 选择本文件 → 应用
 *
 * 说明：这份示范用的是网易自己的接口，所以它拿不到 VIP 曲的直链（网易官方本来就给 null）。
 *      它的作用是**把宿主 API 的用法演示完整**——把下面 apis 里的地址换成你自己音源
 *      脚本用的接口，就是一个真正的音源了。
 */

const { EVENT_NAMES, request, on, send, utils } = globalThis.lx

// 回调风格的 lx.request → Promise。宿主已在服务端代发，没有 CORS 限制。
const http = (url, options) =>
  new Promise((resolve, reject) => {
    request(url, options || {}, (err, resp, body) => {
      if (err) return reject(new Error(String(err)))
      if (resp.statusCode !== 200) return reject(new Error('HTTP ' + resp.statusCode))
      resolve(String(body))
    })
  })

const WY_HEADERS = { Referer: 'https://music.163.com/', Cookie: 'appver=8.7.01; os=pc' }

// 音质：洛雪传来的 type 是 128k / 320k / flac / flac24bit
const BR = { '128k': 128000, '320k': 320000, flac: 999000, flac24bit: 1900000 }

// 各平台的 musicInfo 字段不同：wy 用 id，kg 用 hash，tx 用 songmid，kw 用 rid。
// 宿主会把能给的都给上，脚本按自己的 source 取。
const idOf = (m) => m.id || m.songmid || m.hash || m.rid || ''

async function musicUrl(musicInfo, type) {
  const id = idOf(musicInfo)
  const body = await http(
    'https://music.163.com/api/song/enhance/player/url?id=' + id +
      '&ids=[' + id + ']&br=' + (BR[type] || 320000),
    { headers: WY_HEADERS }
  )
  const data = JSON.parse(body).data || []
  const url = data[0] && data[0].url
  if (!url) throw new Error('该曲没有可播放直链（多为 VIP / 版权限制）')
  return url.replace(/^http:\/\//i, 'https://')
}

async function lyric(musicInfo) {
  const id = idOf(musicInfo)
  const body = await http(
    'https://music.163.com/api/song/lyric?id=' + id + '&lv=-1&kv=-1&tv=-1',
    { headers: WY_HEADERS }
  )
  const j = JSON.parse(body)
  return {
    lyric: (j.lrc && j.lrc.lyric) || '',
    tlyric: (j.tlyric && j.tlyric.lyric) || null,
    rlyric: null,
    lxlyric: null,
  }
}

async function pic(musicInfo) {
  const id = idOf(musicInfo)
  const body = await http('https://music.163.com/api/song/detail?ids=[' + id + ']', { headers: WY_HEADERS })
  const songs = JSON.parse(body).songs || []
  const url = songs[0] && songs[0].album && songs[0].album.picUrl
  if (!url) throw new Error('没有拿到封面')
  return url.replace(/^http:\/\//i, 'https://')
}

// 宿主通过这个事件请求一切：action 只有 musicUrl / lyric / pic 三种
on(EVENT_NAMES.request, ({ source, action, info }) => {
  if (source !== 'wy') return Promise.reject(new Error('示例音源只实现了 wy'))
  switch (action) {
    case 'musicUrl':
      return musicUrl(info.musicInfo, info.type)
    case 'lyric':
      return lyric(info.musicInfo)
    case 'pic':
      return pic(info.musicInfo)
    default:
      return Promise.reject(new Error('未知动作 ' + action))
  }
})

// 声明这个脚本支持哪些音源（key 与洛雪一致：wy 网易 / kg 酷狗 / tx QQ / kw 酷我 / mg 咪咕）
// 宿主只会把这里声明过的 source 路由给本脚本，其余走内置兜底。
send(EVENT_NAMES.inited, {
  status: true,
  openDevTools: false,
  sources: {
    wy: { name: '示例音源(网易样板)', type: 'music' },
  },
})

// utils 里还有这些东西可用（真实音源脚本常用）：
//   utils.buffer.from(str[, 'base64'|'hex']) / utils.buffer.bufToString(buf[, 'base64'|'hex'])
//   utils.crypto.md5(str) / utils.crypto.randomBytes(n)
//   utils.crypto.aesEncrypt(buf, 'aes-128-cbc', key, iv) / aesDecrypt / rsaEncrypt
//   utils.zlib.inflate(buf) / utils.zlib.deflate(buf)   ← 返回 Promise
