<template>
  <n-tooltip trigger="hover" :style="{ padding:'0px 5px', backgroundColor:'#11111133', color:'DeepSkyBlue' }" >
    <template #trigger>
      <i
        class="cursor-pointer"
        :class="'i-fe:ruler'"
        @click="distance_ruler(cesiumStore.getViewer())"
      />
    </template>
    测距
  </n-tooltip>
</template>

<script setup>
import { useCesiumStore } from '@/store'
import { distance_ruler } from "@/cesium"

const cesiumStore = useCesiumStore();
</script>
