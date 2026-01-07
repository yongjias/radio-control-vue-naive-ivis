
const decoderTxt = new TextDecoder('utf-8');
const decode_stream_downward = (data) => {
  const utf8String = decoderTxt.decode(data);
  
  return JSON.parse(utf8String);
}

const decode_stream_upward = (data) => {
  const utf8String = decoderTxt.decode(data);
  
  return utf8String;
}

const decode_stream_SglFreqDF = (dat, minQuality) => {
  const uint8Array = new Uint8Array(dat);
  const data = new DataView(uint8Array.buffer);
  let compass = null;  // 电子罗盘正北偏角, unit: 0.1deg
  const bearings = [];
  const levels = [];
  let offset = 0
  // frame payload   ----------
  // 'true' for little-endian
  while (offset < data.byteLength) {
    if (data.byteLength - offset < 5) {
      console.log('data length too short, offset', offset, data.byteLength)
      break;  // 数据长度不够, 退出
    }

    let dt = data.getUint8(offset, true);        // dt: 9 (SglFreqDF)
    offset += 1 
    let dl = data.getInt32(offset, true);        // dl, data length
    offset += 4
    //console.log('dtdl', dt, dl, dl+5)  //debug: 显示子体类型和长度, dl+5: total length of this frame
    if (dt == 9) {     // 9：单频测向
      let dfCode = data.getUint8(offset, true);    // 测向体制代码
      offset += 1 
      let cFrq = data.getFloat64(offset, true);    // 中心频率
      offset += 8
      let dfNum = data.getUint8(offset, true);     // 示向度个数
      offset += 1 
      //console.log('dfCode, cFrq, dfNum',dfCode, cFrq, dfNum);
      //const dfQtys = [];
      for (let i=0; i<dfNum; i++) {
        let bearing = data.getUint16(offset, true) * 0.1;        // 示向度, 正北为0->3600, unit:0.1deg
        if (compass !== null) {
          bearing = (bearing + compass) % 360;
        }
        offset += 2
        let level = data.getInt16(offset, true) * 0.1 - 107;     // 电平, unit: 0.1 dBuv, convert to dBm
        offset += 2
        let pitch = data.getInt16(offset, true) * 0.1;           // 俯仰角, unit: 0.1deg, range:-900->900
        offset += 2
        let dfQty = data.getUint8(offset, true);                 // 测向质量, range: 1->99
        offset += 1 
        //console.log(pitch, bearing, level, dfQty)
        if (Math.abs(pitch)<30 && dfQty>=minQuality) {
          bearings.push(bearing);
          levels.push(level);
          //dfQtys.push(dfQty);
        }
      }
    } else if (dt == 29) { // 电子罗盘
      compass = data.getInt16(offset, true) * 0.1;             // 正北偏角, unit: 0.1deg
      compass = compass % 360;
      compass = compass < 0 ? compass+360 : compass;
      //console.log('compass', compass)
      offset += 8   // skip 磁偏角, 俯仰角, 横滚角
    } else { // 不是SglFreqDF数据, 也不是电子罗盘
      offset += dl;  // 不是SglFreqDF数据, 跳过
      //console.log('not SglFreqDF, offset', offset)
    }
  }

  return [bearings, levels];
  //return [bearings, levels, dfQtys];
  
}

const decode_stream_spectrum_simple = (dat) => {
  const uint8Array = new Uint8Array(dat);
  const data = new DataView(uint8Array.buffer);
  let offset = 0
  let sFrq = data.getFloat64(offset, true);  // 'true' for little-endian,  start frequency Hz
  offset += 8
  let step = data.getFloat32(offset, true);  // step, Hz
  offset += 4
  let num = data.getUint32(offset, true);    // current number of frequencies, equal nFrq
  offset += 4
  //console.log(sFrq, step, num)

  let spec = []
  for(let i=0; i<num; i++) {
    spec.push((data.getInt16(offset, true) * 0.01 ) + 107)  // 0.01dBm to dBuv
    offset += 2
  }

  return [spec, sFrq*1e-6, step*1e-6]  // MHz
}

function decode_stream_mscan_simple(dat) {
  const uint8Array = new Uint8Array(dat);
  const data = new DataView(uint8Array.buffer);
  let offset = 0
  let num = data.getUint16(offset, true);    // 'true' for little-endian, frequency number
  offset += 2
  const frq = []
  for(let i=0; i<num; i++) {
    frq.push(data.getFloat64(offset, true)*1e-6);  // frequency Hz->MHz
    offset += 8
  }
  const lvl = []
  for(let i=0; i<num; i++) {
    lvl.push((data.getInt16(offset, true) * 0.01 ) + 107)  // 0.01dBm to dBuv
    offset += 2
  }

  return [num, frq, lvl]
}

function decode_stream_audio_simple(dat) {
  const uint8Array = new Uint8Array(dat);
  const data = new DataView(uint8Array.buffer);

  return new Int16Array(dat, 4)  // 16-bit PCM
}

export {decode_stream_downward, decode_stream_upward, decode_stream_SglFreqDF, 
  decode_stream_spectrum_simple, decode_stream_mscan_simple, decode_stream_audio_simple}