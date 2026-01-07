import * as Cesium from 'cesium';
import api from '@/api'
import { throttle } from '@/utils'
import { useCesiumStore, useRecordStore, useSiteStore } from '@/store';

// 性能调整
const sendIntervalMs = 16; // 约60fps
let lastSentReal = 0;
let throttledClockListener = null;
let handler = null;

const pfTune = reactive({
  pixelSize: 2,
  enableDistanceCull: true,
})
const DistanceCullTransparency = [1e3, 1.0, 5.0e7, 0.85]
const DistanceCullScale = [1e3, 2., 5.0e7, 0.4]

// 轨迹管理
const orbitMinutes = ref(50)
const selected = new Map();

// 卫星接收机
const iReceiver = ref(true)
const satReceiver = reactive({
  lat: 25.9,
  lon: 98.4,
  altMeters: 100,       // 米
  minElevDeg: 10        // 度
})
const colorIn = Cesium.Color.RED.withAlpha(0.5);
const colorOut = Cesium.Color.BLACK.withAlpha(0.25);
const colorSelected = Cesium.Color.YELLOW;
const colorNormal = Cesium.Color.WHITE;
const colorConnect = Cesium.Color.LIME;
let unWatchReceiver = null;

// 卫星共享变量
let viewer;
let points;
let pointsRef
let worker = null
let polylines = null;
// line between satellite and observer
let receiveLine = null;
let source = `czm_material czm_getMaterial(czm_materialInput materialInput)
    {
        czm_material material = czm_getDefaultMaterial(materialInput);
        vec2 st = materialInput.st;
        vec4 colorImage = texture(image, vec2(fract((st.s - speed * czm_frameNumber * 0.001)), st.t));
        material.alpha = colorImage.a * color.a;
        material.diffuse = colorImage.rgb * 1.5 ;
        return material;
    }`
let obsPos = Cesium.Cartesian3.fromDegrees(satReceiver.lon, satReceiver.lat, satReceiver.altMeters);

function sendObserver() { 
  obsPos = Cesium.Cartesian3.fromDegrees(satReceiver.lon, satReceiver.lat, satReceiver.altMeters);
  if ( iReceiver.value ) {
    if (receiveLine) {
        receiveLine.positions = [obsPos, obsPos]
    } else {
        receiveLine = polylines.add({
        positions: [obsPos, obsPos],
        width: 4,
        material:  new Cesium.Material({
            fabric: {
                uniforms: {
                    color: Cesium.Color.fromCssColorString("#7ffeff"),
                    image: "/images/spriteline.png",
                    speed: 18,
                },
                source,
            },
            translucent: function () {
                return true
            }
        })
        });
    }
  } else {
    polylines.remove(receiveLine);
    receiveLine = null;
  }

  if(worker) worker.postMessage({ 
    type:'observer', 
    enable: iReceiver.value, 
    lat: satReceiver.lat, 
    lon: satReceiver.lon, 
    altMeters: satReceiver.altMeters, 
    minElevDeg: satReceiver.minElevDeg
  }) 
}

function applyStyle() {
  if (!points) return
  for (let i = 0; i < points.length; i++) {
    const p = pointsRef[i]
    p.pixelSize = pfTune.pixelSize
    if (pfTune.enableDistanceCull) {
      p.distanceDisplayCondition = new Cesium.DistanceDisplayCondition(0.0, 5.0e8)
      p.translucencyByDistance = new Cesium.NearFarScalar(...DistanceCullTransparency)
      p.scaleByDistance = new Cesium.NearFarScalar(...DistanceCullScale)
    } else {
      p.distanceDisplayCondition = undefined
      p.translucencyByDistance = undefined
      p.scaleByDistance = undefined
    }
  }
  viewer?.scene.requestRender()
}

function clearOrbits() {
  //polylines.removeAll();
  selected.forEach(({ line }, key) => {
    pointsRef[key].id.iSelected = false;
    pointsRef[key].color = colorNormal;
    pointsRef[key].pixelSize = pfTune.pixelSize;
    polylines.remove(line);
  });
  selected.clear()
  viewer?.scene.requestRender()
}

async function loadSat() {
  const cesiumStore = useCesiumStore();
  viewer = cesiumStore.getViewer();
  if (!viewer) return
  const recordStore = useRecordStore();
  console.log(recordStore.satData.filter(el=>el.name=='STARLINK-34522'), 'satellites loaded');
  points = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection({
    blendOption: Cesium.BlendOption.OPAQUE
  }))
  pointsRef = new Array(recordStore.satData.length);
  polylines = viewer.scene.primitives.add(new Cesium.PolylineCollection())

  const siteStore = useSiteStore();
  const devDownward = Object.values(siteStore.sites).filter(s => s.name === '下行')[0];
  unWatchReceiver = watch(devDownward, () => {
    satReceiver.lat = devDownward.lat;
    satReceiver.lon = devDownward.lon;
    satReceiver.altMeters = devDownward.alt;

    sendObserver();
  }, { deep: true, immediate: true });

  // 批量创建空点位，待 worker 回传坐标后填充
  const batch = 2000
  for (let i = 0; i < recordStore.satData.length; i += batch) {
    const end = Math.min(i + batch, recordStore.satData.length)
    for (let j = i; j < end; j++) {
      const p = points.add({
        position: new Cesium.Cartesian3(0,0,0),
        pixelSize: pfTune.pixelSize,
        color: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK.withAlpha(0.25),
        outlineWidth: 1,
        id: { idx: j, name: recordStore.satData[j].name, iSelected: false, vis: 0 },
      })
      if (pfTune.enableDistanceCull) {
        p.distanceDisplayCondition = new Cesium.DistanceDisplayCondition(0.0, 5.0e8)
        p.translucencyByDistance = new Cesium.NearFarScalar(...DistanceCullTransparency)
        p.scaleByDistance = new Cesium.NearFarScalar(...DistanceCullScale)
      } 
      pointsRef[j] = p;
    }
    await Promise.resolve()
  }

  // 启动 worker
  worker = new Worker(new URL('@/worker/sgp4Worker.js', import.meta.url), { type: 'module' })
  worker.onmessage = async (e) => {
    const msg = e.data
    if (msg.type === 'pos') {
      // Float64Array: [x0, y0, z0, x1, y1, z1, ...] 单位米
      const buf = new Float64Array(msg.buffer); 
      const vis = new Uint8Array(msg.vis);  

      // 批量更新并减少不必要的position赋值
      const batchSize = 200;
      const scratch = new Cesium.Cartesian3();
      for(let j = 0; j < points.length; j += batchSize) {
        const end = Math.min(j + batchSize, points.length);
        for(let i = j; i < end; i++) {
          const idxBuf = i * 3;
          if (buf[idxBuf] !== 0 || buf[idxBuf + 1] !== 0 || buf[idxBuf + 2] !== 0) {
            scratch.x = buf[idxBuf]; scratch.y = buf[idxBuf+1]; scratch.z = buf[idxBuf+2];
            pointsRef[i].position = scratch;

            // 连线接收设备和最近的卫星
            if (vis[i]==2 && receiveLine) {
              receiveLine.positions = [pointsRef[i].position, obsPos];
            }

            if (vis[i] !== pointsRef[i].id.vis) {
             
                // 可见性筛选
              if (vis[i]===1) {
                pointsRef[i].outlineColor = colorIn;
              } else if (vis[i]===0) {
                pointsRef[i].outlineColor = colorOut;
              } else if (vis[i]===2 && iReceiver.value) {
                pointsRef[i].color = colorConnect;
                pointsRef[i].pixelSize = Math.max(10, pfTune.pixelSize+3);
              }
              // reset vis of point
              pointsRef[i].id.vis = vis[i];
            }
          }
        }
        // 每批次让出主线程
        await new Promise(resolve => setTimeout(resolve, 0))
      }
      viewer?.scene.requestRender()
    }
    if (msg.type === 'orbit') {
      const { idx, buffer } = msg
      //const arr = new Float64Array(buffer)
      // positions 依次为 [x..,y..,z..]，按时间序
      const pos = []
      for (let i = 0; i < buffer.length; i += 3) {
        pos.push(new Cesium.Cartesian3(buffer[i], buffer[i+1], buffer[i+2]))
      }
      //const line = polylines.add({ positions: pos, width: 1})
      const line = polylines.add({ 
        positions: pos, 
        width: 1, 
        material: Cesium.Material.fromType('Color', {color: Cesium.Color.CYAN }) 
      });
      selected.set(idx, { line, name: 'SAT' })
      viewer?.scene.requestRender()
    }
  }

  // 发送 TLE 初始化
  worker.postMessage({
    type: 'init',
    tles: recordStore.satData
  })

  // 发送可见性筛选参数
  sendObserver()

}

// 点击拾取与轨迹
function setupPicking() {
  handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
  const picking_sat = (movement) => {
    const picked = viewer.scene.pick(movement.position)
    if (picked && picked.primitive && picked.primitive.id && picked.primitive instanceof Cesium.PointPrimitive) {
      const idx = picked.primitive.id.idx; 
      pointsRef[idx].id.iSelected = !pointsRef[idx].id.iSelected;
      // 选中的点高亮
      if (pointsRef[idx].id.iSelected) {
        pointsRef[idx].color = colorSelected;
        pointsRef[idx].pixelSize = Math.max(10, pfTune.pixelSize+3);
        $notification.success({
          title: pointsRef[idx].id.name,
          contentStyle: 'text-align: center; font-size: 16px;',
          duration: 10000,
          keepAliveOnHover: true
        });
      } else {
        pointsRef[idx].color = colorNormal;
        pointsRef[idx].pixelSize = pfTune.pixelSize;
      }
      // 已存在就删除
      if (selected.has(idx)) {
        const rec = selected.get(idx)
        polylines.remove(rec.line)
        selected.delete(idx)
        viewer?.scene.requestRender()
        return
      }
      // 限制最多 3 条轨迹
      if (selected.size >= 3) {
        const firstKey = selected.keys().next().value
        const rec = selected.get(firstKey)
        polylines.remove(rec.line)
        selected.delete(firstKey)
        // reset firstKey point to normal
        pointsRef[firstKey].id.iSelected = false;
        pointsRef[firstKey].color = colorNormal;
        pointsRef[firstKey].pixelSize = pfTune.pixelSize;
      }
      const jsDate = Cesium.JulianDate.toDate(viewer.clock.currentTime)
      worker?.postMessage({ 
        type: 'orbit', 
        idx: idx, 
        aheadMin: orbitMinutes.value, 
        behindMin: orbitMinutes.value, 
        stepSec: 60,
        timeSec: jsDate.getTime(),
      })
    }
  }
  const throttlePickingSat = throttle(picking_sat, 120);
  handler.setInputAction(throttlePickingSat, Cesium.ScreenSpaceEventType.LEFT_CLICK)
}

function tickSending() {
  // 重要：将 tick 驱动交给 Cesium，每帧（按节流）把当前仿真时间发给 worker
  // 用 Cesium 的 clock.onTick 替代手动 rAF loop
  throttledClockListener = (clock) => {
    const now = performance.now()
    if (now - lastSentReal >= sendIntervalMs) {
      lastSentReal = now
      const jsDate = Cesium.JulianDate.toDate(clock.currentTime)
      worker?.postMessage({ type: 'tick', timeSec: jsDate.getTime() })
    }
  }
  viewer.clock.onTick.addEventListener(throttledClockListener)
}

function cleanSat() {
  if (throttledClockListener && viewer && viewer.clock) {
    viewer.clock.onTick.removeEventListener(throttledClockListener)
    throttledClockListener = null
  }
  if (handler != null) {
        handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK)
  }
  if (worker) { worker.terminate(); worker = null }
  if (polylines) { 
    clearOrbits()
    polylines.remove(receiveLine);
    receiveLine = null;
    viewer.scene.primitives.remove(polylines);
  }
  if (unWatchReceiver) {
    unWatchReceiver();
    unWatchReceiver = null;
  }
  if (points) { viewer.scene.primitives.remove(points) }
  viewer.scene.requestRender();
}

const setSatView = () => {
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(116, 39, 1.5e7),
    //duration: 1,
    orientation: {
        heading : Cesium.Math.toRadians(0.0), // 方向
        pitch : Cesium.Math.toRadians(-90.0),// 倾斜角度
        roll : 0
    }
  })
}

async function fetchSatellite(satGroup) {
  console.time(satGroup)
  const res = await api.record_getByName({name: satGroup})
  console.timeEnd(satGroup)
  const tles = res.data.str.split('\r\n');
  const tleData = [];
  console.log('number is ', tles.length/3);
  for (let i = 0; i < tles.length; i += 3) {
      if (i + 2 < tles.length) {
          const nameLine = tles[i].trim();
          const line1 = tles[i + 1].trim();
          const line2 = tles[i + 2].trim();
          
          if (nameLine && line1 && line2) {
              tleData.push({
                  name: nameLine,
                  l1: line1,
                  l2: line2
              });
          }
      }
  }
  return tleData;
}

export { fetchSatellite, loadSat, setupPicking, tickSending, cleanSat, setSatView,
    pfTune, applyStyle, orbitMinutes, iReceiver, sendObserver, clearOrbits }