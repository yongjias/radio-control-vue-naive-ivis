<!--------------------------------
 - @Author: Ronnie Zhang
 - @LastEditor: Ronnie Zhang
 - @LastEditTime: 2024/01/13 17:41:38
 - @Email: zclzone@outlook.com
 - Copyright © 2023 Ronnie Zhang(大脸怪) | https://isme.top
 --------------------------------->

 <template>
  <n-modal
    v-model:show="show"
    class="modal-box"
    :style="{ width: modalOptions.width, ...modalOptions.modalStyle }"
    :preset="undefined"
    size="huge"
    :draggable="{ bounds: 'none' }"
    :bordered="false"
    :mask-closable="false"
    @after-enter="onAfterEnter"
    @after-leave="onAfterLeave"
  >
    <template #default="{ draggableClass }">
    <n-card :closable="props.closable" @close="close()" 
      header-style="height: 50px; padding:2px 8px; border-radius: 5px 5px 0px 0px; border-bottom: 1px solid #7f363f72;"
      :content-style="modalOptions.contentStyle" :footer-style="modalOptions.footerStyle"
      >
      <template #header>
        <header class="modal-header flex f-c-c color-primary" :class="draggableClass">
          {{ props.title }}
          <slot name="header"></slot>
        </header>
      </template>
      <slot />

      <!-- 底部按钮 -->
      <template #footer>
        <slot name="footer">
          <footer v-if="modalOptions.showFooter" class="flex justify-end">
            <n-button v-if="modalOptions.showCancel" size="small" @click="handleCancel()">
              {{ modalOptions.cancelText }}
            </n-button>
            <n-button
              v-if="modalOptions.showOk"
              type="primary"
              size="small"
              :loading="modalOptions.okLoading"
              class="ml-30"
              @click="handleOk()"
            >
              {{ modalOptions.okText }}
            </n-button>
          </footer>
        </slot>
      </template>
    </n-card>
    </template>
  </n-modal>
</template>

<script setup>
      //header-style="background-color: #5c615d; padding:2px 8px; border-radius: 5px 5px 0px 0px;"
//import { initDrag } from './utils'

const props = defineProps({
  width: {
    type: String,
    default: '800px',
  },
  title: {
    type: String,
    default: '',
  },
  closable: {
    type: Boolean,
    default: true,
  },
  cancelText: {
    type: String,
    default: '取消',
  },
  okText: {
    type: String,
    default: '确定',
  },
  showFooter: {
    type: Boolean,
    default: true,
  },
  showCancel: {
    type: Boolean,
    default: true,
  },
  showOk: {
    type: Boolean,
    default: true,
  },
  modalStyle: {
    type: Object,
    default: () => {},
  },
  contentStyle: {
    type: Object,
    default: () => ({
      padding: '10px 10px'
    }),
  },
  footerStyle: {
    type: Object,
    default: () => ({
      padding: '5px 10px 8px 10px'
    }),
  },
  draw: {
    type: Function,
    default: () => {},
  },
  drawClean: {
    type: Function,
    default: () => {},
  },
  onOk: {
    type: Function,
    default: () => {},
  },
  onCancel: {
    type: Function,
    default: () => {},
  },
})
// 声明一个show变量，用于控制模态框的显示与隐藏
const show = ref(false)
// 声明一个modalOptions变量，用于存储模态框的配置信息
const modalOptions = ref({})

const okLoading = computed({
  get() {
    return !!modalOptions.value?.okLoading
  },
  set(v) {
    if (modalOptions.value) {
      modalOptions.value.okLoading = v
    }
  },
})

// 打开模态框
async function open(options = {}) {
  if (!show.value) {
    // 将props和options合并赋值给modalOptions
    modalOptions.value = { ...props, ...options }  // note: breaking props reactivity

    // 将show的值设置为true
    show.value = true
    //await nextTick()
    //initDrag(
    //  Array.prototype.at.call(document.querySelectorAll('.modal-header'), -1),
    //  Array.prototype.at.call(document.querySelectorAll('.modal-box'), -1),
    //)
  }
}

// 定义一个close函数，用于关闭模态框
function close() {
  show.value = false
}

// 定义一个handleOk函数，用于处理模态框确定操作
async function handleOk(data) {
  // 如果modalOptions中没有onOk函数，则直接关闭模态框
  if (typeof modalOptions.value.onOk !== 'function') {
    return close()
  }
  try {
    // 调用onOk函数，传入data参数
    const res = await modalOptions.value.onOk(data)
    // 如果onOk函数的返回值不为false，则关闭模态框
    if (res !== false)
      close()
  }
  catch (error) {
    console.error(error)
    okLoading.value = false
  }
}

// 定义一个handleCancel函数，用于处理模态框取消操作
async function handleCancel(data) {
  // 如果modalOptions中没有onCancel函数，则直接关闭模态框
  if (typeof modalOptions.value.onCancel !== 'function') {
    return close()
  }
  try {
    // 调用onCancel函数，传入data参数
    const res = await modalOptions.value.onCancel(data)

    // 如果onCancel函数的返回值不为false，则关闭模态框
    if (res !== false)
      close()
  }
  catch (error) {
    console.error(error)
    okLoading.value = false
  }
}

async function onAfterEnter() {
  await nextTick()
  await modalOptions.value.draw()
}

async function onAfterLeave() {
  //await nextTick()
  //initDrag(
  //  Array.prototype.at.call(document.querySelectorAll('.modal-header'), -1),
  //  Array.prototype.at.call(document.querySelectorAll('.modal-box'), -1),
  //)
  //document.onmousemove = null
  //document.onmouseup = null
  await modalOptions.value.drawClean()
}

// 定义一个defineExpose函数，用于暴露open、close、handleOk、handleCancel函数
defineExpose({
  open,
  close,
  handleOk,
  handleCancel,
  okLoading,
  options: modalOptions,
})
</script>