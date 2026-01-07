import * as Cesium from 'cesium'
import LatLon  from 'geodesy/latlon-nvector-spherical.js'

export const distance_ruler = (viewer) => {
    // storage variables for dragging-click points
    let activeShapePos = []
    let activeShapePoints = []
    let activeShape = undefined
    let dis_info = undefined
    // event handle
    const ahandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

    // performance improvement
    let isMouseMoveScheduled = false

    document.getElementById('distance_info')?.remove()
    // change cursor to crosshair
    document.body.style.cursor = "help"

    // drawing polygon
    ahandler.setInputAction(function (event ) {
        const ray = viewer.camera.getPickRay(event.position)
        if (ray != undefined) {
            const earthPosition = viewer.scene.globe.pick(ray, viewer.scene)
            // `earthPosition` will be undefined if our mouse is not over the globe.
            if (Cesium.defined(earthPosition) && earthPosition != undefined) {
                if (activeShapePos.length === 0) {
                    activeShapePos.push(earthPosition)
                    const dynamicPositions = new Cesium.CallbackProperty(function () {
                        return activeShapePos
                    }, false)
                    activeShape = drawShape(dynamicPositions)
                    dis_info = create_dis_info()
                }
                activeShapePos.push(earthPosition)
                activeShapePoints.push(createPoint(earthPosition))
                //if (activeShapePoints.length>1) {
                //    console.log('add tag')
                //}
            }
        }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
    ahandler.setInputAction(function (event) {
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
                            update_dis_info(event.endPosition)
                        }
                    }
                }
                isMouseMoveScheduled = false
            })
        }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)
    ahandler.setInputAction(function () {
        if (activeShape != undefined) {
            viewer.entities.remove(activeShape)
            activeShape = undefined
        }
        if (activeShapePoints.length > 0) {
            for (let i=0; i<activeShapePoints.length; i++) {
                viewer.entities.remove(activeShapePoints[i])
            }
            activeShapePoints = []
        }
        if (dis_info != undefined) {
            dis_info.remove()
            dis_info = undefined
        }
        activeShapePos = []
        document.body.style.cursor = "default"
        if (ahandler != null) {
            ahandler.removeInputAction(Cesium.ScreenSpaceEventType.MOUSE_MOVE)
            ahandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK)
            ahandler.removeInputAction(Cesium.ScreenSpaceEventType.RIGHT_CLICK)
        }
    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK)

    function createPoint(worldPosition) {
        const point = viewer.entities.add({
            position: worldPosition,
            point: {
                color: Cesium.Color.LIGHTGRAY,
                pixelSize: 6,
                outlineWidth: 2,
                outlineColor: Cesium.Color.BLACK,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            }
        })
        return point
    }
    function drawShape(positionData) {
        return viewer.entities.add({
            polyline: {
                positions: positionData,
                material: new Cesium.PolylineArrowMaterialProperty(
                    Cesium.Color.ORANGE.withAlpha(0.7),
                ),
                width: 8,
            }
        })
    }
    function create_dis_info() {
        let txt = document.createElement('div')
        txt.id = 'distance_info'
        txt.style.position = 'absolute'
        txt.style.padding = '0px 3px'
        txt.classList.add('auto-bg-opc1')
        document.body.appendChild(txt)
        return txt
    }
    function update_dis_info(position) {
        if (dis_info != undefined) {
            dis_info.style.top = '' + (position.y + 50 + 10) + 'px'       // need included header height
            dis_info.style.left = '' + (position.x + 40 - 20) + 'px'  // need include left side width
            dis_info.innerHTML = cal_distance()
        }
    }
    function cal_distance() {
        let lonlats = Cesium.Ellipsoid.WGS84.cartesianArrayToCartographicArray(activeShapePos)
        let lons = lonlats.map(el => Cesium.Math.toDegrees(el.longitude))
        let lats = lonlats.map(el => Cesium.Math.toDegrees(el.latitude))
        let d_toltal = 0
        let d_last = 0
        let d_len = lats.length
        if (d_len>1) {
            for (let i=1; i<=d_len-1; i++) {
                let p0 = new LatLon(lats[i-1], lons[i-1])
                let p1 = new LatLon(lats[i], lons[i])
                d_last = p1.distanceTo(p0)
                d_toltal += d_last
            }
        }
        return '当前<span style="color:red">'+(d_last/1000).toFixed(1) +
            '</span>公里<br>总长<span style="color:red">' +
            (d_toltal/1000).toFixed(1) +
            '</span>公里<br><span style="font-size:11px">右键结束</span>'   // meter to km
    }
}
