
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
      <n-radio-group v-model:value="curOpt" @update:value="reload_record" size="small">
        <n-radio-button
          v-for="opt in options" :key="opt.value" :value="opt.value" :label="opt.label"/>
      </n-radio-group>
      <div class="flex f-c-c gap-5 text-gray-200" >
        <span>时间范围</span>
        <n-slider v-model:value="timeRange" range :format-tooltip="formatTooltip" 
          :min="tMin" :max="tMax" :step="1000" class="w-330" />
      </div>
      <n-button size="small" @click="filter_target_area" >
        <i class="i-fe:area-custom text-14" />
        {{ iDragArea ? '取消区域范围' : '设定区域范围' }}
      </n-button>
      <n-select :options="gidOptions" @update:value="filter_gid"
        size="small" class="w-90" :default-value="-1"/>
      <n-button size="small" @click="reload_record" >
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
      :data="resultTableData"
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
      :data="tdoaTableData"
      :pagination="pagination"
      :row-class-name="rowClassName"
      v-model:checked-row-keys="tdoaTargetSelectedKeys"
      @update:checked-row-keys="trigger_tdoaTarget_selection"
    />
  </div>
</template>

<script setup>
import { useRecordStore, useAppStore, useSiteStore, useCesiumStore } from '@/store'
import { formatDateTime } from '@/utils';
import { useDraggable } from '@vueuse/core'
import LatLon from 'geodesy/latlon-nvector-spherical.js';         // faster but less accurate
import { update_lineTarget, del_targets, update_tdoaTarget, update_dfLines, clear_dfLines,
         findSiteMfidByCoord, update_lineTarget_batch, drag_area } from '@/cesium'
import { utils, writeFile } from 'xlsx'

defineOptions({ name: 'UpwardRecordPanel' })

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
  initialValue: { x: window.innerWidth/2 - 500 , y: window.innerHeight - 660 },
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
    iOpen.value = true;
  })
}

const timeColumn = reactive({
  title: '定位时间', key: 'time', width: 35, 
    sorter:  (a, b) => a.timeMs - b.timeMs,  defaultSortOrder: 'descend',
  filterOptionValue: timeRange,
  className: 'time',
  filter(_, row) {
    const tm = Date.parse(row.time)
    const start = Math.min(...timeRange.value)
    const end = Math.max(...timeRange.value)
    return tm >= start && tm <= end;
  }
})

const filter_gid = (gid) => {
  gidColumn.filterOptionValue = gid;
}
const gidOptions = ref([
  {label: '所有组', value:-1},
])
const gidColumn = reactive({
  title: '组',
  key: 'gid',
  width: 8,
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
  { title: '站1经度', key: 'site1Lon', width: 25 },
  { title: '站1纬度', key: 'site1Lat', width: 25 },
  { title: '站2经度', key: 'site2Lon', width: 25 },
  { title: '站2纬度', key: 'site2Lat', width: 25 },
  { title: '定位经度', key: 'lon', width: 70 },
  { title: '定位纬度', key: 'lat', width: 70 },
  { title: '测向度1', key: 'angle1', width: 50 },
  { title: '测向度2', key: 'angle2', width: 50 },
]

const tdoaColumns = [
  { type: 'selection', width: 5, 
    disabled: () => (appStore.nearView==='上行' || appStore.nearView==='总体' ? false : true) },
  timeColumn,
  { title: '定位经度', key: 'lon', width: 60 },
  { title: '定位纬度', key: 'lat', width: 60 },
  { title: '注释', key: 'note', width: 110 },
  { title: '组ID', key: 'gid', width: 4 },
]

const pageSize = 20
const pagination = reactive ({
  pageSize: pageSize,
  prefix({ itemCount }) {
    return `总共${itemCount}个.`
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

const sites = Object.values(siteStore.sites).filter(v => v.name.includes('上行'));
const lineTargetSelectedKeys = ref([]);
const trigger_lineTarget_selection = (keys, items, meta) => {
  if (appStore.nearView!=='上行' && appStore.nearView!=='总体') {
    return; 
  }
  if (meta.action=='check') {
    // add targets
    const lons = meta.row.lon.split('|').map(a => Number(a));
    const lats = meta.row.lat.split('|').map(a => Number(a));
    const points = lons.map((lon, i) => ({
      lon,
      lat: lats[i],
    }));
    update_lineTarget(points, meta.row.time, meta.row.gid);
    const lines = [];
    const mfid1 = findSiteMfidByCoord(sites, Number(meta.row.site1Lon), Number(meta.row.site1Lat));
    if (mfid1) {
      lines.push({
        mfid: mfid1,
        iClear: false,           // 不清除已有线
        dfLines: [{
          id: meta.row.key,        // 关联线 ID 用于后续删除
          lines: meta.row.angle1.split('|').map(a => ({
            angle: Number(a),
            lon: Number(meta.row.site1Lon),
            lat: Number(meta.row.site1Lat),
          })).filter(x => Number.isFinite(x.angle))
        }],
      });
    }
    const mfid2 = findSiteMfidByCoord(sites, Number(meta.row.site2Lon), Number(meta.row.site2Lat));
    if (mfid2) {
      lines.push({
        mfid: mfid2,
        iClear: false,           // 不清除已有线
        dfLines: [{
          id: meta.row.key,        // 关联线 ID 用于后续删除
          lines: meta.row.angle2.split('|').map(a => ({
            angle: Number(a),
            lon: Number(meta.row.site2Lon),
            lat: Number(meta.row.site2Lat),
          })).filter(x => Number.isFinite(x.angle))
        }],
      });
    }
    update_dfLines(lines);
  } else if (meta.action=='uncheck') {
    // remove target
    const groupId = 'lineTarget_'+meta.row.gid+'_'+meta.row.time;
    del_targets(groupId);
    // remove df lines
    const lineIds = [meta.row.key];
    clear_dfLines(lineIds);
  } else if (meta.action=='uncheckAll') {
    const lineIds = [];
    // remove all targets
    resultTableData.value.forEach(row => {
      const groupId = 'lineTarget_'+row.gid+'_'+row.time;
      del_targets(groupId);
      lineIds.push(row.key);
    })
    // remove df lines
    clear_dfLines(lineIds);
    lineTargetSelectedKeys.value = [];
  } else if (meta.action=='checkAll') {
    // add all targets
    const lineTargets = [];
    resultTableData.value.forEach(row => {
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
    const tLines = resultTableData.value.reduce((acc, row) => {
      const mfid1 = findSiteMfidByCoord(sites, Number(row.site1Lon), Number(row.site1Lat));
      if (mfid1==null) {
        console.log('Cannot find site mfid for coord:', row.site1Lon, row.site1Lat, sites);
      }
      if (acc.has(mfid1)) {
        const existing = acc.get(mfid1);
        existing.push({
          id: row.key,        // 关联线 ID 用于后续删除
          lines: row.angle1.split('|').map(a => ({
            angle: Number(a),
            lon: Number(row.site1Lon),
            lat: Number(row.site1Lat),
          })).filter(x => Number.isFinite(x.angle))
        });
      } else {
        acc.set(mfid1, [{
          id: row.key,        // 关联线 ID 用于后续删除
          lines: row.angle1.split('|').map(a => ({
            angle: Number(a),
            lon: Number(row.site1Lon),
            lat: Number(row.site1Lat),
          })).filter(x => Number.isFinite(x.angle))
        }]);
      }

      const mfid2 = findSiteMfidByCoord(sites, Number(row.site2Lon), Number(row.site2Lat));
      if (mfid2==null) {
        console.log('Cannot find site mfid for coord:', row.site2Lon, row.site2Lat, sites);
      }
      if (acc.has(mfid2)) {
        const existing = acc.get(mfid2);
        existing.push({
          id: row.key,        // 关联线 ID 用于后续删除
          lines: row.angle2.split('|').map(a => ({
            angle: Number(a),
            lon: Number(row.site2Lon),
            lat: Number(row.site2Lat),
          })).filter(x => Number.isFinite(x.angle))
        });
      } else {
        acc.set(mfid2, [{
          id: row.key,        // 关联线 ID 用于后续删除
          lines: row.angle2.split('|').map(a => ({
            angle: Number(a),
            lon: Number(row.site2Lon),
            lat: Number(row.site2Lat),
          })).filter(x => Number.isFinite(x.angle))
        }]);
      }

      return acc;
    }, new Map());

    const lines = [];
    tLines.forEach((lineGroup, mfid) => {
      lines.push({
        mfid,
        iClear: false,
        dfLines: lineGroup
      });
    });
    console.log('lines for all selected:', lines.length, lines);
    update_dfLines(lines);
    lineTargetSelectedKeys.value = resultTableData.value.map(row => row.key);
  }
}

const tdoaTargetSelectedKeys = ref([]);
const trigger_tdoaTarget_selection = (keys, items, meta) => {
  if (appStore.nearView!=='上行' && appStore.nearView!=='总体') {
    return; 
  }
  if (meta.action=='check') {
    // add targets
    const lon = Number(meta.row.lon);
    const lat = Number(meta.row.lat);
    update_tdoaTarget(lon, lat, meta.row.time, meta.row.gid);
  } else if (meta.action=='uncheck') {
    // remove target
    const groupId = 'tdoaTarget_'+meta.row.gid+'_'+meta.row.time;
    del_targets(groupId);
  } else if (meta.action=='uncheckAll') {
    // remove all targets
    tdoaTableData.value.forEach(row => {
      const groupId = 'tdoaTarget_'+row.gid+'_'+row.time;
      del_targets(groupId);
    })
    tdoaTargetSelectedKeys.value = [];
  } else if (meta.action=='checkAll') {
    // add all targets
    tdoaTableData.value.forEach(row => {
      const lon = Number(row.lon);
      const lat = Number(row.lat);
      update_tdoaTarget(lon, lat, row.time, row.gid);
    })
    tdoaTargetSelectedKeys.value = tdoaTableData.value.map(row => row.key);
  }
}

const reload_record = async() => {
  loading.value = true
  if (curOpt.value==='tdoa') {
    const records = await recordStore.fetchTdoaRecordAll()
    if (records.length>0) {
      // TDOA table data
      tdoaTableData.value = records.map(el => {
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
      })
    }
    // set timeRange
    timeRange.value = [Date.parse(records[0].time), Date.parse(records[records.length-1].time)]
    tMin.value = timeRange.value[0];
    tMax.value = timeRange.value[1];
  } else {
    const records = await recordStore.fetchUpwardRecordAll()
    if (records.length>0) {
      // Result table data
      resultTableData.value = records.map(el => {
        const msec = Date.parse(el.recordTime); // 解析 UTC ISO
        const time = new Date(msec).toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-');
        return {
          key:       el.id,
          time:      time,
          timeMs:    msec,
          lon:       el.lon,
          lat:       el.lat,
          angle1:    el.angle1,
          angle2:    el.angle2,
          site1Lon:  el.site1Lon,
          site1Lat:  el.site1Lat,
          site2Lon:  el.site2Lon,
          site2Lat:  el.site2Lat,
          gid:       el.gid,
        }
      })
    }
    // set timeRange
    timeRange.value = [Date.parse(records[0].recordTime), Date.parse(records[records.length-1].recordTime)]
    tMin.value = timeRange.value[0];
    tMax.value = timeRange.value[1];
  }
  // table pagination
  pagination.itemCount = resultTableData.value.length
  loading.value = false
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

const update_tableByArea = (lons, lats) => {
  if (lons.length > 0) {
    // filtered by dragged area
    let polygon = []
    for ( let i=0; i<lons.length; i++ ) {
        polygon.push(new LatLon(lats[i], lons[i]))
    }

    // filter tableData by area
    if (curOpt.value==='tdoa') {
      tdoaTableData.value = tdoaTableData.value.filter(el => {
        const lon = Number(el.lon);
        const lat = Number(el.lat);
        let loc = new LatLon(lat, lon)
        return loc.isEnclosedBy(polygon);
      })
      // update pagination
      pagination.itemCount = tdoaTableData.value.length
      return;
    } else {
      resultTableData.value = resultTableData.value.filter(el => {
        const lons = el.lon.split('|').map(a => Number(a));
        const lats = el.lat.split('|').map(a => Number(a));
        for (let i=0; i<lons.length; i++) {
          let loc = new LatLon(lats[i], lons[i])
          if (loc.isEnclosedBy(polygon)) {
            return true;
          }
        }
        return false;
      })
      // update pagination
      pagination.itemCount = resultTableData.value.length
    }
  } 
}

let iDragArea = ref(false);
const filter_target_area = () => {
  // draw a polygon for area selection
  drag_area(update_tableByArea, iDragArea.value)
  iDragArea.value = !iDragArea.value;
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
    lon: Number(v.lon).toFixed(2),
    lat: Number(v.lat).toFixed(2),
  }));

  // 监测结果：统计唯一蜂窝，取第一个中心点作为示例数据
  const lastTdoa = tdoaTableData.value.toSorted((a, b) => Date.parse(b.time) - Date.parse(a.time))[0];
  const resultRows = [
    {
      idx: 1,
      content: '上行信号',
      result: '对终端完成定位',
      data: lastTdoa ? `终端坐标：${Number(lastTdoa.lon).toFixed(2)},${Number(lastTdoa.lat).toFixed(2)}` : '—',
    },
  ];

  // 五：监测数据tdoa（使用页面列定义与当前表格数据）
  const columnsTdoa = tdoaColumns.filter(col => !!col.title); // 忽略 selection 列
  const thKeysTdoa = columnsTdoa.map(col => col.key);
  const thTitlesTdoa = columnsTdoa.map(col => col.title);
  const tdoaTableHtml = `
    <table>
      <thead>
        <tr>${thTitlesTdoa.map(t => `<th>${esc(t)}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${tdoaTableData.value.filter(row => tdoaTargetSelectedKeys.value.includes(row.key))
          .map(row => `
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
        ${resultTableData.value.filter(row => lineTargetSelectedKeys.value.includes(row.key))
          .map(row => `
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