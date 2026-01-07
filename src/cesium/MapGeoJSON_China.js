import * as Cesium from 'cesium'

// 修改为异步函数，加载指定的 GeoJSON 文件
export const map_geoJSON_China = async () => {
  const outlineInstances = [];
  
  try {
    // 加载 public/map/bou1_4l.json
    const response = await fetch('/map/bou1_4l.json');
    
    if (!response.ok) {
      throw new Error(`Failed to load file: ${response.statusText}`);
    }

    const geojson = await response.json();
    const features = geojson.features;

    if (features) {
      features.forEach((feature, index) => {
        const geometry = feature.geometry;
        const props = feature.properties || {};

        // --- 过滤逻辑 ---
        // 根据 bou1_4l 标准：
        // GBCode 26010 = 海岸线
        // GBCode 6x020 = 国界线 (如 610200, 630200 等)
        // 如果你想去除海岸线，过滤掉 26010
        // 注意：不同数据源字段名可能不同，常见为 GB, GBCODE, Code 等
        const gbCode = props.GB || props.GBCODE || props.Code;
        
        if (gbCode) {
            const codeStr = String(gbCode);
            const prefix = codeStr.substring(0, 2);
            //console.log('MapGeoJSON China: GBCode=', codeStr, 'Prefix=', prefix);
            
            //if (codeStr === '26010' || gbCodesToExclude.has(prefix)) {
            if (codeStr === '26010' || prefix!=61) { // 仅保留国界线 61xxxx
                return; 
            }
        }

        // bou1_4l.json 只包含 LineString
        if (geometry.type === 'LineString') {
           const coordinates = geometry.coordinates;
           const positions = coordinates.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat));
           
           // 过滤掉点数过少的无效线段
           if (positions.length < 2) return;

           outlineInstances.push(new Cesium.GeometryInstance({
             id: `border_line_${index}`,
             geometry: new Cesium.PolylineGeometry({
               positions: positions,
               width: 2.0, // 线宽
             }),
             attributes: {
               color: Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.fromCssColorString('#eff30aea'))
             }
           }));
        }
      });
    }
  } catch (error) {
    console.error("Failed to load GeoJSON:", error);
    return { outlinePolygon: null };
  }

  if (outlineInstances.length === 0) {
    console.warn("MapGeoJSON: No geometry instances created.");
    return { outlinePolygon: null };
  }

  // 使用 PolylineColorAppearance 以支持每个实例的颜色（虽然这里统一了颜色，但为了兼容性）
  // 或者使用 PolylineMaterialAppearance 实现发光效果
  const glowMaterial = Cesium.Material.fromType('GlowLine', {
    color: Cesium.Color.fromCssColorString('#eff30aea'),
    power: 0.2,
    taperPower: 0.5
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

  return { outlinePolygon };
}