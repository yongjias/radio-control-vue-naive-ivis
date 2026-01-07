
<template>
  <div class="modalIcon">
    <i class=" i-fe:area cursor-pointer" @click="open_pannel" />
    <span class="iconTip">上行数据管理</span>
  </div>
  <div ref="elBox" :style="style" class="box" v-if="iOpen">
    <div ref="elTitle" class="flex justify-between wh-30 text-18 color-gray-300 py-1 px-10 bg-#80808070 cursor-move">
      <span></span>
      <n-flex class="ml-20">上行数据管理</n-flex>
      <div class="i-fe:x text-28 my-auto cursor-default" @click="iOpen=false"></div>
    </div>
    <div class="flex px-10 pt-5 pb-10 justify-between items-center">
      <n-radio-group v-model:value="curOpt" @update:value="reload_record()" size="small">
        <n-radio-button
          v-for="opt in options" :key="opt.value" :value="opt.value" :label="opt.label"/>
      </n-radio-group>
      <div class="flex f-c-c gap-5 text-gray-200" >
        <span>时间范围</span>
        <n-slider v-model:value="timeRange" range :format-tooltip="formatTooltip" 
          :min="tMin" :max="tMax" :step="1000" class="w-315" @dragend="commitTimeRange" />
      </div>
      <n-button size="small" @click="filter_target_area" >
        <i class="i-fe:area-custom text-14" />
        {{ iDragArea ? '取消区域范围' : '设定区域范围' }}
      </n-button>
      <n-select :options="gidOptions" @update:value="filter_gid"
        size="small" class="w-90" :default-value="-1"/>
      <n-button size="small" @click="reload_record(true)" >
        <i class="i-fe:refresh-cw text-14" />
        重载记录
      </n-button>
      <n-button size="small" @click="create_report">
        <i class="i-fe:table text-14" />
        报表生成 
      </n-button>
      <n-button size="small" @click="curOpt === 'result' ? write_result_record() : write_tdoa_record()" >
        <i class="i-fe:download text-14" />
        导出数据
      </n-button>
    </div>
    <NDataTable v-if="curOpt=='result'"
      :bordered="false"
      :loading="loading"
      size="tiny"
      :columns="resultColumns"
      :data="visibleRows"
      :max-height="'50vh'"
      :scroll-x="1500"
      :pagination="pagination"
      :row-class-name="rowClassName"
      v-model:checked-row-keys="lineTargetSelectedKeys"
      @update:checked-row-keys="trigger_lineTarget_selection"
    />
    <NDataTable v-if="curOpt=='tdoa'"
      :bordered="false"
      :loading="loading"
      size="tiny"
      :columns="tdoaColumns"
      :data="visibleRows"
      :max-height="'50vh'"
      :pagination="pagination"
      :row-class-name="rowClassName"
      v-model:checked-row-keys="tdoaTargetSelectedKeys"
      @update:checked-row-keys="trigger_tdoaTarget_selection"
    />
    <div class="flex mt--25 pl-5 pb-5">
      每页显示
      <n-select :options="pageSizeOptions" v-model:value="pagination.pageSize"
        size="tiny" class="w-80 " />
      <n-button size="tiny" class="ml-50" @click="curOpt === 'result' ? upload_result_record() : upload_tdoa_record()" >
        <i class="i-fe:upload text-14" />
        上传离线数据
      </n-button>
    </div>
    <div class="resizeHandle" @pointerdown.stop.prevent="onResizePointerDown" ></div>
  </div>
</template>

<script setup>
import { useAppStore, useSiteStore, useCesiumStore } from '@/store'
import { formatDateTime } from '@/utils';
import { useDraggable } from '@vueuse/core'
import LatLon from 'geodesy/latlon-nvector-spherical.js';         // faster but less accurate
import { del_targets_batch, update_tdoaTarget, update_dfLine_batch, clear_dfLines,
         update_lineTarget_batch, drag_area } from '@/cesium'
import { utils, read, writeFile } from 'xlsx'
import api from '@/api'
import { useRightResizeHandle } from '@/composables'

defineOptions({ name: 'UpwardRecordPanel' })

const iOpen = ref(false);
const elBox = useTemplateRef('elBox');
const elTitle = useTemplateRef('elTitle');  // draggable element on title bar

const { isResizing, width: panelWidth, onResizePointerDown, canStartDrag } = useRightResizeHandle(elBox, {
  minWidth: 750,
  handleSelector: '.resizeHandle',
  cooldownMs: 120,
})
// Position will persist and update
const { style: dragStyle } = useDraggable(elBox, {
  disabled: isResizing,
  preventDefault: true,
  onStart: (_pos, ev) => canStartDrag(ev),
  // with `preventDefault: true`
  // you can disable the native behavior (e.g., for img)
  // and control the drag-and-drop, preventing the browser interference.
  initialValue: { x: window.innerWidth/2 - 500 , y: 225 },
  handle: elTitle,
})
// Merge draggable transform + our persistent width.
const style = computed(() => {
  const base = dragStyle?.value
  const widthStyle = panelWidth.value > 0 ? { width: `${Math.round(panelWidth.value)}px` } : null

  if (!base) return widthStyle || {}
  if (!widthStyle) return base

  // `useDraggable` may return a string style (e.g. "left:...;top:...").
  // Spreading a string creates indexed keys (0,1,2...) and crashes Vue's style patcher.
  if (typeof base === 'string') return [base, widthStyle]
  if (Array.isArray(base)) return [...base, widthStyle]
  if (typeof base === 'object') return { ...base, ...widthStyle }

  return widthStyle
})

const appStore = useAppStore();
const siteStore = useSiteStore();
const cesiumStore = useCesiumStore();

const timeRange = ref([])
let tMin = ref(null)
let tMax = ref(null)
const filterTimeRange = ref([])     // 仅在拖拽结束后用于过滤
const formatTooltip = (value) => {
  return formatDateTime(value)
}

const options = [
  { label: '交叉定位', value: 'result' },
  { label: 'TDOA定位', value: 'tdoa' },
]
const curOpt = ref('result');

const resultTableData = ref([])
const tdoaTableData = ref([])
const loading = ref(true)
const open_pannel = async() => {
  if (iOpen.value) {
    elBox.value.style.left = '150px';
    elBox.value.style.top = '250px';
    return;
  }
  reload_record().then(() => {
    // open panel
    //iOpen.value = true;
  })
}

const timeColumn = reactive({
  title: '定位时间', 
  key: 'time', 
  width: 40, 
  sorter: {
    compare: (a, b) => a.timeMs - b.timeMs,
    multiple: 3
  },
  defaultSortOrder: 'descend',
  className: 'time',
})

// 仅在拖拽结束时提交过滤
const commitTimeRange = (val) => {
  if (timeRange.value?.length === 2) {
    

    filterTimeRange.value = [...timeRange.value]
  } else {
    filterTimeRange.value = null
  }
}

const filter_gid = (gid) => {
  gidColumn.filterOptionValue = gid;
}
const gidOptions = ref([
  {label: '所有组', value:-1},
])
const gidColumn = reactive({
  title: '组',
  key: 'gid',
  width: 10,
  filter: (value, row) => {
    if (value==-1) {
      return true;
    }
    return row.gid==value;
  },
})

const resultColumns = [
  { type: 'selection', width: 5, 
    disabled: () => (appStore.nearView==='上行' || appStore.nearView==='总体' ? false : true) },
  timeColumn,
  gidColumn,
  { title: '站1经度', key: 'site1Lon', width: 27 },
  { title: '站1纬度', key: 'site1Lat', width: 27 },
  { title: '站2经度', key: 'site2Lon', width: 27 },
  { title: '站2纬度', key: 'site2Lat', width: 27 },
  { title: '定位经度', key: 'lon', width: 50 , ellipsis: { tooltip: true } },
  { title: '定位纬度', key: 'lat', width: 50 , ellipsis: { tooltip: true } },
  { title: '测向度1', key: 'angle1', width: 40 , ellipsis: { tooltip: true } },
  { title: '测向度2', key: 'angle2', width: 40 , ellipsis: { tooltip: true } },
]

const tdoaColumns = [
  { type: 'selection', width: 5, 
    disabled: () => (appStore.nearView==='上行' || appStore.nearView==='总体' ? false : true) },
  timeColumn,
  gidColumn,
  { title: '定位经度', key: 'lon', width: 60 },
  { title: '定位纬度', key: 'lat', width: 60 },
  { title: '注释', key: 'note', width: 110 },
]

const iReading = ref(false);
const pageSizeOptions = [
  { label: '100', value: 100 },
  { label: '500', value: 500 },
  { label: '1000', value: 1000 },
]
const pagination = reactive ({
  pageSize: pageSizeOptions[1].value,
  prefix({ itemCount }) {
    if (curOpt.value==='tdoa') {
      return [
        `总:${itemCount}`,
        iReading.value ? h('span', { style: { color: 'darkred' } }, ' (读取...)') : null,
        `, 选择:${tdoaTargetSelectedKeys.value.length}.`
      ]
    } else {
      return [
        `总:${itemCount}`,
        iReading.value ? h('span', { style: { color: 'darkred' } }, ' (读取...)') : null,
        `, 选择:${lineTargetSelectedKeys.value.length}.`
      ]
    }
  }
})

const rowClassName = (row) => {
  const tm = Date.parse(row.time)
  //const today0 = formatDateTime(new Date().setHours(0, 0, 0, 0));
  //const today1 = formatDateTime(new Date().setHours(24, 0, 0, 0));
  //console.log('today:', today0, today1)
  const today0 = (new Date().setHours(0, 0, 0, 0));
  const today1 = (new Date().setHours(24, 0, 0, 0));
  if (tm >= today0 && tm <= today1) {
    return 'today'
  }
  return ''
}

//const sites = Object.values(siteStore.sites).filter(v => v.name.includes('上行'));
const lineTargetSelectedKeys = ref([]);
const lineTargetPreviousKeys = [];
const trigger_lineTarget_selection = (keys, items, meta) => {
  if (appStore.nearView!=='上行' && appStore.nearView!=='总体') {
    return; 
  }
  if (meta.action=='checkAll') {
    lineTargetSelectedKeys.value = resultTableData.value.map(row => row.key);
  } else if (meta.action=='uncheckAll') {
    lineTargetSelectedKeys.value = [];
  }

  const currentSet = new Set(lineTargetSelectedKeys.value);
  const previousSet = new Set(lineTargetPreviousKeys);
  const diffKeys = [];
  
  // 1. 计算差集 (O(N))
  for (const key of currentSet) if (!previousSet.has(key)) diffKeys.push(key);
  for (const key of previousSet) if (!currentSet.has(key)) diffKeys.push(key);

  // 2. 构建查找表 (优先使用当前页 items)
  const lookupMap = new Map();
  for (const item of items) lookupMap.set(item.key, item);
  
  // 3. 找出 items 中没有的 key
  const missingKeys = diffKeys.filter(k => !lookupMap.has(k));
  if (missingKeys.length > 0) {
    const totalData = resultTableData.value;
    const missingLen = missingKeys.length;
    // 4. 智能决策：何时构建全量索引？
    // 只有当缺失的数量非常多（例如超过 500 个），或者缺失数量占总量的比例较大时，才构建索引。
    // 否则，直接遍历查找通常更快，因为 find 是短路查找。
    // 这里的阈值 500 是一个经验值，通常遍历 500 次大数组不会造成明显卡顿，但构建 10万条数据的 Map 会卡顿。
    const shouldBuildIndex = missingLen > 500; 
    if (shouldBuildIndex) {
       // 构建全量索引 (O(N))
       for (const row of totalData) {
         lookupMap.set(row.key, row);
       }
    } else {
       // 少量缺失，直接 find (O(M * N))，但由于 M 很小，通常优于构建索引
       // 优化：如果 missingKeys 很少，直接对每个 key 做 find
       for (const key of missingKeys) {
         const found = totalData.find(r => r.key === key);
         if (found) lookupMap.set(key, found);
       }
    }
  }
  const diffItems = diffKeys.map(key => lookupMap.get(key)).filter(Boolean);
  //console.log(meta.action, lineTargetSelectedKeys.value, lineTargetPreviousKeys, diffKeys, diffItems);

  if (meta.action=='check' || meta.action=='checkAll') {
    // add diffItems
    const lineTargets = [];
    diffItems.forEach(row => {
      const lons = row.lon.split('|').map(a => Number(a));
      const lats = row.lat.split('|').map(a => Number(a));
      const points = lons.map((lon, i) => ({
        lon,
        lat: lats[i],
      }));
      lineTargets.push({ points, time: row.time, gid: row.gid });
    });
    update_lineTarget_batch(lineTargets);
    // add df lines
    const lines = [];
    for (let i=0; i<diffItems.length; i++) {
      const row = diffItems[i];
      lines.push({
        id: row.key,        // 关联线 ID 用于后续删除
        mfids: [row.mfid1, row.mfid2],
        dfLines: [
          row.angle1.split('|').map(a => ({
            angle: Number(a),
            lon: Number(row.site1Lon),
            lat: Number(row.site1Lat),
          })).filter(x => Number.isFinite(x.angle)),
          row.angle2.split('|').map(a => ({
            angle: Number(a),
            lon: Number(row.site2Lon),
            lat: Number(row.site2Lat),
          })).filter(x => Number.isFinite(x.angle)),
        ],
      });
    }
    update_dfLine_batch(lines);
  } else if (meta.action=='uncheck' || meta.action=='uncheckAll') {
    // remove diffItems targets
    const groupIds = [];
    const lineIds = [];
    diffItems.forEach(row => {
      const groupId = 'lineTarget_'+row.gid+'_'+row.time;
      groupIds.push(groupId);
      lineIds.push(row.key);
    })
    del_targets_batch(groupIds);
    // remove df lines
    clear_dfLines(lineIds);
  } 
  lineTargetPreviousKeys.splice(0, lineTargetPreviousKeys.length, ...lineTargetSelectedKeys.value);
}

const tdoaTargetSelectedKeys = ref([]);
const tdoaTargetPreviousKeys = [];
const trigger_tdoaTarget_selection = (keys, items, meta) => {
  if (appStore.nearView!=='上行' && appStore.nearView!=='总体') {
    return; 
  }
  if (meta.action=='checkAll') {
    tdoaTargetSelectedKeys.value = tdoaTableData.value.map(row => row.key);
  } else if (meta.action=='uncheckAll') {
    tdoaTargetSelectedKeys.value = [];
  }

  const currentSet = new Set(tdoaTargetSelectedKeys.value);
  const previousSet = new Set(tdoaTargetPreviousKeys);
  const diffKeys = [];
  
  // 1. 计算差集 (O(N))
  for (const key of currentSet) if (!previousSet.has(key)) diffKeys.push(key);
  for (const key of previousSet) if (!currentSet.has(key)) diffKeys.push(key);

  // 2. 构建查找表 (优先使用当前页 items)
  const lookupMap = new Map();
  for (const item of items) lookupMap.set(item.key, item);
  
  // 3. 找出 items 中没有的 key
  const missingKeys = diffKeys.filter(k => !lookupMap.has(k));
  if (missingKeys.length > 0) {
    const totalData = tdoaTableData.value;
    const missingLen = missingKeys.length;
    // 4. 智能决策：何时构建全量索引？
    // 只有当缺失的数量非常多（例如超过 500 个），或者缺失数量占总量的比例较大时，才构建索引。
    // 否则，直接遍历查找通常更快，因为 find 是短路查找。
    // 这里的阈值 500 是一个经验值，通常遍历 500 次大数组不会造成明显卡顿，但构建 10万条数据的 Map 会卡顿。
    const shouldBuildIndex = missingLen > 500; 
    if (shouldBuildIndex) {
       // 构建全量索引 (O(N))
       for (const row of totalData) {
         lookupMap.set(row.key, row);
       }
    } else {
       // 少量缺失，直接 find (O(M * N))，但由于 M 很小，通常优于构建索引
       // 优化：如果 missingKeys 很少，直接对每个 key 做 find
       for (const key of missingKeys) {
         const found = totalData.find(r => r.key === key);
         if (found) lookupMap.set(key, found);
       }
    }
  }
  const diffItems = diffKeys.map(key => lookupMap.get(key)).filter(Boolean);
  //console.log(meta.action, tdoaTargetSelectedKeys.value, tdoaTargetPreviousKeys, diffKeys, diffItems);

  if (meta.action=='check' || meta.action=='checkAll') {
    // add all targets
    diffItems.forEach(row => {
      const lon = Number(row.lon);
      const lat = Number(row.lat);
      update_tdoaTarget(lon, lat, row.time, row.gid);
    })
  } else if (meta.action=='uncheck' || meta.action=='uncheckAll') {
    // remove all targets
    const groupIds = diffItems.map(row => {
      const groupId = 'tdoaTarget_'+row.gid+'_'+row.time;
      return groupId;
    })
    del_targets_batch(groupIds);
  }
  tdoaTargetPreviousKeys.splice(0, tdoaTargetPreviousKeys.length, ...tdoaTargetSelectedKeys.value);
}

// 公共：将接口记录映射为表格行
function mapRecord(el) {
  if (curOpt.value==='tdoa') {
    const msec = Date.parse(el.time); // 解析 UTC ISO
    const time = new Date(msec).toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-');
    return {
      key:       el.id,
      time:      time,
      timeMs:    msec,
      lon:       el.lon,
      lat:       el.lat,
      note:      el.note,
      gid:       el.gid,
    }
  } else if (curOpt.value==='result') {
    const msec = Date.parse(el.recordTime); // 解析 UTC ISO
    const time = new Date(msec).toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-');
    return {
      key:       el.id,
      time:      time,
      timeMs:    msec,
      lon:       el.lon,
      lat:       el.lat,
      mfid1:     el.mfid1,
      mfid2:     el.mfid2,
      angle1:    el.angle1,
      angle2:    el.angle2,
      site1Lon:  el.site1Lon,
      site1Lat:  el.site1Lat,
      site2Lon:  el.site2Lon,
      site2Lat:  el.site2Lat,
      gid:       el.gid,
    }
  }
}

const remove_filtered = (gids, keys) => {
  // 若不在范围内，移除相关目标
  del_targets_batch(gids);
  if (curOpt.value==='result') {
    // remove df lines
    clear_dfLines(keys);
    lineTargetSelectedKeys.value = lineTargetSelectedKeys.value.filter(key => !keys.includes(key));
    lineTargetPreviousKeys.splice(0, lineTargetPreviousKeys.length, ...lineTargetSelectedKeys.value);
  } else {
    tdoaTargetSelectedKeys.value = tdoaTargetSelectedKeys.value.filter(key => !keys.includes(key));
    tdoaTargetPreviousKeys.splice(0, tdoaTargetPreviousKeys.length, ...tdoaTargetSelectedKeys.value);
  }
}

// 以小批量在下一个帧追加，避免长时间主线程占用
function appendRowsInBatches(loadId, rows, batchSize = 500) {
  let i = 0
  if (curOpt.value==='tdoa') {
    return new Promise(resolve => {
      const step = () => {
        // 若已发起新一轮加载，则中止旧任务
        if (currentLoadId.value !== loadId) return resolve()
        const slice = rows.slice(i, i + batchSize)
        if (slice.length) {
          tdoaTableData.value.push(...slice)   // ✅ 注意展开 push
          i += batchSize
          requestAnimationFrame(step)
        } else {
          resolve()
        }
      }
      requestAnimationFrame(step)
    })
  } else {
    return new Promise(resolve => {
      const step = () => {
        // 若已发起新一轮加载，则中止旧任务
        if (currentLoadId.value !== loadId) return resolve()
        const slice = rows.slice(i, i + batchSize)
        if (slice.length) {
          resultTableData.value.push(...slice)   // ✅ 注意展开 push
          i += batchSize
          requestAnimationFrame(step)
        } else {
          resolve()
        }
      }
      requestAnimationFrame(step)
    })
  }
}

// 后台加载余下块（顺序保证），可根据需要改为有序并发
async function loadRemainingChunks(loadId, fromN, toN) {
  if (curOpt.value==='tdoa') {
    for (let n = fromN; n <= toN; n++) {
      if (currentLoadId.value !== loadId) return
      const resp = await api.tdoa_getNthChunkOfAll({
        n,
        chunkSize: pagination.pageSize,
        order: 'DESC',
      })
      const records = resp.data || []
      if (records.length) {
        const mapped = records.map(mapRecord)
        await appendRowsInBatches(loadId, mapped)
        // 更新时间范围
        timeRange.value[0] = Date.parse(tdoaTableData.value[tdoaTableData.value.length - 1].time)
        tMin.value = timeRange.value[0]
        commitTimeRange();
      }
    }
    if (currentLoadId.value === loadId) {
      update_gidOptions();  // 完成后更新组选项
      iReading.value = false;
    }
  } else {
    for (let n = fromN; n <= toN; n++) {
      if (currentLoadId.value !== loadId) return
      const resp = await api.upward_getNthChunkOfAll({
        n,
        chunkSize: pagination.pageSize,
        order: 'DESC',
      })
      const records = resp.data || []
      if (records.length) {
        const mapped = records.map(mapRecord)
        await appendRowsInBatches(loadId, mapped)
        // 更新时间范围
        timeRange.value[0] = Date.parse(resultTableData.value[resultTableData.value.length - 1].time)
        tMin.value = timeRange.value[0]
        commitTimeRange();
      }
    }
    if (currentLoadId.value === loadId) {
      update_gidOptions();  // 完成后更新组选项
      iReading.value = false;
    }
  }
}

// 用于取消旧的加载任务
const currentLoadId = ref(0)
const reload_record = async (iForce=false) => {
  iOpen.value = true; //  打开面板
  let loadId = null;
  let recordResp = null;
  if (curOpt.value==='tdoa') {
    // 若非强制刷新，且已有数据则不重复加载
    if (!iForce && tdoaTableData.value.length>0) {
      timeRange.value = [Date.parse(tdoaTableData.value[tdoaTableData.value.length - 1].time), Date.parse(tdoaTableData.value[0].time)]
      tMin.value = timeRange.value[0]
      tMax.value = timeRange.value[1]
      commitTimeRange();
      return;
    }
    loadId = ++currentLoadId.value
    loading.value = true
    iReading.value = true;

    // 首块：带 total 的接口，优先渲染首屏
    recordResp = await api.tdoa_getNthChunkOfAllWithMeta({
      n: 1,
      chunkSize: pagination.pageSize,
      order: 'DESC',
    })
    const first = recordResp.data.data || []
    if (first.length) {
      tdoaTableData.value = first.map(mapRecord)   // ✅ 直接替换首屏数据
      // 设置时间范围
      timeRange.value = [Date.parse(first[first.length - 1].time), Date.parse(first[0].time)]
      tMin.value = timeRange.value[0]
      tMax.value = timeRange.value[1]
      commitTimeRange();
    } else {
      tdoaTableData.value = []
    }
    // 清空选择
    lineTargetSelectedKeys.value = [];
    lineTargetPreviousKeys.splice(0, lineTargetPreviousKeys.length);
  } else {
    // 若非强制刷新，且已有数据则不重复加载
    if (!iForce && resultTableData.value.length>0) {
      timeRange.value = [Date.parse(resultTableData.value[resultTableData.value.length - 1].time), Date.parse(resultTableData.value[0].time)]
      tMin.value = timeRange.value[0]
      tMax.value = timeRange.value[1]
      commitTimeRange();
      return;
    }
    loadId = ++currentLoadId.value
    loading.value = true
    iReading.value = true;

    // 首块：带 total 的接口，优先渲染首屏
    recordResp = await api.upward_getNthChunkOfAllWithMeta({
      n: 1,
      chunkSize: pagination.pageSize,
      order: 'DESC',
    })
    const first = recordResp.data.data || []
    if (first.length) {
      resultTableData.value = first.map(mapRecord)   // ✅ 直接替换首屏数据
      // 设置时间范围
      timeRange.value = [Date.parse(first[first.length - 1].recordTime), Date.parse(first[0].recordTime)]
      tMin.value = timeRange.value[0]
      tMax.value = timeRange.value[1]
      commitTimeRange();
    } else {
      resultTableData.value = []
    }
    // 清空选择
    lineTargetSelectedKeys.value = [];
    lineTargetPreviousKeys.splice(0, lineTargetPreviousKeys.length);
  }
  const total = recordResp.data.total || 0
  //pagination.itemCount = total  // remote模式起作用
  loading.value = false

  // 余下块后台增量加载（不阻塞）
  const nChunks = Math.ceil(total / pagination.pageSize)
  if (nChunks > 1) {
    // 不 await，后台进行
    loadRemainingChunks(loadId, 2, nChunks)
  } else {
    update_gidOptions();  // 完成后更新小区选项
    iReading.value = false;
  }
}

const update_gidOptions = () => {
  // update gid options
  if (curOpt.value==='tdoa') {
    gidOptions.value = [
      {label: '所有组', value:-1},
      ...Array.from(new Set(tdoaTableData.value.map(el => el.gid))).map(el => ({
        label: el, value: el
      })),
    ]
  } else {
    gidOptions.value = [
      {label: '所有组', value:-1},
      ...Array.from(new Set(resultTableData.value.map(el => el.gid))).map(el => ({
        label: el, value: el
      })),
    ]
  }
}

// 统一的“可见行”计算（仅此处做过滤）
const visibleRows = computed(() => {
  let rows = curOpt.value === 'tdoa' ? tdoaTableData.value : resultTableData.value

  const removed_selected_keys = [];
  const removed_selected_gids = [];
  // 时间过滤
  if (Array.isArray(filterTimeRange.value) && filterTimeRange.value.length === 2) {
    const start = Math.min(filterTimeRange.value[0], filterTimeRange.value[1])
    const end   = Math.max(filterTimeRange.value[0], filterTimeRange.value[1])
    rows = rows.filter(r => {
      const tm = r.timeMs ?? Date.parse(r.time)
      const iOk = tm >= start && tm <= end
      if (!iOk) {
        // 记录被移除的选中项
        if (curOpt.value==='tdoa') {
          if (tdoaTargetSelectedKeys.value.includes(r.key)) {
            removed_selected_keys.push(r.key);
            removed_selected_gids.push('tdoaTarget_' + r.gid + '_' + r.time);
          }
        } else {
          if (lineTargetSelectedKeys.value.includes(r.key)) {
            removed_selected_keys.push(r.key);
            removed_selected_gids.push('lineTarget_' + r.gid + '_' + r.time);
          }
        }
      }
      return iOk
    })
  }

  // 区域过滤
  if (Array.isArray(areaFilter.lons) && areaFilter.lons.length >= 3) {
    if (curOpt.value==='tdoa') {
      rows = rows.filter(r => {
        if(pointInPolygon(Number(r.lon), Number(r.lat), areaFilter.lons, areaFilter.lats)) {
          return true;
        }
        // 记录被移除的选中项
        if (tdoaTargetSelectedKeys.value.includes(r.key)) {
          removed_selected_keys.push(r.key);
          removed_selected_gids.push('tdoaTarget_' + r.gid + '_' + r.time);
        }
        return false;
      })
    } else {
      // 交叉定位多点
      rows = rows.filter(r => {
        const lons = r.lon.split('|').map(a => Number(a));
        const lats = r.lat.split('|').map(a => Number(a));
        for (let i=0; i<lons.length; i++) {
          if (pointInPolygon(lons[i], lats[i], areaFilter.lons, areaFilter.lats)) {
            return true;
          }
        }
        // 记录被移除的选中项
        if (lineTargetSelectedKeys.value.includes(r.key)) {
          removed_selected_keys.push(r.key);
          removed_selected_gids.push('lineTarget_' + r.gid + '_' + r.time);
        }
        return false;
      })
    }
  }

  // 移除相关选中目标
  if (removed_selected_keys.length > 0) {
    remove_filtered(removed_selected_gids, removed_selected_keys);
  }

  return rows
})

const update_tableByArea_LATLON = (lons, lats) => {
  if (lons.length > 0) {
    // filtered by dragged area
    let polygon = []
    for ( let i=0; i<lons.length; i++ ) {
        polygon.push(new LatLon(lats[i], lons[i]))
    }

    // filter tableData by area
    if (curOpt.value==='tdoa') {
      keysInArea.value = tdoaTableData.value.filter(el => {
        const lon = Number(el.lon);
        const lat = Number(el.lat);
        let loc = new LatLon(lat, lon)
        return loc.isEnclosedBy(polygon);
      }).map(el => el.key);
    } else {
      keysInArea.value = resultTableData.value.filter(el => {
        const lons = el.lon.split('|').map(a => Number(a));
        const lats = el.lat.split('|').map(a => Number(a));
        for (let i=0; i<lons.length; i++) {
          let loc = new LatLon(lats[i], lons[i])
          if (loc.isEnclosedBy(polygon)) {
            return true;
          }
        }
        return false;
      }).map(el => el.key);
    }
  } 
}

const update_tableByArea = (lons, lats) => {
  if (lons.length > 0) {
    if (lons.length > 0 && lons.length === lats.length) {
      areaFilter.lons = [...lons]
      areaFilter.lats = [...lats] // 触发过滤
    }
  }
}

// Ray-casting algorithm for point-in-polygon on lon/lat plane
function pointInPolygon(lon, lat, polyLons, polyLats) {
  let inside = false;
  for (let i = 0, j = polyLons.length - 1; i < polyLons.length; j = i++) {
    const xi = polyLons[i], yi = polyLats[i];
    const xj = polyLons[j], yj = polyLats[j];
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lon < (xj - xi) * (lat - yi) / (yj - yi + 0.0) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// 过滤区域选择
const areaFilter = reactive({ lons: [], lats: []}); 
let iDragArea = ref(false);
const filter_target_area = () => {
  // draw a polygon for area selection
  drag_area(update_tableByArea, iDragArea.value)
  iDragArea.value = !iDragArea.value;
  if (!iDragArea.value) {
    // clear area filter
    areaFilter.lons = []
    areaFilter.lats = [] // ← 清空区域，触发过滤恢复
  }
}

const write_result_record = () => {
  if (!resultTableData.value?.length)
    return $message.warning('没有记录')
  const columnsData = resultColumns.filter(item => !!item.title)
  const thKeys = columnsData.map(item => item.key)
  const thData = columnsData.map(item => item.title)
  const trData = resultTableData.value.map(item => thKeys.map(key => item[key]))
  const sheet = utils.aoa_to_sheet([thData, ...trData])
  
  // 设置列宽度
  const colWidths = thKeys.map(key => {
    // 根据不同的列设置不同的宽度
    switch(key) {
      case 'taskId': return { wch: 10 }      // 任务ID列宽度
      case 'time': return { wch: 25 }        // 时间列宽度
      case 'lon': return { wch: 25 }         // 交叉定位经度列宽度
      case 'lat': return { wch: 25 }         // 交叉定位纬度列宽度
      case 'angle1': return { wch: 25 }      // 设备1测向列宽度
      case 'angle2': return { wch: 25 }      // 设备2测向列宽度
      case 'site1Lon': return { wch: 25 }    // 设备1经度列宽度
      case 'site1Lat': return { wch: 25 }    // 设备1纬度列宽度
      case 'site2Lon': return { wch: 25 }    // 设备2经度列宽度
      case 'site2Lat': return { wch: 25 }    // 设备2纬度列宽度
      case 'gid': return { wch: 4 }          // 组列宽度
      default: return { wch: 20 }            // 默认列宽度
    }
  })
  sheet['!cols'] = colWidths
  
  const workBook = utils.book_new()
  utils.book_append_sheet(workBook, sheet, '上行记录报表')
  const time = new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-').replace(/\ /g, 'T');
  writeFile(workBook, `上行记录报表_${time}.xlsx`)
}

const write_tdoa_record = () => {
  if (!tdoaTableData.value?.length)
    return $message.warning('没有记录')
  const columnsData = tdoaColumns.filter(item => !!item.title)
  const thKeys = columnsData.map(item => item.key)
  const thData = columnsData.map(item => item.title)
  const trData = tdoaTableData.value.map(item => thKeys.map(key => item[key]))
  const sheet = utils.aoa_to_sheet([thData, ...trData])
  
  // 设置列宽度
  const colWidths = thKeys.map(key => {
    // 根据不同的列设置不同的宽度
    switch(key) {
      case 'taskId': return { wch: 10 }      // 任务ID列宽度
      case 'time': return { wch: 25 }        // 时间列宽度
      case 'lon': return { wch: 25 }         // 交叉定位经度列宽度
      case 'lat': return { wch: 25 }         // 交叉定位纬度列宽度
      case 'angle1': return { wch: 25 }      // 设备1测向列宽度
      case 'angle2': return { wch: 25 }      // 设备2测向列宽度
      case 'site1Lon': return { wch: 25 }    // 设备1经度列宽度
      case 'site1Lat': return { wch: 25 }    // 设备1纬度列宽度
      case 'site2Lon': return { wch: 25 }    // 设备2经度列宽度
      case 'site2Lat': return { wch: 25 }    // 设备2纬度列宽度
      case 'gid': return { wch: 4 }          // 组列宽度
      default: return { wch: 20 }            // 默认列宽度
    }
  })
  sheet['!cols'] = colWidths
  
  const workBook = utils.book_new()
  utils.book_append_sheet(workBook, sheet, 'TDOA记录报表')
  const time = new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-').replace(/\ /g, 'T');
  writeFile(workBook, `TDOA记录报表_${time}.xlsx`)
}

const upload_result_record = () => {
  // 1. 动态创建 input 元素
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx, .xls, .csv'; // 限制文件类型
  input.style.display = 'none';

  // 2. 监听文件选择
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      loading.value = true; // 显示加载状态
      const data = await file.arrayBuffer();
      const workbook = read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      // 检查必要的列是否存在 (简单的校验)
      if (firstSheetName !== '站点测向定位记录') {
        $message.error('没有找到"站点测向定位记录"工作表');
        loading.value = false;
        return;
      }
      const worksheet = workbook.Sheets[firstSheetName];
      
      // defval: '' 保证空单元格也有 key，方便处理
      const jsonData = utils.sheet_to_json(worksheet, { defval: '' });

      if (jsonData.length === 0) {
        $message.warning('文件内容为空');
        loading.value = false;
        return;
      }

      // 检查必要的列是否存在 (简单的校验)
      if (!('目标经纬度' in jsonData[0])) {
        $message.error('文件格式错误：缺少"目标经纬度"列');
        loading.value = false;
        return;
      }

      // 3. 映射数据
      let records = jsonData.map(el => {
        const [lon, lat] = el['目标经纬度'].split(',').map(s => s.trim());
        const [lon1, lat1] = el['经纬度'].split(',').map(s => s.trim());
        const [lon2, lat2] = el['经纬度_1'].split(',').map(s => s.trim());
        return {
          recordTime: el['时间'], 
          lon: lon,
          lat: lat,
          site1Lon: lon1,
          site1Lat: lat1,
          site2Lon: lon2,
          site2Lat: lat2,
          angle1: el['角度'],
          angle2: el['角度_1'],
          gid: el['组'] ? el['组'] : 1, // 默认组 1
          note: '',
        }
      });
      
      // 4. 调用 API
      const resp = await api.upward_bulk_create(records);
      if (resp.data === true) {
        $message.success(`成功导入 ${records.length} 条交叉定位记录`);
        reload_record(true); // 刷新列表
      } else {
        $message.error('导入失败');
      }
    } catch (error) {
      console.error(error);
      $message.error('文件解析或上传出错');
    } finally {
      loading.value = false;
      input.value = ''; // 清空，允许重复选择同名文件
    }
  };

  // 触发点击
  document.body.appendChild(input);
  input.click();
  document.body.removeChild(input);
}

const upload_tdoa_record = () => {
  // 1. 动态创建 input 元素
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx, .xls, .csv'; // 限制文件类型
  input.style.display = 'none';

  // 2. 监听文件选择
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      loading.value = true; // 显示加载状态
      const data = await file.arrayBuffer();
      const workbook = read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      // 检查必要的列是否存在 (简单的校验)
      if (firstSheetName !== '站点TDOA定位记录') {
        $message.error('没有找到"站点TDOA定位记录"工作表');
        loading.value = false;
        return;
      }
      const worksheet = workbook.Sheets[firstSheetName];
      
      // defval: '' 保证空单元格也有 key，方便处理
      const jsonData = utils.sheet_to_json(worksheet, { defval: '' });

      if (jsonData.length === 0) {
        $message.warning('文件内容为空');
        loading.value = false;
        return;
      }

      // 检查必要的列是否存在 (简单的校验)
      if (!('目标经纬度' in jsonData[0])) {
        $message.error('文件格式错误：缺少"目标经纬度"列');
        loading.value = false;
        return;
      }

      // 3. 映射数据
      let records = jsonData.map(el => {
        const [lon, lat] = el['目标经纬度'].split(',').map(s => s.trim());
        return {
          time: el['时间'], 
          lon: lon,
          lat: lat,
          gid: el['组'] ? el['组'] : 1, // 默认组 1
          note: '',
        }
      });
      
      // 4. 调用 API
      const resp = await api.tdoa_bulk_create(records);
      if (resp.data === true) {
        $message.success(`成功导入 ${records.length} 条TDOA定位记录`);
        reload_record(true); // 刷新列表
      } else {
        $message.error('导入失败');
      }
    } catch (error) {
      console.error(error);
      $message.error('文件解析或上传出错');
    } finally {
      loading.value = false;
      input.value = ''; // 清空，允许重复选择同名文件
    }
  };

  // 触发点击
  document.body.appendChild(input);
  input.click();
  document.body.removeChild(input);
}

const create_report = async () => {
  const pad = n => String(n).padStart(2, '0');
  const formatCN = ms => {
    const d = new Date(ms);
    return `${d.getFullYear()}年${pad(d.getMonth() + 1)}月${pad(d.getDate())}日${pad(d.getHours())}时${pad(d.getMinutes())}分`;
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  // 任务名称：优先用过滤值，否则占位
  const taskName = '上行设备定位任务';

  // 监测时间：用滑块 timeRange
  const [startMs, endMs] = (timeRange.value?.length ?? 0)
    ? [Math.min(...timeRange.value), Math.max(...timeRange.value)]
    : [Date.now(), Date.now()];

  // 监测地点：按 mfid 去重（无 mfid 时退回 hexId），经纬度用蜂窝中心
  const devices = Object.values(siteStore.sites).filter(v => v.name.includes('上行')).map((v, i) => ({
    idx: i + 1,
    name: v.name,
    lon: Number(v.lon).toFixed(4),
    lat: Number(v.lat).toFixed(4),
  }));

  // 监测结果：前1000条选择的记录作为示例数据
  const selectedFirst1KResult = lineTargetSelectedKeys.value.slice(0, 1000);
  const selectedResult = resultTableData.value.filter(row => selectedFirst1KResult.includes(row.key));
  const lastResult = selectedResult[selectedResult.length - 1] || null;
  const selectedFirst1KTdoa = tdoaTargetSelectedKeys.value.slice(0, 1000);
  const selectedTdoa = tdoaTableData.value.filter(row => selectedFirst1KTdoa.includes(row.key));
  const lastTdoa = selectedTdoa[selectedTdoa.length - 1] || null;
  const resultRows = [
    {
      idx: 1,
      content: '交叉定位',
      result: lastResult ? '定位成功' : '无定位数据',
      data: lastResult ? `定位坐标：${Number(lastResult.lon).toFixed(4)},${Number(lastResult.lat).toFixed(4)}` : '—',
    },
    {
      idx: 2,
      content: 'TDOA定位',
      result: lastTdoa ? '定位成功' : '无定位数据',
      data: lastTdoa ? `定位坐标：${Number(lastTdoa.lon).toFixed(4)},${Number(lastTdoa.lat).toFixed(4)}` : '—',
    },
  ];

  // 五：监测数据Result, TDOA（使用页面列定义与当前表格数据）
  const columnsTdoa = tdoaColumns.filter(col => !!col.title); // 忽略 selection 列
  const thKeysTdoa = columnsTdoa.map(col => col.key);
  const thTitlesTdoa = columnsTdoa.map(col => col.title);
  const tdoaTableHtml = `
    <table>
      <thead>
        <tr>${thTitlesTdoa.map(t => `<th>${esc(t)}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${selectedTdoa.map(row => `
          <tr>${thKeysTdoa.map(k => {
            let v = row[k];
            if (Array.isArray(v)) v = v.join(',');     // 展开数组
            return `<td>${esc(v)}</td>`;
          }).join('')}</tr>
        `).join('')}
      </tbody>
    </table>
  `;
  
  const columnsResult = resultColumns.filter(col => !!col.title); // 忽略 selection 列
  const thKeysResult = columnsResult.map(col => col.key);
  const thTitlesResult = columnsResult.map(col => col.title);
  const resultTableHtml = `
    <table>
      <thead>
        <tr>${thTitlesResult.map(t => `<th>${esc(t)}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${selectedResult.map(row => `
            <tr>${thKeysResult.map(k => {
              let v = row[k];
              if (Array.isArray(v)) v = v.join(',');     // 展开数组
              return `<td>${esc(v)}</td>`;
            }).join('')}</tr>
          `).join('')}
      </tbody>
    </table>
  `;

  // 获取 Cesium 截图（base64）
  // ✅ 在 postRender 里抓图，避免黑屏
  const getCesiumShot = () => new Promise(resolve => {
    try {
      const v = cesiumStore.getViewer?.() ?? cesiumStore.viewer;
      const scene = v?.scene;
      if (!scene) return resolve(null);
      const remove = scene.postRender.addEventListener(() => {
        try {
          const url = scene.canvas.toDataURL('image/png');
          resolve(url);
        } catch (e) {
          resolve(null);
        } finally {
          remove();
        }
      });
      scene.requestRender?.();
    } catch (e) {
      resolve(null);
    }
  });

  const shot = await getCesiumShot();

  const html = `
<!doctype html><html><head><meta charset="utf-8">
<title>监测报告</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,'Helvetica Neue',Arial,'Noto Sans',sans-serif;color:#222;padding:24px;}
  h2{margin:0 0 12px;}
  .sec{margin:14px 0 18px;}
  table{border-collapse:collapse;width:100%;margin-top:8px;}
  th,td{border:1px solid #999;padding:6px 10px;text-align:left;vertical-align:top;}
  th{background:#f2f2f2;}
</style></head><body>
  <div class="sec"><h2>一：任务名称：${esc(taskName)}</h2></div>
  <div class="sec"><h2>二：监测时间</h2>
    <div>${esc(formatCN(startMs))} – ${esc(formatCN(endMs))}</div>
  </div>
  <div class="sec"><h2>三：监测地点</h2>
    <table>
      <thead><tr><th>编号</th><th>设备名称</th><th>经纬度</th></tr></thead>
      <tbody>
        ${devices.length
          ? devices.map(d => `<tr><td>${d.idx}</td><td>${esc(d.name)}</td><td>${d.lon},${d.lat}</td></tr>`).join('')
          : '<tr><td>1</td><td>下行设备一</td><td>—</td></tr>'}
      </tbody>
    </table>
  </div>
  <div class="sec"><h2>四：监测结果</h2>
    <table>
      <thead><tr><th>编号</th><th>内容</th><th>结果</th><th>数据</th></tr></thead>
      <tbody>
        ${resultRows.map(r => `<tr><td>${r.idx}</td><td>${esc(r.content)}</td><td>${esc(r.result)}</td><td>${esc(r.data)}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>
  <div class="sec"><h2>五：监测数据-TDOA</h2>
    ${tdoaTableHtml}
  </div>
  <div class="sec"><h2>五：监测数据-交叉定位</h2>
    ${resultTableHtml}
  </div>
  <div class="sec"><h2>六：监测截图</h2>
    ${shot ? `<img class="shot" src="${shot}" alt="监测截图">` : '<div>暂无截图</div>'}
  </div>
</body></html>`;

  const w = window.open('', '_blank');
  if (w) {
    w.document.write(html);
    w.document.close();
    w.focus();
  } else {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `监测报告_${ts}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

</script>

<style scoped>
.box {
  width: 1200px;
  background-color: #1d1d1bcc;
  border-radius: 5px 5px 10px 10px;
  font-size: 14px;
  align-items: center;
  justify-content: center;
  user-select: none;
  position: fixed;
}
.resizeHandle {
  position: absolute;
  top: 0;
  right: -3px;
  width: 3px;
  height: 100%;
  touch-action: none;
  z-index: 10;
}
.resizeHandle:hover {
  cursor: ew-resize;
  background-color: #b66858aa;
  border-radius: 0px 10px 10px 0px;
}
.iconTip {
  visibility: hidden; /* Hide the tooltip text by default */
  position: absolute;
  text-align: center;
  left: 5%;
  transform: translateX(110%);
  font-size: 16px;
  color: CYAN;
  opacity: 0;
  transition: opacity 0.3s;
  z-index: 1;
}
.modalIcon {
  position: relative;
}
.modalIcon:hover {
  background-color: #18181c55;
  border-radius: 20px 20px;
}
.modalIcon:hover .iconTip {
  visibility: visible; /* Show the tooltip on hover */
  opacity: 1; /* Make the tooltip visible */
  mix-blend-mode: screen;
}
:deep(.n-data-table table) {
  background-color: #1d2e4c00 !important;
  padding: 1px 5px !important;
}
:deep(.n-data-table td) {
  background-color: #18181800 !important;
  padding: 1px 1px !important;
  border-bottom: 1px solid #442a2a !important;
}
:deep(.n-data-table thead) {
  background-color: #18181800 !important;
}
:deep(.n-data-table th) {
  font-size: small !important;
  padding: 1px 3px !important;
  background-color: #18181800 !important;
  border-top: 1px solid #000500aa !important;
  border-bottom: 1px solid #000500aa !important;
}
:deep(.today .time) {
  color: #ff7733 !important;
}

</style>