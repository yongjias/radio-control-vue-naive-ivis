import api from '@/api'
import { utils, read } from 'xlsx'

async function fetchExcelFile(url) {
  const res = await fetch(url);
  const arrayBuffer = await res.arrayBuffer();

  const data = new Uint8Array(arrayBuffer);
  const workbook = read(data, { type: 'array' });

  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const json = utils.sheet_to_json(worksheet, { raw: false });

  return json

}

export const create_sites = () => {
  // Fetch and read the Excel file
  fetchExcelFile('/监测站.xlsx').then(json => {
    //console.log(json)
    let i = 1;
    json.forEach(async(el) => {
      let port = parseInt(el['端口号']);
      let mfid = ''+(10000001000000+i)
      let lon = parseFloat(el['经度']);
      let lat = parseFloat(el['纬度']);
      let group = parseInt(el['分组']);
      //console.log(mfid, i, lon, lat)
      let rec = {
        mfid:                 mfid,
        name:                 el['设备名'],
        address:              el['地点'],
        lon:                  lon,
        lat:                  lat,
        alt:                  0,
        port:                 port,
        group:                group,
      }
      //console.log(rec)
      i=i+1;
      const res = await api.createSites(rec)
      //console.log(res)
    })
  })
}