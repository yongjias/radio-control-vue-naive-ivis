
<template>
  <div class="bg-#18181c76 mr-5 rounded-15 border-cyan-700 border-1">
    <n-button style="padding: 0px 8px; font-size: 15px;" size="medium" round
      @click="switch_farView" :type="appStore.iFarView ? 'info' : 'default'" >深空视角
    </n-button>
  </div>
  <div class="bg-#18181c76 rounded-5 border-cyan-700 border-1">
    <n-button v-for="func in nearOptions" :key="func.value" :value="func.value" size="medium"
      style="padding: 0px 5px; font-size: 15px;" @click="trigger_nearView(func.value)" 
      :type="appStore.nearView === func.value ? 'primary' : 'default'"
    >
      {{ func.label }}
    </n-button>
  </div>
</template>

<script setup>
import { useAppStore, useCesiumStore } from '@/store'

defineOptions({ name: 'MonitorPanel' })

const appStore = useAppStore();
const cesiumStore = useCesiumStore();

const nearOptions = [
  { label: '总体态势', value: '总体' },
  { label: '下行态势', value: '下行' },
  { label: '上行态势', value: '上行' },
];

const switch_farView = () => {
  appStore.iFarView = !appStore.iFarView;
  cesiumStore.setView();
}

const trigger_nearView = (value) => {
  if (appStore.nearView === value) {
    appStore.nearView = null;
  } else {
    appStore.nearView = value;
  }
  cesiumStore.setView();
}

onMounted(() => {
  setTimeout(() => {
    cesiumStore.setView();
  }, 500);
})

</script>
