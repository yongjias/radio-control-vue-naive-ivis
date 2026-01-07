<template>
  <div class="topleft">
    <MonitorPanel/>
  </div>

  <div class="title text-28" :class="siteStore.iStatus ? 'color-primary' : 'animate-bounce'">
    {{ title }}
  </div>

  <div class="topright text-26 text-primary  bg-#18181c76 rounded-5 px-5">
    <ChooseMap v-if="router.currentRoute.value.name=='Home'"/>
    <GoNorth v-if="router.currentRoute.value.name=='Home'"/>
    <DistanceRuler v-if="router.currentRoute.value.name=='Home'"/>
    <Fullscreen />
    <MapProject />
    <FPS />
    <UserAvatar />
  </div>
</template>

<script setup>
import { Fullscreen, UserAvatar, DistanceRuler, FPS } from '@/layouts/components'
import GoNorth from '@/layouts/components/GoNorth.vue';
import MapProject from '@/layouts/components/MapProject.vue';
import { router } from '@/router'
import { useSiteStore } from '@/store'

const siteStore = useSiteStore()

const title = import.meta.env.VITE_TITLE
  //background: linear-gradient(0deg, transparent 10%, #006a86 50%, transparent 95%);
  //background: linear-gradient(0deg, #18181c 10%, #006a86 50%, #18181c 95%);
  //background: linear-gradient(0deg, #b4b4b4 10%, #05745d 50%, #bbbbbc 95%);
</script>

<style scoped>
.topleft {
  position: absolute;
  display: flex;
  top: 3px;
  left: 7px;
  width: 300px;
  align-items: center;
  justify-content: space-between;
}

.title {
  position: absolute;
  user-select: none;
  top: 0px;
  left: calc(50% - 200px); /* 400 / 2 = 200，避免与动画 transform 冲突 */
  width: 400px;
  height: 50px;
  text-align: center;
  background: linear-gradient(0deg,  #0194bd 5%, #18181c 35%);
  border-radius: 10px 10px 20px 20px;
  box-shadow: 0px 1px 5px 3px #01566e55;
  /* 根据附图实现：左右完全对称的双弯曲，保持左右下角原有弧度形状，适度加宽底边直线 */
  /*
  mask: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 100" preserveAspectRatio="none"><path d="M0 0 C 10 25 25 35 45 50 C 65 65 70 80 65 85 L335 85 C 330 80 335 65 355 50 C 375 35 390 25 400 0 Z" fill="white"/></svg>') center/100% 100% no-repeat;
  */
}

.topright {
  position: absolute;
  display: flex;
  top: 3px;
  right: 5px;
  width: 260px;
  align-items: center;
  justify-content: space-between;
}

</style>