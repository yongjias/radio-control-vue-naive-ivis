// AudioWorklet Processor (audio-processor.js)
/*
class StreamProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.buffer = new Float32Array(0);
        this.port.onmessage = (event) => {
            const newData = event.data.audioData;
            const updatedBuffer = new Float32Array(this.buffer.length + newData.length);

            updatedBuffer.set(this.buffer);
            updatedBuffer.set(newData, this.buffer.length);
            this.buffer = updatedBuffer;
        };
    }

    process(inputs, outputs) {
        const output = outputs[0];
        if (this.buffer.length >= output[0].length * 2) {
            output[0].set(this.buffer.subarray(0, output[0].length));
            this.buffer = this.buffer.subarray(output[0].length);
        } else {
            output[0].fill(0); // Fill with silence if buffer is empty
        }
        return true; // Keep processor alive
    }
}
*/

class StreamProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
      this.buffer = new RingBuffer(16384)   // Use a ring buffer, 8192-16384 for 250-500ms of 32k
      this.port.onmessage = (event) => {
          const newData = event.data.audioData;
          this.buffer.push(newData); // Push new data into the ring buffer
      };
  }

  process(inputs, outputs) {
      const output = outputs[0];
      if (this.buffer.size >= output[0].length * 2) {
          output[0].set(this.buffer.pop(output[0].length)); // Retrieve the necessary samples
      } else {
          output[0].fill(0); // Fill with silence if buffer is empty
      }
      return true; // Keep processor alive
  }
}

class RingBuffer {
  constructor(size) {
      this.size = size;
      this.buffer = new Float32Array(size);
      this.start = 0;
      this.end = 0;
  }

  get length() {
      return (this.end + this.size - this.start) % this.size;
  }

  push(data) {
      //const availableSpace = this.size - this.length;
      //if (data.length > availableSpace) {
      //    console.warn('RingBuffer overflow: Data will be truncated');
      //}
      for (let i = 0; i < data.length; i++) {
          if (this.length >= this.size) {
              this.start = (this.start + 1) % this.size; // Overwrite oldest data
          }
          this.buffer[this.end] = data[i];
          this.end = (this.end + 1) % this.size;
      }
  }

  pop(count) {
      const result = new Float32Array(count);
      const actualCount = Math.min(count, this.length);
      for (let i = 0; i < actualCount; i++) {
          result[i] = this.buffer[this.start];
          this.start = (this.start + 1) % this.size;
      }
      return result;
  }
}

/*
// Simple RingBuffer implementation
class RingBuffer {
  constructor(size) {
      this.size = size;
      this.buffer = new Float32Array(size);
      this.start = 0;
      this.end = 0;
      this.length = 0;
  }

  push(data) {
      for (let i = 0; i < data.length; i++) {
          this.buffer[this.end] = data[i];
          this.end = (this.end + 1) % this.size;
          if (this.length < this.size) {
              this.length++;
          } else {
              this.start = (this.start + 1) % this.size; // Overwrite oldest data
          }
      }
  }

  pop(count) {
      const result = new Float32Array(count);
      for (let i = 0; i < count; i++) {
          if (this.length === 0) break;
          result[i] = this.buffer[this.start];
          this.start = (this.start + 1) % this.size;
          this.length--;
      }
      return result;
  }
}
*/

registerProcessor('stream-processor', StreamProcessor);