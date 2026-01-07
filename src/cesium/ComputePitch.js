import * as Cesium from 'cesium'
export function compute_pitch(viewer) {
  // 获取相机的方向向量
  const cameraDirection = viewer.camera.direction;

  // 获取相机的位置
  const cameraPosition = viewer.camera.position;

  // 定义地球椭球体
  const ellipsoid = Cesium.Ellipsoid.WGS84;

  // 计算相机位置处的地表法线向量
  //const surfaceNormal = ellipsoid.geodeticSurfaceNormal(cameraPosition);

  // 将相机位置转换为地理坐标（经度、纬度、高度）
  const cartographicPosition = ellipsoid.cartesianToCartographic(cameraPosition);

  // 将高度设置为地面高度（0 米）
  cartographicPosition.height = 0;

  // 将地理坐标转换回笛卡尔坐标
  const groundPosition = ellipsoid.cartographicToCartesian(cartographicPosition);

  // 计算地面位置处的地表法线
  const surfaceNormal = ellipsoid.geodeticSurfaceNormal(groundPosition);

  // 归一化向量
  const cameraDirectionNormalized = Cesium.Cartesian3.normalize(cameraDirection, new Cesium.Cartesian3());
  const surfaceNormalNormalized = Cesium.Cartesian3.normalize(surfaceNormal, new Cesium.Cartesian3());

  // 计算点积
  const dotProduct = Cesium.Cartesian3.dot(cameraDirectionNormalized, surfaceNormalNormalized);

  // 计算夹角（弧度）
  const angleRad = Math.acos(dotProduct);

  // 转换为角度
  let angleDeg = Cesium.Math.toDegrees(angleRad);
  if (angleDeg > 90) angleDeg -= 90

  // 输出结果
  //console.log('相机与地面的夹角为：' + angleDeg + ' 度');
  return angleDeg
}
