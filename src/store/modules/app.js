/**********************************
 * @Author: Ronnie Zhang
 * @LastEditor: Ronnie Zhang
 * @LastEditTime: 2023/12/05 21:25:31
 * @Email: zclzone@outlook.com
 * Copyright © 2023 Ronnie Zhang(大脸怪) | https://isme.top
 **********************************/

import { defaultLayout, defaultPrimaryColor, naiveThemeOverrides } from '@/settings'
import { generate, getRgbStr } from '@arco-design/color'
import { defineStore } from 'pinia'

export const useAppStore = defineStore('app', {
  state: () => ({
    iFarView: true,
    nearView: null,
    collapsed: false,
    split: ['200px', '0px'],
    layout: defaultLayout,
    primaryColor: defaultPrimaryColor,
    naiveThemeOverrides,
  }),
  actions: {
    switchCollapsed() {
      this.collapsed = !this.collapsed
    },
    switchSplit() {
      this.split.reverse()
    },
    setCollapsed(b) {
      this.collapsed = b
    },
    setLayout(v) {
      this.layout = v
    },
    setPrimaryColor(color) {
      this.primaryColor = color
    },
    setThemeColor(color = this.primaryColor ) {
      const colors = generate(color, {
        list: true,
        dark: true,
      })
      document.body.style.setProperty('--primary-color', getRgbStr(colors[5]))
      this.naiveThemeOverrides.common = Object.assign(this.naiveThemeOverrides.common || {}, {
        primaryColor: colors[5],
        primaryColorHover: colors[4],
        primaryColorSuppl: colors[4],
        primaryColorPressed: colors[6],
      })
    },
  },
  persist: {
    paths: ['collapsed', 'layout', 'primaryColor', 'naiveThemeOverrides'],
    storage: sessionStorage,
  },
})
