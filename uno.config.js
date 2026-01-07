/**********************************
 * @Author: Ronnie Zhang
 * @LastEditor: Ronnie Zhang
 * @LastEditTime: 2023/12/05 21:30:57
 * @Email: zclzone@outlook.com
 * Copyright © 2023 Ronnie Zhang(大脸怪) | https://isme.top
 **********************************/

import { FileSystemIconLoader } from '@iconify/utils/lib/loader/node-loaders'
import presetRemToPx from '@unocss/preset-rem-to-px'
import { defineConfig, presetAttributify, presetIcons, presetWind3 } from 'unocss'
import { getIcons } from './build'

const icons = getIcons()
export default defineConfig({
  presets: [
    //presetUno(),
    presetWind3(),
    presetAttributify(),
    presetIcons({
      warn: true,
      prefix: 'i-',
      extraProperties: {
        display: 'inline-block',
        width: '1em',
        height: '1em',
      },
      collections: {
        me: FileSystemIconLoader('./src/assets/icons/isme'),
        fe: FileSystemIconLoader('./src/assets/icons/feather'),
      },
    }),
    presetRemToPx({ baseFontSize: 4 }),
  ],
  safelist: icons.map(icon => `${icon} ${icon}?mask`.split(' ')).flat(),
  shortcuts: [
    ['wh-full', 'w-full h-full'],
    ['f-c-c', 'flex justify-center items-center'],
    ['flex-col', 'flex flex-col'],
    ['card-border', 'border border-solid border-light_border dark:border-dark_border'],
    ['card-border1', 'border border-solid border-light_border1 dark:border-dark_border1'],
    ['auto-bg', 'bg-white dark:bg-dark'],
    ['auto-bg1', 'bg1-green dark:bg1-cyan'],
    ['auto-bg1-opc', 'bg1-green-opc dark:bg1-cyan-opc'],
    ['auto-bg1-opc1', 'bg1-green-opc1 dark:bg1-cyan-opc1'],
    ['auto-bg-opc', 'bg-white-opc dark:bg-dark-opc'],
    ['auto-bg-opc1', 'bg-white-opc1 dark:bg-dark-opc1'],
    ['auto-bg-opc2', 'bg-white-opc2 dark:bg-dark-opc2'],
    ['auto-bg-hover', 'hover:bg-#eaf0f1 hover:dark:bg-#1b2429'],
    ['auto-bg-highlight', 'bg-#eaf0f1 dark:bg-#1b2429'],
    ['text-highlight', 'rounded-4 px-8 py-2 auto-bg-highlight'],
  ],
  rules: [
    [
      'bg1-green',
      {
        '--un-bg-opacity': 0.8,
        'background-color': 'rgb(136 146 136 / var(--un-bg-opacity))'
      }
    ],
    [
      'bg1-cyan',
      {
        '--un-bg-opacity': 0.4,
        'background-color': 'rgb(0 113 148 / var(--un-bg-opacity))'
      }
    ],
    [
      'bg1-green-opc',
      {
        '--un-bg-opacity': 0.4,
        'background-color': 'rgb(203 203 201 / var(--un-bg-opacity))'
      }
    ],
    [
      'bg1-cyan-opc',
      {
        '--un-bg-opacity': 0.3,
        'background-color': 'rgb(20 113 168/ var(--un-bg-opacity))'
      }
    ],
    [
      'bg1-green-opc1',
      {
        '--un-bg-opacity': 0.2,
        'background-color': 'rgb(203 203 201 / var(--un-bg-opacity))'
      }
    ],
    [
      'bg1-cyan-opc1',
      {
        '--un-bg-opacity': 0.2,
        'background-color': 'rgb(0 113 238 / var(--un-bg-opacity))'
      }
    ],
    [
      'bg-dark-opc',
      {
        '--un-bg-opacity': 0.4,
        'background-color': 'rgb(0 0 0 / var(--un-bg-opacity))'
      }
    ],
    [
      'bg-white-opc',
      {
        '--un-bg-opacity': 0.5,
        'background-color': 'rgb(255 255 255 / var(--un-bg-opacity))'
      }
    ],
    [
      'bg-dark-opc1',
      {
        '--un-bg-opacity': 0.23,
        'background-color': 'rgb(80 80 80 / var(--un-bg-opacity))'
      }
    ],
    [
      'bg-white-opc1',
      {
        '--un-bg-opacity': 0.3,
        'background-color': 'rgb(255 255 255 / var(--un-bg-opacity))'
      }
    ],
    [
      'bg-dark-opc2',
      {
        '--un-bg-opacity': 0.7,
        'background-color': 'rgb(15 15 15 / var(--un-bg-opacity))'
      }
    ],
    [
      'bg-white-opc2',
      {
        '--un-bg-opacity': 0.8,
        'background-color': 'rgb(255 255 255 / var(--un-bg-opacity))'
      }
    ],
    [
      'border-b-dark_border_gbc',
      {
        'border-image': 'linear-gradient(45deg, #000000, #13DAE9, #000000) 50'
      },
    ],
    [
      'border-b-dark_border_gb',
      {
        'border-image': 'linear-gradient(45deg, #000000, #13DAE9, #000000) 100'
      },
    ],
    [
      'border-t-dark_border_gbc',
      {
        'border-image': 'linear-gradient(45deg, #000000, #13DAE9, #000000) 50'
      },
    ],
    [
      'border-dark_border1',
      {
        '--un-border-opacity': 0.4,
        'border-color': 'rgb(20 218 233 / var(--un-border-opacity))'
      },
    ],
    [
      'border-light_border1',
      {
        '--un-border-opacity': 0.6,
        'border-color': 'rgb(89 139 225 / var(--un-border-opacity))'
      },
    ],
    [
      'card-shadow',
      {
        'box-shadow': '0 1px 2px -2px #00000029, 0 3px 6px #0000001f, 0 5px 12px 4px #00000017'
      },
    ],
  ],
  theme: {
    colors: {
      primary: 'rgba(var(--primary-color))',
      dark: '#18181c',
      light_border: '#efeff5',
      dark_border: '#2d2d30',
    },
  },
})
