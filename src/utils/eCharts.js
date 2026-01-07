import * as echarts from 'echarts/core';
import { 
  GridComponent, 
  TooltipComponent, 
  TitleComponent, 
  DataZoomComponent,
  VisualMapComponent, 
  LegendComponent,
  GeoComponent,
} from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { 
  BarChart, 
  GaugeChart, 
  PieChart, 
  RadarChart,
  CustomChart,
} from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';
import { useSiteStore } from '@/store'
import { Device, deviceStatus } from '@/constants'

echarts.use([
  GridComponent, TooltipComponent, DataZoomComponent,
  TitleComponent, VisualMapComponent, LegendComponent,
  BarChart, GaugeChart, PieChart, RadarChart,
  GeoComponent, CustomChart, 
  LabelLayout, CanvasRenderer
]);

function echartsMonitorActive(divId) {
  // which channel to alert is colored
  const siteStore = useSiteStore()
  let cn = -1;
  if (siteStore.loraDecoded[siteStore.pickedLora]) {
    cn = +siteStore.loraDecoded[siteStore.pickedLora].cn - 1;
  }
  if (cn < 0) {
    setTimeout(() => {
      if (siteStore.loraDecoded[siteStore.pickedLora]) {
        cn = +siteStore.loraDecoded[siteStore.pickedLora].cn - 1;
      }
      if (cn < 0) {
        setTimeout(() => {
          if (siteStore.loraDecoded[siteStore.pickedLora]) {
            cn = +siteStore.loraDecoded[siteStore.pickedLora].cn - 1;
          }
          if (cn < 0) {
            setTimeout(() => {
              if (siteStore.loraDecoded[siteStore.pickedLora]) {
                cn = +siteStore.loraDecoded[siteStore.pickedLora].cn - 1;
              }
              if (cn < 0) {
                setTimeout(() => {
                  if (siteStore.loraDecoded[siteStore.pickedLora]) {
                    cn = +siteStore.loraDecoded[siteStore.pickedLora].cn - 1;
                  }
                }, 1000);
              }
            }, 1000);
          }
        }, 1000);
      }
    }, 3000);
  }
  //console.log('cn:', cn);

  // 1) Configuration
  const UPDATE_INTERVAL = 50;    // ms
  const POINT_COUNT     = 64;
  const BASELINE_DBM    = -120;   // bottom of chart
  const Y_MIN_DBM       = -120;   // y-axis min
  const Y_MAX_DBM       = -20;    // y-axis max

  // 2) Categories & initial data in [–100, –80)
  const categories = Array.from({length: POINT_COUNT}, (_, i) => String(i+1));
  const rawData  = Array.from({length: POINT_COUNT}, () => Math.random()*10 - 100);
  const diffData = rawData.map(v => v - BASELINE_DBM);

  // 3) Init ECharts
  const charDom = document.getElementById(divId);
  const chart = echarts.init(charDom, 'dark');

  // 4) Base option
  const option = {
    backgroundColor: '#1a243456',  // any CSS color: hex, rgb(a), named…
    tooltip: { show: false },
    grid: { left: 35, right: 10, top: 15, bottom: 30},

    xAxis: {
      type: 'category',
      data: categories,
      axisLine: { lineStyle: { color: '#aaa' } },
      axisLabel: { color: '#ddd' },
      axisTick: { show: false }
    },

    yAxis: {
      type: 'value',
      min:  Y_MIN_DBM - BASELINE_DBM,  // 0
      max:  Y_MAX_DBM - BASELINE_DBM,  // 100
      axisLine: { lineStyle: { color: '#aaa' } },
      axisLabel: {
        color: '#ddd',
        formatter: v => `${(v + BASELINE_DBM)}`
      },
      splitLine: { show: true, lineStyle: { type: 'dashed', color: '#444' } },
      // add unit to y-axis
      name: 'dBm',              // the text you want to show
      nameLocation: 'start',    // 'start' for the min end of the axis
      nameTextStyle: {
        color: '#afa',
        fontSize: 12,
        align: 'right',
      },
      nameGap: 10,              // distance (px) from the axis line
      nameRotate: 0             // keep it horizontal
    },

    series: [{
      name: 'Signal',
      type: 'bar',
      stack: 'base',
      //large: true,
      //largeThreshold: POINT_COUNT,
      barWidth: '60%',
      data: diffData,
      animation: false,
      itemStyle: {
        color: params => {
          return params.dataIndex === cn ? 'rgba(255,180,215,0.8)' : 'rgba(0,180,215,0.8)';
        }
      },
      label: {
        show: true,
        position: 'top',
        formatter: params => 
          params.dataIndex === cn
            //? `${params.value + BASELINE_DBM} dBm`  // or any text
            ? `${siteStore.loraDecoded[siteStore.pickedLora].freq} MHz`  // or any text
            : ''
      },
      //emphasis: { itemStyle: { color: 'rgba(0,180,215,1)' } }
    }]
  };

  chart.setOption(option);
  
  // 5) Update loop: regenerate each bar height in place
  const id = setInterval(() => {
    for (let i = 0; i < POINT_COUNT; i++) {
      if ( i===cn ) {
        rawData[i] = +siteStore.loraDecoded[siteStore.pickedLora].pow;    // new in [–100, –80)
      } else {
        rawData[i] = Math.random()*3 - 110;    // new in [–120, –110]
      }
      diffData[i] = rawData[i] - BASELINE_DBM;
    }
    chart.setOption(
      { series: [{ data: diffData }] },    // only data changes
      false,                                // don’t merge whole option
      { replaceMerge: ['series'] }          // keep itemStyle, etc
    );
  }, UPDATE_INTERVAL);

  return ()=> {
    clearInterval(id);
    chart.dispose();
  }

}

function echartsDial(divId, title) {
  const chartDom = document.getElementById(divId);
  const myChart = echarts.init(chartDom);

  //let observer = null;
  //let invId = null;
  const option = {
    title: {
      text: title,
      top: 30,
      left: 'center',
      textStyle: {
        color: '#abc',   // main title color
        fontSize: 18,
        fontWeight: 'bold'
      },
    },
    series: [
      {
        type: 'gauge',
        center: ['50%', '60%'],
        min: 0,
        max: 20,
        axisLine: {
          lineStyle: {
            width: 10,
            color: [
              [0.3, '#67e0e3'],
              [0.7, '#37a2da'],
              [1, '#fd666d']
            ]
          }
        },
        pointer: {
          itemStyle: {
            color: 'auto'
          }
        },
        axisTick: {
          distance: -10,
          length: 5,
          lineStyle: {
            color: '#fff',
            width: 1
          }
        },
        splitLine: {
          distance: -10,
          length: 10,
          lineStyle: {
            color: '#fff',
            width: 3
          }
        },
        axisLabel: {
          color: 'inherit',
          distance: 17,
          fontSize: 15
        },
        detail: {
          fontSize: 17,
          valueAnimation: true,
          formatter: '{value} 个',
          color: 'inherit'
        },
        data: [
          {
            value: 0
          }
        ]
      }
    ]
  };
  /*
  invId = setInterval(function () {
    myChart.setOption({
      series: [
        {
          data: [
            {
              value: +(Math.random() * 100).toFixed(2)
            }
          ]
        }
      ]
    });
  }, 2000);
  */

  const dial_update_data = (nData) => {
    myChart.setOption(
      { series: [{ data: [{value: nData}] }] },    // only data changes
      false,                                       // don’t merge whole option
      { replaceMerge: ['series'] }                 // keep itemStyle, etc
    );
  }

  option && myChart.setOption(option);

  // ResizeObserver approach:
  //observer = new ResizeObserver(() => {
  //  myChart.resize()
  //})
  //observer.observe(chartDom)

  return [dial_update_data, ()=> {
    //observer.disconnect();
    //clearInterval(invId);
    myChart.dispose();
  }]
}

function echartsDialBearing(divId) {
  const chartDom = document.getElementById(divId);
  const myChart = echarts.init(chartDom);

  //let observer = null;
  //let invId = null;
  const option = {
    series: [
      {
        type: 'gauge',
        startAngle: 90,        // 起始角度（0°）
        endAngle: -270,        // 结束角度（360°）
        splitNumber: 8,        // (360 - 0) / 8 = 45° 每段
        radius: '85%',         // 放大圆环
        center: ['50%', '45%'],
        min: 0,
        max: 360,
        axisLine: {
          lineStyle: {
            width: 10,
            color: [
              [0.25, '#67e063'],
              [0.5, '#67e0e3'],
              [0.75, '#37a2da'],
              [1, '#fd666d']
            ],
            roundCap: true  // 使环闭合（圆角）
          }
        },
        pointer: {
          itemStyle: {
            color: 'auto'
          }
        },
        axisTick: {
          distance: -10,
          length: 5,
          lineStyle: {
            color: '#fff',
            width: 1
          }
        },
        splitLine: {
          distance: -10,
          length: 10,
          lineStyle: {
            color: '#fff',
            width: 3
          }
        },
        axisLabel: {
          color: 'inherit',
          distance: 17,
          fontSize: 15,
          // 只显示 45° 倍数的标签
          formatter: function(value) {
            return value % 45 === 0 && value !==360 ? value + '°' : '';
          }
        },
        detail: {
          fontSize: 17,
          valueAnimation: true,
          formatter: '{value}度',
          color: 'inherit'
        },
        data: [
          {
            value: 0
          }
        ]
      }
    ]
  };
  /*
  invId = setInterval(function () {
    myChart.setOption({
      series: [
        {
          data: [
            {
              value: +(Math.random() * 100).toFixed(2)
            }
          ]
        }
      ]
    });
  }, 2000);
  */

  const dial_update_data = (nData) => {
    myChart.setOption(
      { series: [{ data: [{value: nData}] }] },    // only data changes
      false,                                       // don’t merge whole option
      { replaceMerge: ['series'] }                 // keep itemStyle, etc
    );
  }

  option && myChart.setOption(option);

  // ResizeObserver approach:
  //observer = new ResizeObserver(() => {
  //  myChart.resize()
  //})
  //observer.observe(chartDom)

  return [dial_update_data, ()=> {
    //observer.disconnect();
    //clearInterval(invId);
    myChart.dispose();
  }]
}

function echartsPie(divId, title, sData) {
  const chartDom = document.getElementById(divId);
  const myChart = echarts.init(chartDom);

  //let observer = null;
  const option = {
    title: {
      text: title,
      top: 30,
      left: 'center',
      textStyle: {
        color: '#abc',   // main title color
        fontSize: 18,
        fontWeight: 'bold'
      },
    },
    series: [
      {
        type: 'pie',
        center: ['50%', '60%'],
        radius: ['50%', '70%'],
        avoidLabelOverlap: false,
        padAngle: 5,
        itemStyle: {
          borderRadius: 10
        },
        label: {
          position: 'inside',
          formatter: '{b|{b}}',
          rich: {
            b: {
              color: '#fff',
              backgroundColor: '#4C505855',
              fontSize: 13,
              fontWeight: 'bold',
            },
          },
          show: true
        },
        emphasis: {
          label: {
            formatter: '{c|次数:{c}}\n{per|{d}%}',
            rich: {
              c: {
                color: '#3ff',
              },
              per: {
                color: '#f3f',
                padding: [3, 4],
                borderRadius: 4,
              }
            },
            show: true,
            backgroundColor: '#CCD0D895',
            padding: [8, 4, 0, 4],
            fontSize: 18,
            fontWeight: 'bold'
          }
        },
        labelLine: {
          show: false
        },
        data: sData,
      }
    ]
  };

  option && myChart.setOption(option);

  // ResizeObserver approach:
  //observer = new ResizeObserver(() => {
  //  myChart.resize()
  //})
  //observer.observe(chartDom)

  return ()=> {
    //observer.disconnect();
    myChart.dispose();
  }
}

function echartsBar(divId, title, sData) {
  const chartDom = document.getElementById(divId);
  const myChart = echarts.init(chartDom);

  // 动态生成颜色（根据值的大小）
  const values = sData.map(item => item.value);
  const valLen = values.length;
  const maxValue = Math.max(...values);
  const colors = sData.map(item => {
    // 值越大，颜色越接近红色；值越小，越接近绿色
    const ratio = item.value / maxValue;
    const red = Math.floor(255 * ratio);
    const green = Math.floor(255 * (1 - ratio));
    return `rgb(${red}, ${green}, 100)`;
  });
  //let observer = null;
  const option = {
    title: {
      text: title,
      top: 10,
      left: 'center',
      textStyle: {
        color: '#abc',   // main title color
        fontSize: 18,
        fontWeight: 'bold'
      },
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        // Use axis to trigger tooltip
        type: 'shadow' // 'shadow' as default; can also be 'line' or 'cross'
      }
    },
    //legend: {},
    grid: {
      left: '10%',  // Increase left margin for y-axis labels (default: 10%)
      right: '10%',
      top: '10%',
      bottom: '10%' // 必须足够大（至少大于 dataZoom.height）
    },
    xAxis: {
      type: 'value'
    },
    yAxis: {
      type: 'category',
      data: sData.map(item => item.name), // y轴显示名称
      axisLabel: {
        width: 80,
        overflow: 'truncate',
        interval: 0,
        color: '#fff',
      },
    },
    series: [
      {
        name: '数值',
        type: 'bar',
        data: values, // x轴显示值
        itemStyle: {
          color: params => colors[params.dataIndex] // 动态设置颜色
        },
        barWidth: '50%', // 设置条形宽度
        label: { show: true, position: 'right' } // 在条形右侧显示数值
      },
    ],
    dataZoom: [
      {
        type: 'slider',  // 滑动条型 dataZoom
        show: true,
        yAxisIndex: [0],   // 控制 y 轴
        left: '95%',  // 滑块距离左侧位置
        width: '5%', // 滑块宽度
        start: (valLen-10) / valLen * 100,  // 初始显示范围的开始百分比
        end: 100, // 初始显示10个项目
      }
    ]
  };

  option && myChart.setOption(option);

  // ResizeObserver approach:
  //observer = new ResizeObserver(() => {
  //  myChart.resize()
  //})
  //observer.observe(chartDom)

  return ()=> {
    //observer.disconnect();
    myChart.dispose();
  }
}

function echartsRadar(divId, title, areaNames, sData) {
  const chartDom = document.getElementById(divId);
  const myChart = echarts.init(chartDom);
  
  //let observer = null;
  const option = {
    title: {
      text: title,
      top: 20,
      left: 'center',
      textStyle: {
        color: '#abc',   // main title color
        fontSize: 18,
        fontWeight: 'bold'
      },
    },
    tooltip: {
      trigger: 'item'
    },
    visualMap: {
      top: 'bottom',
      right: 10,
      color: ['red', 'yellow'],
      calculable: true,
      textStyle: {
        color: '#fff'  // set tick label color here
      },
    },
    radar: {
      indicator: areaNames,
      center: ['50%', '57%'],
      splitNumber: 5,
      axisName: {
        color: '#eee',
        padding: [-10, -10],
      }
    },
    series: (function () {
      var series = [];
      for (var i = 1; i <= 28; i++) {
        series.push({
          type: 'radar',
          symbol: 'none',
          lineStyle: {
            width: 1
          },
          emphasis: {
            areaStyle: {
              color: 'rgba(0,250,0,0.3)'
            }
          },
          data: sData
        });
      }
      return series;
    })()
  };

  option && myChart.setOption(option);

  // ResizeObserver approach:
  //observer = new ResizeObserver(() => {
  //  myChart.resize()
  //})
  //observer.observe(chartDom)

  return ()=> {
    //observer.disconnect();
    myChart.dispose();
  }

}

function echartsMap(divId, geoHubei, sData) {
  var chartDom = document.getElementById(divId);
  var myChart = echarts.init(chartDom);

  let observer = null;
  echarts.registerMap('hubeiMap', geoHubei);
  const option = {
    geo: {
      map: 'hubeiMap',
      roam: true,
      label: {
        color: '#ff5',
        fontSize: 14,
        show: true,
        formatter: params => {
          const sites = sData.filter(el => el.name.includes(params.name));
          const ratio = sites.reduce((acc, cur) => acc + cur.ratio, 0).toFixed(1);
          if (sites.length > 0) {
            //return `${params.name}\n${sites[0].lon.toFixed(2)+','+sites[0].lat.toFixed(2)}`
            return `${params.name}\n\n{b|${sites.length}个监测站}\n覆盖:${ratio}%`
          } else {
            return `${params.name}`
          }
        },
        rich: {
          b: {
            color: '#fe7cfd',
            fontSize: 12,
            fontWeight: 'bold',
          },
        }
      },
      itemStyle: {
        areaColor: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            //{ offset: 0, color: '#dc9a9e' },   // top color
            //{ offset: 1, color: '#cad0c4' }    // bottom color
            { offset: 0, color: '#1f3d5fa0' },   // top color
            { offset: 1, color: '#cac0c0f0' }    // bottom color
          ],
          global: false
        },
        borderColor: '#3bc',
        borderWidth: 1
      },
      emphasis: {
        label: {
          show: true,
          color: '#fff',
          fontSize: 14,
          fontWeight: 'bold',
          formatter: params => {
            const sites = sData.filter(el => el.name.includes(params.name));
            if (sites.length > 0) {
              return `${params.name}\n\n{b|${sites.reduce((acc,cur)=>{
                acc = acc + cur.lon.toFixed(2)+', '+cur.lat.toFixed(2) + '\n';
                return acc;
              }, '')}}`
            } else {
              return `${params.name}`
            }
          },
          rich: {
            b: {
              color: '#fa33f7',
              fontSize: 13,
              fontWeight: 'bold',
            },
          }
        },
        itemStyle: {
          areaColor: '#FFC107aa',
          borderWidth: 2
        }
      },
    },
    series: {
      type: 'custom',
      coordinateSystem: 'geo',
      geoIndex: 0,
      zlevel: 1,
      data: sData,
      renderItem(params, api) {
        const coord = api.coord([
          //api.value(0, params.dataIndex),
          //api.value(1, params.dataIndex)
          sData[params.dataIndex].lon,
          sData[params.dataIndex].lat,
        ]);
        const color = sData[params.dataIndex].status===deviceStatus.ABNORMAL ? Device[deviceStatus.ABNORMAL].Color : 
                      sData[params.dataIndex].status===deviceStatus.RUNNING ? Device[deviceStatus.RUNNING].Color : 
                      sData[params.dataIndex].status===deviceStatus.IDLE ? Device[deviceStatus.IDLE].Color : Device[deviceStatus.OFFLINE].Color;
        const circles = [];
        for (let i = 0; i < 5; i++) {
          circles.push({
            type: 'circle',
            shape: {
              cx: 0,
              cy: 0,
              r: 30
            },
            style: {
              stroke: color,
              fill: 'none',
              lineWidth: 4
            },
            // Ripple animation
            keyframeAnimation: 
            {
              duration: 4000,
              loop: true,
              delay: (-i / 4) * 4000,
              keyframes: [
                {
                  percent: 0,
                  scaleX: 0,
                  scaleY: 0,
                  style: {
                    opacity: 1
                  }
                },
                sData[params.dataIndex].status<deviceStatus.IDLE ? 
                {
                  percent: 1,
                  scaleX: 0,
                  scaleY: 0,
                  style: {
                    opacity: 1
                  }
                } :
                {
                  percent: 1,
                  scaleX: 1,
                  scaleY: 0.4,
                  style: {
                    opacity: 0
                  }
                }
              ]
            }
          });
        }
        return {
          type: 'group',
          x: coord[0],
          y: coord[1],
          children: [
            ...circles,
            {
              type: 'path',
              shape: {
                d: 'M16 0c-5.523 0-10 4.477-10 10 0 10 10 22 10 22s10-12 10-22c0-5.523-4.477-10-10-10zM16 16c-3.314 0-6-2.686-6-6s2.686-6 6-6 6 2.686 6 6-2.686 6-6 6z',
                x: -10,
                y: -35,
                width: 20,
                height: 40
              },
              style: {
                fill: color
              },
              // Jump animation.
              keyframeAnimation: 
                sData[params.dataIndex].status<deviceStatus.ABNORMAL ? {} :
              {
                duration: 1000,
                loop: true,
                delay: Math.random() * 1000,
                keyframes: [
                  {
                    y: -10,
                    percent: 0.5,
                    easing: 'cubicOut'
                  },
                  {
                    y: 0,
                    percent: 1,
                    easing: 'bounceOut'
                  }
                ]
              }
            }
          ]
        };
      }
    }
  };

  myChart.setOption(option);

  // ResizeObserver approach:
  observer = new ResizeObserver(() => {
    myChart.resize()
  })
  observer.observe(chartDom)

  return ()=> {
    observer.disconnect();
    myChart.dispose();
  }

}

export { echartsMonitorActive, echartsDial, echartsDialBearing, echartsPie, echartsBar, echartsRadar, echartsMap };