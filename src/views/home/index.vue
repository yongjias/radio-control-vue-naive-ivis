<template>
    <CesiumMap/>
    <FarView v-if="appStore.iFarView"/>
    <Downward v-if="appStore.nearView==='下行' || appStore.nearView==='总体'"/>
    <Upward v-if="appStore.nearView==='上行' || appStore.nearView==='总体'"/>
</template>

<script setup>
import { useAppStore } from '@/store'

defineOptions({ name: 'Home' })

const appStore = useAppStore();

</script>
