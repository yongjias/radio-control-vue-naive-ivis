// Web Worker：批量 SGP4 传播，返回 ECEF x,y,z（米）
import * as sat from 'satellite.js'

let satrecs = []
let positions = []
let iVisiable = [] // 可见性

let obs = { 
  enable: false, 
  lat: 0,         // 度
  lon: 0,         // 度
  altMeters: 0,   // 米
  minElevDeg: -90 // 阈值（度），默认不过滤
}

let observerGd = {
  latitude: sat.degreesToRadians(obs.lat),
  longitude: sat.degreesToRadians(obs.lon),    // 弧度
  height: obs.altMeters / 1000.0,              // km
}

self.onmessage = (e) => {
  const msg = e.data
  if (msg.type === 'init') {
    satrecs = msg.tles.map((t) => sat.twoline2satrec(t.l1, t.l2))
    positions = Array(satrecs.length * 3).fill(0);
    iVisiable = Array(satrecs.length).fill(false);
  } else if (msg.type === 'tick') {
    // 由主线程每帧（按节流）发来当前仿真时间（秒）
    const date = new Date(msg.timeSec)
    computeAndPost(date)
  } else if (msg.type === 'orbit') {
    const { idx, aheadMin = 15, behindMin = 15, stepSec = 30, timeSec } = msg
    sendOrbit(idx, aheadMin, behindMin, stepSec, timeSec)
  } else if (msg.type === 'observer') {
    obs = {
      enable: msg.enable ?? true,
      lat: msg.lat ?? obs.lat,                         // 度
      lon: msg.lon ?? obs.lon,                         // 度
      altMeters: msg.altMeters ?? obs.altMeters,       // meter
      minElevDeg: msg.minElevDeg ?? obs.minElevDeg,
    }
    observerGd = {
      latitude: sat.degreesToRadians(obs.lat),
      longitude: sat.degreesToRadians(obs.lon),
      height: obs.altMeters / 1000.0, // km
    }
  }
}

function computeAndPost(date) {
  const gmst = sat.gstime(date)

  let minRange = Infinity;
  let minRangeIdx = null;
  for (let i = 0; i < satrecs.length; i++) {
    const pv = sat.propagate(satrecs[i], date)
    if (!pv) {
      positions[i*3] = 0;
      positions[i*3+1] = 0;
      positions[i*3+2] = 0;
      continue
    }
    const ecf = sat.eciToEcf(pv.position, gmst) // km
    iVisiable[i] = false // 不可见
    if (obs.enable) {
      const look = sat.ecfToLookAngles(observerGd, ecf);
      //  azDeg: sat.radiansToDegrees(look.azimuth)
      //  rangeKm: look.rangeSat
      const elDeg = sat.radiansToDegrees(look.elevation);
      if (look && elDeg >= obs.minElevDeg) {
        iVisiable[i] = true // 可见
        if (look.rangeSat < minRange) {
          minRange = look.rangeSat
          minRangeIdx = i
        }
      }
    }
    //positions.push(ecf.x * 1000, ecf.y * 1000, ecf.z * 1000) // m
    positions[i*3] = ecf.x * 1000; // m
    positions[i*3+1] = ecf.y * 1000; // m
    positions[i*3+2] = ecf.z * 1000; // m
  }

  if (minRangeIdx !== null) {
    iVisiable[minRangeIdx] = 2 // 最接近的标记为 2
  }
  const out = new Float64Array(positions)
  const visiable = new Uint8Array(iVisiable)
  self.postMessage({ type: 'pos', vis: visiable, buffer: out }, [out.buffer])
}

function sendOrbit(idx, aheadMin, behindMin, stepSec, timeSec) {
  if (!satrecs[idx]) return
  const points = []

  // 过去段
  for (let t = -behindMin * 60; t <= aheadMin * 60; t += stepSec) {
    const dt = new Date(timeSec + t * 1000)
    const pv = sat.propagate(satrecs[idx], dt)
    if (!pv) continue
    const gmst = sat.gstime(dt)
    const ecf = sat.eciToEcf(pv.position, gmst)
    points.push(ecf.x * 1000, ecf.y * 1000, ecf.z * 1000)
  }
  const out = new Float64Array(points)
  self.postMessage({ type: 'orbit', idx, buffer: out }, [out.buffer])
}