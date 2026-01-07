<!--------------------------------
 - @Author: Ronnie Zhang
 - @LastEditor: Ronnie Zhang
 - @LastEditTime: 2023/12/05 21:28:36
 - @Email: zclzone@outlook.com
 - Copyright © 2023 Ronnie Zhang(大脸怪) | https://isme.top
 --------------------------------->

<template>
  <div class="flex-col wh-full bg-[url(@/assets/images/login_bg3.webp)] bg-cover">
    <div class="flex-col my-auto gap-20">
      <div class="f-c-c text-36 text-white font-bold">
        {{ title }}
      </div>
      <div class="m-auto w-330 f-c-c rounded-30 bg-#0A1823a0" 
        border-l="1px solid #5A78a3" border-r="1px solid #5A78a3">
        <div class="w-550 flex-col px-10 py-26">
          <div style="width:230px; margin: auto;">
            <n-input
              v-model:value="loginInfo.username"
              autofocus
              class="mt-32 h-40 items-center bg-#0A1823"
              placeholder="请输入用户名"
              :maxlength="20"
            >
              <template #prefix>
                <i class="i-fe:user mr-12 opacity-70" />
              </template>
              <template #clear-icon></template>
            </n-input>
            <n-input
              v-model:value="loginInfo.password"
              class="mt-20 h-40 items-center bg-#0A1823"
              type="password"
              show-password-on="mousedown"
              placeholder="请输入密码"
              :maxlength="20"
              @keydown.enter="handleLogin()"
            >
              <template #prefix>
                <i class="i-fe:lock mr-12 opacity-70" />
              </template>
              <template #separator></template>
            </n-input>

            <n-checkbox
              class="mt-20"
              :checked="isRemember"
              label="记住我"
              :on-update:checked="(val) => (isRemember = val)"
            />

            <div class="mt-20 flex items-center">
              <n-button
                class="h-40 flex-1 rounded-5 text-16 bg-#0A1823"
                :loading="loading"
                @click="handleLogin()"
              >
                登录
              </n-button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!--
    <TheFooter class="py-20" />
    -->
  </div>
</template>

<script setup>
import { useAuthStore } from '@/store'
import { lStorage } from '@/utils'
import { useStorage } from '@vueuse/core'
import api from '@/api'

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()
const title = import.meta.env.VITE_TITLE

const loginInfo = ref({
  username: '',
  password: '',
})

const localLoginInfo = lStorage.get('loginInfo')
if (localLoginInfo) {
  loginInfo.value.username = localLoginInfo.username || ''
  loginInfo.value.password = localLoginInfo.password || ''
}

const isRemember = useStorage('isRemember', true)
const loading = ref(false)
async function handleLogin() {
  const { username, password } = loginInfo.value
  if (!username || !password)
    return $message.warning('请输入用户名和密码')
  try {
    loading.value = true
    $message.loading('正在验证，请稍后...', { key: 'login' })
    const { data } = await api.login({ username, password: password.toString() })
    if (isRemember.value) {
      lStorage.set('loginInfo', { username, password })
    }
    else {
      lStorage.remove('loginInfo')
    }
    onLoginSuccess(data)
  }
  catch (error) {
    $message.destroy('login')
    console.error(error)
  }
  loading.value = false
}

async function onLoginSuccess(data = {}) {
  authStore.setToken(data)
  $message.loading('登录中...', { key: 'login' })
  try {
    $message.success('登录成功', { key: 'login' })
    if (route.query.redirect) {
      const path = route.query.redirect
      delete route.query.redirect
      router.push({ path, query: route.query })
    }
    else {
      router.push('/')
    }
  }
  catch (error) {
    console.error(error)
    $message.destroy('login')
  }
}
</script>
