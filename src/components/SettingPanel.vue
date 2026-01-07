
<template>
  <div class="modalIcon">
    <i class=" i-fe:settings cursor-pointer" @click="meModal.open();" />
    <span class="iconTip">设备管理</span>
  </div>
  <MeModal ref="meModal" title="设备管理" width="600px" :closable="false" 
    :modalStyle="modalStyle" @ok="submitTasks()">
    <div class="f-c-c justify-around">
      <div v-for="gid in Object.keys(upSites)" style="text-align: center;" >
        上行设备:{{ upSites[gid].length }}台
        <n-transfer :options="upSites[gid].map(el => ({ label: el.name+'-'+el.address, value: el.mfid }))" 
          v-model:value="upDevices" style="height: 200px;width: 300px;"/>
        下行设备:{{ downSites[gid].length }}台
        <n-transfer :options="downSites[gid].map(el => ({ label: el.name+'-'+el.address, value: el.mfid }))" 
          v-model:value="downDevices" style="height: 100px;width: 300px;"/>
        <span>组{{ gid }}</span>
      </div>
    </div>
  </MeModal>
</template>

<script setup>
import { MeModal } from '@/components'
import { useModal } from '@/composables'
import { useSiteStore } from '@/store'

defineOptions({ name: 'SettingPanel' })

const siteStore = useSiteStore()

const upSites = Object.values(siteStore.sites).filter(s => s.name.includes('上行')).reduce((acc, site) => {
    const key = site.group ?? 'UNGROUPED';
    (acc[key] ||= []).push(site);
    return acc;
  }, {});
const downSites = Object.values(siteStore.sites).filter(s => s.name.includes('下行')).reduce((acc, site) => {
    const key = site.group ?? 'UNGROUPED';
    (acc[key] ||= []).push(site);
    return acc;
  }, {});

const [meModal] = useModal()

const modalStyle = {
  backgroundColor: '#1d1d1bdf',
  borderRadius: '5px 5px 10px 10px',
  //marginTop: '15%',
  //marginLeft: '60px',
  userSelect: 'none',
}

const upDevices = ref([].concat(...Object.keys(upSites).map(gid => upSites[gid].map(el => el.mfid))));
const downDevices = ref([].concat(...Object.keys(downSites).map(gid => downSites[gid].map(el => el.mfid))));

const submitTasks = () => {
}

</script>

<style scoped>
.iconTip {
  visibility: hidden; /* Hide the tooltip text by default */
  text-align: center;
  position: absolute;
  left: 10%;
  transform: translateX(110%);
  font-size: 16px;
  color: CYAN;
  opacity: 1;
  transition: opacity 0.3s;
  z-index: 1;
}
.modalIcon {
  position: relative;
}
.modalIcon:hover {
  background-color: #18181c55;
  border-radius: 20px 20px;
}
.modalIcon:hover .iconTip {
  visibility: visible; /* Show the tooltip on hover */
  opacity: 1; /* Make the tooltip visible */
  mix-blend-mode: screen;
}

</style>