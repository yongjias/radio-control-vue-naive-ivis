<!--------------------------------
 - @Author: Ronnie Zhang
 - @LastEditor: Ronnie Zhang
 - @LastEditTime: 2023/12/13 20:54:55
 - @Email: zclzone@outlook.com
 - Copyright © 2023 Ronnie Zhang(大脸怪) | https://isme.top
 --------------------------------->

<template>
  <div style="position: absolute; width: 100%; height: 100%; top:0px">
    <slot />
  </div>
  <AppSider/>
  <AppHeader/>
</template>

<script setup>
import AppHeader from './header/index.vue'
import AppSider from './sider/index.vue'
//import AppFooter from './footer/index.vue'
  //<AppFooter class="h-35" />

</script>
