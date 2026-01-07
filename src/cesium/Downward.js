// Downward.js
import * as Cesium from "cesium";
import { useCesiumStore, useSiteStore } from '@/store';
import { WsClient } from '@/utils/wsSocket'
import { decode_stream_downward, formatDateTime, throttle } from '@/utils';
import receiverModelUrl from '@/assets/models/receiver.glb?url';
import { MAX_COLOR_IDX } from '@/constants';
import api from '@/api'

// 优化：批量更新相关变量
let updateTimer = null;
let lastUpdateTime = 0;
const UPDATE_INTERVAL = 100; // ms
// 待更新的站点队列
const EPSILON = 1e-5;        // 1 meter resolution

// ✅ 全局任务ID，跨站点共享
let currentTask = null;

// 共享变量
let viewer = null;
let hexPrimitive = null;
let hexOutlinePrimitive = null;
let fillInstances = new Map();
let outlineInstances = new Map();
let hexIds = new Map();
const devSites = new Map();
let countSIDCollection = null;
// add this map for fast lookup
const countSIDLabelById = new Map();

// warning indicator
const iSIDShow = ref(false);
let SIDTimeout = null;

// 开关蜂窝-卫星连线
let hexSatLines = null;
let hexSatPoints = null;
let hexSatLineMap = null;

// 优化：颜色缓存
const colorCache = new Map();

// calculate model matrix
function calc_siteModel_pos(lon, lat, alt, heading=225, pitch=10, roll=0) {
  const position = Cesium.Cartesian3.fromDegrees(
    lon,
    lat,
    alt
  );
  // Define heading, pitch, and roll in radians
  const headingPositionRoll = new Cesium.HeadingPitchRoll(
    Cesium.Math.toRadians(heading),
    Cesium.Math.toRadians(pitch),
    Cesium.Math.toRadians(roll)
  );
  const fixedFrameTransform = Cesium.Transforms.localFrameToFixedFrameGenerator(
    "north",
    "west"
  );
  return Cesium.Transforms.headingPitchRollToFixedFrame(
    position,
    headingPositionRoll,
    Cesium.Ellipsoid.WGS84,
    fixedFrameTransform
  );
}

async function load_siteModel(siteInfo, lon, lat, alt) {
  try {
    // 先移除旧模型
    if (siteInfo.model && viewer) {
      viewer.scene.primitives.remove(siteInfo.model);
      siteInfo.model = null;
    }

    const modelMatrix = calc_siteModel_pos(lon, lat, alt);
    const model = await Cesium.Model.fromGltfAsync({
      url: receiverModelUrl,
      modelMatrix: modelMatrix,
      color: new Cesium.Color(0.9, 0.95, 1.0, 1.0),
      colorBlendMode: Cesium.ColorBlendMode.MIX,
      colorBlendAmount: 0.5,
      silhouetteColor: Cesium.Color.DARKSLATEBLUE,
      silhouetteSize: 2,
      scene: viewer.scene,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      minimumPixelSize: 48,
      id: siteInfo.name+','+lon.toFixed(4)+','+lat.toFixed(4)+','+alt.toFixed(0)+
        ','+siteInfo.gid+','+siteInfo.mfid,
    });
    viewer.scene.primitives.add(model);
    // Load the modified glTF into Cesium.
    model.readyEvent.addEventListener(() => {
      siteInfo.model = model
    })
  } catch (error) {
    console.error('加载站点模型失败:', siteInfo.name, error);
  }
}

// 创建 Primitive
function buildFillPrimitive(primInstances) {
  //const prim = new Cesium.GroundPrimitive({
  const prim = new Cesium.Primitive({
    geometryInstances: primInstances,
    appearance: new Cesium.PerInstanceColorAppearance({
      flat: true,
      translucent: true,
      closed: false,
    }),
    classificationType: Cesium.ClassificationType.TERRAIN,
    asynchronous: true,
    interleave: true,
  });

  return prim;
}

function buildOutlinePrimitive(primInstances) {
  const prim = new Cesium.GroundPolylinePrimitive({
    geometryInstances: primInstances,
    appearance: new Cesium.PolylineMaterialAppearance({
      //material: Cesium.Material.fromType('Color', {
      //  color: new Cesium.Color(0.0, 0.0, 0.0, 1.0)
      //}),
      material: Cesium.Material.fromType('PolylineOutline', {
        color: Cesium.Color.BLACK.withAlpha(1.0),
        outlineColor: Cesium.Color.BLACK.withAlpha(1.0),
        outlineWidth: 1
      }),
      translucent: true,
    }),
    classificationType: Cesium.ClassificationType.TERRAIN,
    asynchronous: true,
    interleave: true,
    allowPicking: false,
  });

  return prim;
}

// 简化 HSL(0-360,0-255,0-255) -> RGBA(0-255)
function hsl2rgba(h, s, l, a = 128) {
  s /= 255; 
  l /= 255;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp >= 0 && hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
    a
  ];
}

// 优化：根据中心点索引生成稳定颜色（带缓存）
function colorFromIndex(idx) {
  if (colorCache.has(idx)) {
    return colorCache.get(idx);
  }
  
  // ✅ idx 是 0-1 的比例，映射到色调 240° -> 0° (蓝 -> 绿 -> 红)
  // 方案1: 240° -> 0° (240, 180, 120, 60, 0)
  const h = Math.floor((1 - idx) * 240); // 从 240° 递减到 0°
  const s = 180; // 饱和度 70%
  const l = 160; // 亮度 63%
  const [r, g, b, a] = hsl2rgba(h, s, l, 160);
  const color = [r/255, g/255, b/255, a/255];
  
  colorCache.set(idx, color);
  return color;
}

// 删除一个蜂窝
function remove_hex(hexMapId) {
  if (fillInstances.delete(hexMapId)) {
    outlineInstances.delete(hexMapId);
    hexFillIdByMapId.delete(hexMapId);  // ✅ 同步删除映射
    
    scheduleUpdate();
  }
}
// ✅ 新增：批量删除蜂窝
function remove_hex_batch(hexMapIds) {
  if (!Array.isArray(hexMapIds) || hexMapIds.length === 0) return;
  
  let hasChanges = false;
  for (const hexMapId of hexMapIds) {
    if (fillInstances.delete(hexMapId)) {
      outlineInstances.delete(hexMapId);
      hexFillIdByMapId.delete(hexMapId);
      hasChanges = true;
    }
  }
  
  if (hasChanges) {
    scheduleUpdate();  // ✅ 只触发一次
  }
}

// 仅更新颜色（不重建）
const hexFillIdByMapId = new Map();
// 仅更新颜色（不重建）
function updateHexColorOnly(hexMapId, color, id='') {
  if (!hexPrimitive) return false;
  const instId = hexFillIdByMapId.get(hexMapId);
  if (!instId) return false;
  const attrs = hexPrimitive.getGeometryInstanceAttributes(instId);
  if (!attrs) return false;

  attrs.pickId.object.id = id;
  attrs.color = Cesium.ColorGeometryInstanceAttribute.toValue(color);
  viewer?.scene.requestRender();

  // 同步更新保存在 fillInstances 的 GeometryInstance（保持 JS 对象一致）
  const gi = fillInstances.get(hexMapId);
  if (gi) {
    gi.attributes = {
      ...gi.attributes,
      color: Cesium.ColorGeometryInstanceAttribute.fromColor(color) // 用同样的类型保存
    };
  }

  return true;
}
// 优化：内存优化 - 预分配数组
function update_hex(hexs) {
  if (!hexs || !hexs.hexVertex || !hexs.hexVertex.lats || !hexs.hexVertex.lons) {
    console.error('无效的蜂窝数据:', hexs);
    return;
  }

  const vertexCount = hexs.hexVertex.lats.length;
  
  if (vertexCount !== hexs.hexVertex.lons.length) {
    console.error('经纬度数组长度不匹配');
    return;
  }

  if (vertexCount < 3) {
    console.error('蜂窝顶点数量不足');
    return;
  }
  
  const color = new Cesium.Color(...colorFromIndex(hexs.hexColorFactor));
  const id = hexs.hexMapId+','+hexs.hexCenters.lon.toFixed(5)+','+hexs.hexCenters.lat.toFixed(5)+
    ','+hexs.idSat+','+hexs.satPos.lon+','+hexs.satPos.lat+','+hexs.satPos.hgt+
    ','+hexs.satTime+','+hexs.SID;
  // 仅更新颜色，不触发重建, 若失败（比如首次还没建好），继续走重建路径
  if (updateHexColorOnly(hexs.hexMapId, color, id)) {
    // 更新SID标签
    if (hexs.SID > 0) {
      const lbl = getCountSIDLabelById(hexs.hexMapId);
      if (lbl) {
        lbl.text = '' + hexs.SID;
      }
    }
    // 更新实例 ID 信息
    const fillInstance = fillInstances.get(hexs.hexMapId);
    if (fillInstance) {
      fillInstance.id = id;
    }

    return;
  }

  // 每次创建新数组（因为后续会被扩展运算符复制）
  const positionsCartesian = new Array(vertexCount);

  for (let k = 0; k < vertexCount; k++) {
    positionsCartesian[k] = Cesium.Cartesian3.fromDegrees(
      hexs.hexVertex.lons[k],
      hexs.hexVertex.lats[k]
    );
  }

  fillInstances.set(hexs.hexMapId, new Cesium.GeometryInstance({
    id: id,
    geometry: new Cesium.PolygonGeometry({
      polygonHierarchy: new Cesium.PolygonHierarchy(positionsCartesian),
    }),
    attributes: {
      color: Cesium.ColorGeometryInstanceAttribute.fromColor(color),
    },
  }));

  outlineInstances.set(hexs.hexMapId, new Cesium.GeometryInstance({
    id: hexs.hexMapId,
    geometry: new Cesium.GroundPolylineGeometry({
      positions: [...positionsCartesian, positionsCartesian[0]],
      width: 1,
    }),
  }));

  scheduleUpdate();
}

// ✅ 新增：批量添加蜂窝
function update_hex_batch(hexsArray) {
  if (!Array.isArray(hexsArray) || hexsArray.length === 0) return;
  
  let hasChanges = false;

  for (const hexs of hexsArray) {
    if (!hexs || !hexs.hexVertex || !hexs.hexVertex.lats || !hexs.hexVertex.lons) {
      console.error('无效的蜂窝数据:', hexs);
      continue;
    }

    const vertexCount = hexs.hexVertex.lats.length;
    
    if (vertexCount !== hexs.hexVertex.lons.length || vertexCount < 3) {
      console.error('蜂窝数据无效:', hexs);
      continue;
    }
    
    let color = new Cesium.Color(...colorFromIndex(hexs.hexColorFactor));
    const positionsCartesian = new Array(vertexCount);
    // 检查时间是否一个月以前(30 * 24 * 60 * 60 * 1000)
    if (Date.parse(hexs.satTime) + 2592000000 < Date.now() ) {
      // color 为灰色
      color = new Cesium.Color(0.8, 0.8, 0.8, 0.5);
    }

    for (let k = 0; k < vertexCount; k++) {
      positionsCartesian[k] = Cesium.Cartesian3.fromDegrees(
        hexs.hexVertex.lons[k],
        hexs.hexVertex.lats[k]
      );
    }

    fillInstances.set(hexs.hexMapId, new Cesium.GeometryInstance({
      id: hexs.hexMapId+','+hexs.hexCenters.lon.toFixed(5)+','+hexs.hexCenters.lat.toFixed(5)+
        ','+hexs.idSat+','+hexs.satPos.lon+','+hexs.satPos.lat+','+hexs.satPos.hgt+','+hexs.satTime+','+hexs.SID,
      geometry: new Cesium.PolygonGeometry({
        polygonHierarchy: new Cesium.PolygonHierarchy(positionsCartesian),
      }),
      attributes: {
        color: Cesium.ColorGeometryInstanceAttribute.fromColor(color),
      },
    }));

    outlineInstances.set(hexs.hexMapId, new Cesium.GeometryInstance({
      id: hexs.hexMapId,
      geometry: new Cesium.GroundPolylineGeometry({
        positions: [...positionsCartesian, positionsCartesian[0]],
        width: 2,
      }),
    }));

    hasChanges = true;
  }

  if (hasChanges) {
    scheduleUpdate();
  }
}

// 统一的更新调度器（节流）
function scheduleUpdate() {
  const now = Date.now();
  const timeSinceLastUpdate = now - lastUpdateTime;

  if (timeSinceLastUpdate >= UPDATE_INTERVAL) {
    update_hexScene();
    lastUpdateTime = now;
  } else {
    if (updateTimer) clearTimeout(updateTimer);
    updateTimer = setTimeout(() => {
      update_hexScene();
      lastUpdateTime = Date.now();
      updateTimer = null;
    }, UPDATE_INTERVAL - timeSinceLastUpdate);
  }
}

// helper to get label by id
function getCountSIDLabelById(id) {
  if (!countSIDCollection) return null;
  // fast lookup if we maintain the map
  if (countSIDLabelById.has(id)) return countSIDLabelById.get(id);
  // fallback: iterate collection
  for (let i = 0; i < countSIDCollection.length; i++) {
    const lbl = countSIDCollection.get(i);
    if (lbl && lbl.id === id) return lbl;
  }
  return null;
}

// 新增：版本号，避免竞态
let hexSceneVersion = 0;
// 新增：等待 Primitive 就绪（兼容无 readyPromise 的版本）
function waitPrimitiveReady(primitive, scene, timeoutMs = 30000) {
  if (!primitive) return Promise.resolve();
  if (primitive.ready) return Promise.resolve();
  if (primitive.readyPromise && typeof primitive.readyPromise.then === 'function') {
    return primitive.readyPromise;
  }
  
  return new Promise((resolve, reject) => {
    let removeListener = null;
    let timeoutId = null;
    
    const cleanup = () => {
      if (removeListener) {
        try { removeListener(); } catch {}
        removeListener = null;
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };
    
    removeListener = scene.postRender.addEventListener(() => {
      if (primitive.ready) {
        cleanup();
        resolve();
      }
    });
    
    // ✅ 超时保护
    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`Primitive ready 超时 (${timeoutMs}ms)`));
    }, timeoutMs);
  });
}
// 优化：避免重复创建
function update_hexScene() {
  const siteStore = useSiteStore();
  const fillArray = [...fillInstances.values()];
  const outlineArray = [...outlineInstances.values()];

  if (fillArray.length === 0 || outlineArray.length === 0) {
    // 没有实例，移除旧的 Primitive
    if (hexPrimitive) {
      viewer.scene.primitives.remove(hexPrimitive);
      hexPrimitive = null;
    }
    if (hexOutlinePrimitive) {
      viewer.scene.primitives.remove(hexOutlinePrimitive);
      hexOutlinePrimitive = null;
    }
    hexFillIdByMapId.clear(); // ✅ 同步清理映射
    countSIDCollection.removeAll(); // 清理所有标签
    countSIDLabelById.clear(); // 清理标签映射
    return;
  }
  //console.log('fillArray length:', fillArray.length, 'outlineArray length:', outlineArray.length);

  /// 记录旧引用
  const prevFill = hexPrimitive;
  const prevOutline = hexOutlinePrimitive;

  // 创建新 Primitive 并加入场景
  const prim = buildFillPrimitive(fillArray);
  const outlinePrim = buildOutlinePrimitive(outlineArray);
  viewer.scene.primitives.add(prim);
  viewer.scene.primitives.add(outlinePrim);

  const myVersion = ++hexSceneVersion;

  const fillReady = waitPrimitiveReady(prim, viewer.scene);
  const outlineReady = waitPrimitiveReady(outlinePrim, viewer.scene);

  Promise.all([fillReady, outlineReady]).then(() => {
    if (!viewer || viewer.isDestroyed?.()) return;

    // 不是最新版本：自清理，避免竞态残留
    if (myVersion !== hexSceneVersion) {
      try { viewer.scene.primitives.remove(prim); } catch {}
      try { viewer.scene.primitives.remove(outlinePrim); } catch {}
      return;
    }

    // 新的已就绪，安全移除旧的
    if (prevFill && !prevFill.isDestroyed?.()) {
      try { viewer.scene.primitives.remove(prevFill); } catch {}
    }
    if (prevOutline && !prevOutline.isDestroyed?.()) {
      try { viewer.scene.primitives.remove(prevOutline); } catch {}
    }

    // 更新当前引用
    hexPrimitive = prim;
    hexOutlinePrimitive = outlinePrim;

    hexFillIdByMapId.clear();
    // 新增：更新每个蜂窝SID计数标注
    countSIDCollection.removeAll();
    countSIDLabelById.clear();
    for (const [hexMapId, instance] of fillInstances) {
      // 新增：建立“hexMapId -> 实例 id”映射，供颜色直改
      hexFillIdByMapId.set(hexMapId, instance.id);

      // hexMapId, lon, lat, idSat, satLon, satLat, satHgt, satTime, SID
      const [hId, lon, lat, idSat, satLon, satLat, satHgt, satTime, SID] = instance.id.split(','); 
      //console.log(`蜂窝 ${hexMapId} SID 计数: ${SID}`, hId, lon, lat, idSat, satLon, satLat, satHgt, satTime, SID);
      let text = '';
      if (SID !== 'undefined' && SID !== '0') text = `${SID}`;
      const label = countSIDCollection.add({
        position: Cesium.Cartesian3.fromDegrees(parseFloat(lon), parseFloat(lat), 150),
        text: text,
        font: '16px halvetica, sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.YELLOW,
        outlineWidth: 2,
        scale: 1.0,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        //eyeOffset: new Cesium.Cartesian3(0, 0, -100),
        scaleByDistance: new Cesium.NearFarScalar(150, 2, 8000000, 0.1),
        id: hexMapId,
      });
      countSIDLabelById.set(hexMapId, label);
    }

    // 计算并缓存包围球
    //const allPoints = sitePoints ? [...sitePoints] : [];
    const allPoints = [];
    fillInstances.forEach((instance) => {
      const geometry = instance.geometry;
      if (geometry && geometry._polygonHierarchy) {
        const positions = geometry._polygonHierarchy.positions;
        if (Array.isArray(positions)) {
          allPoints.push(...positions);
        }
      }
    });
    if (allPoints.length > 0) {
      // 更新全局的 downwardBoundingSphere
      siteStore.downwardBoundingSphere = Cesium.BoundingSphere.fromPoints(allPoints);
    }

    viewer.scene.requestRender?.();
  }).catch(err => {
    console.warn('update_hexScene ready failed:', err);
    // 失败：移除新建的，并恢复旧的显示
    try { viewer.scene.primitives.remove(prim); } catch {}
    try { viewer.scene.primitives.remove(outlinePrim); } catch {}
  });
}

// 批量更新站点模型位置
function update_sitePos(siteInfo, lon, lat, alt) {
  if (siteInfo && siteInfo.model) {
    const modelMatrix = calc_siteModel_pos(lon, lat, alt);
    siteInfo.model.modelMatrix = modelMatrix;
    api.updateSiteLocation(siteInfo.name, {lon, lat, alt}); // 异步更新后台数据
  }
  viewer?.scene.requestRender();
}
const throttledUpdateSitePos = throttle(update_sitePos, 200);

// 开关蜂窝-卫星连线
const trigger_hexSatLine = ({
  hexId,
  hexLon,
  hexLat,
  satLon,
  satLat,
  satHgt
}) => {
  if (hexSatLineMap.has(hexId)) {
    const {line, point} = hexSatLineMap.get(hexId);
    hexSatLines.remove(line);
    hexSatPoints.remove(point);
    hexSatLineMap.delete(hexId);
  } else {
    const dfLine = hexSatLines.add({
      positions: [
        Cesium.Cartesian3.fromDegrees(hexLon, hexLat, 0),
        Cesium.Cartesian3.fromDegrees(satLon, satLat, satHgt)
      ],
      width: 1,
      material: Cesium.Material.fromType('PolylineDash', {
        color: Cesium.Color.BURLYWOOD.withAlpha(0.9),     // 线颜色
        gapColor: Cesium.Color.TRANSPARENT,            // 虚线间隙颜色
        dashLength: 16,                                 // 每段长度（像素）
        // dashPattern: 0xFF00                          // 可选：16位虚线模式
      })
    });
    const point = hexSatPoints.add({
      position: Cesium.Cartesian3.fromDegrees(satLon, satLat, satHgt),
      pixelSize: 6,
      color: Cesium.Color.WHITE.withAlpha(0.7),
      outlineColor: Cesium.Color.BLACK.withAlpha(0.9),
      outlineWidth: 1,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    });
    hexSatLineMap.set(hexId, {line: dfLine, point: point});
  }
}

async function wsDownward() {
  const cesiumStore = useCesiumStore();
  viewer = cesiumStore.getViewer();
  if (!viewer) {
    console.error('Cesium viewer 未初始化');
    return;
  }

  const siteStore = useSiteStore();
  const sites = Object.values(siteStore.sites).filter(s => s.name.includes('下行'));

  if (sites.length === 0) {
    console.warn('没有配置下行站点');
    return;
  }

  // 蜂窝-卫星连线
  hexSatLines = viewer.scene.primitives.add(new Cesium.PolylineCollection());
  hexSatPoints = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
  hexSatLineMap = new Map();
  
  countSIDCollection = viewer.scene.primitives.add(new Cesium.LabelCollection());

  for (const site of sites) {
    // 初始化实例容器
    const siteInfo = {
      name: site.name,
      gid: site.group,
      mfid: site.mfid,
      model: null,
      curWs: null,
    };
    devSites.set(site.mfid, siteInfo);

    // create site model
    await load_siteModel(siteInfo, site.lon, site.lat, site.alt);

    // 建立 WebSocket 连接
    siteInfo.curWs = new WsClient(
      `ws://${import.meta.env.VITE_HOST}:${site.port + siteStore.wssPortOffset}`,
      (data) => {
        try {
          const json = decode_stream_downward(data);
          //console.log('下行收到数据:', json);
          
          if (json.status) {
            //console.log('下行设备状态:', json.status);
          }

          if (json.decodeInfos && json.decodeInfos.length > 0) {
            // ✅ 修复：先检查第一个元素的 taskId
            const firstTaskId = json.decodeInfos[0].taskId;
            
            // ✅ 只有当收到新 taskId 时才清理旧状态
            if (currentTask !== null && currentTask !== firstTaskId) {
              console.log(`任务切换: ${currentTask} -> ${firstTaskId}`);
              fillInstances.clear();
              outlineInstances.clear();
              hexFillIdByMapId.clear();
              hexIds.clear();
              countSIDCollection.removeAll();
              countSIDLabelById.clear();
              
              // 触发场景更新以清空旧 Primitive
              scheduleUpdate();
            }
            
            // 更新当前任务ID
            currentTask = firstTaskId;

            for (const info of json.decodeInfos) {
              // 蜂窝部分
              if (info.hexMapId) {
                const sidCount = JSON.parse(info.SID).length;
                // 优化：更新 hexIds
                const currentCount = hexIds.get(info.hexMapId)?.count || 0;
                const currentSIDCount = hexIds.get(info.hexMapId)?.countSID || 0;
                hexIds.set(info.hexMapId, {
                  count: currentCount + 1, 
                  countSID: currentSIDCount + sidCount,  // should be wrong JSON.parse
                });

                // 蜂窝部分
                const hex = {
                  idSat: info.idSat,
                  satPos: {
                    lon: info.posSatLongitude,
                    lat: info.posSatLatitude,
                    hgt: info.posSatHeight,
                  },
                  satTime: formatDateTime(new Date(info.satTimestamp * 1000)),
                  hexMapId: info.hexMapId,
                  hexColorFactor: Math.min(hexIds.get(info.hexMapId)?.count / MAX_COLOR_IDX, 1),
                  hexCenters: {
                    lon: info.posHexLongitude,
                    lat: info.posHexLatitude,
                    hgt: info.posHexHeight,
                  },
                  hexVertex: {
                    lats: info.hexLatitude,
                    lons: info.hexLongitude,
                  },
                  SID: hexIds.get(info.hexMapId)?.countSID,
                };
                
                update_hex(hex);

                if (siteStore.iWarningSID && sidCount > 0) {
                  iSIDShow.value = true;
                  // 自动隐藏提示
                  if (SIDTimeout) {
                    clearTimeout(SIDTimeout);
                  }
                  SIDTimeout = setTimeout(() => {
                    iSIDShow.value = false;
                    SIDTimeout = null;
                  }, 5000);     // 5 秒后自动隐藏
                }
              }

              // 使用节流更新站点位置
              if (info.antennaLongitude && info.antennaLatitude && info.antennaAltitude) {
                const lon = info.antennaLongitude;
                const lat = info.antennaLatitude;
                const alt = info.antennaAltitude;
                
                // ✅ 使用误差范围比较
                const lonChanged = Math.abs(site.lon - lon) > EPSILON;
                const latChanged = Math.abs(site.lat - lat) > EPSILON;
                const altChanged = Math.abs(site.alt - alt) > EPSILON;
                
                if (lonChanged || latChanged || altChanged) {
                  throttledUpdateSitePos(siteInfo, lon, lat, alt);
                  
                  site.lon = lon;
                  site.lat = lat;
                  site.alt = alt;
                  
                  // ✅ 更新 sitePoints 中对应的点
                  //const siteIndex = sites.indexOf(site);
                  //if (siteIndex > -1 && sitePoints) {
                  //  sitePoints[siteIndex] = Cesium.Cartesian3.fromDegrees(lon, lat, alt);
                  //}
                }
              }

              // 卫星连线部分
              if(info.satName) {
                const idx  = siteStore.satData.findIndex(t => t.name === info.satName);
                if (idx > -1 && site.connectedSatIdx !== idx) {
                  site.previousSatIdx = site.connectedSatIdx;
                  site.connectedSatIdx = idx;
                  site.iConnectedSatChange = true;
                }
              };
            }
          }
        } catch (error) {
          console.error('处理下行数据时出错:', error);
        }
      }//, (status) => {
      //  console.log(`下行${site.port} WebSocket 连接状态:`, status);
      //}
    );

    // resume previous hexScene
    update_hexScene();

    /* 
    //测试数据 
    const hexs = {
          idSat: 3844,
          satPos: {
            lon: 102.51908639179983,
            lat: 27.079248230313873,
            hgt: 540472.2954649677,
          },
          satTime: formatDateTime(new Date(1731031372 * 1000)),
          hexMapId: 12269623,
          hexColorFactor: 3/MAX_COLOR_IDX,
          hexCenters: {
            lon: 98.0428804150404,
            lat: 23.97885515356539,
            hgt: 0.3147998388115936,
          },
          hexVertex: {
            lats: [
              23.953594702731674,
              24.042511683775473,
              24.067740933853855,
              24.004048454386176,
              23.915122872149933,
              23.889898308561662
            ],
            lons: [
              98.14246012677027,
              98.11662463110243,
              98.01700989921915,
              97.943273071038,
              97.96916219231576,
              98.06873463774606
            ],
          }
        };
        update_hex(hexs);
    const hexs1 = {
          idSat: 3844,
          satPos: {
            lon: 102.51908639179983,
            lat: 27.079248230313873,
            hgt: 540472.2954649677,
          },
          satTime: formatDateTime(new Date(1731031372 * 1000)),
          hexMapId: 12269624,
          hexColorFactor: 25/MAX_COLOR_IDX,
          hexCenters: {
            lon: 98.4428804150404,
            lat: 23.97885515356539,
            hgt: 0.3147998388115936,
          },
          hexVertex: {
            lats: [
              23.953594702731674,
              24.042511683775473,
              24.067740933853855,
              24.004048454386176,
              23.915122872149933,
              23.889898308561662
            ],
            lons: [
              98.54246012677027,
              98.51662463110243,
              98.41700989921915,
              98.343273071038,
              98.36916219231576,
              98.46873463774606
            ],
          }
        };
        update_hex(hexs1);
        
              const tlon = 104.03135681152344+Math.random()*10;
              const tlat = 30.609342575073242+Math.random()*10;
              throttledUpdateSitePos(siteInfo, tlon, tlat, 517.5919799804688);
              scheduleUpdate();  // siteInfo.lon 将会更新
              site.lon = tlon;
              site.lat = tlat;
              site.alt = 517.5919799804688;

                //const idx  = siteore.satData.findIndex(t => t.name === "STARLINK-34522");
                const idx = site.group==1 ? 7804 : 7844;
                site.previousSatIdx = site.connectedSatIdx;
                site.connectedSatIdx = idx;
                site.iConnectedSatChange = true;

                setTimeout(() => {
                  const tlon = 94.03135681152344+Math.random()*10;
                  const tlat = 25.609342575073242+Math.random()*10;
                  throttledUpdateSitePos(siteInfo, tlon, tlat, 517.5919799804688);
                  scheduleUpdate();  // siteInfo.lon 将会更新
                  site.lon = tlon;
                  site.lat = tlat;
                  site.alt = 517.5919799804688;
              
                  //const idx = siteore.satData.findIndex(t => t.name === "STARLINK-34233");
                  const idx = site.group==1 ? 7804 : 7844;
                  site.previousSatIdx = site.connectedSatIdx;
                  site.connectedSatIdx = idx;
                  site.iConnectedSatChange = true;
                }, 8000);
    */

  }
}

// 控制下行站点开关机
function switch_power_downward(iOn, siteName) {
  //const site = Object.values(siteStore.sites).find(el => el.name === siteName)
  const siteInfo = devSites.values().find(el => el.name === siteName);
  if (!siteInfo) {
    $message.error(`未找到设备: ${siteName}`);
    return;
  }
  api.switch_power({
    power: iOn ? 1 : 0,
    mfid: siteInfo.mfid
  }).then((res)=>{
    if (res.data) {
      // success
      siteInfo.model && (siteInfo.model.color = Cesium.Color.fromCssColorString(
        iOn ? 'rgba(130, 255, 130, 1.0)' : 'rgba(230, 255, 230, 1.0)'
      ));
      viewer?.scene.requestRender();
      $message.success(`${siteName}: ${iOn ? '开机' : '关机'}成功`);
    } else {
      $message.error(`${siteName}: ${iOn ? '开机' : '关机'}失败`);
    }
  });
}

// 优化：完善的资源清理
function unloadDownward() {
  const siteStore = useSiteStore();
  if (updateTimer) {
    clearTimeout(updateTimer);
    updateTimer = null;
  }
  
  // 清理缓存
  colorCache.clear();

  // 关闭 WebSocket
  for (const [mfid , siteInfo] of devSites) {
    // 清理模型
    if (siteInfo.model && viewer) {
      viewer.scene.primitives.remove(siteInfo.model);
      siteInfo.model = null;
    }
    
    // 关闭 WebSocket
    if (siteInfo.curWs?.socket) {
      try {
        siteInfo.curWs.socket.close();
      } catch (err) {
        console.error('关闭 WebSocket 失败:', err);
      }
      siteInfo.curWs = null;
    }

    // 清除连接卫星idx
    siteStore.sites[mfid].connectedSatIdx = null;
  }
  devSites.clear();

  if (viewer) {
    if (hexPrimitive) {
      viewer.scene.primitives.remove(hexPrimitive);
      hexPrimitive = null;
    }
    if (hexOutlinePrimitive) {
      viewer.scene.primitives.remove(hexOutlinePrimitive);
      hexOutlinePrimitive = null;
    }
    
    if (countSIDCollection) {
      countSIDCollection.removeAll(); // 清理所有标签
      countSIDCollection = null;
    }
    //fillInstances?.clear();
    //outlineInstances?.clear();
    //fillInstances = null;
    //outlineInstances = null;

    if (hexSatLines) {
      viewer.scene.primitives.remove(hexSatLines);
      hexSatLines = null;
    }
    if (hexSatPoints) {
      viewer.scene.primitives.remove(hexSatPoints);
      hexSatPoints = null;
    }
    hexSatLineMap?.clear();

    //viewer = null;
  }
  //hexIds.clear();
  //hexIds = null;
  lastUpdateTime = 0;
}

//export { unloadDownward, wsDownward, update_hex, update_hex_batch, iSIDShow,
//  remove_hex, remove_hex_batch, trigger_hexSatLine, switch_power_downward };
export { unloadDownward, wsDownward, update_hex_batch, iSIDShow,
  remove_hex_batch, trigger_hexSatLine, switch_power_downward };