// Upward.js
import * as Cesium from "cesium";
import { useCesiumStore, useSiteStore } from '@/store';
import { WsClient } from '@/utils/wsSocket'
import { decode_stream_upward, throttle } from '@/utils';
import dfModelUrl from '@/assets/models/df.glb?url';
import LatLon from 'geodesy/latlon-nvector-spherical.js';         // faster but less accurate
import { DF_LINE_LENGTH } from '@/constants';
import api from '@/api'

// 优化：批量更新相关变量
let updateTimer = null;
let lastUpdateTime = 0;
const UPDATE_INTERVAL = 100;       // ms

// 待更新的站点队列
const pendingDfLineUpdates = new Map();
const EPSILON = 1e-5;             // 1 meter resolution

// 共享变量
let viewer = null;
const devSites = new Map();
let sitePoints = null;
const devGroups = new Map();
let dfLineCollection = null;
let dfTargetCollection = null;
const iTargetShow = ref(false);
let targetTimeout = null;
let curLineTargetGid = null;
let preRecordTime = 0;        // 上一次处理的记录时间，避免重复处理, 三站都工作时需要
const polylineIndex = new Map();     // id -> polyline 映射，便于删除
const sitePolylineIndex = new Map(); // 站点 mfid -> Set<polyline id> 映射，便于按站点删除

function removePolylineById(id) {
  if (!dfLineCollection) return false;
  const lines = polylineIndex.get(id);
  let removed = false;
  if (Array.isArray(lines)) {
    // 方案1：一个 id 对应多个 polyline
    for (const line of lines) {
      if (line) dfLineCollection.remove(line);
    }
    removed = lines.length > 0;
  } else if (lines) {
    // 兼容旧格式
    dfLineCollection.remove(lines);
    removed = true;
  }
  polylineIndex.delete(id);

  // 从所有站点索引中移除该 id（同一条线可能挂在多个站点）
  for (const [mfid, idSet] of Array.from(sitePolylineIndex.entries())) {
    if (!idSet) continue;
    if (idSet.delete(id) && idSet.size === 0) {
      sitePolylineIndex.delete(mfid);
    }
  }

  return removed;
}

// calculate model matrix
function calc_siteModel_pos(lon, lat, alt, heading=225, pitch=0, roll=0) {
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
      url: dfModelUrl,
      modelMatrix: modelMatrix,
      color: new Cesium.Color(0.9, 0.95, 0.9, 1.0),
      colorBlendMode: Cesium.ColorBlendMode.MIX,
      colorBlendAmount: 0.5,
      silhouetteColor: Cesium.Color.DARKSLATEBLUE,
      silhouetteSize: 4,
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

// 通过 group 在 BillboardCollection 中查找 billboard
function getBillboardByGroup(collection, targetType='lineTarget', group) {
  if (!collection) return [];
  const out = [];
  for (let i = 0; i < collection.length; i++) {
    const item = collection.get(i);
    let tIds = item.id.split('_');
    const tTarget = tIds[0]; // 提取 target 部分
    const tGroup = tIds[tIds.length-2]; // 提取 group 部分
    if (tGroup === group && tTarget === targetType) out.push(item);
  }
  return out;
}

const del_targetsByType = (targetType, gid) => {
  if (!viewer || !dfTargetCollection) {
    return;
  }
  // remove gid in id target
  const prevTargets = getBillboardByGroup(dfTargetCollection, targetType, gid);
  prevTargets.forEach(prevTarget => {
    dfTargetCollection.remove(prevTarget);
  });
  viewer.scene.requestRender();
}

// 通过 id 在 BillboardCollection 中查找 billboard
function getBillboardById(collection, gid) {
  if (!collection) return [];
  const out = [];
  for (let i = 0; i < collection.length; i++) {
    const item = collection.get(i);
    let tIds = item.id.split('_');
    const tGid = tIds[0]+'_'+tIds[tIds.length-2]+'_'+tIds[tIds.length-1]; // 提取 gid 部分
    if (tGid === gid) out.push(item);
  }
  return out;
}

const del_targets = (gid) => {
  if (!viewer || !dfTargetCollection) {
    return;
  }
  // remove gid in id target
  const prevTargets = getBillboardById(dfTargetCollection, gid);
  prevTargets.forEach(prevTarget => {
    dfTargetCollection.remove(prevTarget);
  });
  viewer.scene.requestRender();
}

// 高性能：一次遍历 dfTargetCollection，删除一组 gids
const del_targets_batch = (gids) => {
  if (!viewer || !dfTargetCollection || !Array.isArray(gids) || gids.length === 0) {
    return;
  }

  const gidSet = new Set(gids);

  // 从后往前遍历可以避免删除时影响未遍历元素的索引
  for (let i = dfTargetCollection.length - 1; i >= 0; i--) {
    const item = dfTargetCollection.get(i);
    if (!item || !item.id) continue;
    const parts = String(item.id).split('_');
    if (parts.length < 3) continue;
    const tGid = parts[0] + '_' + parts[parts.length - 2] + '_' + parts[parts.length - 1];
    if (gidSet.has(tGid)) {
      dfTargetCollection.remove(item);
    }
  }

  viewer.scene.requestRender();
}

const update_lineTarget = (points, time, gid) => {
  if (!viewer || !dfTargetCollection) {
    return;
  }

  // check existing targets
  const groupId = 'lineTarget_'+gid+'_'+time;
  const prevTargets = getBillboardById(dfTargetCollection, groupId);
  if (prevTargets.length < points.length) {
    points.forEach(p => {
      const lon = p.lon;
      const lat = p.lat;
      const id = 'lineTarget_'+lon.toFixed(3)+'_'+lat.toFixed(3)+'_'+gid+'_'+time;
      // create df target billboard
      dfTargetCollection.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
        image: '/images/target.png',
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        horizontalOrigin : Cesium.HorizontalOrigin.CENTER,
        // optional: keep it “pinned” so it scales/rotates with the view
        eyeOffset: new Cesium.Cartesian3(0, 0, 0),
        color: Cesium.Color.YELLOW,
        show: true,
        id: id,
        scale: 1.5,
        minimumPixelSize: 72,
      });
    });
  }
  viewer.scene.requestRender();
}

const update_lineTarget_batch = (lineTargets) => {
  if (!viewer || !dfTargetCollection) {
    return;
  }

  // check existing targets
  for (const { points, time, gid } of lineTargets) {
    points.forEach(p => {
      const lon = p.lon;
      const lat = p.lat;
      const id = 'lineTarget_'+lon.toFixed(3)+'_'+lat.toFixed(3)+'_'+gid+'_'+time;
      // create df target billboard
      dfTargetCollection.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
        image: '/images/target.png',
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        horizontalOrigin : Cesium.HorizontalOrigin.CENTER,
        // optional: keep it “pinned” so it scales/rotates with the view
        eyeOffset: new Cesium.Cartesian3(0, 0, 0),
        color: Cesium.Color.YELLOW,
        show: true,
        id: id,
        scale: 1.5,
        minimumPixelSize: 72,
      });
    });
  }
  viewer.scene.requestRender();
}

let tdoaTargetGid = null;
const update_tdoaTarget = (lon, lat, time, gid) => {
  if (!viewer || !dfTargetCollection) {
    return;
  }

  const id = 'tdoaTarget_'+gid+'_'+time;
  // create df target billboard
  dfTargetCollection.add({
    position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
    image: '/images/target.png',
    verticalOrigin: Cesium.VerticalOrigin.CENTER,
    horizontalOrigin : Cesium.HorizontalOrigin.CENTER,
    // optional: keep it “pinned” so it scales/rotates with the view
    eyeOffset: new Cesium.Cartesian3(0, 0, 0),
    color: Cesium.Color.RED,
    show: true,
    id: id,
    scale: 1.5,
    minimumPixelSize: 72,
  });
  viewer.scene.requestRender();
}

// 统一的更新调度器（节流）
function scheduleUpdate() {
  const now = Date.now();
  const timeSinceLastUpdate = now - lastUpdateTime;

  if (timeSinceLastUpdate >= UPDATE_INTERVAL) {
    update_dfLineScene();
    lastUpdateTime = now;
  } else {
    if (updateTimer) clearTimeout(updateTimer);
    updateTimer = setTimeout(() => {
      update_dfLineScene();
      lastUpdateTime = Date.now();
      updateTimer = null;
    }, UPDATE_INTERVAL - timeSinceLastUpdate);
  }
}

// 批量更新站点模型位置
function update_sitePos(siteInfo, lon, lat, alt) {
  if (siteInfo && siteInfo.model) {
    const modelMatrix = calc_siteModel_pos(lon, lat, alt);
    siteInfo.model.modelMatrix = modelMatrix;
    siteInfo.model.id = siteInfo.name+','+lon.toFixed(3)+','+lat.toFixed(3)+','+alt.toFixed(0)+
    ','+siteInfo.gid+','+siteInfo.mfid;
    api.updateSiteLocation(siteInfo.name, {lon, lat, alt}); // 异步更新后台数据

    viewer?.scene.requestRender();
  }
}
const throttledUpdateSitePos = throttle(update_sitePos, 100);

function clear_site_dfLines(mfid) {
  if (!viewer || !dfLineCollection) {
    return;
  }

  let removedAny = false;

  // ✅ 优先走站点索引：O(k)
  const siteIds = sitePolylineIndex.get(mfid);
  if (siteIds && siteIds.size > 0) {
    for (const id of siteIds) {
      removedAny = removePolylineById(id) || removedAny;
    }
    sitePolylineIndex.delete(mfid);
  }

  // ✅ 兜底1：实时线可能直接用 mfid 作为 id
  if (!removedAny) {
    removedAny = removePolylineById(mfid) || removedAny;
  }

  if (removedAny) {
    viewer.scene.requestRender();
  }
}

// 通过 id 在 PolylineCollection 中查找 polyline
function getPolylineById(collection, id) {
  if (!collection) return [];
  const out = [];
  for (let i = 0; i < collection.length; i++) {
    const item = collection.get(i);
    if (item.id === id) out.push(item);
  }
  return out;
}

function clear_dfLines(ids) {
  if (!viewer || !dfLineCollection || !Array.isArray(ids) || ids.length === 0) {
    return;
  }

  for (const id of ids) {
    removePolylineById(id);
  }

  viewer.scene.requestRender();
}

const update_dfLine_batch = (dfLineArr) => {
  if (!viewer || !dfLineCollection) {
    return;
  }

  const allPoints = [];
  for (const { id, mfids, dfLines } of dfLineArr) {
    allPoints.push(...draw_dfLines(id, mfids, dfLines));
  }

  viewer?.scene.requestRender();

  // ✅ 更新包围球
  if (allPoints.length > 0) {
    try {
      const siteStore = useSiteStore();
      siteStore.upwardBoundingSphere = Cesium.BoundingSphere.fromPoints([...allPoints, ...sitePoints]);
    } catch (err) {
      console.error('更新包围球失败:', err);
    }
  }

}

// 优化：避免重复创建
function update_dfLineScene() {
  if (!viewer || pendingDfLineUpdates.size === 0) {
    return;
  }

  const allPoints = [];

  for (const [mfid, lines] of pendingDfLineUpdates) {
    // 清除旧线
    clear_site_dfLines(mfid);
        
    // 添加新线
    allPoints.push(...draw_dfLines(mfid, [mfid], [lines]));
  }

  viewer?.scene.requestRender();

  // ✅ 更新包围球
  if (allPoints.length > 0) {
    try {
      const siteStore = useSiteStore();
      siteStore.upwardBoundingSphere = Cesium.BoundingSphere.fromPoints([...allPoints, ...sitePoints]);
    } catch (err) {
      console.error('更新包围球失败:', err);
    }
  }

  pendingDfLineUpdates.clear();
}

const draw_dfLines = (id, mfids, dfLines) => {
  const allPoints = [];
  // 避免重复：同 id 重新绘制时先移除旧 polyline
  removePolylineById(id);

  const polylines = [];  // 方案1：一个 id 存储多个 polyline

  for (const lines of dfLines) {
    if (!lines || lines.length === 0) continue;

    const positions = [];
    lines.forEach(({ lon, lat, angle }) => {
      const normalizedAngle = ((angle % 360) + 360) % 360;
      const Pstart = new LatLon(lat, lon);
      const Pend = Pstart.destinationPoint(DF_LINE_LENGTH, normalizedAngle);
      const startPos = Cesium.Cartesian3.fromDegrees(Pstart.lon, Pstart.lat, 0);
      const endPos = Cesium.Cartesian3.fromDegrees(Pend.lon, Pend.lat, 0);

      positions.push(startPos, endPos);
      allPoints.push(endPos);
    });

    if (positions.length > 0) {
      const polyline = dfLineCollection.add({
        id,
        positions,
        width: 1,
        material: Cesium.Material.fromType('Color', {
          color: Cesium.Color.CYAN.withAlpha(0.7),
        }),
      });
      polylines.push(polyline);
    }
  }

  if (polylines.length > 0) {
    polylineIndex.set(id, polylines);
    mfids.forEach(mfid => {
      if (!sitePolylineIndex.has(mfid)) {
        sitePolylineIndex.set(mfid, new Set());
      }
      sitePolylineIndex.get(mfid).add(id);
    });
  }

  return allPoints;
}

// 根据经纬度在 sites 中匹配站点（最近邻，带米级容差）
function findSiteMfidByCoord(sites, lon, lat, toleranceMeters = 50) {
  if (!Array.isArray(sites) || sites.length === 0) return null;
  let best = null;
  let bestDist = Number.POSITIVE_INFINITY;
  const p2 = Cesium.Cartographic.fromDegrees(lon, lat);
  for (const s of sites) {
    const p1 = Cesium.Cartographic.fromDegrees(s.lon, s.lat);
    const geodesic = new Cesium.EllipsoidGeodesic(p1, p2);
    const dist = geodesic.surfaceDistance;
    if (dist < bestDist) {
      bestDist = dist;
      best = s;
    }
  }
  return bestDist <= toleranceMeters ? best.mfid : null;
}

// 松散格式键值对字符串解析为对象（增强：去花括号/换行）
function parseKVListToObj(parts) {
  const out = {};
  for (const raw of parts) {
    // 去掉首尾花括号/空白/换行
    const part = String(raw).trim().replace(/^[{\s]+|[}\s]+$/g, '');
    const i = part.indexOf(':');
    if (i < 0) continue;
    let key = part.slice(0, i).trim().replace(/^[{\s]+|[}\s]+$/g, '');
    let val = part.slice(i + 1).trim().replace(/^[{\s]+|[}\s]+$/g, '');
    // 去掉可能的收尾引号
    if (/^-?\d+(\.\d+)?$/.test(val)) val = Number(val);
    else val = val.replace(/^['"]|['"]$/g, '');
    out[key] = val;
  }
  return out;
}

async function wsUpward() {
  const cesiumStore = useCesiumStore();
  viewer = cesiumStore.getViewer();
  if (!viewer) {
    console.error('Cesium viewer 未初始化');
    return;
  }

  const siteStore = useSiteStore();
  const sites = Object.values(siteStore.sites).filter(s => s.name.includes('上行'));
  if (sites.length === 0) {
    console.warn('没有配置上行站点');
    return;
  }

  dfLineCollection = viewer.scene.primitives.add(new Cesium.PolylineCollection());
  dfTargetCollection = viewer.scene.primitives.add(new Cesium.BillboardCollection({
    scene: viewer.scene
  }));

  sitePoints = sites.map(site => Cesium.Cartesian3.fromDegrees(site.lon, site.lat, site.alt));
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

    // 显示站点探测范围
    site.create_range(viewer);

    // 建立 WebSocket 连接
    siteInfo.curWs = new WsClient(
      `ws://${import.meta.env.VITE_HOST}:${site.port + siteStore.wssPortOffset}`,
      (data) => {
        try {
          const info = JSON.parse(data.toString());
          
          if (info.type === 'gps') {
            // 使用节流更新站点位置
            const lon = info.lon;
            const lat = info.lat;
            const alt = info.alt;

            // ✅ 使用误差范围比较
            const lonChanged = Math.abs(site.lon - lon) > EPSILON;
            const latChanged = Math.abs(site.lat - lat) > EPSILON;
            const altChanged = Math.abs(site.alt - alt) > EPSILON;
            
            if ((lonChanged || latChanged || altChanged) && (Math.abs(lon)>0.1 || Math.abs(lat)>0.1)) { // (lon,lat) != (0,0)
            //if (lonChanged || latChanged || altChanged) {
              throttledUpdateSitePos(siteInfo, lon, lat, alt );
              
              site.lon = lon;
              site.lat = lat;
              site.alt = alt;
              
              // ✅ 更新 sitePoints 中对应的点
              const siteIndex = sites.indexOf(site);
              if (siteIndex > -1 && sitePoints) {
                sitePoints[siteIndex] = Cesium.Cartesian3.fromDegrees(lon, lat, alt);
              }
            }
          } 
        } catch (error) {
          console.error('处理上行数据时出错:', error);
        }
      }//, (status) => {
      //  console.log(`上行${site.port} WebSocket 连接状态:`, status);
      //}
    );
  }

  // 建立分组 WebSocket 连接
  const groups = new Set(sites.map(site => site.group));
  for (const gid of groups) {
    let port = siteStore.get_group_port(gid);
    if (!port) {
      continue;
    }
    const curWs = new WsClient(
      `ws://${import.meta.env.VITE_HOST}:${port + siteStore.wssPortOffset}`,
      (data) => {
        try {
          const dataStr = decode_stream_upward(data);
          const records = dataStr.split('#');
          records.forEach(recStr => {
            process_upward_record(recStr, gid);
          });
        } catch (error) {
          console.error('处理上行数据时出错:', error);
        }
      }
    );
    devGroups.set(gid, curWs);

    /*
     pendingSiteDfUpdates.set('10000001000002', [{
              lon: 116.3573,
              lat: 40.6487,
              alt: 0,
              angle: 200,
            }]);
     pendingSiteDfUpdates.set('10000001000003', [{
              lon: 116.93317,
              lat: 39.3403,
              alt: 0,
              angle: 300,
            }]);
     pendingSiteDfUpdates.set('10000001000004', [{
              lon: 115.06,
              lat: 39.2396,
              alt: 0,
              angle: 50,
            }]);

            scheduleUpdate();
            //update_tdoaTarget(115.93317, 39.7896, 1, '2023-10-01 12:00:00');
            */
  }

  function process_upward_record(dataStr, gid) {
    if (dataStr.trim() === '') {
      return;
    }
    const infos = dataStr.split(',');
    const type = infos[0];
    const info = parseKVListToObj(infos.slice(1));

    if (type === 'Direction') {
      // 更新测向线
      let mfid = sites[(+info.ID) - 1]?.mfid;
      // let mfid = findSiteMfidByCoord(sites, Number(info.Lng), Number(info.Lat));
      if (mfid) {
        let lines = [];
        // 多角度用“|”分隔
        if (typeof info.Angle === 'string' && info.Angle.includes('|')) {
          lines = info.Angle.split('|').map(a => ({
            angle: Number(a),
            lon: Number(info.Lng),
            lat: Number(info.Lat),
          })).filter(x => Number.isFinite(x.angle));
        } else {
          const angleNum = Number(info.Angle);
          if (Number.isFinite(angleNum)) {
            lines = [{
              angle: angleNum,
              lon: Number(info.Lng),
              lat: Number(info.Lat),
            }];
          }
        }
        if (lines.length > 0) {
          pendingDfLineUpdates.set(mfid, lines);
          scheduleUpdate();
        }
      } else {
        console.warn('未匹配到上行站点:', info);
      }

    } else if (type === 'Result') {
      let points = [];
      // 多交叉定位用“|”分隔
      //console.log('Result info:', info);
      if (typeof info.Lng === 'string' && info.Lng.includes('|')) {
        let lons = info.Lng.split('|').map(a => Number(a));
        let lats = info.Lat.split('|').map(a => Number(a));
        points = lons.map((lon, i) => ({
          lon,
          lat: lats[i],
        }));
      } else {
        if (Number.isFinite(info.Lng) && Number.isFinite(info.Lat)) {
          points = [{
            lon: Number(info.Lng),
            lat: Number(info.Lat),
          }];
        }
      }
      if (points.length > 0) {
        let groupId = 'lineTarget_'+gid+'_'+info.Time;
        let curTime = info.Time;
        if (
          (sites.filter(s => s.status === 2).length === 3) && // 三个设备都工作
          (Math.abs(Date.parse(info.Time) - preRecordTime) < 1000) // 和上一个记录小于1秒
        ) {
          // 三站都工作时，处理第二个交叉定位
          groupId = curLineTargetGid;
          curTime = curLineTargetGid.split('_')[2]; // 上一个info.Time
        }
        if (curLineTargetGid && curLineTargetGid !== groupId) {
          // remove previous target
          del_targets(curLineTargetGid);
        }
        curLineTargetGid = groupId;
        preRecordTime = Date.parse(info.Time);
        // 更新测向目标位置
        update_lineTarget(points, curTime, gid);
        if (siteStore.iWarningResult) {
          iTargetShow.value = true;
          // 自动隐藏提示
          if (targetTimeout) {
            clearTimeout(targetTimeout);
          }
          targetTimeout = setTimeout(() => {
            iTargetShow.value = false;
            targetTimeout = null;
          }, 5000);     // 5 秒后自动隐藏
        }
      }

    } else if (type === 'TDOA') {
      //console.log('TDOA info:', info);
      // 删除之前TDOA目标位置
      const id = 'tdoaTarget_'+gid+'_'+info.Time;
      if (tdoaTargetGid) {
        // remove previous target
        del_targets(tdoaTargetGid);
      }
      tdoaTargetGid = id;

      // 更新 TDOA 目标位置
      update_tdoaTarget(info.Lng, info.Lat, info.Time, gid);
      if (siteStore.iWarningTdoa) {
        iTargetShow.value = true;
        // 自动隐藏提示
        if (targetTimeout) {
          clearTimeout(targetTimeout);
        }
        targetTimeout = setTimeout(() => {
          iTargetShow.value = false;
          targetTimeout = null;
        }, 10000);     // 10 秒后自动隐藏
      }

    } else if (type === 'Status') {
      const site = sites.find(s => +s.port === +info.Port);
      if (!site) {
        console.warn('未找到对应上行站点:', info.Port);
        return;
      }
      // 使用节流更新站点位置
      const lon = info.Lng;
      const lat = info.Lat;

      // ✅ 使用误差范围比较
      const lonChanged = Math.abs(site.lon - lon) > EPSILON;
      const latChanged = Math.abs(site.lat - lat) > EPSILON;
      
      if (lonChanged || latChanged) {
        const sInfo = devSites.get(site.mfid); // ✅ 修复：获取对应 siteInfo
        if (sInfo) {
          throttledUpdateSitePos(sInfo, lon, lat, 0 );
        }
        
        site.lon = lon;
        site.lat = lat;
        
        // ✅ 更新 sitePoints 中对应的点
        const siteIndex = sites.indexOf(site);
        if (siteIndex > -1 && sitePoints) {
          sitePoints[siteIndex] = Cesium.Cartesian3.fromDegrees(lon, lat, 0);
        }
      }

      // 清理之前的测向线和交叉定位目标
      if (site.status !== 2 && (+info.Flag === 2)) {
        clear_site_dfLines(site.mfid);
        del_targetsByType('lineTarget', gid);
      }

      // update site status
      site.status = (+info.Flag);
      site.update_range();
    }
  }
}

// 控制上行站点开关机
function switch_power_upward(iOn, siteName) {
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
function unloadUpward() {
  const siteStore = useSiteStore();
  if (updateTimer) {
    clearTimeout(updateTimer);
    updateTimer = null;
  }
  
  // 清理缓存
  pendingDfLineUpdates.clear();

  // 关闭 WebSocket
  for (const [mfid , siteInfo] of devSites) {
    // 清理测向线
    if (dfLineCollection) {
      clear_site_dfLines(mfid);
    }
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

    // 删除站点探测范围
    siteStore.sites[mfid].remove_range(viewer);
  }
  devSites.clear();
  polylineIndex.clear();
  sitePolylineIndex.clear();

  // ✅ 清理分组 WebSocket
  for (const [gid, ws] of devGroups) {
    if (ws?.socket) {
      try {
        ws.socket.close();
      } catch (err) {
        console.error(`[Group ${gid}] 关闭 WebSocket 失败:`, err);
      }
    }
  }
  devGroups.clear();

  // ✅ 清理 Cesium Primitives
  if (viewer) {
    if (dfLineCollection) {
      try {
        viewer.scene.primitives.remove(dfLineCollection);
      } catch (err) {
        console.warn('移除 dfLineCollection 失败:', err);
      }
    }
    if (dfTargetCollection) {
      try {
        viewer.scene.primitives.remove(dfTargetCollection);
      } catch (err) {
        console.warn('移除 dfTargetCollection 失败:', err);
      }
    }
  }
  dfLineCollection = null;
  dfTargetCollection = null;

  // 清理全局变量
  sitePoints = null;
  lastUpdateTime = 0;
  //viewer = null;

}

export { unloadUpward, wsUpward, iTargetShow, switch_power_upward,
  update_lineTarget, update_lineTarget_batch, del_targets, del_targets_batch, 
  update_tdoaTarget, update_dfLine_batch, clear_dfLines };