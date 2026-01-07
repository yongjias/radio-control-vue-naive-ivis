// bearing.js

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
    return 0
  }
}

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

export { certain_bearing }