<template>
  <n-dropdown trigger="hover" :options="mapLayers" @select="change_maplayer" size="small" class="card-border auto-bg-opc">
    <i
      class="cursor-pointer"
      :class="'i-fe:layers'"
    />
  </n-dropdown>
</template>

<script setup>
import { NSlider } from 'naive-ui'
import { useCesiumStore } from '@/store'

//const { change_baseMap, show_map_border, change_map_range } = useCesiumStore();
//const { change_baseMap, show_map_label, change_map_range } = useCesiumStore();
const { change_baseMap, show_map_label } = useCesiumStore();

// map variables
let iMapLabel = false
//let iMapBorder = false;
let mapLayers = [
    {label: '离线卫星地图',   key: 'OfflineMap',  icon: ()=>h('i',{class: 'i-fe:map'})},
    //{label: '全国卫星', key: 'SrrcMapWx', icon: ()=>h('i', { class: 'i-fe:globe' })},
    //{label: '全国行政', key: 'SrrcMapXz', icon: ()=>h('i',{class: 'i-fe:map'})},
    //{label: '高清卫星', key: 'SrrcMapHwx', icon: ()=>h('i',{class: 'i-fe:navigation'})},
    {label: 'Arcgis地图', key: 'ArcgisMap', icon: ()=>h('i', { class: 'i-fe:globe' })},
    {label: '高德行政',   key: 'GaoDeMap',  icon: ()=>h('i',{class: 'i-fe:navigation'})},
    //{label: '微软地图',   key: 'AzureMapWx',  icon: ()=>h('i',{class: 'i-fe:map'})},
    {label: '地图标识',   key:'mapLabel',
      icon: ()=>h('i',{class: (()=>iMapLabel ? 'i-fe:check-box-outline' : 'i-fe:unchecked-regular')()})},
    //{label: '地区覆盖',   key:'mapBorder',
    //  icon: ()=>h('i',{class: (()=>iMapBorder ? 'i-fe:check-box-outline' : 'i-fe:unchecked-regular')()})},
    //{label: '地图视窗范围', key: 'mapRange',  icon: ()=>h('i',{class: 'i-fe:split'})},
    //{key: 'mapRange', type: 'render', render: ()=>h('div', {class: 'flex f-c-c justify-evenly'}, [
    //  h('label', {for: 'slider', class: 'text-#ddd'}, '地图视窗'),
    //  h(NSlider, {id:'slider', defaultValue:100, 'onUpdate:value': (value)=>change_map_range(value), style: { width: '80px'} })
    //])},
]
const change_maplayer = (key) => {
    if (key == 'mapLabel') {
      iMapLabel = !iMapLabel
      show_map_label(iMapLabel)
    //} else if (key == 'mapRange') {
    //  change_map_range()
    } else {
      if (key == 'GaoDeMap') {
        iMapLabel = false;
        show_map_label(iMapLabel)
      }
      change_baseMap(key)
    }
}
</script>
