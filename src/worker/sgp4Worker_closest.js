// Web Worker：批量 SGP4 传播，返回 ECEF x,y,z（米）
import * as sat from 'satellite.js'

// -----------------------------
// 内部状态
// -----------------------------
let satrecs = []
let count = 0

// 双缓冲：每帧交替使用，减少 GC/复制
let posBuffers = [null, null]        // Float64Array 长度 = count*3
let visBuffers = [null, null]        // Uint8Array  长度 = count
let writeIndex = 0                   // 当前写入缓冲索引（0/1）

// 观测站参数
let obs = {
  enable: false,
  lat: 0,           // 度
  lon: 0,           // 度
  altMeters: 0,     // 米
  minElevDeg: -90,  // 阈值（度），默认不过滤
}

let observerGd = {
  latitude: sat.degreesToRadians(obs.lat), // 弧度
  longitude: sat.degreesToRadians(obs.lon),
  height: obs.altMeters / 1000.0,          // km
}

// -----------------------------
// 消息处理
// -----------------------------
self.onmessage = (e) => {
  const msg = e.data
  switch (msg.type) {
    case 'init': {
      // tles: [{ l1, l2, name? }, ...]
      satrecs = msg.tles.map((t) => sat.twoline2satrec(t.l1, t.l2))
      count = satrecs.length

      // 分配双缓冲
      posBuffers[0] = new Float64Array(count * 3)
      posBuffers[1] = new Float64Array(count * 3)
      visBuffers[0] = new Uint8Array(count)
      visBuffers[1] = new Uint8Array(count)
      // 初始化为 0/false
      posBuffers[0].fill(0); posBuffers[1].fill(0)
      visBuffers[0].fill(0); visBuffers[1].fill(0)
      break
    }
    case 'tick': {
      // 主线程每帧（按节流）发来当前仿真时间（毫秒）
      const date = new Date(msg.timeSec)
      computeAndPost(date)
      break
    }
    case 'orbit': {
      const { idx, aheadMin = 15, behindMin = 15, stepSec = 30, timeSec } = msg
      sendOrbit(idx, aheadMin, behindMin, stepSec, timeSec)
      break
    }
    case 'observer': {
      obs = {
        enable: msg.enable ?? true,
        lat: msg.lat ?? obs.lat,
        lon: msg.lon ?? obs.lon,
        altMeters: msg.altMeters ?? obs.altMeters,
        minElevDeg: msg.minElevDeg ?? obs.minElevDeg,
      }
      observerGd = {
        latitude: sat.degreesToRadians(obs.lat),
        longitude: sat.degreesToRadians(obs.lon),
        height: obs.altMeters / 1000.0, // km
      }
      break
    }
    default:
      // 忽略未知消息类型
      break
  }
}

// -----------------------------
// 传播并回传一帧
// -----------------------------
function computeAndPost(date) {
  if (count === 0) return

  // 选择写入缓冲（另一块在传输中）
  const pos = posBuffers[writeIndex]
  const vis = visBuffers[writeIndex]
  vis.fill(0) // 0=不可见, 1=可见, 2=最近

  const gmst = sat.gstime(date)
  let minRange = Infinity
  let minIdx = -1

  // 批量传播
  for (let i = 0; i < count; i++) {
    const pv = sat.propagate(satrecs[i], date)
    if (!pv || !pv.position) {
      pos[i * 3] = 0
      pos[i * 3 + 1] = 0
      pos[i * 3 + 2] = 0
      continue
    }

    const ecf = sat.eciToEcf(pv.position, gmst) // km
    pos[i * 3]     = ecf.x * 1000.0
    pos[i * 3 + 1] = ecf.y * 1000.0
    pos[i * 3 + 2] = ecf.z * 1000.0

    if (obs.enable) {
      const look = sat.ecfToLookAngles(observerGd, ecf)
      if (look) {
        const elDeg = sat.radiansToDegrees(look.elevation)
        if (elDeg >= obs.minElevDeg) {
          vis[i] = 1 // 可见
          if (look.rangeSat < minRange) {
            minRange = look.rangeSat
            minIdx = i
          }
        }
      }
    }
  }

  if (minIdx >= 0) vis[minIdx] = 2 // 最近的标记为 2

  // 发送：把当前写缓冲发出去（可转移），下帧改写另一块
  const posToSend = pos
  const visToSend = vis

  // 切换双缓冲写入索引
  writeIndex = writeIndex ^ 1

  // 重要：传递 ArrayBuffer 实现零拷贝
  self.postMessage(
    { 
      type: 'pos', 
      buffer: posToSend.buffer, 
      vis: visToSend.buffer 
    },
    [posToSend.buffer, visToSend.buffer]
  )

  // 被转移的 buffer 已“失效”，这里立刻重建新的缓冲占位，避免下次没有可用缓冲
  // （也可以延迟到下一次 compute 再检查并重建）
  const idx = writeIndex ^ 1 // 刚刚发出去的那块
  posBuffers[idx] = new Float64Array(count * 3)
  visBuffers[idx] = new Uint8Array(count)
}

// -----------------------------
// 生成轨迹并回传（独立一次性数组即可）
// -----------------------------
function sendOrbit(idx, aheadMin, behindMin, stepSec, timeSec) {
  if (!satrecs[idx]) return

  // 计算点数（含端点）
  const totalSec = aheadMin * 60 + behindMin * 60;
  const steps = Math.floor(totalSec / stepSec) + 1;
  const out = new Float64Array(steps * 3);

  let k = 0
  for (let t = -behindMin * 60; t <= aheadMin * 60; t += stepSec) {
    const dt = new Date(timeSec + t * 1000)
    const pv = sat.propagate(satrecs[idx], dt)
    if (!pv || !pv.position) {
      continue
    }
    const gmst = sat.gstime(dt)
    const ecf = sat.eciToEcf(pv.position, gmst)
    out[k++] = ecf.x * 1000.0
    out[k++] = ecf.y * 1000.0
    out[k++] = ecf.z * 1000.0
  }

  self.postMessage({ type: 'orbit', idx, buffer: out }, [out.buffer])
}