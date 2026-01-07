
<template>
  <div class="modalIcon">
    <i :class="`i-fe:alert-octagon cursor-pointer`" @click="iOpen = !iOpen" />
    <span class="iconTip">监测预警</span>
  </div>

  <div ref="elBox" :style="style" class="box" v-if="iOpen">
    <div ref="elTitle" class="flex text-20 color-primary f-c-c py-10 cursor-move justify-between" style="border-bottom: 1px solid #7f363f72;">
      <span/>
      监测预警
      <div class="i-fe:x text-22 my-auto mr-3 cursor-default" @click="iOpen=false"></div>
    </div>
    <div class="flex justify-between px-50 pt-30">
        <div class="text-#f3bc3f text-16">
          下行设备预警选项: 
        </div>
        <n-checkbox size="small" v-model:checked="siteStore.iWarningSID">
          <span class="text-blue-3">SID</span>
        </n-checkbox>
    </div>
    <n-divider />
    <div class="flex justify-between px-50 pb-30">
        <div class="text-#f3bc3f text-16">
          上行设备预警选项: 
        </div>
        <n-checkbox size="small" v-model:checked="siteStore.iWarningResult">
          <span class="text-blue-3">测向定位</span>
        </n-checkbox>
        <n-checkbox size="small" v-model:checked="siteStore.iWarningTdoa">
          <span class="text-blue-3">TDOA定位</span>
        </n-checkbox>
    </div>
    <!--
    <n-divider />
    <div class="flex justify-between px-50 pb-30">
        <div class="text-#f3bc3f text-16">
          自动生成报表文件: 
        </div>
        <n-checkbox size="small" v-model:checked="siteStore.iWarningAutoOutput">
          <span class="text-blue-3">生成报表</span>
        </n-checkbox>
    </div>
    -->
  </div>

</template>

<script setup>
import { useSiteStore  } from '@/store'
import { useDraggable } from '@vueuse/core'

defineOptions({ name: 'WarningPanel' })

const iOpen = ref(false);
const elBox = useTemplateRef('elBox');
const elTitle = useTemplateRef('elTitle');  // draggable element on title bar

// Position will persist and update
const { style } = useDraggable(elBox, {
  preventDefault: true,
  // with `preventDefault: true`
  // you can disable the native behavior (e.g., for img)
  // and control the drag-and-drop, preventing the browser interference.
  initialValue: { x: window.innerWidth/2 - 256 , y: window.innerHeight/2 - 185 },
  handle: elTitle,
})

const siteStore = useSiteStore();

</script>

<style scoped>
.box {
  width: 512px;
  background-color: #1d1d1b;
  border-radius: 5px 5px 10px 10px;
  font-size: 14px;
  align-items: center;
  justify-content: center;
  user-select: none;
  position: fixed;
}
.modalIcon {
  position: relative;
}
.iconTip {
  visibility: hidden; /* Hide the tooltip text by default */
  text-align: center;
  position: absolute;
  left: 5%;
  transform: translateX(110%);
  font-size: 16px;
  color: CYAN;
  opacity: 1;
  transition: opacity 0.3s;
  z-index: 1;
}
.modalIcon:hover {
  background-color: #18181c33;
  border-radius: 25px 25px;
}
.modalIcon:hover .iconTip {
  visibility: visible; /* Show the tooltip on hover */
  opacity: 1; /* Make the tooltip visible */
  mix-blend-mode: screen;
}

/* default is around 8px; shrink it to 4px: */
:deep(.n-slider-marks) {
  transform: translateY(-12px) !important;
}
</style>