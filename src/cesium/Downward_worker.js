// Downward.js
import * as Cesium from "cesium";
import { useCesiumStore, useSiteStore } from '@/store';
import { WsClient } from '@/utils/wsSocket'
import { decode_stream_downward } from '@/utils';

// 共享变量
let viewer = null;
let worker = null;
let curWs = null;

// hex Primitive
let hexPrimitive = null;
let hexOutlinePrimitive = null;

// create a Material instance, not a MaterialProperty
//const glowMaterial = Cesium.Material.fromType('GlowLine', {
//color: Cesium.Color.fromCssColorString('#33e5f9da'),
  //color: Cesium.Color.fromCssColorString('#3f98e8ab'),
//power: 0.4,       // smaller to more blur
//});

// 从 Worker 批次数据创建 Primitive
function buildFillPrimitive(primInstances) {
  const prim = new Cesium.GroundPrimitive({
    geometryInstances: primInstances,
    appearance: new Cesium.PerInstanceColorAppearance({
      flat: true,
      translucent: true,
      closed: false,
    }),
    classificationType: Cesium.ClassificationType.TERRAIN,
    asynchronous: true,
    interleave: true,
    //allowPicking: false,
  });

  return prim;
}

function buildOutlinePrimitive(primInstances) {
  const prim = new Cesium.GroundPolylinePrimitive({
    geometryInstances: primInstances,
    appearance: new Cesium.PolylineMaterialAppearance({
        //material: glowMaterial,
        material: Cesium.Material.fromType('Color', {
          color: new Cesium.Color(1.0, 1.0, 1.0, 0.7)
        }),
        translucent : true,
      }),
    classificationType: Cesium.ClassificationType.TERRAIN,
    asynchronous: true,
    interleave: true,
    allowPicking: false,
  });

  return prim;
}

function loadDownward() {
  const cesiumStore = useCesiumStore();
  viewer = cesiumStore.getViewer();
  if (!viewer) return;

  // 启动 Worker
  worker = new Worker(new URL('@/worker/hex-worker.js', import.meta.url), { type: 'module' })

  // Worker 消息回调
  worker.onmessage = (e) => {
    const { type, sendECEF, floatsPer, positions, colors, ids, done } = e.data;
    if (type !== "batch") return;
    // 重新创建 TypedArray
    const posArr = new Float64Array(positions);
    const colArr = new Uint8Array(colors);

    const fillInstances = [];
    const outlineInstances = [];
    for (let i = 0; i < ids.length; i++) {
      let positionsCartesian;

      if (sendECEF) {
        // ECEF: 6点 * 3 = 18 浮点
        positionsCartesian = new Array(6);
        const base = i * floatsPer;
        for (let k = 0; k < 6; k++) {
          const x = posArr[base + k * 3];
          const y = posArr[base + k * 3 + 1];
          const z = posArr[base + k * 3 + 2];
          positionsCartesian[k] = new Cesium.Cartesian3(x, y, z);
        }
      } else {
        // 经纬度: 6点 * 2 = 12 浮点
        const base = i * floatsPer;
        const degs = [];
        for (let k = 0; k < 6; k++) {
          degs.push(posArr[base + k * 2], posArr[base + k * 2 + 1]);
        }
        const flat = Cesium.Cartesian3.fromDegreesArray(degs);
        positionsCartesian = [flat[0], flat[1], flat[2], flat[3], flat[4], flat[5]];
      }

      const color = new Cesium.Color(
        colArr[i * 4] / 255,
        colArr[i * 4 + 1] / 255,
        colArr[i * 4 + 2] / 255,
        colArr[i * 4 + 3] / 255
      );

      fillInstances.push(new Cesium.GeometryInstance({
        id: '下行' + ids[i],
        geometry: new Cesium.PolygonGeometry({
          polygonHierarchy: new Cesium.PolygonHierarchy(positionsCartesian),
          //vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(color),
        },
      }))

      outlineInstances.push(new Cesium.GeometryInstance({
        id: '下行' + ids[i],
        geometry: new Cesium.GroundPolylineGeometry({
          positions: [...positionsCartesian, positionsCartesian[0]], // 闭合
          width: 1,                       // how thick the glow “tube” is
        }),
      }));

    }

    if (done) {
      // 创建新 Primitive
      const prim = buildFillPrimitive(fillInstances);
      viewer.scene.primitives.add(prim);

      // 创建新 Outline Primitive
      const OutlinePrimitive = buildOutlinePrimitive(outlineInstances);
      viewer.scene.primitives.add(OutlinePrimitive);

      // 移除旧 Primitive
      if (hexPrimitive) {
        viewer.scene.primitives.remove(hexPrimitive);
      }
      hexPrimitive = prim;

      if (hexOutlinePrimitive) {
        viewer.scene.primitives.remove(hexOutlinePrimitive);
      }
      hexOutlinePrimitive = OutlinePrimitive;

      viewer?.scene.requestRender();
    }
  }
}

function unloadDownward() {
  // 关闭 WebSocket
  if (curWs && curWs.socket) {
      try {
          curWs.socket.close();
          curWs = null;
      } catch (err) {
          console.error(err);
      }
  }
  // 关闭 Worker
  if (worker) {
    worker.terminate();
    worker = null;
  }
  // 移除 Primitive
  if (viewer) {
    if (hexPrimitive) {
      viewer.scene.primitives.remove(hexPrimitive);
      hexPrimitive = null;
    }
    if (hexOutlinePrimitive) {
      viewer.scene.primitives.remove(hexOutlinePrimitive);
      hexOutlinePrimitive = null;
    }
    viewer.scene.requestRender();
    viewer = null;
  }
}

function wsDownward() {
  const siteStore = useSiteStore();
  const devDownward = Object.values(siteStore.sites).filter(s => s.name === '下行'); 
  if (devDownward.length === 0) {
    alert('数据库中没有下行设备，请先添加一个名称为“下行”的设备!');
    return;
  }

  curWs = new WsClient('ws://'+import.meta.env.VITE_HOST+':'+(devDownward[0]?.port + siteStore.wssPortOffset), (data)=>{
    const json = decode_stream_downward(data);
    if (json.status) {
      console.log('下行设备状态:', json.status);
      //json.status = {
      //  DEMStatus : "解调中",
      //  FPGATemperature : 91,
      //  GPSStatus : 0,
      //  GPSTime : {seconds: 1760177566},
      //  PLLLockStatus : 0,
      //  availableDiskCapacity : 6855026438144,
      //  demSpeed : 313452815.54919255,
      //  recordStatus : "未记录",
      //  systemSpeed : 2671742370.035455,
      //  totalDiskCapacity : 14001845039104,
      //  transferStatus : "正常",
      //}
      //if (json.status.transferStatus === '正常' && json.status.DEMStatus === '解调中') { }
    }

    if (json.decodeInfos && json.decodeInfos.length > 0 ) {
      console.log('下行解码数据:', json.decodeInfos);

      /////////////////////////////////////////////////////
      // 示例：定义几个蜂窝中心点，然后发给 worker
      //////////////////////////////////////////////////////
      const centers = [
        { lon: 116.39, lat: 39.91, id: "A1", r: 1000, color: 3 },
        { lon: 116.41, lat: 39.92, id: "A2", r: 1050, color: 20 },
        { lon: 116.42, lat: 39.90, id: "A3", r: 980, color: 50 },
      ];

      // 发送给 worker
      worker.postMessage({
        centers,
        hexRadiusMeters: 500, // 默认半径
        batchSize: 1000,      // 每批多少个 hex（默认 1000）
        sendECEF: true,       // true: 返回 ECEF Float64；false: 返回经纬度 Float64
        colorMax: 50,         // 用于自动着色的最大值
      });
    }
  })
}

const setDownwardView = (pitch, rangeFactor=10, screenOffsetRatio=0.2) => {
  const siteStore = useSiteStore();
  const points = Object.values(siteStore.sites).map(el => Cesium.Cartesian3.fromDegrees(el.lon, el.lat));
  let boundingSphere = Cesium.BoundingSphere.fromPoints(points);
  if ( boundingSphere) {
    viewer.camera.viewBoundingSphere(boundingSphere,
      new Cesium.HeadingPitchRange(
        Cesium.Math.toRadians(0),        // heading 方向
        Cesium.Math.toRadians(pitch),    // pitch 倾斜角度
        boundingSphere.radius * rangeFactor
      )
    )
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)  // unlock camera

    if (screenOffsetRatio !== 0) {
      // 计算向上偏移的距离，让目标在屏幕中向下移动
      const camera = viewer.camera;
      const canvas = viewer.canvas;
      const canvasHeight = canvas.clientHeight || canvas.height;
      
      // 计算当前相机到目标的距离
      const distance = Cesium.Cartesian3.distance(camera.position, boundingSphere.center);
      
      // 获取相机的垂直视场角
      const frustum = camera.frustum;
      const fovy = frustum.fovy || Cesium.Math.toRadians(60); // 默认60度
      
      // 计算每像素对应的实际距离（在目标距离处）
      const metersPerPixel = (2 * distance * Math.tan(fovy / 2)) / canvasHeight;
      
      // 计算需要向上移动的距离（屏幕高度的一定比例）
      const offsetPixels = canvasHeight * screenOffsetRatio; // 例如20%的屏幕高度
      const offsetMeters = offsetPixels * metersPerPixel;
      
      // 相机向上移动，使目标在屏幕中向下移动
      camera.moveUp(offsetMeters);
    }

    viewer.scene.requestRender();
  }
}

export { loadDownward, unloadDownward, wsDownward, setDownwardView }