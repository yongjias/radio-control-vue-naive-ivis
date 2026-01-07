<template>
  <div  style="position:absolute; left: 50%; top: 25%; transform: translate(-50%, 0); 
    width:300px; background-color: #553333cc; border-radius: 10px;
    height:30px; color:black; font-size: 18px; color:white; text-align: center;" 
    v-if = "iSIDShow">
    警告: 监测到小区新SID!
  </div>
</template>
<script setup>
import { unloadDownward, wsDownward, iSIDShow } from '@/cesium'

defineOptions({ name: 'Downward' })

onMounted(() => {
  wsDownward();
});

onBeforeUnmount(()=>{
  unloadDownward();
})

</script>