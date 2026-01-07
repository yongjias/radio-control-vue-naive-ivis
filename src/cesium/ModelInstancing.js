import * as Cesium from 'cesium'
import { getRotationMatrix } from './GetRotationMatrix'
import gltf0 from '@/assets/models/tower.gltf.json'
import gltf1 from '@/assets/models/control.gltf.json'

function downloadJSON(json, filename) {
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
}

function arrayBufferToBase64(buffer) {
    let binary = ''
    const bytes = new Uint8Array(buffer)
    const len = bytes.byteLength
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i])
    }
    return window.btoa(binary)
}

export async function gltf_instancing(scene, instances, base, scale, devType) {
  let gltf = null
  let color = null
  if (devType == 'manage') {
    gltf = JSON.parse(JSON.stringify(gltf0))
    color = new Cesium.Color(0.95, 0.95, 0.95, 1.0)
  } else if (devType == 'control') {
    gltf = JSON.parse(JSON.stringify(gltf1))
    color = new Cesium.Color(0.95, 0.95, 1.0, 1.0)
  } else {
    color = Cesium.Color.MAGENTA
  }

    let translations = []
    let rotations = []
    let scales = []
    let instanceIdStrings  = []
    // Convert geographical positions to transformation matrices.
    for (let i=0; i<instances.length; i++) {
        scales.push([1, 1, 1])
        // transation
        const cartesian = Cesium.Cartesian3.fromDegrees(instances[i].lon, instances[i].lat,instances[i].alt)
        const tt = Cesium.Matrix4.multiplyByPoint(base.invPosMat, cartesian, new Cesium.Cartesian3())
        translations.push([tt.y, tt.z, tt.x])
        // rotation
        let rotationMatrix = getRotationMatrix(instances[i].heading, instances[i].pitch, instances[i].roll, cartesian)
        let relativeRotationMatrix = Cesium.Matrix4.multiply(base.invRotMat, rotationMatrix, new Cesium.Matrix4())
        let mat4 = Cesium.Matrix4.clone(Cesium.Matrix4.IDENTITY)
        //@ts-ignore
        mat4 = Cesium.Matrix4.multiply(mat4, Cesium.Axis.Z_UP_TO_Y_UP, mat4)
        mat4 = Cesium.Matrix4.multiply(mat4, relativeRotationMatrix, mat4)
        //@ts-ignore
        mat4 = Cesium.Matrix4.multiply(mat4, Cesium.Axis.Y_UP_TO_Z_UP, mat4)
        let rotationMatrix3x3 = Cesium.Matrix4.getRotation(mat4, new Cesium.Matrix3()) // Extract the rotation matrix (3x3) from the relative transformation matrix (4x4)
        let rotationQuaternion = Cesium.Quaternion.fromRotationMatrix(rotationMatrix3x3) // Convert the rotation matrix to a quaternion
        rotations.push([rotationQuaternion.x, rotationQuaternion.y, rotationQuaternion.z, rotationQuaternion.w])
        // instance_id
        instanceIdStrings.push(
          JSON.stringify({
            id:  instances[i].key,
            lon: instances[i].lon.toFixed(3),
            lat: instances[i].lat.toFixed(3),
            alt: instances[i].alt.toFixed(0),
            type: instances[i].type,
            city: instances[i].city
          })
        )
    }
    let instance_len = instanceIdStrings.length
    const instanceIds = []
    let instanceIdOffsets = []
    let offset = 0
    instanceIdStrings.forEach((id, idx) => {
        instanceIdOffsets.push(offset)
        instanceIds.push(idx)
        offset += (new TextEncoder().encode(id)).length
        // offset += id.length
    })
    instanceIdOffsets.push(offset)  // N+1 is need
    const instanceIdsBuffer = new Uint32Array(instanceIds);

    const translationBuffer = new Float32Array(translations.flat())
    const rotationBuffer = new Float32Array(rotations.flat())
    scales = scales.flat().map( el => el * scale )
    const scaleBuffer = new Float32Array(scales)
    // Concatenate all buffers
    const bufferData = new Uint8Array(
        translationBuffer.byteLength + rotationBuffer.byteLength + scaleBuffer.byteLength + instanceIdsBuffer.byteLength
    );
    bufferData.set(new Uint8Array(translationBuffer.buffer), 0)
    bufferData.set(new Uint8Array(rotationBuffer.buffer), translationBuffer.byteLength)
    bufferData.set(new Uint8Array(scaleBuffer.buffer), translationBuffer.byteLength + rotationBuffer.byteLength)
    bufferData.set(new Uint8Array(instanceIdsBuffer.buffer), translationBuffer.byteLength + rotationBuffer.byteLength + scaleBuffer.byteLength)

    // Create new buffer view for the concatenated buffer
    const bufferIndex = gltf.buffers.length
    gltf.buffers.push({
        byteLength: bufferData.byteLength,
        uri: 'data:application/gltf-buffer;base64,' + arrayBufferToBase64(bufferData.buffer)
    })

    const translationBufferViewIndex = gltf.bufferViews.length
    gltf.bufferViews.push({
        buffer: bufferIndex,
        byteOffset: 0,
        byteLength: translationBuffer.byteLength,
        target: 34962 // ARRAY_BUFFER
    })

    const rotationBufferViewIndex = gltf.bufferViews.length
    gltf.bufferViews.push({
        buffer: bufferIndex,
        byteOffset: translationBuffer.byteLength,
        byteLength: rotationBuffer.byteLength,
        target: 34962 // ARRAY_BUFFER
    })

    const scaleBufferViewIndex = gltf.bufferViews.length
    gltf.bufferViews.push({
        buffer: bufferIndex,
        byteOffset: translationBuffer.byteLength + rotationBuffer.byteLength,
        byteLength: scaleBuffer.byteLength,
        target: 34962 // ARRAY_BUFFER
    })

    const instanceIdBufferViewIndex = gltf.bufferViews.length
    gltf.bufferViews.push({
        buffer: bufferIndex,
        byteOffset: translationBuffer.byteLength + rotationBuffer.byteLength + scaleBuffer.byteLength,
        byteLength: instanceIdsBuffer.byteLength,
        target: 34962 // ARRAY_BUFFER
    })

    // Create accessors for instancing attributes
    const translationAccessorIndex = gltf.accessors.length
    gltf.accessors.push({
        bufferView: translationBufferViewIndex,
        byteOffset: 0,
        componentType: 5126, // FLOAT
        count: instance_len,
        type: 'VEC3'
    })

    const rotationAccessorIndex = gltf.accessors.length
    gltf.accessors.push({
        bufferView: rotationBufferViewIndex,
        byteOffset: 0,
        componentType: 5126, // FLOAT
        count: instance_len,
        type: 'VEC4'
    })

    const scaleAccessorIndex = gltf.accessors.length
    gltf.accessors.push({
        bufferView: scaleBufferViewIndex,
        byteOffset: 0,
        componentType: 5126, // FLOAT
        count: instance_len,
        type: 'VEC3'
    })

    const instanceIdAccessorIndex = gltf.accessors.length;
    gltf.accessors.push({
        bufferView: instanceIdBufferViewIndex,
        byteOffset: 0,
        componentType: 5125, // UNSIGNED_short
        count: instance_len,
        type: 'SCALAR'
    });

    // Create buffer view for instance ID offsets

    const instanceIdOffsetsBuffer = new Uint32Array(instanceIdOffsets.flat());
    const instanceIdStringBuffer = new TextEncoder().encode(instanceIdStrings.join(''))
    //const instanceIdStringBuffer = new Uint8Array(instanceIdStrings.join('').split('').map(char => char.charCodeAt(0)))
    const bufferData1 = new Uint8Array(
        instanceIdStringBuffer.byteLength + instanceIdOffsetsBuffer.byteLength
    );
    bufferData1.set(new Uint8Array(instanceIdStringBuffer.buffer), 0)
    bufferData1.set(new Uint8Array(instanceIdOffsetsBuffer.buffer), instanceIdStringBuffer.byteLength)
    const instanceIdOffsetsBufferIndex = gltf.buffers.length;
    gltf.buffers.push({
        byteLength: bufferData1.byteLength,
        uri: 'data:application/gltf-buffer;base64,' + arrayBufferToBase64(bufferData1.buffer)
    });

    const instanceIdStringBufferViewIndex = gltf.bufferViews.length;
    gltf.bufferViews.push({
        buffer: instanceIdOffsetsBufferIndex,
        byteOffset: 0,
        byteLength: instanceIdStringBuffer.byteLength,
    })

    const instanceIdOffsetsBufferViewIndex = gltf.bufferViews.length;
    gltf.bufferViews.push({
        buffer: instanceIdOffsetsBufferIndex,
        byteOffset: instanceIdStringBuffer.byteLength,
        byteLength: instanceIdOffsetsBuffer.byteLength,
    });

    // Add the EXT_mesh_gpu_instancing extension to the node
    const instancingExtension = {
        attributes: {
            TRANSLATION: translationAccessorIndex,
            ROTATION: rotationAccessorIndex,
            SCALE: scaleAccessorIndex,
            _FEATURE_ID_0: instanceIdAccessorIndex
        }
    };

    // Add the EXT_instance_features extension to the node
    const instanceFeaturesExtension = {
        featureIds: [
            {
                featureCount: instance_len,
                attribute: 0,
                propertyTable: 0
            }
        ]
    };

    // Add the EXT_structural_metadata extension to the model
    const structuralMetadataExtension = {
        schema: {
            classes: {
                instance_ids: {
                    properties: {
                        id: {
                            type: "STRING"
                        }
                    }
                }
            }
        },
        propertyTables: [
            {
                class: "instance_ids",
                count: instance_len,
                properties: {
                    id: {
                        values: instanceIdStringBufferViewIndex,
                        stringOffsets: instanceIdOffsetsBufferViewIndex
                    }
                }
            }
        ]
    };

    // Ensure the node has the extensions
    const node = gltf.nodes[0]
    node.extensions = node.extensions || {}
    node.extensions['EXT_mesh_gpu_instancing'] = instancingExtension
    node.extensions['EXT_instance_features'] = instanceFeaturesExtension
    gltf.extensions = gltf.extensions || {}
    gltf.extensions['EXT_structural_metadata'] = structuralMetadataExtension

    // Add the extensions to the GLTF file
    gltf.extensionsUsed = gltf.extensionsUsed || []
    if (!gltf.extensionsUsed.includes('EXT_mesh_gpu_instancing')) {
        gltf.extensionsUsed.push('EXT_mesh_gpu_instancing')
    }
    if (!gltf.extensionsUsed.includes('EXT_instance_features')) {
        gltf.extensionsUsed.push('EXT_instance_features')
    }
    if (!gltf.extensionsUsed.includes('EXT_structural_metadata')) {
        gltf.extensionsUsed.push('EXT_structural_metadata')
    }

    // Download the modified GLTF
    //setTimeout(()=>{
        //downloadJSON(gltf, 'modified_model.gltf')
    //}, 30000)

    // Create a blob URL for the modified GLTF
    const modifiedGltfBlob = new Blob([JSON.stringify(gltf)], { type: 'application/json' })
    const modifiedGltfUrl = URL.createObjectURL(modifiedGltfBlob)

    // Load the modified GLTF into Cesium
    let modelInstance = await Cesium.Model.fromGltfAsync({
        url: modifiedGltfUrl,
        modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(base.position),
        enableVerticalExaggeration: false,
        scene: scene,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        //heightReference: Cesium.HeightReference.CLAMP_TO_TERRAIN,
        //scale: 1,
        color: color
    })

    URL.revokeObjectURL(modifiedGltfUrl) // free up resources

    return modelInstance

}

export function camera_height(viewer) {
    let ellipsoid = viewer.scene.globe.ellipsoid
    // Get the camera's current position in Cartesian coordinates
    let cameraPosition = viewer.scene.camera.positionWC.clone()

    // Get the ellipsoid surface position directly below the camera
    let cartographic = ellipsoid.cartesianToCartographic(cameraPosition)
    let surfacePosition = ellipsoid.cartographicToCartesian(
        new Cesium.Cartographic(cartographic.longitude, cartographic.latitude, 0)
    )

    // Compute the distance between the camera and the surface position
    return Cesium.Cartesian3.distance(cameraPosition, surfacePosition)
    //console.log('height:'+distance)
}
