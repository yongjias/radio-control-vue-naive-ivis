// note: there are some error and need modified to use, reference to utils/ReceiveStreamFrame.ts of rfcs-nest-serve

// --------------------- 内存池 ---------------------
class ArrayBufferPool {
  constructor(blockSize = 8192, maxBlocks = 50) {
    this.blockSize = blockSize;
    this.maxBlocks = maxBlocks;
    this.freeList = [];
  }

  allocate() {
    return this.freeList.pop() || new Uint8Array(new ArrayBuffer(this.blockSize));
  }

  free(buf) {
    if (this.freeList.length < this.maxBlocks) {
      buf.fill(0); // 清空防止数据泄漏
      this.freeList.push(buf);
    }
  }
}

// --------------------- 帧解析器 ---------------------
class OptimizedFrameParser {
  constructor() {
    this.pool = new ArrayBufferPool();
    this.buffer = this.pool.allocate();
    this.cursor = 0;
    this.state = 'HEADER';
    this.currentFrame = null;
  }

  // 接收WebSocket数据块
  feed(chunk) {
    const newData = new Uint8Array(chunk);
    
    // 确保缓冲区足够大 (动态扩容)
    if (this.cursor + newData.length > this.buffer.length) {
      const newBuffer = this.pool.allocate();
      newBuffer.set(this.buffer.subarray(0, this.cursor));
      this.pool.free(this.buffer);
      this.buffer = newBuffer;
    }

    // 拷贝数据到工作区
    this.buffer.set(newData, this.cursor);
    this.cursor += newData.length;
    this.processBuffer();
  }

  // 处理缓冲数据
  processBuffer() {
    while (this.cursor > 0) {
      if (this.state === 'HEADER') {
        if (!this.parseHeader()) break;
      }
      
      if (this.state === 'PAYLOAD') {
        if (!this.parsePayload()) break;
      }
    }

    // 压缩缓冲区 (避免内存浪费)
    if (this.cursor === 0 && this.buffer.length > 65536) {
      this.pool.free(this.buffer);
      this.buffer = this.pool.allocate();
    }
  }

  parseHeader() {
    const HEADER_SIZE = 24; // 基础帧头大小
    if (this.cursor < HEADER_SIZE) return false;

    const view = new DataView(this.buffer.buffer);
    this.currentFrame = {
      header: {
        leader: view.getUint32(0),
        version: `${view.getUint8(4)}.${view.getUint8(5)}`,
        stc: view.getUint32(6),
        timestamp: this.parseTimestamp(view, 10),
        payloadLength: view.getUint32(19),
        extHeaderLength: view.getUint8(23)
      },
      payload: null
    };

    // 跳过扩展头 (如果有)
    const extHeaderEnd = 24 + this.currentFrame.header.extHeaderLength;
    if (this.cursor < extHeaderEnd) return false;

    this.state = 'PAYLOAD';
    this.buffer = this.buffer.subarray(extHeaderEnd); // 零拷贝切片
    this.cursor -= extHeaderEnd;
    return true;
  }

  parsePayload() {
    const needed = this.currentFrame.header.payloadLength;
    if (this.cursor < needed) return false;

    // 直接引用内存池数据 (零拷贝)
    this.currentFrame.payload = this.buffer.subarray(0, needed);
    this.onFrame(this.currentFrame);

    // 移动到剩余数据
    this.buffer = this.buffer.subarray(needed);
    this.cursor -= needed;
    this.state = 'HEADER';
    return true;
  }

  // 必须由使用者实现
  onFrame(frame) {
    throw new Error("请重写onFrame方法处理完整帧");
  }
}

// --------------------- WebSocket集成 ---------------------
class WsDataStream {
  constructor(url) {
    this.parser = new OptimizedFrameParser();
    this.parser.onFrame = this.handleFrame.bind(this);
    
    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';
    this.ws.onmessage = (e) => this.parser.feed(e.data);
    this.ws.onclose = () => this.parser.free();
  }

  handleFrame(frame) {
    // 实际业务处理 (示例: 打印帧信息)
    console.log(`[Frame] STC: ${frame.header.stc}`, {
      timestamp: frame.header.timestamp,
      payloadSize: frame.payload.length
    });

    // 处理payload中的子体数据
    this.processSubFrames(frame.payload);
  }

  processSubFrames(payload) {
    // 示例: 解析payload中的多个子体
    const view = new DataView(payload.buffer);
    let offset = 0;
    
    while (offset < payload.length) {
      const type = view.getUint8(offset++);
      const length = view.getUint32(offset);
      offset += 4;
      const data = payload.subarray(offset, offset + length);
      offset += length;
      
      console.log(`[SubFrame] Type: ${type}`, data);
    }
  }
}

// --------------------- 使用示例 ---------------------
const stream = new WsDataStream('wss://api.example.com/sensor-data');

