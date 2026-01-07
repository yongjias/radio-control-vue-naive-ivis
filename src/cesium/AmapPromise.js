// src/utils/amap-wrapper.js
// Usage:
//   import loadAMap from '@/utils/amap-wrapper'
//   const AMap = await loadAMap({ key: 'YOUR_KEY', plugins: ['ToolBar'] })

let _amapPromise = null

/**
 * 动态加载高德地图 JS API (WebGL/v2)
 * @param {Object} options
 * @param {string} options.key - 高德 Key (required)
 * @param {string[]} [options.plugins] - 插件数组，按需加载（e.g. ['ToolBar','Geocoder']）
 * @param {number} [options.timeout=20000] - 超时时间 ms
 * @param {string} [options.version='2.0'] - API 版本
 * @returns {Promise<any>} resolves to window.AMap
 */
function loadAMap({
  key,
  plugins = [],
  timeout = 20000,
  version = '2.0',
} = {}) {
  if (!key) {
    return Promise.reject(new Error('AMap key is required'))
  }

  // 如果之前已经开始加载或加载完成，直接返回缓存 Promise
  if (_amapPromise) return _amapPromise

  _amapPromise = new Promise((resolve, reject) => {
    // 已经存在全局 AMap（可能静态引入或被其他地方加载过）
    if (window.AMap) {
      return resolve(window.AMap)
    }

    // 构造 script 地址并带 plugin 参数
    const pluginParam = plugins.length ? `&plugin=${encodeURIComponent(plugins.join(','))}` : ''
    const src = `https://webapi.amap.com/maps?v=${encodeURIComponent(version)}&key=${encodeURIComponent(key)}${pluginParam}`

    // 如果想优先下载可以提前插入 <link rel="preload">（可选）
    // const link = document.createElement('link')
    // link.rel = 'preload'
    // link.as = 'script'
    // link.href = src
    // document.head.appendChild(link)

    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.defer = true

    // 加载成功
    script.onload = () => {
      if (window.AMap) {
        resolve(window.AMap)
      } else {
        reject(new Error('AMap loaded but window.AMap is undefined'))
      }
    }

    script.onerror = (ev) => {
      reject(new Error('Failed to load AMap script'))
    }

    // 超时处理（如果超时，移除事件并 reject）
    const timer = setTimeout(() => {
      script.onload = null
      script.onerror = null
      // 选择性移除脚本标签，避免重复请求造成干扰
      if (script.parentNode) script.parentNode.removeChild(script)
      reject(new Error(`AMap load timed out after ${timeout} ms`))
    }, timeout)

    // 在成功或错误时清除超时计时器（确保不会双重 reject）
    const wrapResolve = (val) => {
      clearTimeout(timer)
      resolve(val)
    }
    const wrapReject = (err) => {
      clearTimeout(timer)
      reject(err)
    }

    // 改为使用包装器以确保 timer 被清理
    script.onload = () => {
      if (window.AMap) wrapResolve(window.AMap)
      else wrapReject(new Error('AMap loaded but window.AMap is undefined'))
    }
    script.onerror = (ev) => wrapReject(new Error('Failed to load AMap script'))

    // 将 script 插入到 head（也可以插入 body）
    // 推荐 document.head，因为浏览器会更早开始下载
    document.head.appendChild(script)
  })

  // 返回且缓存 Promise（这样后续调用会复用）
  return _amapPromise
}

export { loadAMap };