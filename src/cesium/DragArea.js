import * as Cesium from 'cesium'
import { useCesiumStore } from '@/store'

const activeShapePoints = ref([])
const activeShape = ref(undefined)
export const drag_area = (cb_update, iClean) => {
    const cesiumStore = useCesiumStore();
    const viewer = cesiumStore.getViewer();
    let activeShapePos = []
    // set event handle
    const rHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
    if (activeShape.value != undefined) {
        viewer.entities.remove(activeShape.value)
        activeShape.value = undefined
    }
    if (activeShapePoints.value.length > 0) {
        for (let i=0; i<activeShapePoints.value.length; i++) {
            viewer.entities.remove(activeShapePoints.value[i])
        }
        activeShapePoints.value = []
    }

    if (iClean) { // just clean up
        return;
    }

    // pause outside mouse event listener
    cesiumStore.iPausedMouseEvents = true;

    // performance improvement
    let isMouseMoveScheduled = false

    // change cursor to crosshair
    // ✅ 红色十字准星
    //const redCursor = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><line x1="0" y1="12" x2="24" y2="12" stroke="red" stroke-width="2"/><line x1="12" y1="0" x2="12" y2="24" stroke="red" stroke-width="2"/></svg>') 12 12, crosshair`
    // ✅ 绿色十字准星
    // const greenCursor = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><line x1="0" y1="12" x2="24" y2="12" stroke="green" stroke-width="2"/><line x1="12" y1="0" x2="12" y2="24" stroke="green" stroke-width="2"/></svg>') 12 12, crosshair`
    // ✅ 品色十字准星带圆圈
    const cyanCursor = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="12" stroke="cyan" stroke-width="1" fill="none"/><line x1="0" y1="16" x2="32" y2="16" stroke="cyan" stroke-width="2"/><line x1="16" y1="0" x2="16" y2="32" stroke="cyan" stroke-width="2"/></svg>') 16 16, crosshair`
    document.body.style.cursor = cyanCursor
    // drawing polygon
    rHandler.setInputAction(function (event) {
        const ray = viewer.camera.getPickRay(event.position)
        if (ray != undefined) {
            const earthPosition = viewer.scene.globe.pick(ray, viewer.scene)
            // `earthPosition` will be undefined if our mouse is not over the globe.
            if (Cesium.defined(earthPosition) && earthPosition != undefined) {
                if (activeShapePos.length === 0) {
                    activeShapePos.push(earthPosition)
                    const dynamicPositions = new Cesium.CallbackProperty(function () {
                        return new Cesium.PolygonHierarchy(activeShapePos)
                    }, false)
                    activeShape.value = drawShape(dynamicPositions)
                }
                activeShapePos.push(earthPosition)
                activeShapePoints.value.push(createPoint(earthPosition))
            }
        }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
    rHandler.setInputAction(function (event) {
        if (!isMouseMoveScheduled) {
            isMouseMoveScheduled = true
            requestAnimationFrame(() => {
                if (activeShapePos.length>0) {
                    const ray = viewer.camera.getPickRay(event.endPosition)
                    if ( ray != undefined ) {
                        const newPosition = viewer.scene.globe.pick(ray, viewer.scene)
                        if (Cesium.defined(newPosition) && newPosition != undefined) {
                            //floatingPoint.position.setValue(newPosition);
                            activeShapePos.pop()
                            activeShapePos.push(newPosition)
                        }
                    }
                }
                isMouseMoveScheduled = false
            })
        }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)
    rHandler.setInputAction(function () {
        activeShapePos.pop()
        if ( activeShape.value!=undefined && activeShape.value.polygon!=undefined ) {
            activeShape.value.polygon.material = new Cesium.ImageMaterialProperty({
                color: Cesium.Color.WHITE.withAlpha(0)
            })
        }
        if (activeShapePos.length>0) {
            let lonlats = Cesium.Ellipsoid.WGS84.cartesianArrayToCartographicArray(activeShapePos)
            let lonRange = lonlats.map(el => Cesium.Math.toDegrees(el.longitude))
            let latRange = lonlats.map(el => Cesium.Math.toDegrees(el.latitude))
            cb_update(lonRange, latRange)
        } else {
            cb_update([], [])
        }
        if (rHandler != null) {
            rHandler.removeInputAction(Cesium.ScreenSpaceEventType.MOUSE_MOVE)
            rHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK)
            rHandler.removeInputAction(Cesium.ScreenSpaceEventType.RIGHT_CLICK)
        }
        document.body.style.cursor = "default"
        // resume outside mouse listener
        cesiumStore.iPausedMouseEvents = false;
    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK)

    function createPoint(worldPosition) {
        const point = viewer.entities.add({
            position: worldPosition,
            point: {
                color: Cesium.Color.WHITE,
                pixelSize: 5,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            }
        })
        return point
    }
    function drawShape(positionData) {
        return viewer.entities.add({
            polygon: {
                hierarchy: positionData,
                material: new Cesium.ColorMaterialProperty(
                    Cesium.Color.WHITE.withAlpha(0.3)
                ),
                height: 10,  // needed by outline
                outline : true,
                outlineColor : Cesium.Color.MAGENTA
            }
        })
    }
}
