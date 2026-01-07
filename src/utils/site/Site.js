import { CircleWaveShrink } from '@/cesium' 
import { Device, deviceStatus } from '@/constants';
export class Site {
  constructor(rec) {   // create Site from sql record
    this.mfid          = rec.mfid;
    this.name          = rec.name;
    this.address       = rec.address;
    this.lon           = rec.lon;                // longitude
    this.lat           = rec.lat;                // latitude
    this.alt           = rec.alt;                // altitude
    this.port          = rec.port;
    this.status        = deviceStatus.OFFLINE;  // status: 0:OFFLINE, 1:ONLINE, 2:MONITOR, 3:ALERT
    this.CircleWave    = null;
    this.range         = 8000;                  // detecting range
    this.color         = Device[this.status].Color;
    this.duration      = 5000;
    this.iAnimation    = Device[this.status].iAnimation;
    this.group         = rec.group;
  }

  update_range() {
    this.color = Device[this.status].Color;
    this.iAnimation = Device[this.status].iAnimation;
  }

  create_range(viewer) {
    if ( !this.CircleWave ) {
      // Radiant using CallbackProperty for position,radius,color
      this.CircleWave = new CircleWaveShrink(viewer,
        this.mfid,                                  // id
        toRef(()=>[this.lon, this.lat, this.alt]),  // position
        toRef(()=>this.color),                      // color
        toRef(()=>this.range),                      // maxRadius
        this.duration,                              // duration
        0.5,                                        // gradient (from edge to center)
        toRef(()=>this.iAnimation),                 // animation 
        2                                           // count
      )
    }
  }

  remove_range(viewer) {
    if ( this.CircleWave ) {
      viewer.entities.removeById(this.mfid)
      this.CircleWave = null;
      viewer.scene.requestRender();
    }
  }

}