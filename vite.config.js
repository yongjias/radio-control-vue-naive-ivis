/**********************************
 * @Author: Ronnie Zhang
 * @LastEditor: Ronnie Zhang
 * @LastEditTime: 2023/12/05 21:31:02
 * @Email: zclzone@outlook.com
 * Copyright © 2023 Ronnie Zhang(大脸怪) | https://isme.top
 **********************************/

import path from 'node:path'
import Vue from '@vitejs/plugin-vue'
import Unocss from 'unocss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers'
import Components from 'unplugin-vue-components/vite'
import { defineConfig, loadEnv } from 'vite'
import cesium from 'vite-plugin-cesium'
import removeNoMatch from 'vite-plugin-router-warn'
import { pluginIcons, pluginPagePathes } from './build/plugin-isme'

export default defineConfig(({ mode, command }) => {
  const viteEnv = loadEnv(mode, process.cwd())
  const { VITE_PUBLIC_PATH, VITE_PROXY_TARGET } = viteEnv

  return {
    base: VITE_PUBLIC_PATH || '/',
    plugins: [
      Vue(),
      cesium(),
      Unocss(),
      AutoImport({
        imports: ['vue', 'vue-router'],
        dts: false,
      }),
      Components({
        resolvers: [NaiveUiResolver()],
        dts: false,
      }),
      // 自定义插件，用于生成页面文件的path，并添加到虚拟模块
      pluginPagePathes(),
      // 自定义插件，用于生成自定义icon，并添加到虚拟模块
      pluginIcons(),
      // 移除非必要的vue-router动态路由警告: No match found for location with path
      removeNoMatch(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), 'src'),
        '~': path.resolve(process.cwd()),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3200,
      open: false,
      proxy: {
        '/api': {
          target: VITE_PROXY_TARGET,
          changeOrigin: true,
          rewrite: path => path.replace(/^\/api/, ''),
          secure: false,
          configure: (proxy, options) => {
            // 配置此项可在响应头中看到请求的真实地址
            proxy.on('proxyRes', (proxyRes, req, res) => {
              proxyRes.headers['x-real-url'] = new URL(req.url || '', options.target)?.href || ''
            })
          },
        },
        //'/SRRC': {
        //  target: 'http://172.19.195.37:8001', // 后端服务实际地址
        //  changeOrigin: true,                    //开启代理
        //},
        '/AGISONLINE': {
          target: 'https://server.arcgisonline.com', // 后端服务实际地址
          changeOrigin: true,                         //开启代理
          rewrite: p => p.replace(/^\/AGISONLINE/, ''),   // ✅ 去掉前缀
          //secure: false,
        },
        '/GDMAP': {
          target: 'https://webrd01.is.autonavi.com', // 后端服务实际地址
          changeOrigin: true,                         //开启代理
          rewrite: p => p.replace(/^\/GDMAP/, ''),   // ✅ 去掉前缀
          //secure: false,
        },
        '/TDT': {
          target: 'http://t0.tianditu.gov.cn', // 后端服务实际地址
          changeOrigin: true,                         //开启代理
          rewrite: p => p.replace(/^\/TDT/, ''),   // ✅ 去掉前缀
        },
      },
    },
    build: {
      sourcemap: false,
      chunkSizeWarningLimit: 1024, // chunk 大小警告的限制（单位kb）
    },
    esbuild: {
      drop: command === 'build' ? ['console', 'debugger'] : [] , // drops console.log, console.info, etc.
    },
  }
})
