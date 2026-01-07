/**********************************
 * @Author: Ronnie Zhang
 * @LastEditor: Ronnie Zhang
 * @LastEditTime: 2023/12/04 22:50:38
 * @Email: zclzone@outlook.com
 * Copyright © 2023 Ronnie Zhang(大脸怪) | https://isme.top
 **********************************/

import { request } from '@/utils'

export default {
  // 获取用户信息
  getUser: () => request.get('/user/detail'),
  // 刷新token
  refreshToken: () => request.get('/auth/refresh/token'),
  // 登出
  logout: () => request.post('/auth/logout', {}, { needTip: false }),
  // 切换当前角色
  switchCurrentRole: role => request.post(`/auth/current-role/switch/${role}`),
  // 获取角色权限
  getRolePermissions: () => request.get('/role/permissions/tree'),
  // 验证菜单路径
  validateMenuPath: path => request.get(`/permission/menu/validate?path=${path}`),
  // for login
  toggleRole: data => request.post('/auth/role/toggle', data),
  // for login
  login: data => request.post('/auth/login', data, { needToken: false }),
  // create sites record to sql
  createSites: data => request.post('/site', data),
  // get all sites from sql
  getAllSites: () => request.get('/site'),
  // get a site by name
  getSiteByName: (name) => request.get(`/site/name/${name}`),
  // get a site by mfid
  getSiteByMfid: (mfid) => request.get(`/site/mfid/${mfid}`),
  // update site's euqid by it's name
  updateSiteMfid: (name, mfid) => request.patch(`/site/${name}`, mfid),
  // update site's location by it's name
  updateSiteLocation: (name, location) => request.patch(`/site/location/${name}`, location),

  // satellite data services
  //record_getByName: name => request.post('/record/getByName', name),
  
  // downward record list
  downward_getAll: () => request.get('/downward'),
  downward_getAllCount: () => request.get('/downward/count'),
  downward_getAllTimeRange: () => request.get('/downward/timeRange'),
  downward_getOne: (mfid, time) => request.get(`/downward/getOne/${mfid}/${time}`),
  downward_getByMfid: mfid => request.post('/downward/getByMfid', mfid),
  downward_getByTime: data => request.post('/downward/getByTime', data),
  downward_getByTimeRange: data => request.post('/downward/getByTimeRange', data),
  downward_getByIndexRange: data => request.post('/downward/getByIndexRange', data),
  downward_getNthChunkInTimeRange: data => request.post('/downward/getNthChunkInTimeRange', data),
  downward_getNthChunkInTimeRangeWithMeta: data => request.post('/downward/getNthChunkInTimeRangeWithMeta', data),
  downward_getNthChunkInTimeRangeAreaWithMeta: data => request.post('/downward/getNthChunkInTimeRangeAreaWithMeta', data),
  downward_getNthChunkInTimeRangeAreaWithMetaDb: data => request.post('/downward/getNthChunkInTimeRangeAreaWithMetaDb', data),
  downward_getNthChunkByTaskIdWithMeta: data => request.post('/downward/getNthChunkByTaskIdWithMeta', data),
  downward_getNthChunkByTaskId: data => request.post('/downward/getNthChunkByTaskId', data),
  downward_getAllTaskId: () => request.post('/downward/getAllTaskId'),

  // upward record list
  upward_getAll: () => request.get('/upward'),
  upward_getOne: (mfid, time) => request.get(`/upward/getOne/${mfid}/${time}`),
  upward_getByMfid: mfid => request.post('/upward/getByMfid', mfid),
  upward_getByTime: data => request.post('/upward/getByTime', data),
  upward_getByTimeRange: data => request.post('/upward/getByTimeRange', data),
  upward_getByTimeGid: data => request.post('/upward/getByTimeGid', data),
  upward_updateNoteByTimeGid: data => request.post('/upward/updateNote', data),
  upward_getNthChunkOfAll: data => request.post('/upward/getNthChunkOfAll', data),
  upward_getNthChunkOfAllWithMeta: data => request.post('/upward/getNthChunkOfAllWithMeta', data),
  upward_bulk_create: data => request.post('/upward/bulk_create', data),

  // tdoa record list
  tdoa_getAll: () => request.get('/tdoa'),
  tdoa_getByTimeRange: data => request.post('/tdoa/getByTimeRange', data),
  tdoa_getByTimeGid: data => request.post('/tdoa/getByTimeGid', data),
  tdoa_updateNoteByTimeGid: data => request.post('/tdoa/updateNote', data),
  tdoa_getNthChunkOfAll: data => request.post('/tdoa/getNthChunkOfAll', data),
  tdoa_getNthChunkOfAllWithMeta: data => request.post('/tdoa/getNthChunkOfAllWithMeta', data),
  tdoa_bulk_create: data => request.post('/tdoa/bulk_create', data),

  // execute system command
  restartServer: () => request.get('/command/execute'),
  switch_power: data => request.post('/command/power', data),
}
