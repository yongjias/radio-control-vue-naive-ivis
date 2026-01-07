// 1. Convert your hex string into a Uint8Array of bytes
function hexToBytes(hex) {
  // split into ['c4','e3','ba','c3'], parse each
  const pairs = hex.match(/.{1,2}/g) || [];
  return new Uint8Array(pairs.map(byte => parseInt(byte, 16)));
}

// 2. Decode with TextDecoder, using the 'gb18030' (or 'gbk') label
function hexToGBK(hex) {
  const bytes = hexToBytes(hex);
  // 'gb18030' covers GBK as well; some engines also accept 'gbk'
  const decoder = new TextDecoder('gb18030');
  return decoder.decode(bytes);
}

function hexToUtf8(hexStr) {
  // decode as UTF-8
  try {
    // 移除可能的空格或前缀（如 0x）
    let hex = hexStr.replace(/\s|0x/g, '');
    
    // 将 Hex 转换为字节数组（Uint8Array）
    const bytes = hexToBytes(hex);

    // fatal: true makes decode() throw on invalid UTF-8
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (e) {
    return 'garbled_text';   // decode failed → garbled/invalid
  }
}

function hexToGBK_filter_EFBFBD(hex) {
  // 将十六进制字符串转换为 Uint8Array
  const raw = hexToBytes(hex)
  // 过滤掉 EFBFBD 字符, “�”(U+FFFD),  这个字符通常表示无法解码的字符
  const filtered = [];
  for (let i = 0; i < raw.length; ) {
    if (
      i + 2 < raw.length &&
      raw[i]   === 0xEF &&
      raw[i+1] === 0xBF &&
      raw[i+2] === 0xBD
    ) {
      i += 3;
    } else {
      filtered.push(raw[i]);
      i++;
    }
  }
  // 3) GBK 解码
  const result = new TextDecoder('gbk').decode(new Uint8Array(filtered));
  return result
}

function isHexString(str) {
  if (typeof str !== 'string' || str.length === 0) return false;
  // 可选：去掉 0x 前缀
  const s = str.startsWith('0x') || str.startsWith('0X') ? str.slice(2) : str;
  if (s.length === 0) return false;
  // 偶数长度校验（可选）
  //if (s.length % 2 !== 0) return false;

  try {
    // 尝试用 BigInt（Node.js 和现代浏览器都支持），会在遇到非 hex 字符时报错
    BigInt('0x' + s);
    return true;
  } catch {
    return false;
  }
}

export { hexToUtf8, hexToGBK, hexToGBK_filter_EFBFBD, isHexString };
// Example:
//const hexString = 'c4e3bac3';  // GBK-encoded "你好"
//console.log(hexToGBK(hexString)); // → "你好"
