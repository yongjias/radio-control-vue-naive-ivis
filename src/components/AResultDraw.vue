<template>
  <transition @after-enter="draw_chart" @after-leave="draw_clean" >
    <div ref="elBox" :style="style" class="box" v-if="iAResultOpen">
      <div ref="elTitle" class="flex justify-between wh-30 text-18 color-primary py-1 px-10 auto-bg1-opc1 cursor-move">
        <span></span>
        <n-flex>{{ siteName }}</n-flex>
        <div class="i-fe:x text-28 my-auto cursor-default" @click="close"></div>
      </div>
      <div id="spectrum_chart" style="width: 100%; height: 160px;" class="f-c-c text-20 color-blueGray">
        掉线
      </div>
      <div class="flex h-25 f-c-c justify-around pt-5">
        <n-checkbox @update:checked="filter_str" size="small" >
          <span class="text-blue-3">过滤空解码</span>
        </n-checkbox>
        <n-select :options="devOptions" @update:value="filter_dev" 
          size="tiny" class="w-110 auto-bg1-opc1" :default-value="-1"/>
        <n-select :options="freqOptions" @update:value="filter_freq" @update:show="update_freq"
          size="tiny" class="w-110 auto-bg1-opc1" :default-value="0"/>
      </div>
      <NDataTable
        :bordered="false"
        size="tiny"
        :columns="decodedColumn"
        :data="decodedMsg"
        :style="{ height: `calc(100% - 215px)`}"
        :scroll-x="1500"
        flex-height
        :row-class-name="rowClassName"
      />
      <div
        class="resize-handle"
        @mousedown.prevent="startResize"
      ></div>
    </div>
  </transition>

</template>

<script setup>
import { useSiteStore } from '@/store'
import { echartsMonitorActive } from '@/utils'
import { useDraggable } from '@vueuse/core'
import { DevType } from '@/settings'

defineOptions({ name: 'AResultDraw' })

const siteStore = useSiteStore()

const iAResultOpen = defineModel('iAResultOpen')

const elBox = useTemplateRef('elBox');
const elTitle = useTemplateRef('elTitle');  // draggable element on title bar
const height = ref(400);
// Position will persist and update
const { x, y, style: dragStyle } = useDraggable(elBox, {
  preventDefault: true,
  // with `preventDefault: true`
  // you can disable the native behavior (e.g., for img)
  // and control the drag-and-drop, preventing the browser interference.
  initialValue: { x: window.innerWidth/2 - 325 , y: window.innerHeight/2 - 250 },
  handle: elTitle,
})

// Attach pointerdown on whole box to detect pseudo resize handle drag
const style = computed(()=>dragStyle.value+';height:'+height.value+'px');

let resizeStartY = 0
let startHeight = 0

function startResize(e) {
  resizeStartY = e.clientY
  startHeight = height.value

  window.addEventListener('mousemove', onResize)
  window.addEventListener('mouseup', stopResize)
}

function onResize(e) {
  const dy = e.clientY - resizeStartY
  height.value = Math.max(50, startHeight + dy) // minimum height 50px
}

function stopResize() {
  window.removeEventListener('mousemove', onResize)
  window.removeEventListener('mouseup', stopResize)
}

const decodedMsg = ref([]);
let siteName = ref('监听');
let unwatch1 = null;
let unwatch2 = null;
let cancelEchart = null;
const draw_chart = () => {
  //console.log(siteStore.loraDecoded[siteStore.pickedLora])
  siteName.value = '监听 - ' + siteStore.sites[siteStore.pickedLora].name;
  unwatch1 = watch(() => siteStore.loraDecoded[siteStore.pickedLora], () => {
    if (siteStore.loraDecoded[siteStore.pickedLora] && siteStore.sites[siteStore.pickedLora].status > 0 ) {
      decodedMsg.value.push({
        time: siteStore.loraDecoded[siteStore.pickedLora].time ,
        frq: siteStore.loraDecoded[siteStore.pickedLora].freq ,
        snr: siteStore.loraDecoded[siteStore.pickedLora].snr ,
        pow: siteStore.loraDecoded[siteStore.pickedLora].pow,
        devType: siteStore.loraDecoded[siteStore.pickedLora].devType,
        str: siteStore.loraDecoded[siteStore.pickedLora].str
      })
      decodedMsg.value = decodedMsg.value.filter((item, index) => {
      let oldest = new Date().setHours(0, 0, 0, 0);
      return (Date.parse(item.time) >= oldest); 
    }).sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
    }
  }, { deep: true, immediate: true })
  // echartsMonitorActive
  unwatch2 = watch(() => siteStore.sites[siteStore.pickedLora].status, () => {
    if (siteStore.sites[siteStore.pickedLora].status > 0 ) {
      if (!cancelEchart) {
        cancelEchart = echartsMonitorActive('spectrum_chart');
      }
    } else {
      if (cancelEchart) {
        cancelEchart();
        cancelEchart = null;
      }
    } 
  }, { deep: true, immediate: true })
}

const devOptions = [
  {label: '所有设备', value: -1},
  ...Object.entries(DevType).map(([key, val]) => {
    return {
      label: val,
      value: Number.parseInt(key),
    }
  })
]

const freqOptions = ref([
  {label: '所有频率', value:0},
])

const filter_str = (iFilter) => {
  if (iFilter) {
    strColumn.filterOptionValue = 2
  } else {
    strColumn.filterOptionValue = null
  }
}
const strColumn = reactive({
  title: '信息',
  key: 'str',
  minWidth: 210,
  maxWidth: 500, 
  filter(value, row) {
    return row.str.length>=value;
  }
})
const filter_dev = (val) => {
  if (val == -1) {
    devColumn.filterOptionValue = null
  } else {
    devColumn.filterOptionValue = val
  }
}
const devColumn = reactive({
  title: '设备',
  key: 'devType',
  width: 110,
  filter(value, row) {
    return row.devType.includes(DevType[value]);
  }
})
const filter_freq = (val) => {
  if (val == 0) {
    freqColumn.filterOptionValue = null
  } else {
    freqColumn.filterOptionValue = val
  }
}
const update_freq = () => {
  freqOptions.value = [
    {label: '所有频率', value:0},
    ...Array.from(new Set(decodedMsg.value.map(el=>el.frq))).map(el=>({
      label: el,
      value: Number.parseFloat(el),
    })),
  ]
}
const freqColumn = reactive({
  title: '频率',
  key: 'frq',
  width: 75,
  className: 'freq',
  sorter: 'default',
  filter(value, row) {
    return row.frq==value;
  }
})
const decodedColumn = [
  { title: '时间', key: 'time', width: 155, className: 'time', sorter: 'default', defaultSortOrder: 'descend'},
  freqColumn,
  { title: '信噪比', key: 'snr', width: 45},
  { title: '功率', key: 'pow', width: 40},
  devColumn,
  strColumn,
]

const rowClassName = (row) => {
  const tm = Date.parse(row.time)
  //const today0 = formatDateTime(new Date().setHours(0, 0, 0, 0));
  //const today1 = formatDateTime(new Date().setHours(24, 0, 0, 0));
  //console.log('today:', today0, today1)
  const len = decodedMsg.value.length;
  if (len < 2) {
    if ( Date.now() - tm < 60000 ) {
      return 'new'
    } else {
      return ''
    }
  } else {
    if (Date.now() - tm < 60000 && tm > Date.parse(decodedMsg.value[len-2].time)) { // latest record
      return 'new'
    } else {
      return ''
    }
  }
}

const close = () => {
  decodedMsg.value.length = 0;
  iAResultOpen.value = false;
}

const draw_clean = () => {
  decodedMsg.value.length = 0;
  if (unwatch1) {
    unwatch1();        // 取消draw_chart中的watch监听
    unwatch1 = null;
  }
  if (unwatch2) {
    unwatch2();        // 取消draw_chart中的watch监听
    unwatch2 = null;
  }
  if (cancelEchart) {
    cancelEchart();   // 取消echartsMonitorActive中的setInterval调用
    cancelEchart = null;
  }
}

</script>

<style scoped>
.box {
  width: 600px;
  background-color: #1a1a1aee;
  border-radius: 5px 5px 10px 10px;
  align-items: center;
  justify-content: center;
  user-select: none;
  position: absolute;
  z-index: 1;
}
/* Resize handle at bottom */
.resize-handle {
  height: 3px;
  background: #1ab9;
  cursor: ns-resize;
  border-radius: 5px 5px 30px 30px;
  width: 98%;
  margin: auto;
}
.v-enter-from,
.v-leave-to {
  opacity: 0;
}
.v-enter-active,
.v-leave-active {
  transition: opacity 0.3s ease;
}
:deep(.n-data-table table) {
  background-color: #1d2e4c00 !important;
}
:deep(.n-data-table td) {
  background-color: #18181800 !important;
  padding: 1px 3px !important;
  border-bottom: 1px solid #442a2a !important;
}
:deep(.n-data-table thead) {
  background-color: #18181877 !important;
}
:deep(.n-data-table th) {
  font-size: small !important;
  padding: 1px 3px !important;
  background-color: #18181800 !important;
}
@keyframes flicker {
  0%, 100% {
    opacity: 1;
    color: #f1cfe3; /* Full color (e.g., yellow) */
  }
  50% {
    opacity: 1;
    color: #ff5cb3; /* Slightly darker color to enhance flicker effect */
  }
}
:deep(.new td) {
  animation: flicker 3.0s infinite; /* Duration and repeat settings */
}
:deep(.new .freq) {
  color: rgba(222, 244, 26, 0.979) !important;
}
</style>