<template>
  <div ref="elBox" :style="style" class="panel">
    <h3 ref="elTitle" style="background-color: #1f363f56;">
      <span style="cursor: pointer; color:cadetblue;" @click="switch_satPanel"><<</span>
      XL星历 (数目:{{ siteStore.satData.length }}, 更新:{{ satTime}})
    </h3>

    <div class="row">
      <label>点大小(px)</label>
      <input type="range" min="1" max="8" step="1" v-model.number="pfTune.pixelSize" @change="applyStyle" />
      <span class="kpi">{{ pfTune.pixelSize }}</span>
    </div>

    <div class="row">
      <label>远距隐藏</label>
      <input type="checkbox" v-model="pfTune.enableDistanceCull" @change="applyStyle" />
      <span class="pill">减少片元压力</span>
    </div>

    <div class="row">
      <label>轨迹分钟</label>
      <input type="range" min="15" max="95" step="5" v-model.number="orbitMinutes" />
      <span class="kpi">±{{ orbitMinutes }}</span>
      <button class="btn" @click="clearOrbits">清除轨迹</button>
    </div>

    <div class="row">
      <label>显示范围</label>
      <input type="checkbox" v-model="iReceiver" @change="sendObserver()" />
      <span class="pill">高亮接收范围内卫星</span>
    </div>

  </div>
</template>

<script setup>
import { useDraggable } from '@vueuse/core'
import { loadSat, setupPicking, tickSending, cleanSat, pfTune, applyStyle, 
  orbitMinutes, clearOrbits, iReceiver, sendObserver } from '@/cesium'
import { useSiteStore } from '@/store';

defineOptions({ name: 'FarView' })

const siteStore = useSiteStore();

// Position will persist and update
const elBox = useTemplateRef('elBox');
const elTitle = useTemplateRef('elTitle');  // draggable element on title bar
const { style, x, y } = useDraggable(elBox, {
  //preventDefault: true,
  // with `preventDefault: true`
  // you can disable the native behavior (e.g., for img)
  // and control the drag-and-drop, preventing the browser interference.
  //initialValue: { x: window.innerWidth/2 - 256 , y: window.innerHeight/2 - 185 },
  initialValue: { x: 10 , y: 55 },
  handle: elTitle,
})

const switch_satPanel = () => {
  const switchElement = document.querySelector('.panel h3 span');
  const rows = document.querySelectorAll('.row');
  
  if (rows[0].style.display === 'none') {
    // 展开逻辑
    rows.forEach(row => row.style.display = '');
    switchElement.textContent = '<<';
    
    // 恢复初始位置
    x.value = 10;
    y.value = 55;

  } else {
    // 折叠逻辑
    rows.forEach(row => row.style.display = 'none');
    switchElement.textContent = '>>';

    // 2. 修改此处：移动到下方
    // 例如：移动到距离窗口底部 40px 的位置 (假设折叠后高度约为 30-40px)
    y.value = window.innerHeight - 90;
    x.value = 180; 
  }
  switchElement.blur();
}

const satTime = ref('');
const update_satTime = () => {
  fetch('/satDatas/dtime.txt')
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to load dtime.txt');
      }
      return response.text();
    })
    .then(text => {
      satTime.value = text;
    })
    .catch(error => console.error(error));

}

onMounted(() => {

  update_satTime();

  loadSat();

  setupPicking();

  tickSending();

  setTimeout(() => {
    switch_satPanel();
  }, 10000);  // Auto collapse after 10s

})

onBeforeUnmount(()=>{
  cleanSat();
})

</script>

<style scoped>
.panel { 
  position: absolute; 
  z-index: 1; 
  background: rgba(17, 24, 39, 0.85); 
  padding: 12px 12px 6px 12px; 
  border-radius: 12px; 
  box-shadow: 0 8px 24px rgba(0,0,0,0.25); 
  user-select: none;
}
.panel h3 { 
  padding-bottom: 3px;
  margin: 0 0 8px; 
  font-size: 15px; 
  letter-spacing: .5px; 
  color: cyan;
  cursor: move;
}
.row { 
  display: flex; 
  align-items: center; 
  gap: 8px; 
  margin: 6px 0; 
}
.row label { 
  font-size: 12px; 
  opacity: .85; 
  min-width: 76px; 
}
.row input[type="range"] { 
  width: 150px; 
}
.row input { 
  background-color: rgba(73, 86, 93, 0.7); 
}
.btn { 
  cursor: pointer; 
  padding: 6px 10px; 
  border-radius: 8px; 
  border: 1px solid rgba(255,255,255,0.15); 
  background: rgba(255,255,255,0.06); 
  color: #fff; font-size: 12px; 
}
.btn:hover { 
  background: rgba(255,255,255,0.12); 
}
.pill { 
  padding: 2px 6px; 
  border-radius: 999px; 
  background: rgba(255,255,255,0.12); 
  font-size: 11px; 
}
.kpi { 
  display: inline-block; 
  min-width: 28px; 
  text-align: right; 
}


</style>