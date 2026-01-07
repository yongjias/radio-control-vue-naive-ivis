// stores/recordStore.js
import { defineStore } from 'pinia';
import api from '@/api'

export const useRecordStore = defineStore('recordStore', {
  state: () => ({
  }),
  actions: {
    // actions
    async fetchDownwardRecordAll() {
      const res = await api.downward_getAll()
      //this.records = res.data
      //console.log(res.data)
      return res.data
    },

    async fetchDownwardRecordByTime(time) {
      const res = await api.downward_getByTimeRange({startTime: time.startTime, endTime: time.endTime})
      return res.data
    },

    async fetchUpwardRecordAll() {
      const res = await api.upward_getAll()
      //this.records = res.data
      //console.log(res.data)
      return res.data
    },

    async fetchTdoaRecordAll() {
      const res = await api.tdoa_getAll()
      //this.records = res.data
      //console.log(res.data)
      return res.data
    },

    async fetchRecordOne(mfid, time) {
      const res = await api.record_getOne(mfid, time)
      //console.log(res.data)
      return res.data
    },

    async fetchRecordbyMfid(mfid) {
      const res = await api.record_getByMfid({mfid: mfid})
      //console.log(res.data)
      return res.data
    },

    async fetchRecordbyTime(time) {
      const res = await api.record_getByTime({time: time})
      //console.log(res.data)
      return res.data
    },

    async fetchRecordbyTimeRange(start, end) {
      const res = await api.record_getByTimeRange({startTime: start, endTime: end})
      //res.data.forEach(el => {
      //  el.time = formatDateTime(el.time)
      //})
      return res.data
    },

  }
});
