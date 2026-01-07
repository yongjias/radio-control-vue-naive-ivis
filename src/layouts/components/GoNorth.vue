<template >
  <n-tooltip trigger="hover" :style="{ padding:'0px 5px', backgroundColor:'#11111133', color:'DeepSkyBlue'}" >
    <template #trigger>
      <i
        class="cursor-pointer "
        :class="'i-fe:compassn'"
        @click="cesiumStore.go_north_up()"
      />
    </template>
    指北针
  </n-tooltip>
</template>

<script setup>
import { useCesiumStore } from '@/store'

const cesiumStore = useCesiumStore();
</script>
