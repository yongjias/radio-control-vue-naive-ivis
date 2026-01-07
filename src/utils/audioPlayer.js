import audioProcessorUrl from '@/utils/audio-processor.js?url';

class AudioPlayer {
  constructor(context) {
    this.audioContext = context;
    this.init();
  }

  async init() {
      await this.audioContext.audioWorklet.addModule(audioProcessorUrl);
      this.workletNode = new AudioWorkletNode(this.audioContext, 'stream-processor');
      this.workletNode.connect(this.audioContext.destination);
  }

  play(data) {
      //const rawData = new Int16Array(data); // Assuming 16-bit PCM
      const floatData = new Float32Array(data.length);

      // Normalize PCM to -1.0 to 1.0
      for (let i = 0; i < data.length; i++) {
          floatData[i] = data[i] / 32768;
      }

      // Post data to AudioWorklet
      this.workletNode.port.postMessage({ audioData: floatData });
  }

  /*
  convertToFloat32(data) {
    const floatData = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) {
        floatData[i] = data[i] / 32768; // Normalize PCM to -1.0 to 1.0
    }
    return floatData;
  }
  */
}

export { AudioPlayer }
