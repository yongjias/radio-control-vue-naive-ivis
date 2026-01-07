// Upward.js
import * as Cesium from "cesium";
import { useCesiumStore, useSiteStore, useAppStore } from '@/store';
import { WsClient } from '@/utils/wsSocket'
import { decode_stream_upward } from '@/utils';
import dfModelUrl from '@/assets/models/df.glb?url';
import LatLon from 'geodesy/latlon-nvector-spherical.js';         // faster but less accurate
import { DF_LINE_LENGTH, MAX_DF_LINES_EACH_SITE } from '@/constants';
import api from '@/api'

// 优化：批量更新相关变量
let updateTimer = null;
let lastUpdateTime = 0;
const UPDATE_INTERVAL = 100;       // ms

// 待更新的站点队列
const pendingSiteUpdates = new Map();
const pendingSiteDfUpdates = new Map();
const EPSILON = 1e-6;

// 共享变量
let viewer = null;
const devSites = new Map();
let sitePoints = null;
const devGroups = new Map();
let dfLineCollection = null;
let dfTargetCollection = null;
const iTargetShow = ref(false);
let targetTimeout = null;

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
      id: siteInfo.name+','+lon.toFixed(3)+','+lat.toFixed(3)+','+alt.toFixed(0)+
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

let curLineTargetGid = null;
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
        color: Cesium.Color.CYAN,
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
    color: Cesium.Color.MAGENTA,
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
    performUpdate();
    lastUpdateTime = now;
  } else {
    if (updateTimer) clearTimeout(updateTimer);
    updateTimer = setTimeout(() => {
      performUpdate();
      lastUpdateTime = Date.now();
      updateTimer = null;
    }, UPDATE_INTERVAL - timeSinceLastUpdate);
  }
}

// 执行所有待更新的操作
function performUpdate() {
  if (!viewer) {
    //console.warn('viewer 已清理，取消更新');
    return;
  }

  // 更新蜂窝场景
  if (pendingSiteDfUpdates.size > 0) {
    update_dfLineScene();
  }

  // 批量更新站点模型位置
  if (pendingSiteUpdates.size > 0) {
    for (const [siteInfo, { lon, lat, alt }] of pendingSiteUpdates) {
      if (siteInfo && siteInfo.model) {
        const modelMatrix = calc_siteModel_pos(lon, lat, alt);
        siteInfo.model.modelMatrix = modelMatrix;
        siteInfo.model.id = siteInfo.name+','+lon.toFixed(3)+','+lat.toFixed(3)+','+alt.toFixed(0)+
        ','+siteInfo.gid+','+siteInfo.mfid;

        api.updateSiteLocation(siteInfo.name, {lon, lat, alt}); // 异步更新后台数据
      }
    }
    viewer?.scene.requestRender();
    pendingSiteUpdates.clear();
  }
}

function clear_site_dfLines(mfid) {
  if (!viewer || !dfLineCollection) {
    return;
  }

  const siteInfo = devSites.get(mfid);
  if (siteInfo && siteInfo.dfLines && siteInfo.dfLines.length > 0) {
    siteInfo.dfLines.forEach(line => {
      line.positions = [];       // 不能删除，只能隐藏
      line.show = false;
    });
  }
  viewer.scene.requestRender();
}

// 优化：避免重复创建
function update_dfLineScene() {
  if (!viewer || pendingSiteDfUpdates.size === 0) {
    return;
  }
  const appStore = useAppStore();
  const allPoints = sitePoints ? [...sitePoints] : [];
  let hasUpdates = false;

  //for (const [mfid, { lon, lat, angle }] of pendingSiteDfUpdates) {
  for (const [mfid, lines] of pendingSiteDfUpdates) {
    const siteInfo = devSites.get(mfid);
    if (siteInfo && siteInfo.dfLines && siteInfo.dfLines.length > 0) {
      siteInfo.dfLines.forEach(line => {
        line.show = false;
      });
      lines.forEach(({ lon, lat, angle }, index) => {
        if (index >= siteInfo.dfLines.length) {
          return;
        }
        // ✅ 归一化角度到 0-360 范围
        const normalizedAngle = ((angle % 360) + 360) % 360;
        const Pstart = new LatLon(lat, lon);
        const Pend = Pstart.destinationPoint(DF_LINE_LENGTH, normalizedAngle);
        const startPos = Cesium.Cartesian3.fromDegrees(Pstart.lon, Pstart.lat, 0);
        const endPos = Cesium.Cartesian3.fromDegrees(Pend.lon, Pend.lat, 0);
        siteInfo.dfLines[index].positions = [startPos, endPos];
        siteInfo.dfLines[index].show = true;

        // ✅ 收集点用于更新包围球
        allPoints.push(endPos);
        hasUpdates = true;
      });
    }
  }

  viewer?.scene.requestRender();

  // ✅ 更新包围球
  if (hasUpdates && allPoints.length > sitePoints.length) {
    try {
      appStore.upwardBoundingSphere = Cesium.BoundingSphere.fromPoints(allPoints);
    } catch (err) {
      console.error('更新包围球失败:', err);
    }
  }

  pendingSiteDfUpdates.clear();
}

// 根据经纬度在 sites 中匹配站点（最近邻，带米级容差）
function findSiteMfidByCoord(sites, lon, lat, toleranceMeters = 300) {
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
  const appStore = useAppStore();
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
  appStore.upwardBoundingSphere = Cesium.BoundingSphere.fromPoints(sitePoints);
  for (const site of sites) {
    // 初始化实例容器
    const siteInfo = {
      name: site.name,
      gid: site.group,
      mfid: site.mfid,
      model: null,
      dfLines: [],
      curWs: null,
    };
    devSites.set(site.mfid, siteInfo);

    // create site model
    await load_siteModel(siteInfo, site.lon, site.lat, site.alt);

    // create df line
    for (let i = 0; i < MAX_DF_LINES_EACH_SITE; i++) {
      siteInfo.dfLines.push(dfLineCollection.add({
        show: false,
        id: 'dfLine_'+site.mfid+'_'+i,
        positions: [],
        width: 2,
        material: Cesium.Material.fromType('PolylineDash', {
          color: Cesium.Color.BURLYWOOD.withAlpha(1.0),     // 线颜色
          gapColor: Cesium.Color.RED.withAlpha(0.8),       // 虚线间隙颜色
          //gapColor: Cesium.Color.TRANSPARENT,            // 虚线间隙颜色
          dashLength: 16,                                  // 每段长度（像素）
          // dashPattern: 0xFF00                           // 可选：16位虚线模式
        })
      }));
    }
  
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
            
            if (lonChanged || latChanged || altChanged) {
              pendingSiteUpdates.set(siteInfo, { lon, lat, alt });
              scheduleUpdate();
              
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
          pendingSiteDfUpdates.set(mfid, lines);
          scheduleUpdate(); // 仅有更新时调度
        }
      } else {
        console.warn('未匹配到上行站点:', info);
      }

    } else if (type === 'Result' && siteStore.iWarningResult) {
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
        const groupId = 'lineTarget_'+gid+'_'+info.Time;
        if (curLineTargetGid && curLineTargetGid !== groupId) {
          // remove previous target
          del_targets(curLineTargetGid);
        }
        curLineTargetGid = groupId;
        // 更新测向目标位置
        update_lineTarget(points, info.Time, gid);
      }

    } else if (type === 'TDOA' && siteStore.iWarningTdoa) {
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
      iTargetShow.value = true;
      // 自动隐藏提示
      if (targetTimeout) {
        clearTimeout(targetTimeout);
      }
      targetTimeout = setTimeout(() => {
        iTargetShow.value = false;
        targetTimeout = null;
      }, 10000);     // 10 秒后自动隐藏

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
          pendingSiteUpdates.set(sInfo, { lon, lat, alt: 0 });
          scheduleUpdate();
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
  pendingSiteUpdates.clear(); 
  pendingSiteDfUpdates.clear();

  // 关闭 WebSocket
  for (const [mfid , siteInfo] of devSites) {
    // 清理测向线
    if (siteInfo.dfLines && dfLineCollection) {
      siteInfo.dfLines.forEach(line => dfLineCollection.remove(line));
      siteInfo.dfLines = [];
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
  update_lineTarget, del_targets, update_tdoaTarget };