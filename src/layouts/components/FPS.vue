<template >
  <n-tooltip trigger="hover" :style="{ padding:'0px 5px', backgroundColor:'#11111133', color:'DeepSkyBlue' }" >
    <template #trigger>
      <i class="cursor-pointer i-fe:eye-tracking" @click="cesiumStore.toggleFPS" />
    </template>
    FPS
  </n-tooltip>
</template>

<script setup>
import { useCesiumStore } from '@/store'

const cesiumStore = useCesiumStore();
</script>
