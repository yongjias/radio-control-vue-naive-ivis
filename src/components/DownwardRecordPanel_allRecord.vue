
<template>
  <div class="modalIcon" disabled>
    <i class="i-fe:hex-outline cursor-pointer" @click="open_pannel"/>
    <span class="iconTip">下行数据管理</span>
  </div>
  <div ref="elBox" :style="style" class="box" v-if="iOpen">
    <div ref="elTitle" class="flex justify-between wh-30 text-18 color-gray-300 py-1 px-10 bg-#80808070 cursor-move">
      <span></span>
      <n-flex class="ml-20">下行数据管理</n-flex>
      <div class="i-fe:x text-28 my-auto cursor-default" @click="iOpen=false"></div>
    </div>
    <div class="flex px-10 pt-5 pb-10 justify-between items-center">
      <div class="flex f-c-c gap-5 text-gray-200" >
        <span>时间范围</span>
        <n-slider v-model:value="timeRange" range :format-tooltip="formatTooltip" 
          :min="tMin" :max="tMax" :step="1000" class="w-350" />
      </div>
      <n-select :options="taskOptions" @update:value="task_filter" 
        size="small" class="w-100" :default-value="0"/>
      <n-button size="small" @click="filter_hex_area" >
        <i class="i-fe:area-custom text-14" />
        {{ iDragArea ? '取消区域范围' : '设定区域范围' }}
      </n-button>
      <n-button size="small" @click="reload_record" >
        <i class="i-fe:refresh-cw text-14" />
        重载记录
      </n-button>
      <n-button size="small" @click="create_report" >
        <i class="i-fe:table text-14" />
        报表生成 
      </n-button>
      <n-button size="small" @click="write_record" >
        <i class="i-fe:download text-14" />
        导出数据
      </n-button>
    </div>
    <NDataTable
      :bordered="false"
      :loading="loading"
      size="tiny"
      :columns="columns"
      :data="tableData"
      :pagination="pagination"
      :scroll-x="2000"
      :row-class-name="rowClassName"
      v-model:checked-row-keys="selectedKeys"
      @update:checked-row-keys="trigger_downward_selection"
    />
  </div>
</template>

<script setup>
import { useRecordStore, useAppStore, useSiteStore, useCesiumStore } from '@/store'
import { formatDateTime } from '@/utils';
import { useDraggable } from '@vueuse/core'
import { update_hex, update_hex_batch, remove_hex, remove_hex_batch, drag_area } from '@/cesium'
import LatLon from 'geodesy/latlon-nvector-spherical.js';         // faster but less accurate
import { utils, writeFile } from 'xlsx'
import { MAX_COLOR_IDX } from '@/constants';

defineOptions({ name: 'DownwardRecordPanel' })

const iOpen = ref(false);
const elBox = useTemplateRef('elBox');
const elTitle = useTemplateRef('elTitle');  // draggable element on title bar

// Position will persist and update
const { style } = useDraggable(elBox, {
  preventDefault: true,
  // with `preventDefault: true`
  // you can disable the native behavior (e.g., for img)
  // and control the drag-and-drop, preventing the browser interference.
  //initialValue: { x: window.innerWidth/2 - 500 , y: 125 },
  initialValue: { x: window.innerWidth/2 - 500 , y: window.innerHeight - 700 },
  handle: elTitle,
})

const recordStore = useRecordStore();
const appStore = useAppStore();
const siteStore = useSiteStore();
const cesiumStore = useCesiumStore();

const timeRange = ref([])
let tMin = ref(null)
let tMax = ref(null)
const formatTooltip = (value) => {
  return formatDateTime(value)
}

const tableData = ref([])
const loading = ref(true)
const open_pannel = async() => {
  reload_record().then(() => {
    // open panel
    iOpen.value = true;
  })
}

const timeColumn = reactive({
  title: '更新时间',
  key: 'time',
  width: 50,
  sorter: {
    compare: (a, b) => a.timeMs - b.timeMs,
    multiple: 1
  },
  defaultSortOrder: 'descend',
  filterOptionValue: timeRange,
  className: 'time',
  filter(_, row) {
    const tm = Date.parse(row.time)
    const start = Math.min(...timeRange.value)
    const end = Math.max(...timeRange.value)
    return tm >= start && tm <= end;
  }
})

const taskOptions = ref([
  {label: '所有任务', value:0},
])
const task_filter = (val) => {
  if (val == 0) {
    taskColumn.filterOptionValue = null
  } else {
    taskColumn.filterOptionValue = val
  }
}
const taskColumn = reactive({
  title: '任务ID',
  key: 'taskId',
  width: 5,
  sorter: {
    compare: (a, b) => a.taskId - b.taskId,
    multiple: 3
  },
  filter(value, row) {
    return row.taskId==value;
  }
})

const columns = [
  { type: 'selection', width: 5, 
    disabled: () => (appStore.nearView==='下行' || appStore.nearView==='总体' ? false : true) },
  taskColumn,
  timeColumn,
  { title: '小区', key: 'hexId', width: 25, sorter: {
    compare: (a, b) => a.hexId - b.hexId,
    multiple: 2
  }},
  { title: '卫星', key: 'idSat', width: 15 },
  { title: '卫星经度', key: 'satLon', width: 40 },
  { title: '卫星纬度', key: 'satLat', width: 40 },
  { title: '卫星高度', key: 'satHgt', width: 25 },
  { title: '星上时间', key: 'satTime', width: 50 },
  { title: '上信道', key: 'chUL', width: 10},
  { title: '下信道', key: 'chDL', width: 10},
  { title: '波束中心经度', key: 'hexLon', width: 40 },
  { title: '波束中心纬度', key: 'hexLat', width: 40 },
  { title: 'SID', key: 'SID', width: 120 },
]

const pageSize = 20
const pagination = reactive ({
  pageSize: pageSize,
  prefix({ itemCount }) {
    return `总:${itemCount}, 选择:${selectedKeys.value.length}个.`
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

let hexMap = null; // 用于批量添加时的计数映射
const selectedKeys = ref([]);
const trigger_downward_selection = (keys, items, meta) => {
  if (appStore.nearView!=='下行' && appStore.nearView!=='总体') {
    return; 
  }
  if (meta.action=='check') {
    const hexIdCounts = (items || []).reduce((acc, row) => {
      const cur = row.hexId;
      // 兼容 SID 已是数组或字符串的情况
      let sidLen = 0;
      try {
        sidLen = Array.isArray(row.SID) ? row.SID.length : JSON.parse(row.SID || '[]').length;
      } catch (e) {
        sidLen = 0;
      }

      if (acc.has(cur)) {
        const prev = acc.get(cur);
        acc.set(cur, {
          count: prev.count + 1,
          SID: prev.SID + sidLen
        });
      } else {
        acc.set(cur, { count: 1, SID: sidLen });
      }
      return acc;
    }, new Map());
    //console.log(`当前选择中 hexId ${meta.row.hexId} 出现了 ${hexIdCounts.get(meta.row.hexId)} 次`, hexIdCounts);
    // add targets
    const hex = {
      idSat: meta.row.idSat,
      satPos: {
        lon: meta.row.satLon,
        lat: meta.row.satLat,
        hgt: meta.row.satHgt,
      },
      satTime: meta.row.satTime,
      hexMapId: meta.row.hexId,
      hexColorFactor: Math.min(hexIdCounts.get(meta.row.hexId).count / MAX_COLOR_IDX, 1),
      hexCenters: {
        lon: meta.row.hexLon,
        lat: meta.row.hexLat,
        hgt: meta.row.hexHgt,
      },
      hexVertex: {
        lats: meta.row.hexLats,
        lons: meta.row.hexLons,
      },
      SID: hexIdCounts.get(meta.row.hexId).SID,
    };
    update_hex(hex);
  } else if (meta.action=='uncheck') {
    // remove target
    remove_hex(meta.row.hexId);
    selectedKeys.value = selectedKeys.value.filter(key => !key.includes(meta.row.hexId));
  } else if (meta.action=='uncheckAll') {
    // ✅ 批量删除：先删除所有，再触发一次更新
    const hexIdsToRemove = Array.from(hexMap.keys());
    remove_hex_batch(hexIdsToRemove);
    selectedKeys.value = [];
  } else if (meta.action=='checkAll') {
    // ✅ 转换为数组并设置颜色因子
    const hexsToAdd = Array.from(hexMap.values());
    update_hex_batch(hexsToAdd);
    selectedKeys.value = tableData.value.map(el => el.key);
  }
}

const reload_record = async() => {
  loading.value = true
  const records = await recordStore.fetchDownwardRecordAll()
  if (records.length>0) {
    tableData.value = records.map(el => {
      const msec = Date.parse(el.updateTime); // 解析 UTC ISO
      const time = new Date(msec).toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-');
      return {
        key:        el.hexId + '_' + time + '_' + el.mfid + '_' + el.id,
        mfid:       el.mfid,
        time:       time,
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
    })
    // set timeRange
    timeRange.value = [Date.parse(records[0].updateTime), Date.parse(records[records.length-1].updateTime)]
    tMin.value = timeRange.value[0];
    tMax.value = timeRange.value[1];
  }
  // table pagination
  pagination.itemCount = tableData.value.length
  loading.value = false

  // update filter_task
  taskOptions.value = [
    {label: '所有任务', value:0},
    ...Array.from(new Set(tableData.value.map(el=>el.taskId))).map(el=>({
      label: el,
      value: Number(el),
    })),
  ]

  // update hexMap
  hexMap = tableData.value.reduce((acc, row) => {
    const hexId = row.hexId;
    
    if (acc.has(hexId)) {
      // 已存在，增加计数
      acc.get(hexId).count++;
      acc.get(hexId).hexColorFactor = Math.min(acc.get(hexId).count / MAX_COLOR_IDX, 1);
      acc.get(hexId).SID += JSON.parse(row.SID).length;
    } else {
      // 首次出现，存储数据
      acc.set(hexId, {
        count: 1,
        idSat: row.idSat,
        satPos: {
          lon: row.satLon,
          lat: row.satLat,
          hgt: row.satHgt,
        },
        satTime: row.satTime,
        hexMapId: hexId,
        hexColorFactor: 1 / MAX_COLOR_IDX,
        hexCenters: {
          lon: row.hexLon,
          lat: row.hexLat,
          hgt: row.hexHgt,
        },
        hexVertex: {
          lats: row.hexLats,
          lons: row.hexLons,
        },
        SID: JSON.parse(row.SID).length,
      });
    }
    
    return acc;
  }, new Map());
  //console.log(`去重后: ${hexMap.size} 个唯一蜂窝，总计数: ${tableData.value.length}`);
}

const update_tableByArea = (lons, lats) => {
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
    // update pagination
    pagination.itemCount = tableData.value.length
  } 
}

let iDragArea = ref(false);
const filter_hex_area = () => {
  // draw a polygon for area selection
  drag_area(update_tableByArea, iDragArea.value)
  iDragArea.value = !iDragArea.value;
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
  const taskName = taskColumn.filterOptionValue ? `任务 ${taskColumn.filterOptionValue}` : 'XXXXX任务';

  // 监测时间：用滑块 timeRange
  const [startMs, endMs] = (timeRange.value?.length ?? 0)
    ? [Math.min(...timeRange.value), Math.max(...timeRange.value)]
    : [Date.now(), Date.now()];

  // 监测地点：按 mfid 去重（无 mfid 时退回 hexId），经纬度用蜂窝中心
  const devices = Object.values(siteStore.sites).filter(v => v.name.includes('下行')).map((v, i) => ({
    idx: i + 1,
    name: v.name,
    lon: Number(v.lon).toFixed(2),
    lat: Number(v.lat).toFixed(2),
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
      data: firstHex ? `波束中心点：${Number(firstHex.lon).toFixed(2)},${Number(firstHex.lat).toFixed(2)}` : '—',
    }
  ];

  // 五：监测数据（使用页面列定义与当前表格数据）
  const columnsData = columns.filter(col => !!col.title); // 忽略 selection 列
  const thKeys = columnsData.map(col => col.key);
  const thTitles = columnsData.map(col => col.title);
  const dataTableHtml = `
    <table>
      <thead>
        <tr>${thTitles.map(t => `<th>${esc(t)}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${tableData.value.map(row => `
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
  width: 1100px;
  background-color: #1d1d1bcc;
  border-radius: 5px 5px 10px 10px;
  font-size: 14px;
  align-items: center;
  justify-content: center;
  user-select: none;
  position: fixed;
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