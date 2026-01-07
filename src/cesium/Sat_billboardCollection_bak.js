import * as Cesium from 'cesium';
import { throttle } from '@/utils'
import { useCesiumStore, useSiteStore } from '@/store';
import { SAT_MIN_ELEV_DEG } from '@/constants';
import satIcon from '@/assets/icons/feather/satellite-color.png'
import pointIcon from '@/assets/icons/feather/satellite-color1.png'
import pointIconHighlight from '@/assets/icons/feather/satellite-color2.png'
import pointIconConnected from '@/assets/icons/feather/satellite-color3.png'
//import pointIcon from '@/assets/icons/feather/pointfilled64.png'

// 性能调整
const sendIntervalMs = 16; // 约60fps
let lastSentReal = 0;
let throttledClockListener = null;
let handler = null;

const pfTune = reactive({
  //pixelSize: Math.max(2, 2 * (window.devicePixelRatio || 1)),
  pixelSize: 2,
  //enableDistanceCull: true,
  enableDistanceCull: false,
})
const DistanceDisplayCondition = new Cesium.DistanceDisplayCondition(0.0, 8e7)
const DistanceCullTransparency = new Cesium.NearFarScalar(1e4, 1.0, 1e7, 0.65)
const DistanceCullScalar = new Cesium.NearFarScalar(1e5, 1.3, 1e7, 0.13);
// 2D 模式下用常量缩放，避免世界换行/经线 180° 附近距离异常导致图标过大
const DistanceCullScalar2D = new Cesium.NearFarScalar(0.0, 0.13, 1e9, 0.13);

// 轨迹管理
const orbitMinutes = ref(50)
const selected = new Map();

// 卫星接收机
const iReceiver = ref(true)
const satReceivers = new Map();
//const colorIn = Cesium.Color.RED.withAlpha(0.5);
//const colorOut = Cesium.Color.BLACK.withAlpha(0.25);
//const colorSelected = Cesium.Color.YELLOW;
//const colorNormal = Cesium.Color.WHITE;
//const colorConnect = Cesium.Color.LIME;
let unWatchReceiver = null;
let unWatchConnectedSat = null;

// 卫星共享变量
let viewer;
let points;
let pointsRef
let worker = null
let polylines = null;
let billboards = null; // ✅ 新增：用于绘制选中图标
let morphListener = null;
// line between satellite and observer
let source = `czm_material czm_getMaterial(czm_materialInput materialInput)
    {
        czm_material material = czm_getDefaultMaterial(materialInput);
        vec2 st = materialInput.st;
        vec4 colorImage = texture(image, vec2(fract((st.s - speed * czm_frameNumber * 0.001)), st.t));
        material.alpha = colorImage.a * color.a;
        material.diffuse = colorImage.rgb * 1.5 ;
        return material;
    }`

function sendObserver() { 
  const siteStore = useSiteStore();
  const lats = [];
  const lons = [];
  const alts = [];
  const elevs = [];
  const enables = [];
  for (const [mfid, receiver] of satReceivers) {
    if ( iReceiver.value ) {
      receiver.receiveLine.show = true;
      if (pointsRef[siteStore.sites[mfid].connectedSatIdx] && pointsRef[siteStore.sites[mfid].connectedSatIdx].color) {
        //pointsRef[siteStore.sites[mfid].connectedSatIdx].color = colorConnect;
        //pointsRef[siteStore.sites[mfid].connectedSatIdx].pixelSize = Math.max(10, pfTune.pixelSize+3);
        pointsRef[siteStore.sites[mfid].connectedSatIdx].image = pointIconConnected;
      }
    } else {
      receiver.receiveLine.show = false;
      if (pointsRef[siteStore.sites[mfid].connectedSatIdx] && pointsRef[siteStore.sites[mfid].connectedSatIdx].color) {
        //pointsRef[siteStore.sites[mfid].connectedSatIdx].color = colorNormal;
        //pointsRef[siteStore.sites[mfid].connectedSatIdx].pixelSize = pfTune.pixelSize;
        pointsRef[siteStore.sites[mfid].connectedSatIdx].image = pointIcon;
      }
    }
    lats.push(receiver.lat);
    lons.push(receiver.lon);
    alts.push(receiver.altMeters);
    elevs.push(receiver.minElevDeg);
    enables.push(iReceiver.value);
  }

  if(worker) worker.postMessage({ 
    type:'observer', 
    enable: enables, 
    lat: lats, 
    lon: lons, 
    altMeters: alts, 
    minElevDeg: elevs,
  }) 
}

function applyStyle() {
  if (!points) return
  for (let i = 0; i < points.length; i++) {
    const p = pointsRef[i]
    //p.pixelSize = pfTune.pixelSize
    if (pfTune.enableDistanceCull) {
      p.distanceDisplayCondition = DistanceDisplayCondition
      p.translucencyByDistance = DistanceCullTransparency
    } else {
      p.distanceDisplayCondition = undefined
      p.translucencyByDistance = undefined
    }
    p.scale = pfTune.pixelSize ** 0.5 * 0.65; // 调整比例以适应图标大小
  }
  viewer?.scene.requestRender()
}

function applySceneModeStyle() {
  if (!viewer || !pointsRef || !points) return;
  const mode = viewer.scene.mode;
  const scaleByDistance = (mode === Cesium.SceneMode.SCENE2D)
    ? DistanceCullScalar2D
    : DistanceCullScalar;

  for (let i = 0; i < points.length; i++) {
    const p = pointsRef[i];
    if (!p) continue;
    p.scaleByDistance = scaleByDistance;
  }
}

function clearOrbits() {
  selected.forEach(({ line, icon }, key) => {
    const p = pointsRef[key];
    p.id.iSelected = false;
    p.show = true;
    //p.color = colorNormal;
    //p.pixelSize = pfTune.pixelSize;
    p.image = pointIcon;
    if (line) polylines.remove(line);
    if (icon && billboards) billboards.remove(icon);
  });
  selected.clear();
  viewer?.scene.requestRender();
}

// ✅ 辅助函数：解析位掩码，获取所有可见的观测站索引
function getVisibleStations(visMask, maxStations = 8) {
  const stations = [];
  for (let i = 0; i < maxStations; i++) {
    if ((visMask & (1 << i)) !== 0) {
      stations.push(i);
    }
  }
  return stations;
}

// ✅ 辅助函数：获取观测站对应的颜色
function getColorForStation(stationIndex) {
  // 根据观测站索引返回不同颜色
  const colors = [
    Cesium.Color.RED,            // 观测站0
    Cesium.Color.MAGENTA,        // 观测站1
    Cesium.Color.LIME,           // 观测站2
    Cesium.Color.ORANGE,         // 观测站3
    Cesium.Color.GREENYELLOW,    // 观测站4
    Cesium.Color.YELLOW,         // 观测站5
    Cesium.Color.CYAN,           // 观测站6
    Cesium.Color.BLUE,           // 观测站7
  ];
  return colors[stationIndex % colors.length].withAlpha(0.95);
}

async function loadSat() {
  const cesiumStore = useCesiumStore();
  viewer = cesiumStore.getViewer();
  if (!viewer) return
  //points = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection({
  //  blendOption: Cesium.BlendOption.OPAQUE,
  //}))
  // 替换 PointPrimitiveCollection
  points = viewer.scene.primitives.add(new Cesium.BillboardCollection());

  const siteStore = useSiteStore();
  pointsRef = new Array(siteStore.satData.length);
  polylines = viewer.scene.primitives.add(new Cesium.PolylineCollection())

  // ✅ 创建 billboard 集合
  billboards = viewer.scene.primitives.add(new Cesium.BillboardCollection());

  const devDownwards = Object.values(siteStore.sites).filter(s => s.name.includes('下行'));

  // ✅ 建立卫星索引到接收站点的反向映射
  const satToSitesMap = new Map(); // key: satIdx, value: Set of site objects
  
  const updateSatToSitesMap = () => {
    satToSitesMap.clear();
    for (const site of devDownwards) {
      const receiver = satReceivers.get(site.mfid);
      if (site.connectedSatIdx !== undefined && site.connectedSatIdx !== null) {
        if (!satToSitesMap.has(site.connectedSatIdx)) {
          satToSitesMap.set(site.connectedSatIdx, new Set());
        }
        satToSitesMap.get(site.connectedSatIdx).add(site);
      } else {
        if (receiver) {
          receiver.receiveLine.show = false;
        }
      }
    }
  };
    
  if (devDownwards.length > 0) {
    unWatchReceiver = watch(() => devDownwards.map(el => `${el.lon}|${el.lat}|${el.alt}`), () => {
      for (const dev of devDownwards) {
        const obsPos = Cesium.Cartesian3.fromDegrees(dev.lon, dev.lat, dev.alt);
        const receiver = satReceivers.get(dev.mfid);
        if (receiver) {
          if (receiver.lon !== dev.lon || receiver.lat !== dev.lat || receiver.altMeters !== dev.alt) {
            receiver.lat = dev.lat;
            receiver.lon = dev.lon;
            receiver.altMeters = dev.alt;
            receiver.obsPos = obsPos;
            receiver.receiveLine.positions = [obsPos, obsPos];
          }
        } else {
          const receiveLine = polylines.add({
            show : true,
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
          satReceivers.set(dev.mfid, {
            lat: dev.lat,
            lon: dev.lon,
            altMeters: dev.alt,
            minElevDeg: SAT_MIN_ELEV_DEG,
            obsPos: obsPos,
            receiveLine: receiveLine,
          });
        }
      }
      sendObserver();
    }, { immediate: true });


    // 初始化映射
    updateSatToSitesMap();
    
    // ✅ 监听连接变化，更新映射
    unWatchConnectedSat = watch(() => devDownwards.map(d => d.connectedSatIdx).join(','), () => {
      updateSatToSitesMap();
    });
  }

  // 批量创建空点位，待 worker 回传坐标后填充
  const batch = 2000
  for (let i = 0; i < siteStore.satData.length; i += batch) {
    const end = Math.min(i + batch, siteStore.satData.length)
    for (let j = i; j < end; j++) {
      const p = points.add({
        position: new Cesium.Cartesian3(0,0,0),
        image: pointIcon,            // 白色圆点，背景透明
        scale: 1,                  // 控制大小
        scaleByDistance: DistanceCullScalar,
        // 强制使用深度测试：避免倾斜地球时远方(地球背面)卫星“穿透”显示到近景
        // 0.0 表示永不关闭深度测试
        //disableDepthTestDistance: 0.0,
        id: { idx: j, name: siteStore.satData[j].name, iSelected: false, vis: 0 },
      });
      if (pfTune.enableDistanceCull) {
        p.distanceDisplayCondition = DistanceDisplayCondition
        p.translucencyByDistance = DistanceCullTransparency
      } 
      pointsRef[j] = p;
    }
    await new Promise(resolve => requestAnimationFrame(resolve));
  }

  // 2D/3D 切换时同步调整缩放策略，避免 2D 下跨 180° 经线出现局部巨型图标
  morphListener = () => {
    applySceneModeStyle();
    viewer?.scene.requestRender();
  };
  viewer.scene.morphComplete.addEventListener(morphListener);
  // 初始模式不会触发 morphComplete；若一开始就是 2D，需要手动应用一次
  if (viewer.scene.mode === Cesium.SceneMode.SCENE2D) {
    applySceneModeStyle();
  }

  // 视点遮挡裁剪（地球背面剔除）：occluder 可复用，只需每次更新相机位置
  const ellipsoidOccluder = new Cesium.EllipsoidalOccluder(Cesium.Ellipsoid.WGS84);

  // 启动 worker
  worker = new Worker(new URL('@/worker/sgp4Worker.js', import.meta.url), { type: 'module' })
  worker.onmessage = async (e) => {
    const msg = e.data
    if (msg.type === 'pos') {
      // Float64Array: [x0, y0, z0, x1, y1, z1, ...] 单位米
      const buf = new Float64Array(msg.buffer); 
      const vis = new Uint8Array(msg.vis);  

      // 视点遮挡裁剪：地球背面的点不显示（避免倾斜视角下“跑到近景”）
      // 注意：相机会动，所以每次消息都更新 occluder.cameraPosition
      const doOcclusionCull = viewer?.scene?.mode === Cesium.SceneMode.SCENE3D;
      const occluder = doOcclusionCull ? ellipsoidOccluder : null;
      if (occluder) {
        occluder.cameraPosition = viewer.camera.positionWC;
      }

      // 批量更新并减少不必要的position赋值
      const batchSize = 1000;
      const scratch = new Cesium.Cartesian3();
      for(let j = 0; j < points.length; j += batchSize) {
        const end = Math.min(j + batchSize, points.length);
        for(let i = j; i < end; i++) {
          const idxBuf = i * 3;
          if (buf[idxBuf] !== 0 || buf[idxBuf + 1] !== 0 || buf[idxBuf + 2] !== 0) {
            scratch.x = buf[idxBuf]; scratch.y = buf[idxBuf+1]; scratch.z = buf[idxBuf+2];
            pointsRef[i].position = scratch;

            // 地球遮挡判断：背面点不显示
              const isVisibleFromCamera = occluder ? occluder.isPointVisible(scratch) : true;
              if (!pointsRef[i].id.iSelected) {
                if (pointsRef[i].show !== isVisibleFromCamera) {
                  pointsRef[i].show = isVisibleFromCamera;
                }
              }

            // 若该卫星已被选中且有图标，让图标位置跟着更新
            const rec = selected.get(i);
            if (rec?.icon) {
              rec.icon.position = scratch;
              if (rec.icon.show !== isVisibleFromCamera) {
                rec.icon.show = isVisibleFromCamera;
              }
            }

            // 更新可见性状态记录
            const visMask = vis[i];
            if (vis[i] !== pointsRef[i].id.vis) {
               pointsRef[i].id.vis = visMask;
            }

            // --- 统一决定图标逻辑 ---
            // 优先级：选中 > 连接 > 可见 > 普通
            
            if (pointsRef[i].id.iSelected) {
               // 选中状态下，点本身是隐藏的(show=false)，由额外的 billboard 显示，所以这里不用管 image
            } else {
               const connectedSites = satToSitesMap.get(i);
               const isConnected = connectedSites && connectedSites.size > 0;
               const isVisible = visMask !== 0;

               if (isConnected) {
                 // 连接状态
                 if (pointsRef[i].image !== pointIconConnected) {
                    pointsRef[i].image = pointIconConnected;
                 }
                 // 处理连线逻辑...
                 for (const connectedSite of connectedSites) {
                    const receiver = satReceivers.get(connectedSite.mfid);
                    if (receiver) {
                      // 若卫星在相机视点下被地球遮挡，则隐藏连线（避免“穿地球”的线）
                      receiver.receiveLine.show = iReceiver.value && isVisibleFromCamera;
                      if (isVisibleFromCamera) {
                        receiver.receiveLine.positions = [pointsRef[i].position, receiver.obsPos];
                      }
                      if (connectedSite.iConnectedSatChange) {
                         // 处理切换时的旧卫星恢复...
                         if (connectedSite.previousSatIdx && connectedSite.previousSatIdx !== i) {
                            // 恢复旧卫星：需要判断旧卫星当前是否可见
                            const prevVis = pointsRef[connectedSite.previousSatIdx].id.vis;
                            pointsRef[connectedSite.previousSatIdx].image = (prevVis !== 0) ? pointIconHighlight : pointIcon;
                         }
                         connectedSite.iConnectedSatChange = false;
                      }
                    }
                 }
               } else if (isVisible) {
                 // 可见状态 (高亮)
                 if (pointsRef[i].image !== pointIconHighlight) {
                    pointsRef[i].image = pointIconHighlight;
                 }
               } else {
                 // 普通状态
                 if (pointsRef[i].image !== pointIcon) {
                    pointsRef[i].image = pointIcon;
                 }
               }
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
      // ✅ 保留之前存的 icon
      const prev = selected.get(idx);
      const icon = prev?.icon;
      selected.set(idx, { line, name: 'SAT', icon });

      viewer?.scene.requestRender()
    }
  }

  // 发送 TLE 初始化
  worker.postMessage({
    type: 'init',
    tles: toRaw(siteStore.satData)
    //tles: siteStore.satData
  })

  // 发送可见性筛选参数
  sendObserver()

}

// 点击拾取与轨迹
function setupPicking() {
  const siteStore = useSiteStore();
  handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
  const picking_sat = (movement) => {
    const picked = viewer.scene.pick(movement.position)
    if (picked && picked.primitive && picked.primitive.id && 
      (picked.primitive instanceof Cesium.PointPrimitive || picked.primitive instanceof Cesium.Billboard)) {
      const idx = picked.primitive.id.idx; 
      pointsRef[idx].id.iSelected = !pointsRef[idx].id.iSelected;
      // 选中的点高亮
      if (pointsRef[idx].id.iSelected) {
        pointsRef[idx].show = false; // 先隐藏点，避免与轨迹重叠时视觉冲突

        // ✅ 新增：创建或更新图标 billboard
        let iconBb = selected.get(idx)?.icon;
        if (!iconBb && billboards) {
          iconBb = billboards.add({
            position: pointsRef[idx].position,
            image: satIcon, 
            scale: 0.3,
            width: 160,
            height: 160,
            // 与主卫星点一致：永不关闭深度测试
            //disableDepthTestDistance: 0.0,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            id: { idx }
          });
        }

        $notification.success({
          title: pointsRef[idx].id.name,
          contentStyle: 'text-align: center; font-size: 16px;',
          duration: 10000,
          keepAliveOnHover: true
        });

        // 轨迹已存在则先删
        if (selected.has(idx)) {
          const rec = selected.get(idx);
          if (rec.line) polylines.remove(rec.line);
          selected.delete(idx);
        }
        
        // 重新请求轨迹
        const jsDate = Cesium.JulianDate.toDate(viewer.clock.currentTime)
        worker?.postMessage({ 
          type: 'orbit', 
          idx,
          aheadMin: orbitMinutes.value, 
          behindMin: orbitMinutes.value, 
          stepSec: 60,
          timeSec: jsDate.getTime(),
        })

        // 暂存 icon；line 在 worker 回来时补上
        selected.set(idx, { line: null, name: 'SAT', icon: iconBb });

      } else {
        const connectedIdxs = Object.values(siteStore.sites)
          .filter(s => s.name.includes('下行')).map(s => s.connectedSatIdx);
        const iConnected = connectedIdxs.includes(idx);
        // 恢复点显示
        pointsRef[idx].show = true;
        //pointsRef[idx].color = iConnected ? colorConnect : colorNormal;
        //pointsRef[idx].pixelSize = iConnected ? Math.max(10, pfTune.pixelSize+3) : pfTune.pixelSize;
        pointsRef[idx].image = iConnected ? pointIconConnected : pointIcon;

        // ✅ 移除 billboard
        const rec = selected.get(idx);
        if (rec?.icon && billboards) {
          billboards.remove(rec.icon);
        }
        if (rec?.line) {
          polylines.remove(rec.line);
        }
        selected.delete(idx);
        viewer?.scene.requestRender();
        return;
      }
      // 限制最多 3 条轨迹
      if (selected.size > 3) {
        const firstKey = selected.keys().next().value
        const rec = selected.get(firstKey)
        if (rec?.line) polylines.remove(rec.line);
        if (rec?.icon && billboards) billboards.remove(rec.icon);
        selected.delete(firstKey)
        // reset firstKey point to normal
        pointsRef[firstKey].id.iSelected = false;
        pointsRef[firstKey].show = true;
        pointsRef[firstKey].image = pointIcon;
        //pointsRef[firstKey].color = colorNormal;
        //pointsRef[firstKey].pixelSize = pfTune.pixelSize;
      }
     
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
  if (morphListener && viewer?.scene?.morphComplete) {
    viewer.scene.morphComplete.removeEventListener(morphListener);
    morphListener = null;
  }
  if (handler != null) {
    handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK)
    handler.destroy();
    handler = null;
  }
  if (worker) {
    worker.onmessage = null;
    worker.terminate(); 
    worker = null;
  }
  if (unWatchReceiver) {
    unWatchReceiver();
    unWatchReceiver = null;
  }
  if (unWatchConnectedSat) {
    unWatchConnectedSat();
    unWatchConnectedSat = null;
  }
  if (polylines) { 
    clearOrbits()
    for(const { receiveLine } of satReceivers.values()) {
      polylines.remove(receiveLine);
    }
    satReceivers.clear();
    viewer.scene.primitives.remove(polylines);
    polylines = null;
  }
  if (points) {
    viewer.scene.primitives.remove(points);
    points = null;
    pointsRef = null;
  }
  // ✅ 清理选中图标
  if (billboards) {
    billboards.removeAll();
    viewer.scene.primitives.remove(billboards);
    billboards = null;
  }

  viewer.scene.requestRender();
}


export { loadSat, setupPicking, tickSending, cleanSat, pfTune, 
  applyStyle, orbitMinutes, iReceiver, sendObserver, clearOrbits }