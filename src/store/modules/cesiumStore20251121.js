// stores/cesiumStore.js
import { defineStore } from 'pinia';
import * as Cesium from 'cesium';
import { useSiteStore } from '@/store';
import { createViewer, AmapMercatorTilingScheme, map_geoJSON } from '@/cesium'
//import geojson_hubei from '@/assets/maps/420000.json'
import geojson_china from '@/assets/maps/100000.json'
//import json_hlj from '@/assets/maps/230000.json'

export const useCesiumStore = defineStore('cesiumStore', () => {
  const viewer = shallowRef(null);

  function init(container) {
    //console.log(viewer.value)
    if (viewer.value) {
      viewer.value.destroy();
      viewer.value = null;
      //return viewer.value
    }
    // 标记为原始对象，避免被响应式代理（双保险：shallowRef + markRaw）
    viewer.value = markRaw(createViewer(container))

    return viewer.value
  }

  function getViewer() {
    return viewer.value;
  }

  const imageryProviders = {
    ArcgisMap: new Cesium.UrlTemplateImageryProvider({
        //url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        //url: 'http://'+import.meta.env.VITE_HOST+'/AGISONLINE/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        url: '/AGISONLINE/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        tilingScheme: new Cesium.WebMercatorTilingScheme(),
        maximumLevel: 20,
        tileWidth: 256,
        tileHeight: 256
    }),
    GaoDeMap: new Cesium.UrlTemplateImageryProvider({
        //url: "https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}",
        //url:  'http://'+import.meta.env.VITE_HOST+"/GDMAP/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}",
        url:  '/GDMAP/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
        subdomains: ['1', '2', '3', '4'],
        minimumLevel: 3,
        maximumLevel: 19,
        tilingScheme: new AmapMercatorTilingScheme() // GCJ-02
    }),
    TianDTMap_w: new Cesium.WebMapTileServiceImageryProvider({
        //url: 'http://t0.tianditu.gov.cn/cia_w/wmts?tk=e174907ba03839b2851f9cb4c906d142',
        //url: 'http://'+import.meta.env.VITE_HOST+'/TDT/cia_w/wmts?tk=e174907ba03839b2851f9cb4c906d142',
        url: '/TDT/cia_w/wmts?tk=e174907ba03839b2851f9cb4c906d142',
        layer:'cia',
        style:'default',
        tileMatrixSetID:'w',
        format:'tiles',
        maximumLevel: 18
    }),
    //AzureMapWx: create_azure_map('Wx'),
    //AzureMapXz: create_azure_map('Xz'),
    //AzureMapHybrid: create_azure_map('Hybrid'),
    //AzureMapLabel: create_azure_map('Label')
  }

  let baseMap = undefined
  const change_baseMap = async (providerName) => {
    if (baseMap != undefined) {
        viewer.value.imageryLayers.remove(baseMap)
        baseMap = undefined
    }

    if (providerName=='OfflineMap') {
        let mapProvide = new Cesium.UrlTemplateImageryProvider({
          //url: '/offlinemap/{z}/{x}/{y}.png',
          url: 'http://'+import.meta.env.VITE_HOST+import.meta.env.VITE_MAP+'/{z}/{x}/{y}.png',
          maximumLevel: 19
        })
        baseMap = viewer.value.imageryLayers.addImageryProvider(mapProvide)
    } else if (providerName=='SrrcMapWx') {
        let mapProvide = await Cesium.ArcGisMapServerImageryProvider.fromUrl(
            '/SRRC/Arcgis/MonitorSender/PS/Loadworld_ImageryMapServer?PSCode=PS-000000-01-0051-0003&BSCode=BS-000000-01-0051-0003&appCode=230000-01-0006&appPass=12345678'
        )
        baseMap = viewer.value.imageryLayers.addImageryProvider(mapProvide)
    } else if (providerName=='SrrcMapHwx') {
        let mapProvide = await Cesium.ArcGisMapServerImageryProvider.fromUrl(
            '/SRRC/Arcgis/MonitorSender/PS/LoadDGImageMapServer?PSCode=PS-000000-01-0051-0002&BSCode=BS-000000-01-0051-0002&appCode=230000-01-0006&appPass=12345678'
        )
        baseMap = viewer.value.imageryLayers.addImageryProvider(mapProvide)
    } else if (providerName=='SrrcMapXz') {
        let mapProvide = await Cesium.ArcGisMapServerImageryProvider.fromUrl(
            //'/SRRC/Arcgis/MonitorSender/PS/Query/MapServer?PSCode=PS-000000-01-0051-0019&BSCode=BS-000000-01-0051-0019&appCode=420000-01-0001&appPass=ythhbspt'
            '/SRRC/esb/Arcgis/MonitorSender/BaseMap/PS/MapServer?PSCode=PS-000000-01-0051-0019&BSCode=BS-000000-01-0051-0019&appCode=420000-01-0001&appPass=hbsythpt'
        )
        baseMap = viewer.value.imageryLayers.addImageryProvider(mapProvide)
        //viewer.value.terrainProvider = terrain
    } else {
        baseMap = viewer.value.imageryLayers.addImageryProvider(imageryProviders[providerName])
        //viewer.value.terrainProvider = terrain
    }

    if (baseMap != undefined) {
      //Basemap always at bottom
      viewer.value.imageryLayers.lowerToBottom(baseMap)
    }
  }

  let mapLabel = undefined
  const show_map_label = (iShow) => {
    if (mapLabel != undefined && !iShow) {
        // 去除地图标记
        viewer.value.imageryLayers.remove(mapLabel)
        mapLabel = undefined
    }
    if (mapLabel == undefined && iShow) {
        // 加地图标记
        mapLabel = viewer.value.imageryLayers.addImageryProvider(imageryProviders.TianDTMap_w)
    }
  }

  const go_home_model = (pitch) => {
    let boundingSphere = null
    if ( Models.receiver && Models.emitter ) {
      boundingSphere = Cesium.BoundingSphere.union(Models.receiver.boundingSphere, Models.emitter.boundingSphere);
    } else if ( Models.receiver ) {
        boundingSphere = Models.receiver.boundingSphere
    } else if ( Models.emitter ) {
        boundingSphere = Models.emitter.boundingSphere
    } else {
        boundingSphere = Models.site.boundingSphere
    }
    if ( boundingSphere) {
      let zrange = 3.3
      if ( pitch != -90 ) {
        zrange = 2.3
      }
      viewer.value.camera.viewBoundingSphere(boundingSphere,
        new Cesium.HeadingPitchRange(
          Cesium.Math.toRadians(0),        // heading 方向
          Cesium.Math.toRadians(pitch),    // pitch 倾斜角度
          boundingSphere.radius * zrange
        )
      )
      viewer.value.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)  // unlock camera
    }
  }

  const siteStore = useSiteStore();
  const go_home = (pitch) => {
    let sites = Object.values(siteStore.sites);
      let lons = sites.map(el=>el.lon)
      let lats = sites.map(el=>el.lat)
      let west = Math.min(...lons)
      let east = Math.max(...lons)
      let south = Math.min(...lats)
      let north = Math.max(...lats)
      let rectangle = Cesium.Rectangle.fromDegrees(west, south, east, north)
      let center = Cesium.Rectangle.center(rectangle);
      let snHgt = Cesium.Rectangle.computeHeight(rectangle)
      let centerCartesian = Cesium.Cartesian3.fromRadians(center.longitude, center.latitude, 0.0); // On the ground
      let cameraHeight = snHgt * 20385000 * Math.sin(Cesium.Math.toRadians(pitch))**1.35; // Adjust the height as needed
      // Define the camera position (above and slightly north of the center of the rectangle)
      let offsetDistance = cameraHeight / Math.tan(Cesium.Math.toRadians(pitch));
      let cameraPosition = Cesium.Cartesian3.fromRadians(center.longitude, center.latitude - offsetDistance / Cesium.Ellipsoid.WGS84.maximumRadius, cameraHeight);
      // Define the direction vector (from camera to the center)
      let direction = Cesium.Cartesian3.subtract(centerCartesian, cameraPosition, new Cesium.Cartesian3());
      direction = Cesium.Cartesian3.normalize(direction, direction);
      // Define the right vector
      let right = Cesium.Cartesian3.cross(direction, Cesium.Cartesian3.UNIT_Z, new Cesium.Cartesian3());
      right = Cesium.Cartesian3.normalize(right, right);
      // Define the up vector (perpendicular to both direction and right vectors)
      let up = Cesium.Cartesian3.cross(right, direction, new Cesium.Cartesian3());
      up = Cesium.Cartesian3.normalize(up, up);

      /*
      viewer.value.camera.setView({
        destination : cameraPosition,
        orientation: {
          direction : direction,
          up : up
        }
      });
      */
      viewer.value.camera.setView({
            destination: Cesium.Cartesian3.fromDegrees(116, 39, 8e6),
            //duration: 1,
            orientation: {
                heading : Cesium.Math.toRadians(0.0), // 方向
                pitch : Cesium.Math.toRadians(-90.0),// 倾斜角度
                roll : 0
            }
        })
      //viewer.value.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)  // unlock camera
  }

  //let iHome3D = ref(false)   // default showing top-down
  let iHome3D = ref(true)   // default showing 3D
  const switch_home3d = () => {
    if (iHome3D.value) {
      go_home(35)      // look pitch
    } else {
      go_home(90)      // look down
    }
    iHome3D.value = !iHome3D.value
  }

  // 优化：添加动画和更好的错误处理
  const setBoundingView = (boundingSpheres, pitch=-45, rangeFactor = 10, screenOffsetRatio = 0.2) => {
    // ✅ 使用第一个有效的包围球初始化
    let combinedBoundingSphere = null;
    for (const bs of boundingSpheres) {
      if (bs && bs.center && typeof bs.radius === 'number' && !isNaN(bs.radius)) {
        if (!combinedBoundingSphere) {
          // 克隆第一个有效的包围球
          combinedBoundingSphere = Cesium.BoundingSphere.clone(bs);
        } else {
          // 合并后续的包围球
          combinedBoundingSphere = Cesium.BoundingSphere.union(
            combinedBoundingSphere, 
            bs, 
            combinedBoundingSphere
          );
        }
      }
    }
    if (!combinedBoundingSphere || combinedBoundingSphere.radius === 0) {
      setSatView();
      return;
    }

    // 计算目标位置参数
    const heading = Cesium.Math.toRadians(0);
    const pitchRad = Cesium.Math.toRadians(pitch);
    const range = combinedBoundingSphere.radius * rangeFactor;
  
    // 计算偏移量
    let offsetMeters = 0;
    if (screenOffsetRatio !== 0) {
      const canvas = viewer.value.canvas;
      const canvasHeight = canvas.clientHeight || canvas.height;
      const distance = range;
      const frustum = viewer.value.camera.frustum;
      const fovy = frustum.fovy || Cesium.Math.toRadians(60);
      const metersPerPixel = (2 * distance * Math.tan(fovy / 2)) / canvasHeight;
      offsetMeters = canvasHeight * screenOffsetRatio * metersPerPixel;
    }
  
    // 使用飞行动画
    viewer.value.camera.viewBoundingSphere(combinedBoundingSphere, 
      new Cesium.HeadingPitchRange(heading, pitchRad, range),
    );
    if (offsetMeters !== 0) {
      viewer.value.camera.moveUp(offsetMeters);
    }
    viewer.value.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)  // unlock camera
    viewer.value.scene.requestRender();
  }

  const setSatView = () => {
    viewer.value.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(116, 39, 1.5e7),
      //duration: 1,
      orientation: {
          heading : Cesium.Math.toRadians(0.0), // 方向
          pitch : Cesium.Math.toRadians(-90.0),// 倾斜角度
          roll : 0
      }
    })
  }

  const go_north_up = () => {
  const v = viewer.value
  if (!v) return

  const camera = v.camera
  const scene = v.scene

  // 1. 取当前视图中心点（屏幕中心射到地球上的点）
  const canvas = scene.canvas
  const centerCartesian = scene.globe.pick(
    camera.getPickRay(new Cesium.Cartesian2(
      canvas.clientWidth / 2,
      canvas.clientHeight / 2
    )),
    scene
  )

  // 如果没打到地球（例如在外太空），直接只改 heading
  if (!centerCartesian) {
    camera.setView({
      orientation: {
        heading: Cesium.Math.toRadians(0.0),
        pitch: camera.pitch,
        roll: 0.0
      }
    })
    return
  }

  // 2. 计算当前视距（相机到中心点的距离）
  const range = Cesium.Cartesian3.distance(camera.positionWC, centerCartesian)

  // 3. 取当前俯仰角，构造“朝北”的视图
  const pitch = camera.pitch

  // 4. 以中心点为焦点，保持范围不变，将 heading 旋转到 0
  camera.lookAt(
    centerCartesian,
    new Cesium.HeadingPitchRange(
      Cesium.Math.toRadians(0.0), // 朝北
      pitch,
      range
    )
  )

  // 5. 解锁相机变换
  camera.lookAtTransform(Cesium.Matrix4.IDENTITY)

  scene.requestRender()
}

  
  const change_map_range = (percent) => {
    const cesiumDiv = document.getElementById('cesiumContainer')
    cesiumDiv.style.left = ''+(100-percent)+'%'
    cesiumDiv.style.width = ''+percent+'%'
  }

  /*
  const hlj_border = async() => {
    const bd_hlj_detail = await Cesium.GeoJsonDataSource.load(json_hlj_detail, {
      stroke: Cesium.Color.fromCssColorString("#00f5ff58"),
      fill: Cesium.Color.fromCssColorString("#ffffff").withAlpha(0.0),
      strokeWidth: 1,
      markerSymbol: "?",
    });
    viewer.value.dataSources.add(bd_hlj_detail);
    const areas = Array.from(new Set(Object.values(siteStore.sites).map(el => el.city)))
    let entities = bd_hlj_detail.entities.values;
    for (let i = 0; i < entities.length; i++) {
      let entity = entities[i];
      let name = entity.name.slice(0, -1);
      if (name.includes('大兴安岭')) name  = '大兴安岭'
      let alpha = 0.3
      if (areas.includes(name)) {
        alpha = 0.6
        entity.polygon.extrudedHeight = 10000; //高度扩大5000倍，便于观察
      }
      const color = Cesium.Color.fromRandom({
        alpha: alpha,
      });
      entity.polygon.material = color;
      entity.polygon.outline = false;
    }

    const bd_china = Cesium.GeoJsonDataSource.load(json_china, {
      stroke: Cesium.Color.fromCssColorString("#fcff00f3"),
      fill: Cesium.Color.fromCssColorString("#ffffff").withAlpha(0.0),
      strokeWidth: 2,
      markerSymbol: "?",
    });
    viewer.value.dataSources.add(bd_china);
  }
  */

  let mapBorder = null;
  let outlineBorder = null;
  const hlj_border = () => {
    if (!outlineBorder || !mapBorder) {
      const {outlinePolygon, fillPolygon} = map_geoJSON(geojson_heilongjiang);
      if (!outlineBorder) {
        outlineBorder = viewer.value.scene.primitives.add(outlinePolygon);
      }
      if (!mapBorder) {
        mapBorder = viewer.value.scene.primitives.add(fillPolygon);
      }
    }
  }
  let cnOutlineBorder = null;
  const cn_border = () => {
    if (!cnOutlineBorder) {
      const {outlinePolygon} = map_geoJSON(geojson_china);
      cnOutlineBorder = viewer.value.scene.primitives.add(outlinePolygon);
    }
  }

  const show_map_border = (iShow) => {
    if (mapBorder != null) {
        mapBorder.show = iShow
    }
  }
  
  const i3D = ref(true);

  function toggleFPS() {
    const show = !viewer.value.scene.debugShowFramesPerSecond
    viewer.value.scene.debugShowFramesPerSecond = show
  }

  const iPausedMouseEvents = ref(false);

  return { init, getViewer, toggleFPS, change_map_range, i3D,
    change_baseMap, show_map_label, switch_home3d, go_north_up,
    show_map_border, cn_border, setBoundingView, iPausedMouseEvents }
    //show_map_border, hb_border, geojson_hubei }
});