<template>
  <div id="cesiumContainer"></div>
  
  <div :bordered="false" v-if="tagTip.iShow"
    :style="{position: 'absolute', left: `${tagTip.left}px`, top: `${tagTip.top}px`, userSelect: 'none'}" >
    <p class="bg-#ec4899aa px-5" >
        {{tagTip.text.SID !== undefined? '小区' : tagTip.text.note===undefined ? '设备' : '卫星终端'}}: 
        <i :class="'color-primary font-bold'">{{tagTip.text.name}}</i>
    </p>
    <p class="bg-#00337799 px-5">
        坐标: <i :class="'text-#C8D500 font-bold'">{{tagTip.text.lon}}, {{tagTip.text.lat}}, {{tagTip.text.alt}} </i>
    </p>
    <p class="bg-#00337799 px-5" v-if="tagTip.text.gid">
        组: <i :class="'text-#C8D500 font-bold'">{{tagTip.text.gid}}</i>
    </p>
    <p class="bg-#00337799 px-5" v-if="tagTip.text.idSat">
        卫星: <i :class="'text-#C8D500 font-bold'">{{tagTip.text.idSat}}</i>
    </p>
    <p class="bg-#00337799 px-5" v-if="tagTip.text.time">
        时间: <i :class="'text-#C8D500 font-bold'">{{tagTip.text.time}}</i>
    </p>
    <p class="bg-#00337799 px-5" v-if="tagTip.text.SID">
        SID数: <i :class="'text-#C8D500 font-bold'">{{tagTip.text.SID}}</i>
    </p>
    <p class="bg-#00337799 px-5" v-if="tagTip.text.note">
        注解: <i :class="'text-#C8D500 font-bold'">{{tagTip.text.note}}</i>
    </p>
    <p class="bg-#00337799 px-5" v-if="tagTip.text.gid && !tagTip.text.time">
        操作: <i :class="'color-primary font-bold'">
         <n-button size="tiny" @click="switch_power(true, tagTip.text.name)">
          <i class="i-fe:play-circle text-14" />
          开机
        </n-button>
        <n-button size="tiny" @click="switch_power(false, tagTip.text.name)">
          <i class="i-fe:stop-circle text-14" />
          关机
        </n-button>
      </i>
    </p>
  </div>
  <div :bordered="false" v-if="tagTip.iText>0"
    :style="{position: 'absolute', left: `${tagTip.left-250}px`, top: `${tagTip.top+20}px`}" >
    <input type="text" placeholder="请输入注解:" 
      @keydown.enter.prevent="onNoteEnter($event.target.value, tagTip.iText)" 
      @keydown.esc.prevent="onNoteEsc"
      style="width:500px; height:30px; color:black; font-size: 16px;"/>
  </div>

  <!--
  <h3 style="position: fixed; bottom: 30px; right: 20px; font-size: 16px;">地图层级: {{ mapLevel }}</h3>
  -->
  <div style="position: fixed; bottom: 60px; right: 20px; display: flex; flex-direction: column; align-items: flex-end; pointer-events: none;">
    <span style="margin-bottom: 2px; font-size: 14px; text-shadow: 1px 1px 2px black;" class="mx-auto">{{ scaleData.label }}</span>
    <div :style="{
      width: scaleData.width + 'px',
      height: '6px',
      border: '2px solid white',
      borderTop: 'none',
      backgroundColor: 'rgba(0,0,0,0.1)',
    }"></div>
  </div>
</template>

<script setup>
  import * as Cesium from 'cesium';
  import { useSiteStore, useCesiumStore } from '@/store';
  import api from '@/api'
  import { throttle } from '@/utils'
  import { trigger_hexSatLine, switch_power_upward, switch_power_downward, 
    camera_height, camera_height2D } from '@/cesium'

  // component name
  defineOptions({
    name: 'CesiumMap',
    inheritAttrs: false
  })

  // 地图比例尺
  //const mapLevel = ref(10);
  const scaleData = reactive({ width: 100, label: '1 km' }); // 新增比例尺数据

  const siteStore = useSiteStore();
  const cesiumStore = useCesiumStore();

  // shared variables
  let viewer = null;
  let tagTip = reactive({
    iShow: false, 
    left: 0, 
    top: 0, 
    text: {
      name: '', 
      lon: '', 
      lat: '', 
      alt: '', 
      idSat: '',
      gid: '',
      time: '',
      note: '',
    },
    iText: 0,
  });
  let handler = null;
  let throttleHeightEvent = null;

  onMounted(async() => {
    viewer = cesiumStore.init('cesiumContainer')
    //console.log(viewer);
    // initial baseMap
    //cesiumStore.change_baseMap('OfflineMap')
    cesiumStore.change_baseMap('ArcgisMap')
    //cesiumStore.change_baseMap('ArcgisMap').then(()=>cesiumStore.hlj_border_terrain())
    //cesiumStore.change_baseMap('SrrcMapWx')
    // add HuBei province border
    //cesiumStore.hb_border()
    cesiumStore.cn_border();
    // china to be front
    //viewer.camera.setView({                     // Longitude, Latitude, Height
    //    destination: Cesium.Cartesian3.fromDegrees(116.4, 39.91, 13000000)  // Beijing
        //destination: Cesium.Cartesian3.fromDegrees(116.4, 39.91, 18000000)  // Beijing
    //});

    // cancel global left double click events
    //viewer.screenSpaceEventHandler.removeInputAction(
    //  Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK
    //);
    // start to receive sites status
    siteStore.check_devices_status();
    siteStore.init_boundingSpheres();

    // change circleWave range along with camera height
    async function heightSiteEvent() {
      // 当前相机返回的高度（2D/3D 含义不同）
      const height = cesiumStore.i3D ? camera_height(viewer) : camera_height2D(viewer)*0.6; 

      const circleRange = height ** 0.75;

      for (const site of Object.values(siteStore.sites)) {
        if (site.name.includes('上行')) {
          site.range = circleRange;
          site.update_range();
        }
      }
    }
    heightSiteEvent();
    throttleHeightEvent = throttle(heightSiteEvent, 200);
    // cesium handle events
    viewer.scene.camera.changed.addEventListener(throttleHeightEvent);

    // event handle
    let lastPickedId = null;
    handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    // performance improvement
    const throttleMouseMove = throttle(listen_mousemove, 100);
    handler.setInputAction(throttleMouseMove, Cesium.ScreenSpaceEventType.MOUSE_MOVE)
    // model selection
    const throttleLeftClick = throttle(listen_leftClick, 120);
    handler.setInputAction(throttleLeftClick, Cesium.ScreenSpaceEventType.LEFT_CLICK)

    async function listen_mousemove(movement) {
      if (cesiumStore.iPausedMouseEvents) return // ✅ 暂停时直接返回
      const pickedInstance = viewer.scene.pick(movement.endPosition);
      if (Cesium.defined(pickedInstance) && 
          typeof pickedInstance.id === 'string' &&
          (pickedInstance.primitive instanceof Cesium.Model ||
          //pickedInstance.primitive instanceof Cesium.GroundPrimitive ||
          pickedInstance.primitive instanceof Cesium.Primitive && pickedInstance.id.includes(',') ||
          pickedInstance.primitive instanceof Cesium.Billboard) 
        ) {
          let iShow = false;
          let currentId = pickedInstance.id
          // 如果是同一个对象，直接返回
          if (currentId && currentId === lastPickedId) {
            return;
          }

          let text = ''
          if (pickedInstance.primitive instanceof Cesium.Model) {
            const [name, lon, lat, alt, gid, mfid] = currentId.split(',');
            text = {name: name, lon: lon, lat: lat, alt: alt, gid: gid};
            iShow = true;
          }
          //if (pickedInstance.primitive instanceof Cesium.GroundPrimitive) {
          if (pickedInstance.primitive instanceof Cesium.Primitive) {
            const [id, lon, lat, idSat, satLon, satLat, satHgt, satTime, SID] = currentId.split(',');
            text = {name: id, idSat: idSat, lon: lon, lat: lat, time: satTime, SID: SID};
            iShow = true;
          }
          // Billboard
          if (pickedInstance.primitive instanceof Cesium.Billboard) {
            if (currentId.includes('tdoaTarget_')) {
              const [name, gid, time] = currentId.split('_');
              const tdoa = await api.tdoa_getByTimeGid({gid: gid, time: time});
              if (tdoa && tdoa.data) {
                text = {name: name, lon: tdoa.data.lon, lat: tdoa.data.lat, gid: gid, time: time, note: tdoa.data.note};
                iShow = true;
              }
            } else if (currentId.includes('lineTarget_')) {
              const [name, lon, lat, gid, time] = currentId.split('_');
              const result = await api.upward_getByTimeGid({gid: gid, time: time});
              if (result && result.data) {
                text = {name: name, lon: lon, lat: lat, gid: gid, time: time, note: result.data.note};
                iShow = true;
              }
            }
          }

          // 处理新对象
          if (iShow) {
            lastPickedId = currentId;
            tagTip.iShow = true;
            tagTip.left = movement.endPosition.x + 10;
            tagTip.top = movement.endPosition.y + 10;
            tagTip.text = text;
          }
      } else {
        lastPickedId = null;
        tagTip.iShow = false;
      }
    }

    function listen_leftClick(movement) {
      if (cesiumStore.iPausedMouseEvents) return // ✅ 暂停时直接返回
      const pickedInstance = viewer.scene.pick(movement.position)
      if ( Cesium.defined(pickedInstance) ) {
        /*
        let mfid = null;
        // gtlf model
        if ( pickedInstance.primitive instanceof Cesium.Model ) {
          const [name, lon, lat, alt, gid, mfid1] = pickedInstance.id.split(',');
          mfid = mfid1;
        }
        // circleWave entity
        if ( pickedInstance.id instanceof Cesium.Entity ) {
          mfid = pickedInstance.id.id;
        }
        if (mfid) {
          const idx = siteStore.selectSites.findIndex(el => el === mfid)
          console.log(mfid,idx)
          if (idx >= 0) {
            siteStore.selectSites.splice(idx, 1);  // need Mutate the array in‐place
          } else {
            siteStore.selectSites.push(mfid)
          }
        }
        */
       
        // 蜂窝卫星连线
        if (pickedInstance.primitive instanceof Cesium.Primitive &&
          typeof pickedInstance.id === 'string' &&
          pickedInstance.id.includes(',')
        ) {
          const [id, lon, lat, idSat, satLon, satLat, satHgt] = pickedInstance.id.split(',');
          trigger_hexSatLine({
            hexId: id,
            hexLon: parseFloat(lon),
            hexLat: parseFloat(lat),
            satLon: parseFloat(satLon),
            satLat: parseFloat(satLat),
            satHgt: parseFloat(satHgt)
          })
        }
        // tdoa定位点编辑,打标
        if (pickedInstance.primitive instanceof Cesium.Billboard && typeof pickedInstance.id === 'string') {
          if (pickedInstance.id.includes('tdoaTarget_')) {
            tagTip.iText = 1;
          } else if (pickedInstance.id.includes('lineTarget_')) {
            tagTip.iText = 2;
          }
        }
        
      }
    }

    // temporary -------------------------------------------------------------------

    // 轻量节流：相机变化后 150ms 再算
    let timer;
    viewer.camera.changed.addEventListener(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const result = cesiumStore.estimateMapLevel(viewer);
        //mapLevel.value = result.level;
        
        // 更新比例尺 UI 数据
        scaleData.width = result.barWidth;
        scaleData.label = result.barLabel;
      }, 150);
    });

    // end temporary ----------------------------------------------------------------
  })

  onBeforeUnmount(()=>{
    throttleHeightEvent && viewer.scene.camera.changed.removeEventListener(throttleHeightEvent);
    if (handler != null) {
      handler.removeInputAction(Cesium.ScreenSpaceEventType.MOUSE_MOVE)
      handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK)
      handler = null;
    }
  })

  // 定位点编辑,打标
  async function onNoteEnter(text, tdoaOrResult) {
    const raw = text ?? '';
    const isBlank = raw.trim() === '';
    // 空白则保存为空字符串；非空再做清洗（避免下划线干扰你现有 split 解析）
    const safeNote = isBlank ? '' : raw.replace(/[\s_]+/g, '-');

    if (tdoaOrResult === 1) {
      await api.tdoa_updateNoteByTimeGid({
        gid: tagTip.text.gid,
        time: tagTip.text.time,
        note: safeNote
      });
    } else if (tdoaOrResult === 2) {
      await api.upward_updateNoteByTimeGid({
        gid: tagTip.text.gid,
        time: tagTip.text.time,
        note: safeNote
      });
    }

    tagTip.text.note = safeNote; // 同步 UI
    tagTip.iText = 0;
  }
  function onNoteEsc(e) {
    // 取消输入：清空并收起
    //if (e?.target) e.target.value = '';
    tagTip.iText = 0;
  }

  function switch_power(iOn, siteName) {
    if (siteName.includes('上行')) {
      switch_power_upward(iOn, siteName);
    } else {
      switch_power_downward(iOn, siteName);
    }
  }

</script>

<style scoped>
  #cesiumContainer {
    position: absolute;
    width: 100%;
    height: 100%;
    top: 0px;
    left: 0px;
    margin: 0;
    padding: 0;
    overflow: hidden;
  }
</style>