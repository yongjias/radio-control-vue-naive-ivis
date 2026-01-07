import * as Cesium from 'cesium';
import { getRotationMatrix } from './GetRotationMatrix'

// Define center of all receivers position as base (longitude, latitude, altitude)
export const compute_baseMat = (rlon, rlat, ralt) => {
  const basecartesian = Cesium.Cartesian3.fromDegrees(rlon, rlat, ralt)
  const basePositionMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(basecartesian)
  const baseInversePositionMatrix = Cesium.Matrix4.inverseTransformation(basePositionMatrix, new Cesium.Matrix4())
  const baseRotationMatrix = getRotationMatrix(0.0, 0.0, 0.0, basecartesian)
  const baseInverseRotationMatrix = Cesium.Matrix4.inverseTransformation(baseRotationMatrix, new Cesium.Matrix4())
  return {
      position: basecartesian,
      invPosMat: baseInversePositionMatrix,
      invRotMat: baseInverseRotationMatrix
  }
}