/*
 * @Description:辐射圈
 */
import * as Cesium from "cesium"

function CircleWaveMaterialProperty(ob) {
  this._definitionChanged = new Cesium.Event();
  this._color = undefined;
  this._colorSubscription = undefined;
  this.color = ob.color;
  this.duration = ob.duration ?? 1000;
  this.count = ob.count ?? 2;
  if (this.count <= 0) {
    this.count = 1;
  }
  this.gradient = ob.gradient ?? 0.1;
  if (this.gradient === 0) {
    this.gradient = 0;
  }
  if (this.gradient > 1) {
    this.gradient = 1;
  }
  this._time = new Date().getTime();
}
Object.defineProperties(CircleWaveMaterialProperty.prototype, {
  isConstant: {
    get: function () {
      return false;
    },
  },
  definitionChanged: {
    get: function () {
      return this._definitionChanged;
    },
  },
  color: Cesium.createPropertyDescriptor("color"),
  duration: Cesium.createPropertyDescriptor("duration"),
  count: Cesium.createPropertyDescriptor("count"),
});
CircleWaveMaterialProperty.prototype.getType = function (_time) {
  return Cesium.Material.CircleWaveMaterialType;
};
CircleWaveMaterialProperty.prototype.getValue = function (time, result) {
  if (!Cesium.defined(result)) {
    result = {};
  }
  result.color = Cesium.Property.getValueOrClonedDefault(
    this._color,
    time,
    Cesium.Color.WHITE,
    result.color
  );
  result.time =
    ((new Date().getTime() - this._time) % this.duration) / this.duration;
  result.count = this.count;
  //result.gradient = 1 + 10 * (1 - this.gradient);
  result.gradient = 1 + 20 * (1 - this.gradient);      // gradient resolution
  return result;
};
CircleWaveMaterialProperty.prototype.equals = function (other) {
  const reData =
    this === other ||
    (other instanceof CircleWaveMaterialProperty &&
      Cesium.Property.equals(this._color, other._color));
  return reData;
};
// Cesium.CircleWaveMaterialProperty = CircleWaveMaterialProperty
Cesium.Material.CircleWaveMaterialType = "CircleWaveMaterial";
Cesium.Material.CircleWaveSource = `
  czm_material czm_getMaterial(czm_materialInput materialInput) {
    czm_material material = czm_getDefaultMaterial(materialInput);
    material.diffuse = 1.5 * color.rgb;
    vec2 st = materialInput.st;
    vec3 str = materialInput.str;
    float dis = distance(st, vec2(0.5, 0.5));
    float per = fract(time);
    if (abs(str.z) > 0.001) {
      discard;
    }
    if (dis > 0.5) {
      discard;
    } else {
      float perDis = 0.5 / count;
      float disNum;
      float bl = .0;
      for (int i = 0; i <= 9; i++) {
        if (float(i) <= count) {
          disNum = perDis * float(i) - dis + per / count;
          if (disNum > 0.0) {
            if (disNum < perDis) {
              bl = 1.0 - disNum / perDis;
            } else if(disNum - perDis < perDis) {
              bl = 1.0 - abs(1.0 - disNum / perDis);
            }
            material.alpha = pow(bl, gradient);
          }
        }
      }
    }
    return material;
  }
  `;
Cesium.Material._materialCache.addMaterial(
  Cesium.Material.CircleWaveMaterialType,
  {
    fabric: {
      type: Cesium.Material.CircleWaveMaterialType,
      uniforms: {
        color: new Cesium.Color(1, 0, 0, 1),
        time: 1,
        count: 1,
        gradient: 0.1,
      },
      source: Cesium.Material.CircleWaveSource,
    },
    translucent: function (material) {
      return true;
    },
  }
);

// 水波纹
export class CircleWave {
  /**
   * @description:
   * @param {*} position 位置
   * @param {*} color 颜色
   * @param {*} maxRadius 最大半径
   * @param {*} duration 扩散间隔
   * @param {*} count 扩散圆数量
   * @return {*}
   */
  constructor(viewer, id, position, color, maxRadius, duration, gradient, count = 3) {
    this.viewer = viewer;
    this.id = id;
    this.maxRadius = maxRadius;
    this.count = count;
    this.gradient = gradient
    const _this = this;
    this.viewer.entities.add({
      id: _this.id,
      position: new Cesium.CallbackProperty((t) =>
        Cesium.Cartesian3.fromDegrees(
          position.value[0],
          position.value[1],
          position.value[2]
        )
      , false),
      ellipse: {
        height: position.value[2],
        semiMinorAxis: new Cesium.CallbackProperty((n) => _this.maxRadius.value, false),
        semiMajorAxis: new Cesium.CallbackProperty((n) => _this.maxRadius.value, false),
        material: new CircleWaveMaterialProperty({
          duration: duration,
          gradient: _this.gradient,
          //color: new Cesium.Color.fromCssColorString(color.value),
          color: new Cesium.CallbackProperty((n) => Cesium.Color.fromCssColorString(color.value), false),
          count: count,
        })
      },
    })
  }
  change_duration(d) {
    const curEntity = this.viewer.entities.getById(this.id);
    curEntity._ellipse._material.duration = d;
  }
  change_waveCount(d) {
    const curEntity = this.viewer.entities.getById(this.id);
    curEntity._ellipse._material.count = d;
  }
  change_color(val) {
    const curEntity = this.viewer.entities.getById(this.id);
    curEntity._ellipse._material.color = new Cesium.Color.fromCssColorString(val)
  }
  change_position(p) {
    const cartesian3 = Cesium.Cartesian3.fromDegrees(
      parseFloat(p[0]),
      parseFloat(p[1]),
      parseFloat(p[2])
    );
    const curEntity = this.viewer.entities.getById(this.id);
    curEntity.position = cartesian3;
  }
  del() {
    this.viewer.entities.removeById(this.id);
  }
}
