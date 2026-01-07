<template>
  <div  style="position:absolute; left: 50%; top: 20%; transform: translate(-50%, 0); 
    width:300px; background-color: #553333cc; border-radius: 10px;
    height:30px; color:black; font-size: 18px; color:white; text-align: center;" 
    v-if = "iTargetShow">
    警告：定位到卫星终端!
  </div>

</template>
<script setup>
import { unloadUpward, wsUpward, iTargetShow } from '@/cesium'

defineOptions({ name: 'Upward' })

onMounted(() => {
  wsUpward();

});

onBeforeUnmount(()=>{
  unloadUpward();
})

</script>