
<template>
  <div class="modalIcon" disabled>
    <i class="i-fe:hex-outline cursor-pointer" @click="open_panel"/>
    <span class="iconTip">下行数据管理</span>
  </div>
  <div ref="elBox" :style="style" class="box" v-if="iOpen">
    <div ref="elTitle" class="flex justify-between wh-30 text-18 color-gray-300 py-1 px-10 bg-#80808070 cursor-move">
      <span></span>
      <n-flex class="ml-20">下行数据管理</n-flex>
      <div class="i-fe:x text-28 my-auto cursor-default" @click="close_panel"></div>
    </div>
    <div class="flex px-10 pt-5 pb-10 justify-between items-center">
      <div class="flex f-c-c" >
        任务装载
        <n-select :options="taskOptions" @update:value="load_tasks" :max-tag-count="1"
          size="tiny" class="w-120" v-model:value="loadTasks" multiple/>
        <n-checkbox @update:checked="load_tasks_all" v-model:checked="iLoadTasksAll">全部</n-checkbox>
      </div>
      <div class="flex f-c-c gap-5 text-gray-200" >
        <span>时间范围</span>
        <n-slider v-model:value="timeRange" range :format-tooltip="formatTooltip" 
          :min="tMin" :max="tMax" :step="1000" class="w-300" @dragend="commitTimeRange" />
      </div>
      <n-button size="small" @click="filter_hex_area" >
        <i class="i-fe:area-custom text-14" />
        {{ iDragArea ? '取消区域范围' : '设定区域范围' }}
      </n-button>
      <n-select :options="curTaskOptions" v-model:value="curTaskFilter"
        size="tiny" class="w-105" :default-value="-1"/>
      <n-select :options="hexIdOptions" v-model:value="curHexFilter"
        size="tiny" class="w-105" :default-value="-1"/>
      <n-input @change="update_idSatFilter" size="tiny" 
        placeholder="选择卫星" style="width: 80px" />
      <n-select :options="devIdOptions" size="tiny" 
        class="w-80" :default-value="'A'"/>
    </div>
    <NDataTable
      :bordered="false"
      :loading="loading"
      size="tiny"
      :columns="columns"
      :data="visibleRows"
      :max-height="'50vh'"
      :pagination="pagination"
      :scroll-x="1500"
      :row-class-name="rowClassName"
      v-model:checked-row-keys="selectedKeys"
      @update:checked-row-keys="trigger_downward_selection"
    />
    <div class="flex mt--25 pl-5 pb-5 gap-10 ">
      每页
      <n-select :options="pageSizeOptions" v-model:value="pagination.pageSize"
        size="tiny" class="w-75 " />
      <n-button size="tiny" @click="tableData=[]; load_records(loadTasks)" >
        <i class="i-fe:refresh-cw text-14" />
        重载记录
      </n-button>
      <n-button size="tiny" @click="create_report" >
        <i class="i-fe:table text-14" />
        报表生成 
      </n-button>
      <n-button size="tiny" @click="write_record" >
        <i class="i-fe:download text-14" />
        导出数据
      </n-button>
    </div>
    <div class="resizeHandle" @pointerdown.stop.prevent="onResizePointerDown" ></div>
  </div>
</template>

<script setup>
import { useAppStore, useSiteStore, useCesiumStore } from '@/store'
import { formatDateTime } from '@/utils';
import { useDraggable } from '@vueuse/core'
import { update_hex_batch, remove_hex_batch, drag_area } from '@/cesium'
import { utils, writeFile } from 'xlsx'
import { MAX_COLOR_IDX } from '@/constants';
import api from '@/api'
import { useRightResizeHandle } from '@/composables'

defineOptions({ name: 'DownwardRecordPanel' })

const iOpen = ref(false);
const elBox = useTemplateRef('elBox');
const elTitle = useTemplateRef('elTitle');  // draggable element on title bar

const { isResizing, width: panelWidth, onResizePointerDown, canStartDrag } = useRightResizeHandle(elBox, {
  minWidth: 875,
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
  initialValue: { x: window.innerWidth/2 - 500 , y: 215 },
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

// 时间过滤
const timeRange = ref([])
let tMin = ref(null)
let tMax = ref(null)
const filterTimeRange = ref([])     // 仅在拖拽结束后用于过滤
const formatTooltip = (value) => {
  return formatDateTime(value)
}

const tableData = ref([])
const loading = ref(true)
const open_panel = async() => {
  if (iOpen.value) {
    elBox.value.style.left = '150px';
    elBox.value.style.top = '250px';
    return;
  }
  const taskIds = await api.downward_getAllTaskId();
  if (taskIds.data.length > 0) {
    taskOptions.value = taskIds.data.map(el=>({
      label: el,
      value: el,
    }));
    if (loadTasks.value.length === 0) {
      loadTasks.value = [taskOptions.value[0].value];     // 默认选择最新的任务， DESC 排序
    } else if (tableData.value.length > 0) {
      iOpen.value = true;
      return; // 已加载数据，无需重复加载
    }
    load_records(loadTasks.value);
  }
}

const close_panel = () => {
  iOpen.value = false;
}

const timeColumn = reactive({
  title: '更新时间',
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

const curHexFilter = ref(-1) // -1 表示不过滤
const hexIdOptions = ref([
  {label: '所有小区', value:-1},
])
const hexIdColumn = reactive({
  title: '小区',
  key: 'hexId',
  width: 20,
  sorter: {
    compare: (a, b) => a.hexId - b.hexId,
    multiple: 1
  },
})

const devIdOptions = [
  { label: '设备A', value: 'A' },
]

const update_idSatFilter = (val) => {
  curIdSatFilter.value = val.trim();
}
const curIdSatFilter = ref('') // -1 表示不过滤
const idSatColumn = reactive({
  title: '卫星',
  key: 'idSat',
  width: 15,
  sorter: {
    compare: (a, b) => a.idSat - b.idSat,
    multiple: 1
  },
})

const columns = [
  { type: 'selection', width: 5, 
    disabled: () => (appStore.nearView==='下行' || appStore.nearView==='总体' ? false : true) },
  timeColumn,
  { title: '任务', key: 'taskId', width: 15 },
  hexIdColumn,
  idSatColumn,
  { title: '卫星经度', key: 'satLon', width: 40 },
  { title: '卫星纬度', key: 'satLat', width: 40 },
  { title: '卫星高度', key: 'satHgt', width: 20 },
  { title: '星上时间', key: 'satTime', width: 40 },
  { title: '上信道', key: 'chUL', width: 15},
  { title: '下信道', key: 'chDL', width: 15},
  { title: '波束中心经度', key: 'hexLon', width: 40 },
  { title: '波束中心纬度', key: 'hexLat', width: 40 },
  { title: 'SID', key: 'SID', width: 80, ellipsis: { tooltip: true } },
]

const readingCount = ref(0);
const iReading = computed(() => readingCount.value > 0);
const pageSizeOptions = [
  { label: '500', value: 500 },
  { label: '1000', value: 1000 },
]
const pagination = reactive ({
  pageSize: pageSizeOptions[0].value,
  prefix({ itemCount }) {
    return [
      `总:${itemCount}`,
      iReading.value ? h('span', { style: { color: 'darkred' } }, ' (读取...)') : null,
      `, 选择:${selectedKeys.value.length}.`
    ]
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

const loadTasks = ref([]);
const taskOptions = ref([])
const load_tasks = (taskIds) => {
  // taskIds 是 n-select 的 v-model:value，已经是最新的选择列表
  if (iLoadTasksAll && taskIds.length < taskOptions.value.length) {
    iLoadTasksAll.value = false;
  }
  // loadTasks.value 还是旧值（Vue 会在此函数后更新它）
  const oldTasks = loadTasks.value || [];
  const newTasks = taskIds || [];
  
  const taskIdsAdd = newTasks.filter(el => !oldTasks.includes(el));
  const taskIdsRemove = oldTasks.filter(el => !newTasks.includes(el));
  
  //console.log('load_tasks:', 'add:', taskIdsAdd, 'remove:', taskIdsRemove);
  
  // 移除已删除任务的记录
  if (taskIdsRemove.length > 0) {
    tableData.value = tableData.value.filter(el => !taskIdsRemove.includes(el.taskId));
    // 更新时间范围
    if (tableData.value.length > 0) {
      const times = tableData.value.map(r => r.timeMs);
      tMin.value = Math.min(...times);
      tMax.value = Math.max(...times);
      timeRange.value = [tMin.value, tMax.value];
      commitTimeRange();
    }
    update_hexIdOptions();
  }
  
  // 增量加载新增任务的记录
  if (taskIdsAdd.length > 0) {
    // 传入 true 表示追加
    load_records(taskIdsAdd, true);
  }
}
const iLoadTasksAll = ref(false);
const load_tasks_all = (checked) => {
  if (checked) {
    const allTaskIds = taskOptions.value.map(el => el.value);
    load_tasks(allTaskIds);
    loadTasks.value = allTaskIds;
  } else {
    loadTasks.value = [];
    tableData.value = [];
  }
}

const curTaskFilter = ref(-1) // -1 表示不过滤
const curTaskOptions = computed(() => {
  // 更新任务过滤选项
  const options = [
    {label: '所有任务', value:-1},
    ...loadTasks.value.map(el=>({
      label: el,
      value: el,
    })),
  ]
  return options;
})

const update_tableByAreaLatLon = (lons, lats) => {
  if (lons.length > 0) {
    // filtered by dragged area
    let polygon = []
    for ( let i=0; i<lons.length; i++ ) {
        polygon.push(new LatLon(lats[i], lons[i]))
    }

    // filter tableData by area
    tableData.value = tableData.value.filter(el => {
      let loc = new LatLon(el.hexLat, el.hexLon)
      return loc.isEnclosedBy(polygon)
    })
  } 
}

const update_tableByArea = (lons, lats) => {
  if (lons.length > 0) {
    if (lons.length > 0 && lons.length === lats.length) {
      areaFilter.lons = [...lons]
      areaFilter.lats = [...lats] // 触发过滤
      buildAreaTester();
    }
  }
}

//let hexMap = new Map();  // 当前已添加的小区映射
// 过滤区域选择
const areaFilter = reactive({ lons: [], lats: []}); 
let iDragArea = ref(false);
const filter_hex_area = () => {
  // draw a polygon for area selection
  drag_area(update_tableByArea, iDragArea.value)
  iDragArea.value = !iDragArea.value;
  if (!iDragArea.value) {
    // clear area filter
    areaFilter.lons = []
    areaFilter.lats = [] // ← 清空区域，触发过滤恢复
    buildAreaTester();
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

// 构建高效的点在多边形内判定器（偶奇规则）
function createPolygonTester(polyLons, polyLats) {
  const n = Math.min(polyLons.length, polyLats.length)
  if (n < 3) return null

  // 预计算包围盒
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let i = 0; i < n; i++) {
    const x = +polyLons[i], y = +polyLats[i]
    if (x < minX) minX = x; if (y < minY) minY = y
    if (x > maxX) maxX = x; if (y > maxY) maxY = y
  }

  // 预计算边：跳过水平边，存 yMin/yMax/xAtYMin/slope(dx/dy)
  const edges = []
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = +polyLons[i], yi = +polyLats[i]
    const xj = +polyLons[j], yj = +polyLats[j]
    if (yi === yj) continue // 跳过水平边
    const yMin = yi < yj ? yi : yj
    const yMax = yi > yj ? yi : yj
    const xAtYMin = yi < yj ? xi : xj
    const slope = (xj - xi) / (yj - yi) // dx/dy
    edges.push({ yMin, yMax, xAtYMin, slope })
  }

  const bbox = [minX, minY, maxX, maxY]
  return {
    bbox,
    test(x, y) {
      // 包围盒快速剔除
      if (y < bbox[1] || y > bbox[3] || x < bbox[0] || x > bbox[2]) return false
      // 半开区间 [yMin, yMax) 防止顶点重复计算
      let inside = false
      for (let k = 0; k < edges.length; k++) {
        const e = edges[k]
        if (y >= e.yMin && y < e.yMax) {
          const xInt = e.xAtYMin + (y - e.yMin) * e.slope
          if (x < xInt) inside = !inside
        }
      }
      return inside
    }
  }
}

// 当前多边形的 tester 与结果缓存（按 hexId 缓存）
const areaState = reactive({
  key: '',
  tester: null,
  cache: new Map(), // Map<hexId, boolean>
})
function polygonKey(lons, lats) {
  return `${lons.join(';')}|${lats.join(';')}`
}
function buildAreaTester() {
  if (areaFilter.lons.length >= 3 && areaFilter.lons.length === areaFilter.lats.length) {
    areaState.key = polygonKey(areaFilter.lons, areaFilter.lats)
    areaState.tester = createPolygonTester(areaFilter.lons, areaFilter.lats)
    areaState.cache = new Map()
  } else {
    areaState.key = ''
    areaState.tester = null
    areaState.cache = new Map()
  }
}

// 统一的“可见行”计算（仅此处做过滤）
const visibleRows = computed(() => {
  let rows = tableData.value

  // 时间过滤
  if (Array.isArray(filterTimeRange.value) && filterTimeRange.value.length === 2) {
    const start = Math.min(filterTimeRange.value[0], filterTimeRange.value[1])
    const end   = Math.max(filterTimeRange.value[0], filterTimeRange.value[1])
    rows = rows.filter(r => {
      const tm = r.timeMs ?? Date.parse(r.time)
      return tm >= start && tm <= end
    })
  }

  // 任务过滤
  if (curTaskFilter.value !== -1) {
    rows = rows.filter(r => String(r.taskId) === String(curTaskFilter.value))
  }

  // 小区过滤
  if (curHexFilter.value !== -1) {
    rows = rows.filter(r => String(r.hexId) === String(curHexFilter.value))
  }

  // 卫星过滤
  if (curIdSatFilter.value.length > 0) {
    rows = rows.filter(r => String(r.idSat) === String(curIdSatFilter.value))
  }

  // 区域过滤
  //if (Array.isArray(areaFilter.lons) && areaFilter.lons.length >= 3) {
  //  rows = rows.filter(r => pointInPolygon(r.hexLon, r.hexLat, areaFilter.lons, areaFilter.lats))
  //}

  // 区域过滤（使用预处理 + 缓存）
  if (areaState.tester) {
    const test = areaState.tester.test
    const cache = areaState.cache
    rows = rows.filter(r => {
      const key = r.hexId
      let inside = cache.get(key)
      if (inside === undefined) {
        inside = test(r.hexLon, r.hexLat)
        cache.set(key, inside)
      }
      return inside
    })
  }

  return rows
})

// 新增：监听 visibleRows 变化，同步清理 selectedKeys
watch(visibleRows, (newRows) => {
  if (selectedKeys.value.length === 0) return;

  // 使用 Set 优化查找 O(M+N)
  const rowKeysSet = new Set();
  for (const r of newRows) {
    rowKeysSet.add(r.key);
  }

  const nextKeys = selectedKeys.value.filter(key => rowKeysSet.has(key));
  
  // 仅当确实有变化时才赋值，避免不必要的更新
  if (nextKeys.length !== selectedKeys.value.length) {
    selectedKeys.value = nextKeys;
  }
});

const selectedKeys = ref([]);
const previousKeys = [];
const trigger_downward_selection = (keys, items, meta) => {
  if (appStore.nearView!=='下行' && appStore.nearView!=='总体') {
    return; 
  }

  if (meta.action=='checkAll') {
    selectedKeys.value = visibleRows.value.map(row => row.key);
  } else if (meta.action=='uncheckAll') {
    selectedKeys.value = [];
  }

  const currentSet = new Set(selectedKeys.value);
  const previousSet = new Set(previousKeys);
  const diffKeys = [];
  
  // 1. 计算差集 (O(N))
  for (const key of currentSet) if (!previousSet.has(key)) diffKeys.push(key);
  for (const key of previousSet) if (!currentSet.has(key)) diffKeys.push(key);

  // 2. 构建查找表 (优先使用当前页 items)
  const lookupMap = new Map();
  for (const item of items) {
    lookupMap.set(item.key, item);
  }
  
  // 3. 找出 items 中没有的 key
  const missingKeys = diffKeys.filter(k => !lookupMap.has(k));
  if (missingKeys.length > 0) {
    const totalData = visibleRows.value;
    const missingLen = missingKeys.length;
    // 4. 智能决策：何时构建全量索引？
    // 只有当缺失的数量非常多（例如超过 500 个），才构建索引。
    // 否则，直接遍历查找通常更快，因为 find 是短路查找。
    // 这里的阈值 500 是一个经验值。
    const shouldBuildIndex = missingLen > 500; 
    if (shouldBuildIndex) {
       // 构建全量索引 (O(N))
       for (const row of totalData) {
         lookupMap.set(row.key, row);
       }
    } else {
       // 少量缺失，直接 find (O(M * N))，但由于 M 很小，通常优于构建索引
       for (const key of missingKeys) {
         const found = totalData.find(r => r.key === key);
         if (found) lookupMap.set(key, found);
       }
    }
  }
  const diffItems = diffKeys.map(key => lookupMap.get(key)).filter(Boolean);
  //console.log(meta.action, selectedKeys.value, previousKeys, diffKeys, diffItems);

  if (meta.action=='check' || meta.action=='checkAll') {
    // add all targets
    const hexsToAdd = Array.from(update_hexMap(diffItems).values());
    update_hex_batch(hexsToAdd);
  } else if (meta.action=='uncheck' || meta.action=='uncheckAll') {
    // remove all targets
    const hexIdsToRemove = diffItems.map(el => el.hexId);
    remove_hex_batch(hexIdsToRemove);
  }
  previousKeys.splice(0, previousKeys.length, ...selectedKeys.value);
}

const update_hexMap = (rows = visibleRows.value) => {
  // 使用 Map 进行聚合，避免 reduce 的对象展开开销
  const map = new Map();
  
  for (const row of rows) {
    const hexId = row.hexId;
    let sidLen = 0;
    
    // 优化 SID 解析：如果只是为了获取长度，且格式简单，可以避免 JSON.parse
    // 这里保留原逻辑，但加上 try-catch 保护
    try {
      if (Array.isArray(row.SID)) {
        sidLen = row.SID.length;
      } else if (typeof row.SID === 'string') {
        // 简单的字符串长度检查可能不够，如果必须解析 JSON
        sidLen = JSON.parse(row.SID || '[]').length;
      }
    } catch {}

    let item = map.get(hexId);
    if (item) {
      // ✅ 直接修改对象属性，避免 { ...prev } 的浅拷贝开销
      item.count++;
      item.hexColorFactor = Math.min(item.count / MAX_COLOR_IDX, 1);
      item.SID += sidLen;
    } else {
      // 新增记录
      map.set(hexId, {
        count: 1,
        idSat: row.idSat,
        satPos: { lon: row.satLon, lat: row.satLat, hgt: row.satHgt },
        satTime: row.satTime,
        hexMapId: hexId,
        hexColorFactor: 1 / MAX_COLOR_IDX,
        hexCenters: { lon: row.hexLon, lat: row.hexLat, hgt: row.hexHgt },
        hexVertex: { lats: row.hexLats, lons: row.hexLons },
        SID: sidLen,
      });
    }
  }
  
  return map;
}

// 更新小区选项
const update_hexIdOptions = () => {
  hexIdOptions.value = [
      { label: '所有小区', value: -1 },
      ...Array.from(new Set(tableData.value.map(el => el.hexId))).map(el => ({
        label: el, value: el
      })),
    ]
}

// 公共：将接口记录映射为表格行
function mapRecord(el) {
  const msec = Date.parse(el.updateTime)
  const time = new Date(msec).toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-')
  return {
    key:        el.hexId + '_' + time + '_' + el.mfid + '_' + el.id + '_' + el.taskId,
    mfid:       el.mfid,
    time,
    timeMs:     msec,
    idSat:      el.idSat,
    satLon:     el.satLon,
    satLat:     el.satLat,
    satHgt:     el.satHgt,
    satTime:    new Date(el.satTime).toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
    chUL:       el.chUL,
    chDL:       el.chDL,
    hexId:      el.hexId,
    hexLon:     Number.parseFloat(el.hexLon.toFixed(5)),
    hexLat:     Number.parseFloat(el.hexLat.toFixed(5)),
    hexHgt:     el.hexHgt,
    SID:        el.SID,
    taskId:     el.taskId,
    hexLons:    el.hexLons,
    hexLats:    el.hexLats,
  }
}

// 以小批量在下一个帧追加，避免长时间主线程占用
function appendRowsInBatches(loadId, rows, batchSize = 500) {
  let i = 0
  // 获取这批数据所属的 taskId (假设一批数据属于同一个任务，通常是的)
  const taskId = rows[0]?.taskId; 

  return new Promise(resolve => {
    const step = () => {
      // 1. 检查全局加载ID (处理重载/全量刷新)
      if (currentLoadId.value !== loadId) {
        return resolve(false);
      }
      // 2. 检查任务是否仍被选中 (处理单个任务取消)
      // 注意：如果 rows 为空或无法获取 taskId，则跳过此检查（防御性编程）
      if (taskId && !loadTasks.value.includes(taskId)) {
        return resolve(false);
      }

      const slice = rows.slice(i, i + batchSize)
      if (slice.length) {
        tableData.value.push(...slice)   // ✅ 注意展开 push
        i += batchSize
        requestAnimationFrame(step)
      } else {
        resolve(true);
      }
    }
    requestAnimationFrame(step)
  })
}

// 后台加载余下块（顺序保证），可根据需要改为有序并发
async function loadRemainingChunks(loadId, taskId, fromN, toN) {
  for (let n = fromN; n <= toN; n++) {
    // 1. 检查全局加载ID
    if (currentLoadId.value !== loadId) {
      return;
    }
    // 2. 检查任务是否仍被选中
    if (!loadTasks.value.includes(taskId)) {
      return;
    }

    const resp = await api.downward_getNthChunkByTaskId({
      taskId: taskId,
      n,
      chunkSize: pagination.pageSize,
      order: 'DESC',
    })
    const records = resp.data || []
    if (records.length) {
      const mapped = records.map(mapRecord)
      const iFinished = await appendRowsInBatches(loadId, mapped)
      if (!iFinished) {
        // 如果 append 被中断（例如任务被取消），则直接退出循环
        return;
      }
      // 更新时间范围
      if (mapped.length > 0) {
        const batchTimes = mapped.map(r => r.timeMs);
        const batchMin = Math.min(...batchTimes);
        const batchMax = Math.max(...batchTimes);
        
        if (tMin.value === null || batchMin < tMin.value) tMin.value = batchMin;
        if (tMax.value === null || batchMax > tMax.value) tMax.value = batchMax;
        
        timeRange.value = [tMin.value, tMax.value];
        commitTimeRange();
      }
    }
  }
}

// 用于取消旧的加载任务
const currentLoadId = ref(0)
const load_records = async (taskIds, isAppend = false) => {
  iOpen.value = true; //  打开面板
  
  const tasksToLoad = Array.isArray(taskIds) ? taskIds : (taskIds ? [taskIds] : []);
  if (tasksToLoad.length === 0) return;

  // 如果是追加模式，使用当前 ID；否则递增 ID (取消旧任务)
  // 注意：如果是首次加载（tableData为空），即使 isAppend 为 true 也应该视为新加载（虽然效果一样）
  let loadId;
  if (isAppend && tableData.value.length > 0) {
    loadId = currentLoadId.value; 
    // 保持 loading 状态，或者根据设计决定是否显示 loading
    // loading.value = true; // 通常追加时不显示全屏 loading，只显示底部 "读取..."
  } else {
    loadId = ++currentLoadId.value;
    loading.value = true; // 全量/重置加载显示 loading
  }
  
  readingCount.value++;

  // 并行请求所有任务的首块数据
  const promises = tasksToLoad.map(tid => api.downward_getNthChunkByTaskIdWithMeta({
    taskId: tid,
    n: 1,
    chunkSize: pagination.pageSize,
    order: 'DESC',
  }));

  try {
    const results = await Promise.all(promises);
    
    const newRows = [];
    const tasksWithMore = [];

    results.forEach((res, index) => {
        const taskId = tasksToLoad[index];
        const data = res.data?.data || [];
        const total = res.data?.total || 0;
        
        if (data.length > 0) {
            newRows.push(...data.map(mapRecord));
        }
        
        const nChunks = Math.ceil(total / pagination.pageSize);
        if (nChunks > 1) {
            tasksWithMore.push({ taskId, nChunks });
        }
    });

    if (newRows.length > 0) {
        tableData.value.push(...newRows);
        // Sort all data by time DESC
        tableData.value.sort((a, b) => b.timeMs - a.timeMs);
        
        // Update time range
        const times = tableData.value.map(r => r.timeMs);
        tMin.value = Math.min(...times);
        tMax.value = Math.max(...times);
        timeRange.value = [tMin.value, tMax.value];
        commitTimeRange();
    }

    loading.value = false;

    // 如果不是增量加载（即全量刷新），重置选择状态
    if (!isAppend) {
      selectedKeys.value = [];
      previousKeys.splice(0, previousKeys.length);
    }

    // Background load remaining chunks
    if (tasksWithMore.length > 0) {
        const bgPromises = tasksWithMore.map(t => loadRemainingChunks(loadId, t.taskId, 2, t.nChunks));
        
        Promise.all(bgPromises).then(() => {
            if (currentLoadId.value === loadId) {
                update_hexIdOptions();
            }
        }).finally(() => {
            readingCount.value--;
        });
    } else {
        update_hexIdOptions();
        readingCount.value--;
    }

  } catch (e) {
      console.error(e);
      loading.value = false;
      readingCount.value--;
  }
}

const write_record = () => {
  if (!tableData.value?.length)
    return $message.warning('没有记录')
  const columnsData = columns.filter(item => !!item.title)
  const thKeys = columnsData.map(item => item.key)
  const thData = columnsData.map(item => item.title)
  const trData = tableData.value.map(item => thKeys.map(key => item[key]))
  const sheet = utils.aoa_to_sheet([thData, ...trData])
  
  // 设置列宽度
  const colWidths = thKeys.map(key => {
    // 根据不同的列设置不同的宽度
    switch(key) {
      case 'taskId': return { wch: 10 }      // 任务ID列宽度
      case 'time': return { wch: 25 }        // 时间列宽度
      case 'idSat': return { wch: 15 }       // 卫星ID列宽度
      case 'satLon': return { wch: 25 }      // 卫星经度列宽度
      case 'satLat': return { wch: 25 }      // 卫星纬度列宽度
      case 'satHgt': return { wch: 25 }      // 卫星高度列宽度
      case 'satTime': return { wch: 25 }     // 星上时间列宽度
      case 'chUL': return { wch: 4 }         // 上行通道列宽度
      case 'chDL': return { wch: 4 }         // 下行通道列宽度
      case 'hexId': return { wch: 15 }       // 蜂窝ID列宽度
      case 'hexLon': return { wch: 25 }      // 蜂窝经度列宽度
      case 'hexLat': return { wch: 25 }      // 蜂窝纬度列宽度
      case 'hexHgt': return { wch: 25 }      // 蜂窝高度列宽度
      case 'SID': return { wch: 30 }         // SID列宽度
      default: return { wch: 20 }            // 默认列宽度
    }
  })
  sheet['!cols'] = colWidths
  
  const workBook = utils.book_new()
  utils.book_append_sheet(workBook, sheet, '下行记录报表')
  const time = new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-').replace(/\ /g, 'T');
  writeFile(workBook, `下行记录报表_${time}.xlsx`)
}

const create_report = async () => {
  const pad = n => String(n).padStart(2, '0');
  const formatCN = ms => {
    const d = new Date(ms);
    return `${d.getFullYear()}年${pad(d.getMonth() + 1)}月${pad(d.getDate())}日${pad(d.getHours())}时${pad(d.getMinutes())}分`;
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  // 任务名称：优先用过滤值，否则占位
  const taskName = loadTasks.value.length > 0 ? `任务 ${loadTasks.value.join(', ')}` : 'XXXXX任务';

  // 监测时间：用滑块 timeRange
  const [startMs, endMs] = (timeRange.value?.length ?? 0)
    ? [Math.min(...timeRange.value), Math.max(...timeRange.value)]
    : [Date.now(), Date.now()];

  // 监测地点：按 mfid 去重（无 mfid 时退回 hexId），经纬度用蜂窝中心
  const devices = Object.values(siteStore.sites).filter(v => v.name.includes('下行')).map((v, i) => ({
    idx: i + 1,
    name: v.name,
    lon: Number(v.lon).toFixed(4),
    lat: Number(v.lat).toFixed(4),
  }));

  // 监测结果：统计唯一蜂窝，取第一个中心点作为示例数据
  const uniqHex = new Map();
  for (const row of tableData.value) {
    if (!uniqHex.has(row.hexId)) uniqHex.set(row.hexId, { lon: row.hexLon, lat: row.hexLat });
  }
  const firstHex = uniqHex.size ? uniqHex.values().next().value : null;
  const resultRows = [
    {
      idx: 1,
      content: '下行信号',
      result: uniqHex.size ? '任务区域内发现非法下行波束' : '未发现',
      data: firstHex ? `波束中心点：${Number(firstHex.lon).toFixed(4)},${Number(firstHex.lat).toFixed(4)}` : '—',
    }
  ];

  // 五：监测数据（使用页面列定义与当前表格数据）
  const columnsData = columns.filter(col => !!col.title); // 忽略 selection 列
  const thKeys = columnsData.map(col => col.key);
  const thTitles = columnsData.map(col => col.title);
  const selectedFirst1K = selectedKeys.value.slice(0, 1000); // 最多前 1000 条
  const dataTableHtml = `
    <table>
      <thead>
        <tr>${thTitles.map(t => `<th>${esc(t)}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${visibleRows.value.filter(row => selectedFirst1K.includes(row.key)).map(row => `
          <tr>${thKeys.map(k => {
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
  <div class="sec"><h2>五：监测数据</h2>
    ${dataTableHtml}
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