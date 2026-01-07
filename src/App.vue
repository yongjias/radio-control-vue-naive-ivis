<!--------------------------------
 - @Author: Ronnie Zhang
 - @LastEditor: Ronnie Zhang
 - @LastEditTime: 2023/12/16 18:49:42
 - @Email: zclzone@outlook.com
 - Copyright © 2023 Ronnie Zhang(大脸怪) | https://isme.top
 --------------------------------->

<template>
  <n-config-provider
    class="wh-full"
    :locale="zhCN"
    :date-locale="dateZhCN"
    :theme="darkTheme"
    :theme-overrides="appStore.naiveThemeOverrides"
  >
    <router-view v-if="Layout && ready" v-slot="{ Component, route: curRoute }">
      <component :is="Layout">
          <KeepAlive :include="keepAliveNames">
            <component :is="Component" v-if="!tabStore.reloading" :key="curRoute.fullPath" />
          </KeepAlive>
      </component>
    </router-view>
  </n-config-provider>
</template>

<script setup>
import { useAppStore, useTabStore, useSiteStore } from '@/store'
import { darkTheme, dateZhCN, zhCN } from 'naive-ui'
import { useDark } from '@vueuse/core'

const layouts = new Map()
function getLayout(name) {
  // 利用map将加载过的layout缓存起来，防止重新加载layout导致页面闪烁
  if (layouts.get(name))
    return layouts.get(name)
  const layout = markRaw(defineAsyncComponent(() => import(`@/layouts/${name}/index.vue`)))
  layouts.set(name, layout)
  return layout
}

const route = useRoute()
const appStore = useAppStore()
if (appStore.layout === 'default')
  appStore.setLayout('')
const Layout = computed(() => {
  if (!route.matched?.length)
    return null
  return getLayout(route.meta?.layout || appStore.layout)
})

const tabStore = useTabStore()
const keepAliveNames = computed(() => {
  return tabStore.tabs.filter(item => item.keepAlive).map(item => item.name)
})

const isDark = useDark();
isDark.value = true // 强制开启暗黑模式
appStore.setThemeColor(appStore.primaryColor)


// create sql records, run once for setup
  // create sites records to sql
  //import { create_sites } from '@/utils/createSqlRecords';    // only need run once
  //create_sites() // write receiver records to sql


// init_data 完成后才渲染路由页，避免子页面先 mounted 读到未初始化的数据
const ready = ref(false)
 
// initial sites and their status
const init_data = async () => {
  const siteStore = useSiteStore()
  // load satellite data
  await siteStore.setSatData();
  // load sites from sql
  await siteStore.fetchApi();

  ready.value = true
}
init_data()

</script>