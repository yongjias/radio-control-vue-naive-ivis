// stores/siteStore.js
import { defineStore } from 'pinia';
import api from '@/api'
import { WsClient, decode_stream_SglFreqDF, DF_ATOM_ARGS } from '@/utils';
import { useCesiumStore } from '@/store'

export const useBearingStore = defineStore('bearingStore', {
  state: () => ({
    dfStations: [],                  // bearing stations
    selectDfStation: [],             // selected bearing station, [equid, equid,...]
    dfTaskids: {},                   // running taskid
    dfStationsWsPort: new Map(),
    dfStationsWsPortBase: 55000,
    bearingFrequency: null,          // frequency for direction finding
    pickedDfStation: null,           // picked dfStation by mouse right-click
    handleDialBear: false,           // switch BearDial component
    dialBear: {},
    //dialLevel: null,
    iStopSendingBearing: true,      // if stop sending bearing data
    duration: 60000,                 // 单频测向持续时间, 1 minute
    tId: null,                       // setTimeout id for B_SglFreqDF_Stop
  }),
  actions: {
    // actions
    // call direction finding atom service and initial dfStations
    async init_bearing_atom_service() {
      // query all devices in Hubei province
      await api.M_QueryDeviceInfos({
        //areacode: '420300',
        feature:    'B_SglFreqDF', // feature code for bearing stations
      }, sites => {
        this.dfStations = sites.reduce( (acc, cur) => {
          let featureCodes = [];
          let pscodes = [];
          let bscodes = [];
          let urls = [];
          let proxyUrls = [];
          let equlist = cur.equlist.equipment.filter( ell => {
            let tmp = ell.featurelist.feature.filter(elll => elll.code.includes('B_SglFreqDF'))
            //console.log('equid', tmp.length)
            if (tmp.length > 0) {
              featureCodes.push(tmp[0].code);
              pscodes.push(tmp[0].psservicecode);
              bscodes.push(tmp[0].servicecode);
              urls.push(tmp[0].exinfo.item[0].paravalue);
              proxyUrls.push(tmp[0].exinfo.item[1].paravalue);
              return true
            } else {
              return false
            }
          })

          for (let i=0; i<equlist.length; i++) {
            acc.push({
              mfid: cur.mfid,         // device mfid
              name: cur.mfname,       // station name
              platformcode: cur.platformcode, // platform code
              equid: equlist[i].equid,       // equipment id
              equname: equlist[i].equname,   // equipment name
              feature: featureCodes[i],   // feature code
              pscode: pscodes[i],   // service ps code
              bscode: bscodes[i],    // service bs code
              url: urls[i],           // service url
              proxyUrl: proxyUrls[i], // service proxy url
            });
          }

          return acc;
        }, []);

        // create dfStationsWsPort
        this.dfStations.forEach( (el,idx) => {
          this.dfStationsWsPort.set(el.equid, (idx+1+this.dfStationsWsPortBase)+'');
        })

      });
        
    },

    // call M_QueryEquStatus atom service to update dfStations status and location
    async update_dfStation_status(iBearStation=null, iDfStationListOpen=null) {
      const cesiumStore = useCesiumStore();
      
      // get bearing stations status
      await api.M_QueryEquStatus({
        equid: this.dfStations.map(el=>el.equid).join(';'),
      }, status => {
        //console.log('bearing stations status', status);
        // update bearing stations with status and location
        this.dfStations = this.dfStations.map(el => {
          if(status[el.equid].result == 'succeed') {
            el.status = status[el.equid].mflist.mf[0].equlist.equipment[0].state; // busy, idle, failure
            el.lon = Number.parseFloat(status[el.equid].mflist.mf[0].longitude); // longitude
            el.lat = Number.parseFloat(status[el.equid].mflist.mf[0].latitude);  // latitude
            el.alt = Number.parseFloat(status[el.equid].mflist.mf[0].altitude ?? 0);  // altitude
            //let compass = Number.parseFloat(status[el.equid].mflist.mf[0].compass ?? 0);  // compass
            //compass = compass % 360;
            //el.compass = compass < 0 ? compass+360 : compass;
          } else {
            el.status = undefined; // busy, idle, failure
          }
          return el;
        });
        //console.log(this.dfStations)

        // create df Stations on map
        if (this.dfStations.length > 0) cesiumStore.create_dfStation();

        // update iBearStation
        if(iBearStation) iBearStation.value = 1;
        if(iDfStationListOpen) iDfStationListOpen.value = true;
      });

    },

    // call M_QueryEquStatus atom service to update dfStations status and location
    async update_selectedStation_status() {
      const cesiumStore = useCesiumStore();
      
      // select bearing stations
      const equid = this.selectDfStation.reduce( (acc, cur) => {
        const idx = this.dfStations.findIndex(el => el.equid === cur);
        if (idx>-1) {
          acc.push(this.dfStations[idx].equid);
        }
        return acc;
      }, [] );

      // get bearing stations status
      await api.M_QueryEquStatus({
        equid: equid.join(';'),
      }, status => {
        let iOnce = false; // only once
        for (const [equid, val] of Object.entries(status)) {
          if ( val.result == 'succeed' ) {
            iOnce = true;
            // get taskid
            this.dfTaskids[equid] = val.mflist.mf[0].equlist.equipment[0].tasklist?.task[0]?.taskid
            // update status and location
            const idx = this.dfStations.findIndex(el => el.equid === equid);
            if (idx>-1) {
              this.dfStations[idx].status = val.mflist.mf[0].equlist.equipment[0].state; // busy, idle, failure
              this.dfStations[idx].lon = Number.parseFloat(val.mflist.mf[0].longitude); // longitude
              this.dfStations[idx].lat = Number.parseFloat(val.mflist.mf[0].latitude);  // latitude
              this.dfStations[idx].alt = Number.parseFloat(val.mflist.mf[0].altitude ?? 0);  // altitude
              let compass = Number.parseFloat(val.mflist.mf[0].compass ?? 0);  // compass
              compass = compass % 360;
              this.dfStations[idx].compass = compass < 0 ? compass+360 : compass;
            }
          }
        }

        // create df Stations on map
        if (iOnce) cesiumStore.create_dfStation();

      })

    },

    // call M_QueryEquStatus atom service to update dfStations status and location
    async get_selectedStation_info(iShow=true) {
      // select bearing stations
      const [mfid, equid] = this.selectDfStation.reduce( ([accA, accB], cur) => {
        const idx = this.dfStations.findIndex(el => el.equid === cur);
        if (idx>-1) {
          accA.push(this.dfStations[idx].mfid);
          accB.push(this.dfStations[idx].equid);
        }
        return [accA, accB];
      }, [[], []] )

      // get bearing stations status
      const status = await api.M_QueryDeviceInfo({
        mfid:          mfid.join(';'),
        equid:         equid.join(';'),
        feature:       'B_SglFreqDF',
      })
      
      const equpara = {};
      for (const [equid, val] of Object.entries(status.data)) {
        if ( val.result == 'succeed' ) {
          const {result, featurelist, ...rest} = val;
          if(iShow) {
            $notification.success({
              title: JSON.stringify(rest, null, 4),
              contentStyle: 'text-align: center; font-size: 16px;'
            });
          }
          // get input parameters
          const inputPara = featurelist.feature[0].input.parameter;
          let parameter = inputPara.reduce( (acc, cur) => {
            acc[cur.name] = cur.defaultvalue;
            return acc;
          }, {} );
          //console.log('input parameters', parameter);
          equpara[equid] = parameter;
          
        }
      }
      return equpara;

    },
  
    async B_SglFreqDF(formValues, cb=null, cb1=null, cb2=null) {
      if (this.selectDfStation.length < 1) {
        return false;
      }
      const equparas = await this.get_selectedStation_info(false)

      // select bearing stations
      const [mfid, equid, wsPort, equpara] = this.selectDfStation.reduce( ([accA, accB, accC, accD], cur) => {
        const idx = this.dfStations.findIndex(el => el.equid === cur);
        if (idx>-1) {
          let item = equparas[cur];
          //console.log(item)
          if (item) {
            // update item using formValues
            item.frequency = this.bearingFrequency * 1e6;
            // reshape item
            item = Object.entries(item).map(([key, val]) => ({paraname: key, paravalue: val}))
            const epara = {
              items: {
                item: item
              },
            }
            accD.push(JSON.stringify(epara));
            accA.push(this.dfStations[idx].mfid);
            accB.push(this.dfStations[idx].equid);
            accC.push(this.dfStationsWsPort.get(cur));
          }
        }
        return [accA, accB, accC, accD];
      }, [[], [], [], []] )
      /*
      const [mfid, equid, wsPort, equpara] = this.selectDfStation.reduce( ([accA, accB, accC, accD], cur) => {
        const idx = this.dfStations.findIndex(el => el.equid === cur);
        if (idx>-1) {
          // 每个设备的请求参数根据ATOM厂家和设备的不同而不同
          let item = null;
          let tmp = this.dfStations[idx].name.split('-');
          let factory = tmp.length>1 ? tmp[tmp.length-1] : null;
          let dev = this.dfStations[idx].equname;
          if (factory) {
            item = DF_ATOM_ARGS[factory] && DF_ATOM_ARGS[factory][dev];
          } else {
            item = DF_ATOM_ARGS[dev];
          }
          if (!item) { // 如果没有找到对应的参数表，则使用原子服务M_QueryDeviceInfo
            item = equparas[cur];
          }
          //console.log(item)
          //console.log(equparas[cur])
          if (item) {
            // update item using formValues
            item.frequency = this.bearingFrequency * 1e6;
            //console.log(item.frequency, formValues)
            //
            // reshape item
            item = Object.entries(item).map(([key, val]) => ({paraname: key, paravalue: val}))
            const epara = {
              items: {
                item: item
              },
            }
            accD.push(JSON.stringify(epara));
            accA.push(this.dfStations[idx].mfid);
            accB.push(this.dfStations[idx].equid);
            accC.push(this.dfStationsWsPort.get(cur));
          }
        }
        return [accA, accB, accC, accD];
      }, [[], [], [], []] )
      */
      if (equid.length<this.selectDfStation.length) {
        $dialog.error({
          title: '选择的测向站有无效参数表!',
        })
        return false;
      }

      await api.B_SglFreqDF({
        mfid:          mfid.join(';'),
        equid:         equid.join(';'),
        wsPort:        wsPort.join(';'),
        feature:       'B_SglFreqDF',
        executetime:   0,               // 0 is continue run
        priority:      0,               // 0-9 from high to l
        equpara:       equpara.join(';'),
        outputchannels: {
          outputchannel: {
            mode: 'source',           // source mode
            datachannel: 'stream',    // stream data channel
          }
        }
      }, (res) => {
        let iAllFail = true; // if all bearing stations failed
        for (const [equid, val] of Object.entries(res)) {
          if ( val.result == 'succeed' ) {
            iAllFail = false; // at least one bearing station succeed
            // get taskid
            this.dfTaskids[equid] = val.taskid
            
            // create ws channel to receive stream
            new WsClient('ws://'+import.meta.env.VITE_HOST+':'+this.dfStationsWsPort.get(equid), (data)=>{
              const decode_bearing = decode_stream_SglFreqDF(data, formValues.dfqualitythreshold);
              if (decode_bearing.length>0) {
                const [bearings, levels] = decode_bearing;
                if (bearings.length>0) {
                  this.dialBear[equid] = Number.parseInt(bearings[0]);  // only take first element
                }
                //if (levels.length>0) {
                  //this.dialLevel = Number.parseInt(levels[0]);   // only take first element
                //}
                if (cb) {
                  cb(equid, bearings);
                }
                
              }
            })
          } else {
            $message.error(equid + ':B_SglFreqDF失败, 请重试!')
          }
        }

        if (iAllFail) {
          if (cb2) {
            cb2();
          } 
          $message.error('所有测向站启动失败, 请重试!')
          // update sending bearing status
          this.iStopSendingBearing = true;  // stop sending status of bearing data
          return false;
        }

        // update dfStation status on map
        this.update_dfStation_status();
        // update sending bearing status
        this.iStopSendingBearing = false;  // sending status of bearing data
        // stop 单频测向 after duration
        this.tId = setTimeout(()=>{
          this.B_SglFreqDF_Stop();
        }, this.duration)

        // all afterward callback
        if (cb1) {
          cb1();
        }

      });
    },

    // call M_RequestEquip atom service to stop direction finding
    async B_SglFreqDF_Stop(cb=null) {
      // 取消 setTimeout
      this.tId && clearTimeout(this.tId);
      this.tId = null; // reset tId

      // select bearing stations
      const [mfid, equid, taskid] = this.selectDfStation.reduce( ([accA, accB, accC], cur) => {
        const idx = this.dfStations.findIndex(el => el.equid === cur);
        if (idx>-1 && this.dfTaskids[this.dfStations[idx].equid]) {
          accA.push(this.dfStations[idx].mfid);
          accB.push(this.dfStations[idx].equid);
          accC.push(this.dfTaskids[this.dfStations[idx].equid]);
        }
        return [accA, accB, accC];
      }, [[], [], []] );
      //const taskid = equid.map(el => this.dfTaskids[el]);

      if (equid.length < 1) {
        $message.error('所有选择的测向站无taskid!');
        return false;
      }
      if (equid.length<this.selectDfStation.length) {
        const equ = this.selectDfStation.filter(el => !this.dfTaskids[el]);
        $message.warning('选择的测向站无taskid: ' + equ.join(', '));
      }

      await api.B_SglFreqDF_Stop({
        equid: this.dfStations.map(el=>el.equid).join(';'),
          mfid:          mfid.join(';'),
          equid:         equid.join(';'),
          taskid:        taskid.join(';'),
          feature:       'B_StopMeas',
      }, (res) => {
        let iAllFail = true; // if all bearing stations failed
        for (const [equid, val] of Object.entries(res)) {
          if ( val.result == 'succeed' ) {
            iAllFail = false; // at least one bearing station succeed
            //console.log('bearing stations status', status);
            delete this.dfTaskids[equid]  // delete taskid after stop it successfully
          } else {
            $message.error(equid + ': B_StopMeas失败, 请重试!')
          }
        }

        if (iAllFail) {
          $message.error('所有测向站停止失败, 请重试!')
          return false;
        }

        // update dfStation status on map
        this.update_dfStation_status();
        // update sending bearing status
        this.iStopSendingBearing = true;  // stop sending status of bearing data

        if (cb) {
          cb();
        }
      });
    },

  }
});
