function sum(a) {
    return a.reduce((acc, val) => acc + val)
}

function mean(a) {
    return sum(a) / a.length
}

function stddev(arr) {
    const arr_mean = mean(arr)
    const r = function(acc, val) {
        return acc + ((val - arr_mean) * (val - arr_mean))
    }
    return Math.sqrt(arr.reduce(r, 0.0) / arr.length)
}

function runningMean(data, windowSize, offset) {
  // Ensure the window size is odd.
  if (windowSize % 2 === 0) {
    throw new Error("Window size must be odd for a centered running mean.");
  }

  const halfWindow = Math.floor(windowSize / 2);
  const result = [];

  // Loop over each element in the input array.
  for (let i = 0; i < data.length; i++) {
    let sum = 0;
    let count = 0;

    // Loop over the window centered at i.
    for (let j = i - halfWindow; j <= i + halfWindow; j++) {
      // Only add values that are within the array bounds.
      if (j >= 0 && j < data.length) {
        sum += data[j];
        count++;
      }
    }
    // Push the average for the current window.
    result.push(sum / count + offset);
  }

  return result;
}

function estimateSignalBandwidth(freq, data, peakIndex, noiseFloor) {
  //const halfPowerThreshold = (data[peakIndex] + noiseFloor) / 2.; // You can adjust criteria for "width"
  const halfPowerThreshold = data[peakIndex]*0.1 + noiseFloor*0.9;  // You can adjust criteria for "width"

  let leftIndex = peakIndex;
  let rightIndex = peakIndex;

  // Expand left until power drops below halfPowerThreshold or start of array
  while (leftIndex > 0 && data[leftIndex] > halfPowerThreshold) {
    leftIndex--;
  }

  // Expand right until power drops below halfPowerThreshold or end of array
  while (rightIndex < data.length - 1 && data[rightIndex] > halfPowerThreshold) {
    rightIndex++;
  }

  const leftFreq = freq[leftIndex];
  const rightFreq = freq[rightIndex];

  return (rightFreq - leftFreq) * 1e3; // MHz -> KHz
}

function smoothed_z_score(x, y, params) {
    var p = params || {}
    // init cooefficients
    const lag = p.lag || 5
    const threshold = p.threshold || 3.5
    const influence = p.influece || 0.5

    if (y === undefined || y.length < lag + 2) {
        throw ` ## y data array to short(${y.length}) for given lag of ${lag}`
    }
    //console.log(`lag, threshold, influence: ${lag}, ${threshold}, ${influence}`)

    // init variables
    var frqs = []
    var signals = []
    let bandwidths = []
    //var idx = []
    var filteredY = y.slice(0)
    const lead_in = y.slice(0, lag)
    //console.log("1: " + lead_in.toString())

    var avgFilter = []
    avgFilter[lag - 1] = mean(lead_in)
    var stdFilter = []
    stdFilter[lag - 1] = stddev(lead_in)
    //console.log("2: " + stdFilter.toString())
    const runOffset = 5;
    const mval = runningMean(y, 7, runOffset)  // move up by offset 3.5
    //console.log(y,mval)

    for (var i = lag; i < y.length; i++) {
        //console.log(`${y[i]}, ${avgFilter[i-1]}, ${threshold}, ${stdFilter[i-1]}`)
        let prev
        let next
        if (i>1) {
          prev = y[i-1]
        } else {
          prev = y[i] - 1
        }
        if (i==y.length-1) {
          next = y[i] -1
        } else {
          next = y[i+1]
        }
        if (Math.abs(y[i] - avgFilter[i - 1]) > (threshold * stdFilter[i - 1]) && y[i]>prev && y[i]>next && y[i]>mval[i]) {
            if (y[i] > avgFilter[i - 1]) {
                signals.push(y[i]+3)
                frqs.push(x[i])
                bandwidths.push(estimateSignalBandwidth(x, y, i, mval[i]-runOffset))
                //idx.push(i)
            }
            // make influence lower
            filteredY[i] = influence * y[i] + (1 - influence) * filteredY[i - 1]
        } else {
            filteredY[i] = y[i]
        }

        // adjust the filters
        const y_lag = filteredY.slice(i - lag, i)
        avgFilter[i] = mean(y_lag)
        stdFilter[i] = stddev(y_lag)
    }

    return [signals, frqs, bandwidths]
    //return [signals, frqs, idx]
}

export {smoothed_z_score}