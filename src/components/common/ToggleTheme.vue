<template>
  <n-tooltip trigger="hover" :style="{ padding:'0px 5px', backgroundColor:'#11111111', color:'DeepSkyBlue' }" >
    <template #trigger>
      <i
        class="ml-6 mr-10 cursor-pointer color-primary"
        :class="isDark ? 'i-fe:moon' : 'i-fe:sun'"
        @click="toggleDark"
      />
    </template>
    明暗主题
  </n-tooltip>
</template>

<script setup>
import * as Cesium from 'cesium';
import { useAppStore } from '@/store'
import { useDark, useToggle } from '@vueuse/core'
import { useCesiumStore } from '@/store';

const appStore = useAppStore()
const isDark = useDark()
const cesiumStore = useCesiumStore();
async function toggleDark() {
  appStore.toggleDark()
  useToggle(isDark)()
  isDark.value ?
    cesiumStore.getViewer().scene.backgroundColor = Cesium.Color.BLACK :
    cesiumStore.getViewer().scene.backgroundColor = Cesium.Color.WHITE
}
</script>
