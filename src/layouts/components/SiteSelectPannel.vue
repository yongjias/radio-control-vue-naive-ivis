<template>
  <div class="f-c-c">
    <i class="i-fe:receiver" />
    <i class="select-none">LORA</i>
    <n-radio-group v-model:value="siteStore.loraStatus" @update:value="siteStore.filterByCondition"
      name="selectReceiver" size="tiny" class="auto-bg1">
      <n-radio-button v-for="item in devStatus" :key="item.value" :value="item.value" size="tiny"
      :style="{color: siteStore.loraStatus==item.value ? item.color1 : item.color}" class="text-15">
        {{ item.label }}
      </n-radio-button>
    </n-radio-group>
  </div>

</template>

<script setup>
import { useSiteStore } from '@/store'
import { Device, deviceStatus } from '@/constants';

defineOptions({ name: 'SiteSelectPannel' })

const siteStore = useSiteStore()

let devStatus = [
  {
    value: deviceStatus.OFFLINE,
    label: Device[deviceStatus.OFFLINE].Txt,
    color: Device[deviceStatus.OFFLINE].Color,
    color1: '#554433'
  },
  {
    value: deviceStatus.IDLE,
    label: Device[deviceStatus.IDLE].Txt,
    color: Device[deviceStatus.IDLE].Color,
    color1: '#823611'
  },
  {
    value: deviceStatus.RUNNING,
    label: Device[deviceStatus.RUNNING].Txt,
    color: '#10ff13',
    color1: '#106213'
  },
  {
    value: deviceStatus.ABNORMAL,
    label: Device[deviceStatus.ABNORMAL].Txt,
    color: '#ff55aa',
    color1: '#9435a5'
  },
  {
    value: deviceStatus.ALL,
    label: Device[deviceStatus.ALL].Txt,
    color: '',
    color1: ''
  },
  {
    value: deviceStatus.NONE,
    label: Device[deviceStatus.NONE].Txt,
    color: '',
    color1: ''
  }
]


</script>