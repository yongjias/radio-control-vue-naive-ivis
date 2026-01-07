<template>
  <div id="cesiumContainer"></div>
  
  <div :bordered="false" v-if="tagTip.iShow"
    :style="{position: 'absolute', left: `${tagTip.left}px`, top: `${tagTip.top}px`, userSelect: 'none'}" >
    <p class="bg-#ec4899aa px-5" >
        站点: <i :class="'color-primary font-bold'">{{tagTip.text.name}}</i>
    </p>
    <p class="bg-#00337799 px-5">
        坐标: <i :class="'text-#C8D500 font-bold'">{{tagTip.text.lon}}, {{tagTip.text.lat}}, {{tagTip.text.alt}} </i>
    </p>
    <p class="bg-#00ddffa5 px-5" v-if="tagTip.text.status">
        状态: <i :class="'text-#C805D0 font-bold'">{{ tagTip.text.status }}</i>
    </p>
  </div>
</template>

<script setup>
  import * as Cesium from 'cesium';
  import { useSiteStore, useCesiumStore } from '@/store';
  import { gltf_instancing, camera_height, compute_baseMat, compute_center_pos, drag_area } from '@/cesium'
  import { throttle } from '@/utils'
  import selectImgUrl from '@/assets/images/select.png'

  // component name
  defineOptions({
    name: 'CesiumMap',
    inheritAttrs: false
  })

  const siteStore = useSiteStore();
  const cesiumStore = useCesiumStore();

  let viewer = null;
  let tagTip = reactive({iShow:false, left:0, top:0, text: {id:'', name:'', lon:'', lat:'', alt:'', status: ''}});
  let throttleHeightEvent = null;
  let handler = null;
  let watch_status = null;
  let watch_selectSites = null;
  onMounted(async() => {
    viewer = cesiumStore.init('cesiumContainer')
    // initial baseMap
    cesiumStore.change_baseMap('OfflineMap')
    //cesiumStore.change_baseMap('ArcgisMap')
    //cesiumStore.change_baseMap('ArcgisMap').then(()=>cesiumStore.hlj_border_terrain())
    //cesiumStore.change_baseMap('SrrcMapWx')
    // add HuBei province border
    //cesiumStore.hb_border()
    cesiumStore.cn_border()
    // go to home
    cesiumStore.switch_home3d()
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
    siteStore.check_devices_status(heightSiteEvent);
    // start to receive decoding message
    //siteStore.init_receive_channel();

    let model = null;
    // change model_scale along with camera height
    async function heightSiteEvent() {
      let siteInstances = Object.values(siteStore.sites).filter(el=>el.name.includes("上行")).map((site) => {
        return {
          key:     site.mfid,
          name:    site.name,
          lon:     site.lon,
          lat:     site.lat,
          alt:     site.alt,
          heading: 0,
          pitch:   0,
          roll:    0,
          status:  site.status,
        }
      })
      //let height = viewer.camera.positionCartographic.height
      if ( siteInstances.length > 0 ) {
        let height = camera_height(viewer)
        //let model_scale = parseFloat((height**0.72*0.085).toFixed(2))
        let model_scale = parseFloat((height**0.65*1.8).toFixed(2))
        //let model_scale = Math.min(10000, parseFloat((height**1.15*1.0).toFixed(2)))
        let siteCenterPos = compute_center_pos(siteInstances.map(el=>[el.lon, el.lat, el.alt]))
        let newModel = await gltf_instancing(viewer.scene, siteInstances, compute_baseMat(...siteCenterPos), model_scale)
        viewer.scene.primitives.add(newModel)
        // Load the modified glTF into Cesium.
        newModel.readyEvent.addEventListener(() => {
          if ( model != null ) {
            viewer.scene.primitives.remove(model)
          }
          model = newModel
        })

        // update circleWave range
        //let circleRange = parseFloat((height**0.75).toFixed(2));
        //console.log('circleWave range in meter: ', circleRange)
        //for (let site of Object.values(siteStore.sites)) {
        //  site.set_range(circleRange);
        //}

      } else {
        if ( model != null ) {
          viewer.scene.primitives.remove(model)
          model = null
        }
      }
    }
    heightSiteEvent();
    throttleHeightEvent = throttle(heightSiteEvent, 200);
    // cesium handle events
    viewer.scene.camera.changed.addEventListener(throttleHeightEvent);

    // add icon for selected sites
    let siteBillboards = viewer.scene.primitives.add(new Cesium.BillboardCollection());
    const update_selected = () => {
      // show label for clustered model
      siteBillboards.removeAll()
      for (let mfid of siteStore.selectSites) {
        siteBillboards.add({
          position : Cesium.Cartesian3.fromDegrees(
            siteStore.sites[mfid].lon,
            siteStore.sites[mfid].lat,
            siteStore.sites[mfid].alt+5000),
          verticalOrigin : Cesium.VerticalOrigin.BOTTOM,
          horizontalOrigin : Cesium.HorizontalOrigin.CENTER,
          //heightReference : Cesium.HeightReference.NONE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY, // makes it ignore the depth buffer entirely
          // optional: keep it “pinned” so it scales/rotates with the view
          eyeOffset: new Cesium.Cartesian3(0, 0, 0),
          image: selectImgUrl,
          color: Cesium.Color.CYAN,
          show: true,
          id: 'selectedSite_'+mfid,
        })
      }
    }
    watch_selectSites = watch(()=>siteStore.selectSites, ()=>{
      update_selected();
    }, {deep: true})

    // event handle
    let lastPickedId = null;
    handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    // performance improvement
    const throttleMouseMove = throttle(listen_mousemove, 100);
    handler.setInputAction(throttleMouseMove, Cesium.ScreenSpaceEventType.MOUSE_MOVE)
    // storage variables for dragging-click points
    let activeShapePoints = ref([])
    let activeShape = ref(undefined)
    // model selection
    const throttleLeftClick = throttle(listen_leftClick, 120);
    handler.setInputAction(throttleLeftClick, Cesium.ScreenSpaceEventType.LEFT_CLICK)
    // draw a polygon for area selection
    const throttleLeftDclick = throttle(listen_leftDclick, 120);
    handler.setInputAction(throttleLeftDclick, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK)
    // show received decoded msg of a lora, or bearing of a df
    const throttleRightClick = throttle(listen_rightClick, 120);
    handler.setInputAction(throttleRightClick, Cesium.ScreenSpaceEventType.RIGHT_CLICK)

    function listen_mousemove(movement) {
      const pickedInstance = viewer.scene.pick(movement.endPosition);
      if (Cesium.defined(pickedInstance)  ) {
        if ((pickedInstance._featureId!=undefined && pickedInstance.primitive instanceof Cesium.Model) ||
          typeof(pickedInstance.id)=='string' && pickedInstance.primitive instanceof Cesium.GroundPrimitive) {

          let currentId = pickedInstance.id
          let text = ''
          if (pickedInstance.primitive instanceof Cesium.Model) {
            currentId = pickedInstance.getProperty(pickedInstance.getPropertyIds()[0])
            text = JSON.parse(currentId)
          }
          if (pickedInstance.primitive instanceof Cesium.GroundPrimitive) {
            const [id, lon, lat] = currentId.split(',');
            text = {name: id, lon: lon, lat: lat};
          }

          // 如果是同一个对象，直接返回
          if (currentId && currentId === lastPickedId) {
            return;
          }

          // 处理新对象
          if (currentId) {
            lastPickedId = currentId;
            tagTip.iShow = true;
            tagTip.left = movement.endPosition.x + 3;
            tagTip.top = movement.endPosition.y + 3;
            tagTip.text = text;
          }
        }
      } else {
        lastPickedId = null;
        tagTip.iShow = false;
      }
    }

    function listen_leftClick(movement) {
      const pickedInstance = viewer.scene.pick(movement.position)
      if ( Cesium.defined(pickedInstance) ) {
        let mfid = null;
        // gtlf model
        if ( pickedInstance.primitive instanceof Cesium.Model ) {
          let id = pickedInstance.getProperty(pickedInstance.getPropertyIds()[0])
          if (typeof id === 'string') {
            let idd = JSON.parse(id)
            mfid = idd.id;
          }
        }
        // circleWave entity
        if ( pickedInstance.id instanceof Cesium.Entity && pickedInstance.id.id.includes('_CircleWave') ) {
          mfid = pickedInstance.id.id.slice(0, -11);
        }
        if (mfid) {
          const idx = siteStore.selectSites.findIndex(el => el === mfid)
          if (idx >= 0) {
            siteStore.selectSites.splice(idx, 1);  // need Mutate the array in‐place
          } else {
            siteStore.selectSites.push(mfid)
          }
        }
        
      }
    }

    function listen_rightClick(movement) {
      const pickedInstance = viewer.scene.pick(movement.position)
      if ( Cesium.defined(pickedInstance) ) {
        let mfid = null;
        let delay = 0;
        // gtlf model
        if ( pickedInstance.primitive instanceof Cesium.Model ) {
          let id = pickedInstance.getProperty(pickedInstance.getPropertyIds()[0])
          if (typeof id === 'string') {
            let idd = JSON.parse(id)
            mfid = idd.id;
          }
        }
        // circleWave entity
        if ( pickedInstance.id instanceof Cesium.Entity && pickedInstance.id.id.includes('_CircleWave') ) {
          mfid = pickedInstance.id.id.slice(0, -11);
        }
        if (mfid) {
          if (siteStore.handleAResult) {
            siteStore.handleAResult = false;
            delay = 100;
          }
          setTimeout(()=>{
            siteStore.pickedLora = mfid;
            siteStore.handleAResult = true;
          }, delay)
        }

        
      }
    }

    function listen_leftDclick(movement) {
      const pickedInstance = viewer.scene.pick(movement.position)
      if ( !Cesium.defined(pickedInstance) || (pickedInstance.id && pickedInstance.id.includes('_fillMap_')) ) {
        // drawing polygon
        drag_area(viewer, activeShapePoints, activeShape, update_siteByArea, handler, listen_mousemove, listen_leftDclick)
      }
    }

  })

  onBeforeUnmount(()=>{
      //viewer.scene.postRender.removeEventListener(heightEvent)
      if (throttleHeightEvent != null) {
        viewer.scene.camera.changed.removeEventListener(throttleHeightEvent)
        throttleHeightEvent = null
      }
      if (handler != null) {
        handler.removeInputAction(Cesium.ScreenSpaceEventType.MOUSE_MOVE)
        handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK)
        handler.removeInputAction(Cesium.ScreenSpaceEventType.RIGHT_CLICK)
        handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK)
        handler = null;
      }
      if (watch_status) {
        watch_status();
        watch_status = null;
      }
      if (watch_selectSites) {
        watch_selectSites();
        watch_selectSites = null;
      }
  })

  const update_siteByArea = (lonRange, latRange)=>{
    if ( lonRange.length>0 ) {
      siteStore.filterByArea(lonRange, latRange)
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