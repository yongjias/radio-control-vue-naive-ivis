// stores/siteStore.js
import LatLon from 'geodesy/latlon-nvector-spherical.js'
import { defineStore } from 'pinia';
import { Site } from '@/utils'
import api from '@/api'
import * as Cesium from "cesium";
import { WsClient } from '@/utils';

export const useSiteStore = defineStore('siteStore', {
  state: () => ({
    //satGroup: 'active',            // satellite group name
    satGroup: 'starlink',            // satellite group name
    satData: [],                     // satellite TLE data
    // site management
    sites: {},
    selectSites: [],
    statusPort: 11001,               // app port range:1024-49151, dynamic(tmp) port: 49152-65535
    wssPortOffset: 2000,             // websocket port offset
    iStatus: false,
    iWarningSID: true,               // warning indicators
    iWarningResult: true,
    iWarningTdoa: true,
    downwardBoundingSphere: null,    // bounding sphere for downward devices
    upwardBoundingSphere: null,      // bounding sphere for upward devices
  }),
  actions: {
    // actions
    /*
    async setSatData() {
      console.time(this.satGroup)
      const res = await api.record_getByName({name: this.satGroup})
      console.timeEnd(this.satGroup)
      const tles = res.data.str.split('\r\n');
      const tleData = [];
      console.log('number is ', tles.length/3);
      for (let i = 0; i < tles.length; i += 3) {
          if (i + 2 < tles.length) {
              const nameLine = tles[i].trim();
              const line1 = tles[i + 1].trim();
              const line2 = tles[i + 2].trim();
              
              if (nameLine && line1 && line2) {
                  tleData.push({
                      name: nameLine,
                      l1: line1,
                      l2: line2
                  });
              }
          }
      }
      this.satData = markRaw(tleData);
    },
    */
    async setSatData() {
      console.time(this.satGroup)
      const url = "/satDatas/" + this.satGroup + ".txt"
      const response = await fetch(url);
      const tleData = await response.text();
    
      if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
      }
    
      // 解析TLE数据
      const parsedTLEs = [];
      const tles = tleData.split('\r\n');
      for (let i = 0; i < tles.length; i += 3) {
          if (i + 2 < tles.length) {
              const nameLine = tles[i].trim();
              const line1 = tles[i + 1].trim();
              const line2 = tles[i + 2].trim();
              
              if (nameLine && line1 && line2) {
                  parsedTLEs.push({
                      name: nameLine,
                      l1: line1,
                      l2: line2
                  });
              }
          }
      }

      // 实时显示处理进度
      console.timeEnd(this.satGroup)

      //this.satData = parsedTLEs;
      this.satData = markRaw(parsedTLEs);
    },
    
    async fetchApi() {
      const res = await api.getAllSites()
      this.sites = res.data.map(el=>new Site(el)).reduce((acc, obj) => {
        acc[obj.mfid] = obj;
        return acc;
      }, {});
    },

    filterByArea(lons, lats) {
      if (lons.length > 0) {
        // same as filteredByCondition except remove city condition
        let mfids = Object.keys(this.sites)
        // filtered by dragged area
        let polygon = []
        for ( let i=0; i<lons.length; i++ ) {
            polygon.push(new LatLon(lats[i], lons[i]))
        }
        this.selectSites = mfids.filter(el => {
          let loc = new LatLon(this.sites[el].lat ,this.sites[el].lon)
          return loc.isEnclosedBy(polygon)
        })
      }
    },

    get_group_port(gid) {
      let group_sites = Object.values(this.sites).filter(site=>site.group==gid);
      if (group_sites.length>0) {
        return Math.floor(group_sites[0].port / 10) * 10;  // 50001 -> 50000  (对下行端口取整)
      } else {
        return null;
      }
    },

    check_devices_status() {  
      // connect to websocket server
      new WsClient('ws://'+import.meta.env.VITE_HOST+':'+this.statusPort, (data)=>{
        let res = JSON.parse(data)
        //console.log(res)
        if (res.mfid) {
          //console.log('siteStore device status', res.mfid, res.status);
          this.sites[res.mfid].status = res.status;
          this.sites[res.mfid].update_range();
        }
      }, (status)=>{
        this.iStatus = status;
      })
    },

    init_boundingSpheres() {
      const downwardSites = Object.values(this.sites).filter(s => s.name.includes('下行'));
      if (downwardSites.length > 0) {
        this.downwardBoundingSphere = Cesium.BoundingSphere.fromPoints(
          downwardSites.map(site => Cesium.Cartesian3.fromDegrees(site.lon, site.lat, site.alt))
        );
      }

      const upwardSites = Object.values(this.sites).filter(s => s.name.includes('上行'));
      if (upwardSites.length > 0) {
        this.upwardBoundingSphere = Cesium.BoundingSphere.fromPoints(
          upwardSites.map(site => Cesium.Cartesian3.fromDegrees(site.lon, site.lat, site.alt))
        );
      }
    },

  }
});
