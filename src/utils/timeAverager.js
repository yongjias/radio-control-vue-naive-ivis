// output average spectrum in real-time
class SlidingWindowAverager {
  constructor(windowSizeMs = 500) {
    this.windowSizeMs = windowSizeMs;   // in ms
    this.frames = [];       // Stores { time: number, data: Array<{freq, power}> }
    this.runningSum = null; // Will store sums of powers for each frequency bin
    this.startTime = null;  // Not strictly needed, but for reference
  }

  /**
   * Add a new frame and return the current averaged spectrum.
   * @param (spectrumData) spectrumData
   * @returns (mPower) averaged spectrum
   */
  addFrame(spectrumData) {
    const now = Date.now();

    // Initialize if first frame
    if (this.runningSum === null) {
      // Set up running sum
      this.runningSum = [...spectrumData];
      this.frames.push({ time: now, data: spectrumData });
      this.startTime = now;
      return this.computeAverage(); // Just returns the first frame's data as average for now
    }

    // Add this frame to running sum
    for (let i = 0; i < this.runningSum.length; i++) {
      this.runningSum[i] += spectrumData[i];
    }

    // Add frame to buffer
    this.frames.push({ time: now, data: spectrumData });

    // Remove old frames outside the time window
    this.pruneOldFrames();

    // Compute and return the averaged spectrum
    return this.computeAverage();
  }

  /**
   * Remove frames older than the window and update running sums.
   */
  pruneOldFrames() {
    const cutoff = Date.now() - this.windowSizeMs;
    while (this.frames.length > 0 && this.frames[0].time < cutoff && this.frames.length > 1) {
      const oldFrame = this.frames.shift();
      for (let i = 0; i < oldFrame.data.length; i++) {
        this.runningSum[i] -= oldFrame.data[i];
      }
    }
  }

  /**
   * Compute average of current frames in the window.
   * @returns averaged spectrum
   */
  computeAverage() {
    const frameCount = this.frames.length;
    if (frameCount === 0) {
      return [];
    }

    return this.runningSum.map(d => d / frameCount );
  }
}

/*
// Example usage:
// Assume a new frame comes in every 50ms, each with the same bins.
const averager = new SlidingWindowAverager(500);

setInterval(() => {
  // Generate dummy data (same bins every time)
  const testData = [
    { freq: 100e6, power: Math.random() * 10 + 50 },
    { freq: 100.01e6, power: Math.random() * 10 + 60 },
    { freq: 100.02e6, power: Math.random() * 10 + 55 }
  ];

  // Every time we add a frame, we get the 500ms averaged spectrum
  const averagedSpectrum = averager.addFrame(testData);
  console.log("Averaged Spectrum:", averagedSpectrum);

}, 50);
*/

// output average spectrum in fixed time interval
class SpectrumAverager {
  constructor(avgIntervalMs = 1000) {   // 1000 ms
    this.avgIntervalMs = avgIntervalMs; // in ms
    this.accumulator = null;    // Will hold sum of powers for each freq
    this.count = 0;             // Number of frames accumulated
    this.startTime = null;      // When did we start accumulating
  }

  /**
   * Call this method with each incoming spectrum frame.
   * @param spectrumData
   */
  addFrame(spectrumData, cb=()=>{}) {
    const currentTime = Date.now();

    // Initialize accumulation if first frame
    if (this.accumulator === null) {
      this.accumulator = [...spectrumData];
      this.count = 1;
      this.startTime = currentTime;
      return;
    }

    // Accumulate if frequencies match
    for (let i = 0; i < spectrumData.length; i++) {
      // Assuming same frequency bin order
      this.accumulator[i] += spectrumData[i];
    }
    this.count++;

    // Check if 1000ms have passed
    if (currentTime - this.startTime >= this.avgIntervalMs) {
      // Compute average
      const averagedSpectrum = this.accumulator.map(d => d / this.count );

      // Output the averaged spectrum
      cb(averagedSpectrum);

      // Reset for the next interval
      this.accumulator = null;
      this.count = 0;
      this.startTime = null;
    }
  }

}

/*
// Example usage:
// Suppose this is called every ~50ms with new data.
const averager = new SpectrumAverager(500);

// Simulate incoming data every 50ms
setInterval(() => {
  const testData = [
    { freq: 100e6, power: Math.random() * 10 + 50 },
    { freq: 100.01e6, power: Math.random() * 10 + 60 },
    { freq: 100.02e6, power: Math.random() * 10 + 55 }
  ];

  averager.addFrame(testData);
}, 50);
*/

export { SpectrumAverager, SlidingWindowAverager }
