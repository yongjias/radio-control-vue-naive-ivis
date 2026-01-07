<template >
  <n-tooltip trigger="hover" :style="{ padding:'0px 5px', backgroundColor:'#11111133', color:'DeepSkyBlue' }" >
    <template #trigger>
      <i class="cursor-pointer" 
        :class="cesiumStore.i3D ? 'i-fe:globe' : 'i-fe:grid'" @click="switch_earth" />
    </template>
    地球2/3D
  </n-tooltip>
</template>

<script setup>
import { useCesiumStore } from '@/store'

const cesiumStore = useCesiumStore();

const duration = 0.1;

// 确保回调在 2D/3D morph 完成后执行（一次性监听，避免堆积）
let morphOnce = null;
const runAfterMorphComplete = (viewer, fn) => {
  if (!viewer?.scene?.morphComplete) {
    fn?.();
    return;
  }

  // 若上一次点击还没完成，先移除旧的一次性监听
  if (morphOnce) {
    try { viewer.scene.morphComplete.removeEventListener(morphOnce); } catch (_) {}
    morphOnce = null;
  }

  morphOnce = () => {
    try { viewer.scene.morphComplete.removeEventListener(morphOnce); } catch (_) {}
    morphOnce = null;

    // morphComplete 触发时内部状态仍可能在收尾，延迟到下一帧更稳
    requestAnimationFrame(() => {
      try {
        fn?.();
      } catch (err) {
        console.error('runAfterMorphComplete callback failed:', err);
      }
      viewer?.scene?.requestRender?.();
    });
  };
  viewer.scene.morphComplete.addEventListener(morphOnce);
}

const switch_earth = () => {
  cesiumStore.i3D = !cesiumStore.i3D;
  const viewer = cesiumStore.getViewer();
  if (!viewer) return;

  // setSatView 依赖 i3D，确保在 morph 结束后再设置相机
  runAfterMorphComplete(viewer, () => cesiumStore.setSatView());
  if ( cesiumStore.i3D ) {
    viewer.scene.morphTo3D(duration);
  } else {
    viewer.scene.morphTo2D(duration);
  }
  //viewer.scene.requestRender();
}
</script>
