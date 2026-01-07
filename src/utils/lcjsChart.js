  import {
    lightningChart,
    PalettedFill,
    LUT,
    emptyLine,
    emptyFill,
    SolidLine,
    SolidFill,
    PointShape,
    AxisScrollStrategies,
    AxisTickStrategies,
    disableThemeEffects,
    LegendBoxBuilders,
    regularColorSteps,
    ColorRGBA,
    Themes,
  } from '@lightningchart/lcjs'

  // Initialize LightningChart JS
  const lc = lightningChart({
    license: "0002-n96ucKX1C700BOZwz7IAGHHjEuT4KwDfrkmx7QCyIBztfxcK2B2YdzqRkuyh0bv4JWu/viN/aCm4HYmBbVnGHphV-MEUCIQCoAbM5nVG3lu6EAeoZcsrvewNpdn+DEGKL6UpNeDXEbAIgCV8gVBAZ3XKPAkbuQDarCfg/BnBK4sN+L00cqoYMu5E=",
    licenseInformation: {
        appTitle: "LightningChart JS Trial",
        company: "LightningChart Ltd."
    },
    warnings: false,
  })

  // gauge
  const draw_gauge = (divId, nCh) => {
    // Create HTML elements for the dashboard layout
    const exampleContainer = document.getElementById(divId)
    exampleContainer.innerHTML = ''
    exampleContainer.style.display = 'flex'
    exampleContainer.style.flexDirection = 'row'
    const gaugeLayout = document.createElement('div')
    exampleContainer.append(gaugeLayout)
    gaugeLayout.style.width = '25%'
    gaugeLayout.style.height = '100%'
    const xyContainer = document.createElement('div')
    exampleContainer.append(xyContainer)
    xyContainer.style.width = '75%'
    xyContainer.style.height = '100%'

    const gaugeChartArray = []
    const lineSeriesArray = []

    // Create XY chart for line series
    const xyChart = lc
        .ChartXY({
            container: xyContainer,
            //theme: Themes.darkGold,
            theme: disableThemeEffects(Themes.darkGold),
        })
        .setTitle('')
        .setCursor((cursor) => cursor.setTickMarkerXVisible(false))
    xyChart
        .getDefaultAxisX()
        .setTickStrategy(AxisTickStrategies.Empty)
        .setThickness(0)
        .setStrokeStyle(emptyLine)
        .setScrollStrategy(AxisScrollStrategies.progressive)
        .setInterval({ start: 0, end: 10_000, stopAxisAfter: false })
    xyChart.getDefaultAxisY().dispose()

    // Create dashboard rows
    const vMin = -5
    const vMax = 15
    for (let iCh = 0; iCh < nCh; iCh++) {
        const axisY = xyChart
            .addAxisY({ iStack: nCh - iCh })
            .setMargins(15, 15)
            .setScrollStrategy(AxisScrollStrategies.expansion)
            .setInterval({ start: vMin, end: vMax, stopAxisAfter: false })
        const lineSeries = xyChart
            .addPointLineAreaSeries({ axisY, dataPattern: 'ProgressiveX' })
            .setMaxSampleCount(10_000)
            .setAreaFillStyle(emptyFill)
        lineSeriesArray.push(lineSeries)

        const gaugeContainer = document.createElement('div')
        gaugeLayout.append(gaugeContainer)
        gaugeContainer.style.height = '' + Math.floor(100/nCh) + '%'
        const gauge = lc
            .Gauge({
                container: gaugeContainer,
                //theme: Themes.darkGold,
                theme: disableThemeEffects(Themes.darkGold),
            })
            .setTitle('')
            .setUnitLabel(`频率 ${iCh + 1}`)
            .setInterval(vMin, vMax)
            .setAngleInterval(180, 0)
            .setRoundedEdges(false)
            .setBarThickness(20)
            .setNeedleLength(20)
            .setNeedleThickness(5)
            .setValueIndicatorThickness(10)
            .setGapBetweenBarAndValueIndicators(1)
            .setTickFormatter((tick) => tick.toFixed(0))
            .setValueLabelFont((font) => font.setSize(24))
            .setUnitLabelFont((font) => font.setSize(16))
            .setTickFont((font) => font.setSize(16))
        gaugeChartArray.push(gauge)
    }

    // Construct value indicator array from a color palette
    const valueIndicators = []
    //const colorPalette = gaugeChartArray[0].getTheme().examples.badGoodColorPalette
    const colorPalette = gaugeChartArray[0].getTheme().examples.coldHotColorPalette
    const intervalStart = vMin
    const intervalEnd = vMax
    const stepSize = (intervalEnd - intervalStart) / colorPalette.length
    colorPalette.forEach((color, index) => {
        valueIndicators.push({
            start: intervalStart + stepSize * index,
            end: intervalStart + stepSize * (index + 1),
            color,
        })
    })
    gaugeChartArray.forEach((gauge) => gauge.setValueIndicators(valueIndicators))

    return [gaugeChartArray, lineSeriesArray]
  }


  // spectrum ---------------------------------------------------------------------------------
  const draw_spectrum =  (divId, nFrq, sFrq, step, DECAY_STEPS_COUNT) => {
    // Create HTML elements for the dashboard layout
    const exampleContainer = document.getElementById(divId)
    exampleContainer.innerHTML = ''
    const xyContainer = document.createElement('div')
    exampleContainer.append(xyContainer)
    xyContainer.style.width = '100%'
    xyContainer.style.height = '50%'
    const wtContainer = document.createElement('div')
    exampleContainer.append(wtContainer)
    wtContainer.style.width = '100%'
    wtContainer.style.height = '50%'

    // Create XY Chart
    const sprectrum = lc
      .ChartXY({
          container: xyContainer,
          //theme: Themes.darkGold,
          theme: disableThemeEffects(Themes.darkGold),
      })
      .setTitle('频谱图')
      .setCursorMode()

    // Set static Y axis interval.
    sprectrum.getDefaultAxisY().setScrollStrategy()
    .setTitle('电平 (dBuv)')
    .setScrollStrategy(AxisScrollStrategies.expansion)
    .setInterval({ start: 0.0, end: 30.0, stopAxisAfter: false })

    sprectrum.getDefaultAxisX()
    .setTitle('频率')
    .setUnits('MHz')
    .setTickStrategy(AxisTickStrategies.Numeric, (strategy) => strategy
      // Configure NumericTickStrategy
      .setMajorFormattingFunction((i) => {
        let frq = sFrq+i*step
        return frq.toFixed(0)
      })
      .setMinorFormattingFunction((i) => {
        let frq = (sFrq+i*step)
        return frq.toFixed(2)
      })
      .setMinorTickStyle((tickStyle) => tickStyle
        .setTickLength(12)
        .setTickPadding(2)
      )
    )
    .setInterval({ start: 0, end: nFrq, stopAxisAfter: false })

    sprectrum.setPadding({
      left: 45, // Adjust the left padding as needed
      right: 25,
      top: 10,
      bottom: 10,
    });
    // Add Line series
    const serieMax = sprectrum.addLineSeries().setStrokeStyle((stroke) => stroke.setThickness(-1))
    const serieMin = sprectrum.addLineSeries().setStrokeStyle((stroke) => stroke.setThickness(-1))
    const series = Array.from({length: DECAY_STEPS_COUNT}, ()=>sprectrum.addLineSeries())
    const serie = sprectrum.addLineSeries()
    const marks = sprectrum.addPointSeries({ pointShape: PointShape.Cross }).setPointSize(15).setEffect(false)

    const theme = sprectrum.getTheme()
    //const defaultStrokeColor = serieMax.getStrokeStyle().getFillStyle().getColor()
    const defaultStrokeColor = ColorRGBA( 235, 110, 185 )
    // Generate list of stroke styles for each decay step.
    const strokeStyles = new Array(DECAY_STEPS_COUNT).fill(0).map((_, i) => {
      const lerpPos = i / DECAY_STEPS_COUNT
      // Linear interpolation convenience function.
      const lerp = (v0, v1, p) => v0 * (1 - p) + v1 * p
      return new SolidLine({
          thickness: 10,
          fillStyle: new SolidFill({
              // Decay step colors shift between default stroke color and fully transparent white.
              color: ColorRGBA(
                  lerp(defaultStrokeColor.getR(), theme.isDark ? 0 : 255, lerpPos),
                  lerp(defaultStrokeColor.getG(), theme.isDark ? 0 : 255, lerpPos),
                  lerp(defaultStrokeColor.getB(), theme.isDark ? 0 : 255, lerpPos),
                  lerp(155, 0, lerpPos),
              ),
          }),
      })
    })
  // waterfall ---------------------------------------------------------------------------------------------
    // Sampling rate as samples per second (only required for example purposes).
    //const sampleRateHz = 100
    // Minimum time step that can be displayed by the heatmap. In this example, set to half of average interval between samples. In normal applications you can set this to some comfortably small value.
    // Smaller value means more precision but more RAM and GPU memory usage.
    //const heatmapMinTimeStepMs = (0.5 * 1000) / sampleRateHz
    const heatmapMinTimeStepMs = 50
    // Time axis view at start
    const viewMs = 10000

    // Create ChartXY.
    const waterfall = lc
      .ChartXY({
          container: wtContainer,
          //theme: Themes.darkGold,
          theme: disableThemeEffects(Themes.darkGold),
      })
      .setTitle('瀑布图')

    const t1s = 1000
    const t1m = 60 * 1000
    const t1h = 60 * 60 * 1000
    const t1d = 24 * 60 * 60 * 1000
    const formatterX = (x) => {
        const hour = Math.floor((x % t1d) / t1h).toString().padStart(2, '0')
        const minute = Math.floor((x % t1h) / t1m).toString().padStart(2, '0')
        const second = Math.floor((x % t1m) / t1s).toString().padStart(2, '0')
        return `${hour}:${minute}:${second}`
    }
    waterfall
      .getDefaultAxisY()
      .setTitle('时间 (s)')
      // Setup progressive scrolling Axis.
      .setScrollStrategy(AxisScrollStrategies.progressive)
      .setDefaultInterval((state) => ({ end: state.dataMax, start: (state.dataMax ?? 0) - viewMs, stopAxisAfter: false }))
      .setTickStrategy(AxisTickStrategies.Time, ticks=>ticks.setMajorFormattingFunction(formatterX, formatterX, formatterX))

    waterfall.getDefaultAxisX()
    .setTitle('频率')
    .setUnits('MHz')
    .setTickStrategy(AxisTickStrategies.Numeric, (strategy) => strategy
      // Configure NumericTickStrategy
      .setMajorFormattingFunction((i) => {
        let frq = sFrq+i*step
        return frq.toFixed(0)
      })
      .setMinorFormattingFunction((i) => {
        let frq = sFrq+i*step
        return frq.toFixed(1)
      })
      .setMinorTickStyle((tickStyle) => tickStyle
        .setTickLength(12)
        .setTickPadding(2)
      )
    )

    // Setup PalettedFill for dynamically coloring Heatmap by Intensity values.
    const lut = new LUT({
      steps: regularColorSteps(-30, 45, waterfall.getTheme().examples.coldHotColorPalette),
      units: 'dB',
      interpolate: true,
    })
    const paletteFill = new PalettedFill({ lut, lookUpProperty: 'value' })

    // Create Scrolling Heatmap Grid Series.
    const heatmapSeries = waterfall
      .addHeatmapScrollingGridSeries({
          scrollDimension: 'rows',
          resolution: nFrq,
      })
      .setStart({ x: 0, y: 0 })
      .setStep({ x: 1, y: heatmapMinTimeStepMs })
      .setFillStyle(paletteFill)
      .setWireframeStyle(emptyLine)
      // Configure automatic data cleaning.
      .setDataCleaning({
          // Out of view data can be lazily removed as long as total columns count remains over 1000.
          minDataPointCount: 1000,
      })

      /*
    // Add LegendBox to chart.
    const legend = waterfall
      .addLegendBox(LegendBoxBuilders.HorizontalLegendBox)
      // Dispose example UI elements automatically if they take too much space. This is to avoid bad UI on mobile / etc. devices.
      .setAutoDispose({
          type: 'max-width',
          maxWidth: 0.8,
      })
      .add(waterfall)
      */

    const handleIncomingData = (timestamp, sample) => {
      // Calculate sample index from timestamp to place sample in correct location in heatmap.
      const iSample = Math.round(timestamp / heatmapMinTimeStepMs)
      heatmapSeries.invalidateIntensityValues({
        iSample,
        values: [sample],
      })
    }

    /*
        // Display incoming points amount in Chart title.
    const title = chart.getTitle()
    let tStart = Date.now()
    let lastReset = Date.now()
    const updateChartTitle = () => {
      // Calculate amount of incoming points / second.
      if (dataAmount > 0 && Date.now() - tStart > 0) {
          const pps = (1000 * dataAmount) / (Date.now() - tStart)
          chart.setTitle(`${title} (${Math.round(pps)} data points / s)`)
      }
      // Reset pps counter every once in a while in case page is frozen, etc.
      if (Date.now() - lastReset >= 5000) {
          tStart = lastReset = Date.now()
          dataAmount = 0
      }
    }
    setInterval(updateChartTitle, 1000)
    */
    return [ serie, serieMax, serieMin, series, strokeStyles, marks, handleIncomingData]

  }

  export { draw_gauge, draw_spectrum }