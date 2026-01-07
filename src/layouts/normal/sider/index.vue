<template>
  <div class="side justify-evenly text-36 color-primary bg-#18181c76 rounded-20 ">
    <WarningPanel/>
    <DownwardRecordPanel/>
    <UpwardRecordPanel/>
    <SettingPanel/>
  </div> 
</template>

<script setup>

</script>

<style scoped>
.side {
  position: absolute;
  display: flex;
  flex-direction: column;
  left: 5px;
  height: 300px;
  width: 50px;
  text-align: center;
  top: calc(50% - 150px);
}

</style>
