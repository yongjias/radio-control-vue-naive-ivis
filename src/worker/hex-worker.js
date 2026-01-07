// hex-worker.js
// 接受参数：
// {
//   centers: Array<{ lon:number, lat:number, r?:number, id?:number|string, color?:number }>,
//   hexRadiusMeters?: number,      // 默认半径（米），当 center.r 未提供时使用
//   batchSize?: number,            // 每批多少个 hex（默认 1000）
//   sendECEF?: boolean,            // true: 返回 ECEF Float64；false: 返回经纬度 Float64
//   colorMax?: number              // maximum value for color scaling (default 50)
// }
//
// 返回消息（每批一次）：
// {
//   type: 'batch',
//   sendECEF: boolean,
//   floatsPer: number,         // 18 (ECEF) 或 12 (经纬度)
//   positions: ArrayBuffer,    // Float64Array buffer
//   colors: ArrayBuffer,       // Uint8Array buffer（每实例4字节）
//   ids: ArrayBuffer           // Uint32Array buffer（非数值 id 会映射到递增整数）
// }

//////////////////// 地理/坐标工具 ////////////////////

// WGS84（经纬度 -> ECEF）
const a = 6378137.0;                           // 半长轴
const f = 1 / 298.257223563;
const e2 = f * (2 - f);                        // 第一偏心率平方

function lonLatHeightToECEF(lonDeg, latDeg, h = 0) {
  const lon = lonDeg * Math.PI / 180;
  const lat = latDeg * Math.PI / 180;
  const cosLat = Math.cos(lat), sinLat = Math.sin(lat);
  const cosLon = Math.cos(lon), sinLon = Math.sin(lon);
  const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
  const x = (N + h) * cosLat * cosLon;
  const y = (N + h) * cosLat * sinLon;
  const z = (N * (1 - e2) + h) * sinLat;
  return [x, y, z];
}

// 在给定经纬度附近（小范围）做米制偏移，返回新的经纬度
function offsetLonLatMeters(lonDeg, latDeg, dx, dy) {
  const latRad = latDeg * Math.PI / 180;
  // 近似：每度纬度的米数、每度经度的米数（视纬度变化）
  const mPerDegLat = 111132.954 - 559.822 * Math.cos(2 * latRad) + 1.175 * Math.cos(4 * latRad);
  const mPerDegLon = (Math.PI / 180) * a * Math.cos(latRad);
  const dLat = dy / mPerDegLat;
  const dLon = dx / mPerDegLon;
  return [lonDeg + dLon, latDeg + dLat];
}

// 以 (lon,lat) 为中心，生成“平顶六边形”6个顶点的经纬度序列 [lon,lat]*6
function hexLngLatVertices(lon, lat, R) {
  const out = new Float64Array(12); // 6点*2
  for (let i = 0; i < 6; i++) {
    const ang = i * Math.PI / 3; // 0°, 60°, 120°, 180°, 240°, 300°
    const dx = R * Math.cos(ang);
    const dy = R * Math.sin(ang);
    const [LON, LAT] = offsetLonLatMeters(lon, lat, dx, dy);
    out[i * 2] = LON;
    out[i * 2 + 1] = LAT;
  }
  return out;
}

// 把 [lon,lat]*6 转为 ECEF Float64Array [x,y,z]*6
function hexLngLatToECEFArr(lonlat12) {
  const out = new Float64Array(18);
  for (let i = 0; i < 6; i++) {
    const lon = lonlat12[i * 2], lat = lonlat12[i * 2 + 1];
    const [x, y, z] = lonLatHeightToECEF(lon, lat, 0);
    out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z;
  }
  return out;
}

//////////////////// 颜色工具 ////////////////////

// 简化 HSL(0-360,0-255,0-255) -> RGBA(0-255)
function hsl2rgba(h, s, l, a = 128) {
  s /= 255; l /= 255;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp >= 0 && hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
    a
  ];
}

// 根据中心点索引/自带 id 生成稳定颜色
function colorFromIndex(idx) {
  const h = Math.floor((1 - idx) * 255);       // 0-255
  const s = Math.floor((1 - h/360) * 255);     // 0-255
  const [r, g, b, a] = hsl2rgba(h, s, 200, 160);
  return new Uint8Array([r, g, b, a]);
}

//////////////////// 批处理发送 ////////////////////
self.onmessage = (e) => {
  const {
    centers = [],               // [{lon,lat,r?, id?, color?}]
    hexRadiusMeters = 1000,     // 默认半径（米）
    batchSize = 1000,
    sendECEF = true,
    colorMax = 50,
  } = e.data || {};

  if (!Array.isArray(centers) || centers.length === 0) {
    // 空任务直接返回
    self.postMessage({ type: 'empty' });
    return;
  }

  let batchPositions = []; // 每元素：Float64Array(18 or 12)
  let batchColors = [];    // 每元素：Uint8Array(4)
  let batchIds = [];       // 每元素：Uint32

  for (let i = 0; i < centers.length; i++) {
    const c = centers[i];
    const lon = c.lon, lat = c.lat;
    const R = (typeof c.r === 'number' && c.r > 0) ? c.r : hexRadiusMeters;

    // 生成顶点
    const lonlat12 = hexLngLatVertices(lon, lat, R);
    const pos = sendECEF ? hexLngLatToECEFArr(lonlat12) : lonlat12;
    batchPositions.push(pos);

    // 颜色 使用索引生成稳定色
    let colorBytes = colorFromIndex(c.color/colorMax);
    batchColors.push(colorBytes);

    // id
    batchIds.push(c.id+','+lon.toFixed(3)+','+lat.toFixed(3)); // 保证唯一

    // 到达批次阈值，发送
    if (batchPositions.length >= batchSize) {
      flushBatch();
    }
  }

  // 发送最后一批
  flushBatch(true);

  // —— 工具函数 —— //
  function flushBatch(isLast = false) {
    if (batchPositions.length === 0) return;

    const n = batchPositions.length;
    const floatsPer = batchPositions[0].length;   // 18 or 12
    const posBuf = new Float64Array(n * floatsPer);
    const colorBuf = new Uint8Array(n * 4);

    for (let i = 0; i < n; i++) {
      posBuf.set(batchPositions[i], i * floatsPer);
      colorBuf.set(batchColors[i], i * 4);
    }

    self.postMessage({
      type: 'batch',
      sendECEF,
      floatsPer,
      ids: batchIds,
      positions: posBuf.buffer,
      colors: colorBuf.buffer,
      done: isLast
    }, [posBuf.buffer, colorBuf.buffer]);

    batchPositions = [];
    batchColors = [];
    batchIds = [];
  }
};
