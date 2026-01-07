// 测向设备一体化调用参数
const DF_ATOM_ARGS = {
    中星: {
        DDF550: {
            frequency: 91600000, 
            span:   1000000,
            dfbw: 100000,
            integrationtime: '3', 
            dfmode: 'NORMAL',            // df mode: THRESHOLD, CONT , NORMAL
            ifbw: 120000,                // if bandwidth
            demodmode: 'FM',             // demodulation mode, FM or AM
            demodbw: '120000',           // demodulation bandwidth
            rfattvalue: 'AUTO',          // rf attenuation value
            rfmode: 'NORM',
            preamplifier: 'ON',          // amplifier, ON or OFF
            polarization: 'vertial',
            spectrumswitch: 'OFF',
            audiotype: 'OFF',            // audio type: OFF, PCM
            holdtime: '0.5'
        },
        CSJCCXTD: { // 比较通用
            frequency: 91600000, 
            demodbw: '120000',          // demodulation bandwidth
            ifbw: 10000000,             // if bandwidth, 10M
            rfmode: 'NORM',
            rfattvalue: '0',            // rf attenuation value
            ifattvalue: '0',
            integrationtime: '3',       // 1:100ms, 2:200ms, 3:500ms, 4: 1s, 5:2s, 6:35
            polarization: 'vertial',
            dfmode: '1',                // df mode: THRESHOLD, CONT , NORMAL
            demodmode: 'FM',            // demodulation mode, FM or AM
            SignalCount: '1',
            DFFastThreshold: '0',
            spectrumswitch: 'OFF',
        },
    },

    华日: {
        DDF550: {
            frequency: 91600000,         
            dfbw: 50000,
            dfmode: 'NORMAL',            // df mode: THRESHOLD, CONT , NORMAL
            ifbw: 1000000,               // if bandwidth
            MeasureDFTime: '0.5',
            ddfampthreshold: 0,
            demodmode: 'FM',             // demodulation mode, FM or AM
            demodbw: '120000',           // demodulation bandwidth
            rfattvalue: 'AUTO',          // rf attenuation value
            AntPOL: 'VERT',
            Amplifier: 'OFF',             // amplifier, ON or OFF
            Selectivity: 'AUTO',
            audiotype: 'OFF',            // audio type: OFF, PCM, GSM610
            AntennaSelect: 'Vertical',
            gain: 'AGC',              // gain: AGC, MGC
        },
        EBD100: {
            frequency: 91600000,         
            InterTime: '0.5',
            BoundWidth: 100,
            DdfThreshold: '0',
            ifbw: 500000,               // if bandwidth
            demodmode: 'FM',
            gain: 'AGC',
            mgc: '0',
            rfattvalue: 'OFF',          // rf attenuation value
            audiotype: 'OFF',            // audio type: OFF, PCM, GSM610
            rfmode: 'NORM',
            detector: 'FAST',
            squelchthreshold: 'OFF',
            spectrumswitch: 'OFF',
        },
        HRS73AlServer40MV3: {
            AlgorithmSwitch: '0',
            frequency: 91600000,         
            dfbw: 150000,
            ddfatt: '0',
            TimeThreshold: '20',
            demodbw: '150000',           // demodulation bandwidth
            SpatialfilterSwitch: 'OFF',
            SpatialfilterChannel: '1',
            FFTConvertToMultiDDF: 'false',
            spectrumswitch: 'OFF',
            rfmode: '1',
            AntPol: '0',
            ddfampthreshold: 0,
            IsCluster: '1',
            DdfMethod: '0',
            DDFSignalCount: '1',
            TimeSwitch: 'OFF',
            SmallSignalSwitch: 'OFF',
            demodmode: 'FM',             // demodulation mode, FM or AM
            BearingCommonValue: 0,
        },
        HRQ15D: {
            frequency: 91600000,         
            dfbw: '120000',
            ddfatt: '0',
            SingleType: 'Normal',        // 测向的信号类型，Normal（普通信号）、Small（弱小信号）、Abrupt（突发信号）
            integrationtime: '50',       // integration time, ms
            ddfampthreshold: '0',        // 电平门限, dBuV
            spectrumswitch: 'OFF',
            rfattvalue: '0',             // rf attenuation value
            rfmode:          '普通',
            AntennaSelect: 'Vertical',
        },
    },

    点阵: {
        DZSIS200: {
            frequency: 94400000, 
            dfbw: 50000,
            ifbw: 1000000,               // if bandwidth
            rfattvalue: 0,             
            ddfampthreshold: -20,        // 电平门限
            dfqualitythreshold: 0,       // 质量门限
            integrationtime: '0.3', 
            rfmode:          'NORM',
            dfmode:          'NORMAL', 
            demodmode: 'FM',            
            squelchswitch: 'ON',
            spectrumswitch: 'OFF',
            audiotype: 'OFF'         
        },
    }
}

export { DF_ATOM_ARGS }