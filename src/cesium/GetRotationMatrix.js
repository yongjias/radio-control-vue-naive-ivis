import * as Cesium from 'cesium'
export function getRotationMatrix(heading, pitch, roll, cPos) {
  let headingPitchRoll = new Cesium.HeadingPitchRoll(
    Cesium.Math.toRadians(heading),
    Cesium.Math.toRadians(pitch),
    Cesium.Math.toRadians(roll)
  )
  return Cesium.Transforms.headingPitchRollToFixedFrame(cPos, headingPitchRoll)
}
