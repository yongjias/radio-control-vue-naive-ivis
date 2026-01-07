import * as Cesium from 'cesium'

/**
 * 
 * @param {*} pairs // [{name: 'name', coordinates: [[lon, lat], [lon, lat]]}, ...]
 * @returns 
 */
const df_lines= (pairs) => {
  const instances = [];
  let alpha = 0.95;

  pairs.forEach(pair => {
    const name = pair.name;
    const positions = pair.coordinates.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat));
    //const featureColor = Cesium.Color.fromRandom({ alpha: alpha });
    const featureColor = Cesium.Color.CYAN.withAlpha(1);
    const colorAttr    = Cesium.ColorGeometryInstanceAttribute.fromColor(featureColor);

    instances.push(new Cesium.GeometryInstance({
      // give each outer its own unique id if you like:
      id: name,
      geometry: new Cesium.PolylineGeometry({
        positions: positions,
        width: 2,
        vertexFormat: Cesium.PolylineColorAppearance.VERTEX_FORMAT,
      }),
      attributes: {
        color: colorAttr,
        show : new Cesium.ShowGeometryInstanceAttribute(true)
      }
    }));
  });

  return new Cesium.Primitive({
    geometryInstances : instances,
    //releaseGeometryInstances: false,
    appearance : new Cesium.PolylineColorAppearance({
      flat: true,
      translucent : true,
      closed : true
    }),
    show: true,
    asynchronous : false,  // 确定基元是异步创建还是阻塞直到准备就绪
  });
}

  /**
 * 
 * @param {*} center // [lon, lat]
 * @param {*} semiMajorAxis // 半长轴
 * @param {*} semiMinorAxis // 半短轴
 * @param {*} rotation // 旋转角度
 * @returns 
 */
const df_ellipse = (center, semiMajorAxis, semiMinorAxis, rotation) => {
  const instances = [];
  let alpha = 0.35;

  //const featureColor = Cesium.Color.fromRandom({ alpha: alpha });
  const featureColor = Cesium.Color.fromCssColorString("#de7575").withAlpha(alpha);
  const colorAttr    = Cesium.ColorGeometryInstanceAttribute.fromColor(featureColor);

  instances.push(new Cesium.GeometryInstance({
    // give each outer its own unique id if you like:
    id: '概率椭圆',
    geometry: new Cesium.EllipseGeometry({
      center : Cesium.Cartesian3.fromDegrees(center[0], center[1]),
      semiMajorAxis : semiMajorAxis,
      semiMinorAxis : semiMinorAxis,
      rotation : Cesium.Math.toRadians(rotation),
      vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,  // rendering时使用的顶点格式, otherwise coarse rendering
    }),
    attributes: {
      color: colorAttr,
      show : new Cesium.ShowGeometryInstanceAttribute(true)
    }
  }));
  // add a center dot
  const cSize = 5000; // 5km
  instances.push(new Cesium.GeometryInstance({
    // give each outer its own unique id if you like:
    id: 'Lon:'+center[0].toFixed(3)+',Lat:'+center[1].toFixed(3),
    geometry: new Cesium.EllipseGeometry({
      center : Cesium.Cartesian3.fromDegrees(center[0], center[1]),
      semiMajorAxis : cSize,
      semiMinorAxis : cSize,
      rotation : 0,
      vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,  // rendering时使用的顶点格式, otherwise coarse rendering
    }),
    attributes: {
      color: Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.MAGENTA),
      show : new Cesium.ShowGeometryInstanceAttribute(true)
    }
  }));

  return new Cesium.Primitive({
    geometryInstances : instances,
    //releaseGeometryInstances: false,
    appearance :  new Cesium.PerInstanceColorAppearance({ // 为每个instance着色
        translucent : true,
        closed : true,              // true: backface culling, false: no backface culling
    }),
    //appearance : new Cesium.PolylineColorAppearance({
    //  flat: true,
    //  renderState: {
    //    lineWidth: Math.min(4.0, viewer.scene.maximumAliasedLineWidth)
    //  }
    //}),
    show: true,
    asynchronous : false,  // 确定基元是异步创建还是阻塞直到准备就绪
  });

}

export {
  df_lines,
  df_ellipse
}