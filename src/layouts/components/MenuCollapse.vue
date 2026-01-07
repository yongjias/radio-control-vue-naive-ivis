<!--------------------------------
 - @Author: Ronnie Zhang
 - @LastEditor: Ronnie Zhang
 - @LastEditTime: 2023/12/16 18:50:18
 - @Email: zclzone@outlook.com
 - Copyright © 2023 Ronnie Zhang(大脸怪) | https://isme.top
 --------------------------------->

<template>
  <n-tooltip trigger="hover" :style="{ padding:'0px 5px', backgroundColor:'#13131355', color:'skyblue' }" >
    <template #trigger>
      <div
        class="f-c-c cursor-pointer rounded-4 text-24 transition-all-300 auto-bg-hover color-primary"
        @click="appStore.switchCollapsed"
      >
        <i :class="siteStore.iStatus ? (appStore.collapsed ? 'i-line-md-menu-unfold-left' : 'i-line-md-menu-fold-left') : (appStore.collapsed ? 'i-line-md-menu-unfold-left color-red' : 'i-line-md-menu-fold-left color-red')" />
      </div>
    </template>
    台站监控台
  </n-tooltip>

</template>

<script setup>
import { useAppStore, useSiteStore } from '@/store'

const appStore = useAppStore()
const siteStore = useSiteStore()
      //<i :class="appStore.collapsed ? 'i-line-md-menu-unfold-left' : 'i-line-md-menu-fold-left'" />
</script>
