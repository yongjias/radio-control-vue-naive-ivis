import * as Cesium from 'cesium'

export const map_geoJSON = (geojson) => {
  const instances = [];
  const outlineInstances = [];
  let alpha = 0.1;

  geojson.features.forEach(feature => {
    const name = feature.properties.name;
    const featureColor = Cesium.Color.fromRandom({ alpha: alpha });
    const colorAttr    = Cesium.ColorGeometryInstanceAttribute.fromColor(featureColor);

    // handle both Polygon and MultiPolygon by normalizing to an array of polygons
    const polygons = feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates]
    : feature.geometry.coordinates;

    polygons.forEach((coords, polyIndex) => {
      // coords[0] is the *outer* ring; we ignore coords.slice(1) (the holes)
      const outerRing = coords[0];
      //const [outer, ...holes] = coords;

      const positions = outerRing.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat))
      const polygonHierarchy = new Cesium.PolygonHierarchy(
        positions
        //, holes.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat)) // holes
      );

      instances.push(new Cesium.GeometryInstance({
        // give each outer its own unique id if you like:
        id: `${name}_fillMap_${polyIndex}`,
        geometry: new Cesium.PolygonGeometry({
          polygonHierarchy: polygonHierarchy,
          vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
          //extrudedHeight: 3_000,     // 5 000 m tall walls
          perPositionHeight: false
        }),
        attributes: {
          color: colorAttr,
          show : new Cesium.ShowGeometryInstanceAttribute(true)
        }
      }));
      /*
      outlineInstances.push(new Cesium.GeometryInstance({
        id: name+'_b_'+polyIndex,
        geometry: new Cesium.PolygonOutlineGeometry({
          polygonHierarchy: polygonHierarchy,
          vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
          extrudedHeight: 100,     // 5 000 m tall walls
          height: 0
        }),
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(
            Cesium.Color.fromCssColorString("#afdf00")
          ),
          show : new Cesium.ShowGeometryInstanceAttribute(true)
        }
      }));
      */
      outlineInstances.push(new Cesium.GeometryInstance({
        id: name+'_b_'+polyIndex,
        geometry: new Cesium.PolylineGeometry({
          positions: positions,
          width: 2,                        // how thick the glow “tube” is
        }),
      }));
    });
  });

  const fillPolygon = new Cesium.Primitive({
    geometryInstances : instances,
    //releaseGeometryInstances: false,
    appearance :  new Cesium.PerInstanceColorAppearance({ // 为每个instance着色
      translucent : true,
      closed : false
    }),
    show: false,
    asynchronous : false,  // 确定基元是异步创建还是阻塞直到准备就绪
  });

  // create a Material instance, not a MaterialProperty
  const glowMaterial = Cesium.Material.fromType('GlowLine', {
    color: Cesium.Color.fromCssColorString('#eff30aea'),
    //color: Cesium.Color.fromCssColorString('#3f98e8ab'),
    power: 0.2          // smaller to more blur
  });

  const outlinePolygon = new Cesium.Primitive({
    geometryInstances: outlineInstances,
    appearance: new Cesium.PolylineMaterialAppearance({
      material: glowMaterial,
      translucent : true,
    }),
    asynchronous: false,
    show: true
  });

  return {outlinePolygon, fillPolygon}

}