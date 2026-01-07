import LatLon  from 'geodesy/latlon-nvector-spherical.js'
// compute center position of receivers
const compute_center_pos = (lonlats) => {
    // lonlats: [[lon,lat],[lon,lat]...]
    let cp = []
    lonlats.forEach(el => {
        cp.push(new LatLon(el[1], el[0]))    // lat, lon
    })
    let t = LatLon.meanOf(cp)                // center point of latlons points
    return [t.lon, t.lat]
}

export { compute_center_pos }
