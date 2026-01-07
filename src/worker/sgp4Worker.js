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
let obs = [];
let observerGd = [];

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
      // 清空旧数据（防止索引错位）
      obs = [];
      observerGd = [];
      // 支持批量更新
      for (let i=0; i<msg.enable.length; i++) {
        obs[i] = {
          enable: msg.enable[i] ?? true,
          lat: msg.lat[i],
          lon: msg.lon[i],
          altMeters: msg.altMeters[i],
          minElevDeg: msg.minElevDeg[i],
        }
        observerGd[i] = {
          latitude: sat.degreesToRadians(obs[i].lat),
          longitude: sat.degreesToRadians(obs[i].lon),
          height: obs[i].altMeters / 1000.0, // km
        }
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

// 选择写入缓冲（另一块在传输中）；如已转移则按需重建
  let pos = posBuffers[writeIndex]
  let vis = visBuffers[writeIndex]
  if (!pos || !pos.buffer || pos.buffer.byteLength === 0) {
    pos = posBuffers[writeIndex] = new Float64Array(count * 3)
  }
  if (!vis || !vis.buffer || vis.buffer.byteLength === 0) {
    vis = visBuffers[writeIndex] = new Uint8Array(count)
  }
  vis.fill(0) // 0=不可见, 1=可见, 2=最近

  const gmst = sat.gstime(date)

  // 预先筛选启用的观测站索引
  const activeObs = []
  for (let j = 0; j < obs.length; j++) {
    if (obs[j] && obs[j].enable) activeObs.push(j)
  }

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

    // ✅ 使用位运算设置可见性
    for (const j of activeObs) {
      const look = sat.ecfToLookAngles(observerGd[j], ecf)
      if (!look) continue
      const elDeg = sat.radiansToDegrees(look.elevation)
      if (elDeg >= obs[j].minElevDeg) {
        //vis[i] = 1 // 可见
        //break  // 只要对一个站可见即可

        // ✅ 设置第 j 位为 1
        vis[i] |= (1 << j)  // 例如: j=0 -> 0b00000001, j=1 -> 0b00000010
        //const a = (vis[i] & (1 << 16)) !== 0;
      }
    }
  }

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

  // 标记已转移的缓冲为 null，延迟到下次写入前再按需重建
  const sentIdx = writeIndex ^ 1 // 刚发出的那块
  posBuffers[sentIdx] = null
  visBuffers[sentIdx] = null
}

// -----------------------------
// 生成轨迹并回传（独立一次性数组即可）
// -----------------------------
function sendOrbit(idx, aheadMin, behindMin, stepSec, timeSec) {
  if (idx < 0 || idx >= satrecs.length || !satrecs[idx]) {
    console.warn('[Worker] sendOrbit: 无效的卫星索引', idx);
    return;
  }

  // 使用数组收集有效点，避免末尾 0 值
  const temp = []
  
  for (let t = -behindMin * 60; t <= aheadMin * 60; t += stepSec) {
    const dt = new Date(timeSec + t * 1000)
    const pv = sat.propagate(satrecs[idx], dt)
    if (!pv || !pv.position) {
      continue // 跳过失败点
    }
    const gmst = sat.gstime(dt)
    const ecf = sat.eciToEcf(pv.position, gmst)
    temp.push(ecf.x * 1000.0, ecf.y * 1000.0, ecf.z * 1000.0)
  }

  if (temp.length === 0) {
    console.error('[Worker] sendOrbit: 没有有效的轨迹点', idx);
    return;
  }

  const out = new Float64Array(temp)
  self.postMessage({ type: 'orbit', idx, buffer: out }, [out.buffer])
}