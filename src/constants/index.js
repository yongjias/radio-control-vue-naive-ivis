export const MAX_COLOR_IDX = 800;

export const DF_LINE_LENGTH = 50000;     // df line length in meter

export const SAT_MIN_ELEV_DEG = 30;       // minimum elevation angle for satellite visibility

export const Device = {
  0:  {Color: ' #b0e0f0', Txt: '离线', iAnimation: false},      // GREY
  1:  {Color: ' #338b13a6', Txt: '在线', iAnimation: false},      // OLIVE
  2:  {Color: ' #f0af60a6', Txt: '运行中', iAnimation: true},     // LIMEGREEN
  3:  {Color: ' #c82683', Txt: '异常', iAnimation: false},      // DEEPPINK
}

export const deviceStatus = {
  OFFLINE:  0,   // 0
  IDLE:     1,   // 1
  RUNNING:  2,   // 2
  ABNORMAL: 3,   // 3
  ALL:      4,   // all status
  NONE:     5,   // none status
}