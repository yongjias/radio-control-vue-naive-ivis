import * as Cesium from 'cesium'
import KDBush from 'kdbush'

/**
 * 找出所有视口区域内的点，放进points数组里
 * @param {*} collection
 * @param {*} points
 * @param {*} viewer.scene
 * @param {*} occluder
 * @returns
 */
export function getScreenSpacePositions(collection, points, viewer, occluder) {
  if (!Cesium.defined(collection)) {
    return
  }
  let length = collection.length //所有点

  for (let i = 0; i < length; ++i) {
    let item = collection[i]
    let position = Cesium.Cartesian3.fromDegrees(item.lon, item.lat, item.alt)
    if ( viewer.scene.mode === Cesium.SceneMode.SCENE3D && !occluder.isPointVisible(position)) {
      continue
    }


    let coord = Cesium.SceneTransforms.worldToWindowCoordinates(
      viewer.scene,
      position
    )
    if (!Cesium.defined(coord)) {
      continue
    }

    points.push({
      index: i,
      collection: collection,
      clustered: false,
      coord: coord,
    })
  }
}

function expandBoundingBox(bbox, pixelRange) {
  bbox.x -= pixelRange;
  bbox.y -= pixelRange;
  bbox.width += pixelRange * 2.0;
  bbox.height += pixelRange * 2.0;
}

function getBoundingBox(coord, pixelRange, result) {
  let model_width = 15
  let model_height = 15
  result = {
    x: coord.x - model_width*0.5,
    y: coord.y - model_height*0.5,
    width:  model_width,
    height: model_height
  }

  expandBoundingBox(result, pixelRange);

  return result;
}

function windowToGeographicCoordinates(viewer, windowPosition) {
  // Get the pick ray from the camera through the window position
  var pickRay = viewer.camera.getPickRay(windowPosition);

  // Use the pick ray to get the intersection point with the globe
  var cartesian = viewer.scene.globe.pick(pickRay, viewer.scene);

  if (!cartesian) {
      // If there's no intersection with the globe, return null
      return null;
  }

  // Convert the Cartesian coordinates to geographic coordinates
  var cartographic = Cesium.Cartographic.fromCartesian(cartesian);

  // Convert the Cartographic coordinates to degrees and meters
  var longitude = Cesium.Math.toDegrees(cartographic.longitude);
  var latitude = Cesium.Math.toDegrees(cartographic.latitude);
  var altitude = cartographic.height;

  return {
      longitude: longitude,
      latitude: latitude,
      altitude: altitude
  };
}

const pointBoundinRectangleScratch = new Cesium.BoundingRectangle();
export function clusterCallback(points) {
  let bbox
  let neighbors
  let neighborLength
  let neighborIndex
  let neighborPoint
  let ids
  let numPoints

  let pixelRange = 20
  let minimumClusterSize = 2

  let index = new KDBush(points.length, 64, Int32Array)
  for (let i=0; i<points.length; i++) {
    index.add(points[i].coord.x, points[i].coord.y)
  }
  index.finish();
  let cluster = []

  for (let i = 0; i < points.length; ++i) {
    let point = points[i]
    if (point.clustered) {
      continue
    }
    point.clustered = true

    let item = point.collection[point.index]
    bbox = getBoundingBox(
      point.coord,
      pixelRange,
      pointBoundinRectangleScratch
    )

    // 时间很短
    neighbors = index.range(
      bbox.x,
      bbox.y,
      bbox.x + bbox.width,
      bbox.y + bbox.height
    )

    neighborLength = neighbors.length

    let clusterPosition = Cesium.Cartesian3.fromDegrees(item.lon, item.lat, item.alt)
    numPoints = 1
    ids = [item.key]

    for (let j = 0; j < neighborLength; ++j) {
      neighborIndex = neighbors[j]
      neighborPoint = points[neighborIndex]
      if (!neighborPoint.clustered) {
        neighborPoint.clustered = true
        let neighborItem = neighborPoint.collection[neighborPoint.index]
        Cesium.Cartesian3.add(
          Cesium.Cartesian3.fromDegrees(neighborItem.lon, neighborItem.lat, neighborItem.alt),
          clusterPosition,
          clusterPosition
        )
        ++numPoints;
        ids.push(neighborItem.key)
      }
    }

    if (numPoints >= minimumClusterSize) {
      let position = Cesium.Cartesian3.multiplyByScalar(
        clusterPosition,
        1.0 / numPoints,
        clusterPosition
      )
      // Convert Cartesian to Cartographic (radians)
      let geo = Cesium.Cartographic.fromCartesian(position);

      if (geo) {
        let lon = Cesium.Math.toDegrees(geo.longitude)
        let lat = Cesium.Math.toDegrees(geo.latitude)
        cluster.push({
          np:      numPoints,
          key:     ids,
          lon:     lon,
          lat:     lat,
          alt:     item.alt,
          heading: item.heading,
          pitch:   item.pitch,
          roll:    item.roll,
          type:    ''+numPoints+'站聚合',
          city:    item.city
        })
      }
    } else {
      cluster.push({
        np: numPoints,
        ...item
      })
    }
  }
  return cluster
}