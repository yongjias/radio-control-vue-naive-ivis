<template>
  <n-tooltip trigger="hover" :style="{ padding:'0px 5px', backgroundColor:'#11111133', color:'DeepSkyBlue' }" >
    <template #trigger>
      <i
        class="cursor-pointer"
        :class="isFullscreen ? 'i-fe:minimize' : 'i-fe:maximize'"
        @click="toggle"
      />
    </template>
    全屏
  </n-tooltip>
</template>

<script setup>
import { useFullscreen } from '@vueuse/core'

const { isFullscreen, toggle } = useFullscreen()
</script>
