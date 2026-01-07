import * as Cesium from 'cesium'

const mapOptions = {
    shouldAnimate: true,
    geocoder: false, //右上角查询按钮
    shadows: false,
    baseLayerPicker: false, //图层选择器
    imageryProvider: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider({}), // no terrain
    terrainShadows: Cesium.ShadowMode.DISABLED,
    fullscreenButton: false, //全屏
    vrButton: false, //vr按钮
    homeButton: false, //home按钮
    infoBox: false,
    navigationHelpButton: false, //帮助按钮
    selectionIndicator: false,
    sceneModePicker: false, //2D,2.5D,3D切换
    animation: true, //动画小窗口
    timeline: true, //时间轴
    requestRenderMode : true,
    maximumRenderTimeChange : Infinity, // refresh arrow speed
    //maximumRenderTimeChange : 0, // refresh screen rate in seconds
}

export function createViewer(container) {
    const viewer = new Cesium.Viewer(container, mapOptions);

    // initial Cesium.Viewer
    viewer.cesiumWidget.creditContainer.style.display = "none"; //去除版权信息
    viewer.scene.skyBox.show = false
    viewer.scene.skyAtmosphere.show = false
    viewer.scene.sun.show=false;  //还可以viewer.scene.sun.destroy();
    viewer.scene.moon.show=false; //月亮
    viewer.scene.fog.enabled = false
    viewer.scene.globe.enableLighting = false
    viewer.scene.postProcessStages.fxaa.enabled = true    // 抗锯齿
    viewer.scene.fxaa = true                              // 抗锯齿
    viewer.scene.msaaSamples = 1
    //viewer.scene.globe.depthTestAgainstTerrain = true;   //地形深度检测
    //viewer.useBrowserRecommendedResolution = true
    //viewer.useBrowserRecommendedResolution = false       // 高分辨率会降低性能
    //viewer.resolutionScale = window.devicePixelRatio     // 高分辨率会降低性能
    // Set the background color of the scene to white
    viewer.scene.backgroundColor = Cesium.Color.BLACK;
      //viewer.scene.backgroundColor = Cesium.Color.fromBytes(24,24,28,1) : // same color as auto-bg
      //viewer.scene.backgroundColor = Cesium.Color.WHITE
    //viewer.sceneModePicker.container.style.zIndex = 3;
    //viewer.sceneModePicker.container.style.top = '13px';

    //viewer.clockViewModel.multiplier = 10; // default speed 

    //viewer.timeline.container.style.visibility = 'hidden';
    viewer.timeline.container.style.position = 'absolute';
    viewer.timeline.container.style.bottom = '0px';
    viewer.timeline.makeLabel = function(julianDate) {
      const gregorian = Cesium.JulianDate.toDate(julianDate);
      // 自定义格式，比如：YYYY-MM-DD HH:mm
      //const y = gregorian.getFullYear();
      //const m = String(gregorian.getMonth() + 1).padStart(2, '0');
      const d = String(gregorian.getDate()).padStart(2, '0');
      const h = String(gregorian.getHours()).padStart(2, '0');
      const min = String(gregorian.getMinutes()).padStart(2, '0');

      //return `${y}/${m}/${d} ${h}:${min}`;
      return `${d}/${h}:${min}`;
    };

    // Animation 面板读数：只显示本地“日期 + 时间”，不带 UTC
    //viewer.animation.container.style.visibility = 'hidden';
    viewer.animation.container.style.position = 'absolute';
    viewer.animation.container.style.bottom = '0px';
    viewer.animation.container.style.zIndex = '1001';
    //viewer.animation.container.style.transformOrigin = 'left bottom';
    //viewer.animation.container.style.transform = 'scale(0.75)';
    const vm = viewer.animation.viewModel;
    vm.dateFormatter = function (julian) {
      return Cesium.JulianDate.toDate(julian).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
    }
    vm.timeFormatter = function (julian) {
      return '';
      const d = Cesium.JulianDate.toDate(julian);
      //return d.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      // 取整到最近的 10 秒
      if (viewer.clock.multiplier > 100) {
        return `${d.getHours().toString().padStart(2, '0')}:`
            + `${d.getMinutes().toString().padStart(2, '0')}`
      } else if (viewer.clock.multiplier > 20) {
        // 取整到最近的 10 秒
        const sec = Math.floor(d.getSeconds() / 10) * 10;
        return `${d.getHours().toString().padStart(2, '0')}:`
            + `${d.getMinutes().toString().padStart(2, '0')}:`
            + `${sec.toString().padStart(2, '0')}`;
      } else {
        return `${d.getHours().toString().padStart(2, '0')}:`
            + `${d.getMinutes().toString().padStart(2, '0')}:`
            + `${d.getSeconds().toString().padStart(2, '0')}`;
      }
    };
    
    return viewer;
}   