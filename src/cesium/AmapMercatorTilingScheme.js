import * as Cesium from 'cesium'
import {CoordTransform} from './CoordTransform'

export class AmapMercatorTilingScheme extends Cesium.WebMercatorTilingScheme {

  constructor() {
    super();

    let projection = new Cesium.WebMercatorProjection();

    this.projection.project = function (cartographic, result) {
      let tmp = CoordTransform.WGS84ToGCJ02(
        Cesium.Math.toDegrees(cartographic.longitude),
        Cesium.Math.toDegrees(cartographic.latitude)
      );
      result = projection.project(new Cesium.Cartographic(
        Cesium.Math.toRadians(tmp[0]), Cesium.Math.toRadians(tmp[1])));
      return new Cesium.Cartesian3(result.x, result.y, result.z);
    };

    this.projection.unproject = function (cartesian, result) {
      let cartographic = projection.unproject(cartesian);
      let tmp = CoordTransform.GCJ02ToWGS84(
        Cesium.Math.toDegrees(cartographic.longitude),
        Cesium.Math.toDegrees(cartographic.latitude)
      );
      result = new Cesium.Cartographic(
        Cesium.Math.toRadians(tmp[0]), Cesium.Math.toRadians(tmp[1]));
      return result
    };
  }
}

