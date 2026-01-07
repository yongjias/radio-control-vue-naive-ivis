// bearing.js
import LatLon from 'geodesy/latlon-nvector-spherical.js';         // faster but less accurate
//import LatLon from 'geodesy/latlon-ellipsoidal-vincenty.js';    // more accurate but slower

// 角度差，周期处理[-180,180]
function angleDiff(a, b) {
  let diff = a - b;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return diff;
}

function filter_azimuth(data, windowSize = 10, thresholdDeg = 10) {
  const halfWin = Math.floor(windowSize / 2);
  const result = [];

  for(let i=0; i < data.length; i++) {
    const start = Math.max(0, i - halfWin);
    const end = Math.min(data.length - 1, i + halfWin);

    const windowPoints = [];
    for(let j = start; j <= end; j++) {
      if(Math.abs(angleDiff(data[j], data[i])) <= thresholdDeg) {
        windowPoints.push(data[j]);
      }
    }

    if(windowPoints.length === 0) continue;

    // 平滑：算数平均
    const avgAz = windowPoints.reduce((acc,p) => acc + p, 0) / windowPoints.length;
    //const avgTime = windowPoints.reduce((acc,p) => acc + p.time, 0) / windowPoints.length;

    // 角度归一化 [0,360)
    let smoothAz = avgAz % 360;
    if(smoothAz < 0) smoothAz += 360;

    //result.push({ time: avgTime, azimuth: smoothAz });
    result.push(smoothAz);
  }
  
  return result
}

function countAzimuthDistribution(data) {
  // 初始化360个角度频数为0
  const counts = new Array(360).fill(0);
  
  data.forEach(( azimuth ) => {
    // 角度归一化到0~360
    let deg = azimuth % 360;
    if (deg < 0) deg += 360;
    // 四舍五入取整
    const index = Math.round(deg) % 360;
    counts[index]++;
  });

  return counts;
}

function countAzimuthDistributionWithMedian(data) {
  const counts = new Array(360).fill(0);
  const buckets = new Array(360).fill(0).map(() => []); // 存放每度的示向度原始值

  data.forEach(( azimuth ) => {
    let deg = azimuth % 360;
    if (deg < 0) deg += 360;
    const index = Math.round(deg) % 360;
    counts[index]++;
    buckets[index].push(deg);
  });

  // 计算每个区间的中值
  const medians = buckets.map((arr,idx) => {
    if (arr.length === 0) return data[idx];
    arr.sort((a,b) => a - b);
    const mid = Math.floor(arr.length / 2);
    if (arr.length % 2 === 0) {
      return (arr[mid - 1] + arr[mid]) / 2;
    } else {
      return arr[mid];
    }
  });

  return { counts, medians };
}

/**
 * 环状移动平均平滑
 * @param {number[]} data  长度360的数组
 * @param {number} span    滑动窗口大小，奇数
 * @returns {number[]}     平滑后数组，长度360
 */
function circularMovingAverage(data, span) {
  const len = data.length;
  const half = Math.floor(span / 2);
  const result = new Array(len).fill(0);

  for (let i = 0; i < len; i++) {
    let sum = 0;
    for (let j = -half; j <= half; j++) {
      // 环绕取模
      let idx = (i + j + len) % len;
      sum += data[idx];
    }
    result[i] = sum / span;
  }
  return result;
}

/**
 * 连续多次移动平滑
 * @param {number[]} data 长度360的数组
 * @param {number[]} spans 平滑窗数组，如 [7,5,3]
 * @returns {number[]} 平滑后的数据
 */
function multiSmooth(data, spans = [7,5,3]) {
  let smoothed = data.slice();
  for (const span of spans) {
    smoothed = circularMovingAverage(smoothed, span);
  }
  return smoothed;
}

/**
 * 根据相对门限筛选峰值角度
 * @param {number[]} data 360长度数组，平滑后数据
 * @param {number} thresholdRatio  相对门限，0~1，表示峰值必须超过 maxValue*thresholdRatio 才算有效峰
 * @returns {number[]} 峰值所在角度数组（0~359）
 */
function findPeak(data, thresholdRatio = 0.2) {
  const peaks = [];
  const len = data.length;
  const maxVal = Math.max(...data);
  const threshold = maxVal * thresholdRatio;

  for (let i = 0; i < len; i++) {
    const prev = data[(i - 1 + len) % len];
    const next = data[(i + 1) % len];
    if (data[i] > prev && data[i] > next && data[i] >= threshold) {
      peaks.push({idx:i, count: data[i]});
    }
  }
  
  // get idx of maximum count
  if (peaks.length>0) {
    const peak = peaks.reduce((max, obj) => (obj.count > max.count ? obj : max), peaks[0]);
    return peak.idx;
  } else {
    return null
  }
}

// 预处理连续测向中的测向度
// 预处理连续测向中的测向度
function certain_bearing(bearingData) {
  if (bearingData.length==0) {
    return null
  }
  const windowSize = 9;
  const thresholdDeg = 10;  // difference limitation from current bearing value
  
  const preAzimuth = filter_azimuth(bearingData, windowSize, thresholdDeg);
  // 0-360 distribution
  const counts = countAzimuthDistribution(preAzimuth);
  // 三次平滑
  const smoothedData = multiSmooth(counts, [7,5,3]);

  //const peakAngleIndexes = findPeaks(smoothedData, 0.5);
  const peakAngleIndex = findPeak(smoothedData);
  //console.log('峰值角度:', peakAngleIndex, medians[peakAngleIndex]);
  let certainBearing = peakAngleIndex
  if (certainBearing == null) {
    certainBearing = bearingData.reduce((sum, num) => sum + num, 0) / bearingData.length;
  }
  return certainBearing
}

// 将度转换为弧度
function toRadians(deg) {
  return deg * Math.PI / 180;
}
// 将弧度转换为度
function toDegrees(rad) {
  return rad * 180 / Math.PI;
}

// 经纬度转单位矢量（球面坐标转换）
function latLonToUnitVector(latDeg, lonDeg) {
  const lat = toRadians(latDeg);
  const lon = toRadians(lonDeg);
  const x = Math.cos(lat) * Math.cos(lon);
  const y = Math.cos(lat) * Math.sin(lon);
  const z = Math.sin(lat);
  return { x, y, z };
}

/**
 * 三维单位向量转经纬度
 * @param {number} x 
 * @param {number} y 
 * @param {number} z 
 * @returns {object} {lon: 经度度, lat: 纬度度}
 */
function vectorToLatLon(x, y, z) {
  const lon = Math.atan2(y, x);
  const lat = Math.asin(z);
  return { lon: toDegrees(lon), lat: toDegrees(lat) };
}

// 计算两个单位矢量(到地心的矢量)之间夹角（弧度）
function angleBetweenTwoPoints(P1, P2) {
  const v1 = latLonToUnitVector(P1.lat, P1.lon);
  const v2 = latLonToUnitVector(P2.lat, P2.lon);

  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  // 限制数值域避免浮点误差导致NaN
  const clampedDot = Math.min(1, Math.max(-1, dot));
  return Math.acos(clampedDot);
}

// angle ABC,  at point B, two side of BA, BC
function angleBetweenTwoLines(Pa, Pb, Pc) {
  const B = new LatLon(Pb.lat, Pb.lon);
  const A = new LatLon(Pa.lat, Pa.lon);
  const C = new LatLon(Pc.lat, Pc.lon);

  const bearingBA = B.initialBearingTo(A);
  const bearingBC = B.initialBearingTo(C);

  // Angle at B between points A and C:
  let angle = (bearingBC - bearingBA + 360) % 360;
  if (angle > 180) angle = 360 - angle;

  //console.log('Angle at B:', angle, 'degrees');
  return toRadians(angle)
}

function isThreeStationIntersectionSuccess(P1, P2, P3, threshold) {
  const d12 = angleBetweenTwoPoints(P1, P2);
  const d23 = angleBetweenTwoPoints(P2, P3);
  const d31 = angleBetweenTwoPoints(P3, P1);

  // 1. 三个交点两两距离均低于阈值，交会成功
  if (d12 < threshold && d23 < threshold && d31 < threshold) {
    return true;
  }

  // 2. 存在任意一对交点距离远低于阈值，且对应示向线中有两条接近重合
  const small_threshold = threshold * 0.2;
  if (d12 < small_threshold || d23 < small_threshold || d31 < small_threshold) {
    // 进一步判断对应示向线是否接近重合
    const a123 = angleBetweenTwoLines(P1, P2, P3);
    const a231 = angleBetweenTwoLines(P2, P3, P1);
    const a312 = angleBetweenTwoLines(P3, P1, P2);
    const thresholdAng = toRadians(5);   // radian threshold < 5 deg
    if (a123 < thresholdAng || a231 < thresholdAng || a312 < thresholdAng) {
      return true;
    }
  }

  // 3. 其他情况视为失败
  return false;
}

/**
 * 球面加权平均点
 * @param {Array<{lon:number, lat:number, weight:number}>} points 含权重的经纬度点数组
 * @returns {{lon:number, lat:number}} 加权平均后的经纬度点
 */
function weightedAverageOnSphere(points) {
  let sumX = 0, sumY = 0, sumZ = 0;

  points.forEach(({ lon, lat, weight }) => {
    const { x, y, z } = latLonToUnitVector(lat, lon);
    sumX += x * weight;
    sumY += y * weight;
    sumZ += z * weight;
  });

  const length = Math.sqrt(sumX*sumX + sumY*sumY + sumZ*sumZ);
  if (length === 0) {
    throw new Error('加权向量长度为0无法归一化!');
  }

  return vectorToLatLon(sumX / length, sumY / length, sumZ / length);
}

/**
 * 计算每个交点的权重
 * @param {{lat:number, lon:number}} point  三站交会成功后的点
 * @param {Array<{lat:number, lon:number}>} stations 三个短波站的经纬度 [{lat,lon},…]
 * @returns {weight:number}}
 */
function computeCrossWeight(point, stations) {
  const maxSum = 3 * Math.PI;  // 3π
  // 1. 计算 Pᵢ 到每个站的球面距离(弧度) l₁, l₂, l₃
  const dists = stations.map(s => angleBetweenTwoPoints(point, s.point));
  const lSum = dists.reduce((a, b) => a + b, 0); // l_i = l₁ + l₂ + l₃, 弧度和

  // 2. 根据公式 w_i = 1 - (lSum / (3π))²
  const w = 1 - Math.pow(lSum / maxSum, 2);

  return w; 
}

/**
 * 从数组 arr 中取出所有可能的不重复三元组
 * @param {Array<any>} arr 输入数组
 * @returns {Array<Array<any>>} 返回一个包含所有三元组的数组
 */
function allTriplets(arr) {
  const result = [];
  const n = arr.length;
  for (let i = 0; i < n - 2; i++) {
    for (let j = i + 1; j < n - 1; j++) {
      for (let k = j + 1; k < n; k++) {
        result.push([arr[i], arr[j], arr[k]]);
      }
    }
  }
  return result;
}
// 用法示例
//const points = ['A', 'B', 'C', 'D'];
//console.log(allTriplets(points));
// 输出: [ [ 'A','B','C' ], [ 'A','B','D' ], [ 'A','C','D' ], [ 'B','C','D' ] ]

// ---------------------------------------------------------------------------
const THRESHOLD_INTERSECTION = toRadians(0.5);     // 0.1 degree ~= 11KM, 
const THRESHOLD_SET = THRESHOLD_INTERSECTION * 2;  // circle radius of points set for final locating
const EARTH_RADIUS = 6371000; // earth radius in meter
onmessage = function(e) {
  if (e.data.length<3) {
    return;
  }
  // 1, get certain bearing from continue bearing stream
    //const bearing = certain_bearing(el.bearings);
  const sites = e.data.map(el => {
    return {
      name: el.name,
      bearing: el.bearing,
      point: new LatLon(el.lat, el.lon),
    }
  })
  
  // 2, 三站示向线交会点集合
  const crossPoints = [];
  const sitesSet = new Set();
  for (let tre of allTriplets(sites)) {  // n choose 3 to get a tre: {name, point, bearing}
    const P1 = LatLon.intersection(
      tre[0].point, tre[0].bearing,
      tre[1].point, tre[1].bearing,
    );
    const P2 = LatLon.intersection(
      tre[1].point, tre[1].bearing,
      tre[2].point, tre[2].bearing,
    );
    const P3 = LatLon.intersection(
      tre[2].point, tre[2].bearing,
      tre[0].point, tre[0].bearing,
    );
    // is a successful intersection
    if( isThreeStationIntersectionSuccess(P1, P2, P3, THRESHOLD_INTERSECTION) ) {
      P2.weight = angleBetweenTwoLines(P1, P2, P3);
      P3.weight = angleBetweenTwoLines(P2, P3, P1);
      P1.weight = angleBetweenTwoLines(P3, P1, P2);
      const meanCrossPoint = weightedAverageOnSphere([P1, P2, P3]); // {lat:lat, lon:lon}
      meanCrossPoint.weight = computeCrossWeight(meanCrossPoint, tre);

      crossPoints.push(meanCrossPoint);
      tre.forEach(el => {
        sitesSet.add(el);
      })
    }
  }
  //console.log(crossPoints, sitesSet)

  // 3, 找出权值和最大的点集
  let maxWeight = 0;
  let locatingPoints = null;
  for (let i=0; i<crossPoints.length; i++) {
    let wSum = 0;
    const setPoints = [];
    for (let j=0; j<crossPoints.length; j++) {
      if (angleBetweenTwoPoints(crossPoints[i], crossPoints[j]) < THRESHOLD_SET ) {
        wSum += crossPoints[j].weight;
        setPoints.push(crossPoints[j]);
      }
    }
    if (wSum > maxWeight) {
      maxWeight = wSum;
      locatingPoints = [...setPoints];
    }
  }

  // 4, 概率椭圆计算
  if (locatingPoints) {
    const locating_center = weightedAverageOnSphere(locatingPoints);
    const P_locating_center = new LatLon(locating_center.lat, locating_center.lon)
    const bearingAndDistances = Array.from(sitesSet).map(el => {
      const bearing = P_locating_center.initialBearingTo(el.point);
      const distance = angleBetweenTwoPoints(P_locating_center, el.point);
      return {
        bearing: bearing,
        distance: distance
      }
    })
    // calculate A, B, C 
    const coef = bearingAndDistances.reduce((acc, obj) => {
      acc.A += Math.cos(obj.bearing)**2/obj.distance;
      acc.B += Math.sin(obj.bearing)*Math.cos(obj.bearing)/obj.distance; 
      acc.C += Math.sin(obj.bearing)**2/obj.distance;
      return acc; 
    }, {A:0, B:0, C:0}); 
    // 旋转角 α
    let alpha = 0.5 * Math.atan2(2*coef.B, coef.C - coef.A);
    // 长短轴比 k
    const tanAlpha = Math.tan(alpha);
    const k = Math.sqrt((coef.A - coef.B*tanAlpha) / (coef.C + coef.B*tanAlpha));
    // 长半轴与短半轴
    let a = Math.sqrt(k) * THRESHOLD_SET * EARTH_RADIUS;
    let b = THRESHOLD_SET * EARTH_RADIUS / Math.sqrt(k);
    // 面积
    const area = Math.PI * a * b;
    // make sure a > b
    if(a < b) {
      [a, b] = [b, a];
      alpha += Math.PI/2;
    }
    //console.log(locating_center, a, b, toDegrees(alpha), area)

    postMessage({
      center: locating_center,
      semiMajorAxis: a * 0.5,
      semiMinorAxis: b * 0.5,
      rotation: toDegrees(alpha),
      area: area
    });
  }
};
