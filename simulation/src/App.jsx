import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, RotateCcw, AlertTriangle, CheckCircle, Zap, Clock, Activity } from 'lucide-react';

const MAX_SIM_TIME_MS = 2500;
const TICK_RATE_MS = 20;

export default function App() {
  // --- Simulation Parameters ---
  const [params, setParams] = useState({
    tau: 300,
    overlapDelay: 100,
    timeoutLimit: 1000,
    shortCircuit: false
  });

  // --- Simulation State ---
  const [status, setStatus] = useState('STANDBY'); 
  const [currentTime, setCurrentTime] = useState(0);
  const [dataLog, setDataLog] = useState([]);
  
  const simRef = useRef({
    isRunning: false,
    time: 0,
    vBus: 0,
    schmittHigh: false,
    airMinusCmd: 0,
    prechargeCmd: 0,
    airPlusCmd: 0,
    timeAt95: null,
    status: 'STANDBY'
  });

  const timerRef = useRef(null);

  // --- Core Simulation Logic ---
  const tick = useCallback(() => {
    if (!simRef.current.isRunning) return;

    const state = simRef.current;
    state.time += TICK_RATE_MS;

    // 1. Calculate physical voltage
    if (state.status === 'PRECHARGING' || state.status === 'OVERLAP') {
      if (params.shortCircuit) {
        state.vBus = Math.min(state.vBus + 0.5, 10); 
      } else {
        const target = 100;
        state.vBus = state.vBus + (target - state.vBus) * (TICK_RATE_MS / params.tau);
      }
    }

    // 2. Hardware Schmitt Trigger Logic (95% threshold via U3A)
    if (state.vBus >= 95 && !state.schmittHigh) {
      state.schmittHigh = true;
      state.timeAt95 = state.time;
      
      if (state.status === 'PRECHARGING') {
        state.status = 'OVERLAP';
        state.airPlusCmd = 1; // CTRL_AIR_PLUS goes HIGH
      }
    }

    // 3. MCU Timeout Logic
    if (state.status === 'PRECHARGING' && state.time >= params.timeoutLimit) {
      state.status = 'FAULT';
      state.prechargeCmd = 0;
      state.airMinusCmd = 0;
      state.airPlusCmd = 0;
      state.isRunning = false;
    }

    // 4. MCU Overlap / Make-Before-Break Logic
    if (state.status === 'OVERLAP') {
      if (state.time >= state.timeAt95 + params.overlapDelay) {
        state.prechargeCmd = 0; // CTRL_PRECHARGE goes LOW
        state.status = 'RUN';
      }
    }

    if (state.time >= MAX_SIM_TIME_MS) {
      state.isRunning = false;
    }

    setCurrentTime(state.time);
    setStatus(state.status);
    
    setDataLog(prev => [...prev, {
      time: state.time,
      vBus: state.vBus,
      schmitt: state.schmittHigh ? 1 : 0,
      precharge: state.prechargeCmd,
      airPlus: state.airPlusCmd,
      airMinus: state.airMinusCmd
    }]);

  }, [params]);

  // --- Lifecycle & Controls ---
  useEffect(() => {
    if (simRef.current.isRunning) {
      timerRef.current = setInterval(tick, TICK_RATE_MS);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [tick, status]); 

  const startSimulation = () => {
    setDataLog([]);
    simRef.current = {
      isRunning: true,
      time: 0,
      vBus: 0,
      schmittHigh: false,
      airMinusCmd: 1,  // Close Negative first/simultaneously
      prechargeCmd: 1, // Close Precharge
      airPlusCmd: 0,   // Keep Positive Open
      timeAt95: null,
      status: 'PRECHARGING'
    };
    setCurrentTime(0);
    setStatus('PRECHARGING');
    
    setDataLog([{
      time: 0, vBus: 0, schmitt: 0, precharge: 1, airPlus: 0, airMinus: 1
    }]);
  };

  const resetSimulation = () => {
    simRef.current.isRunning = false;
    setDataLog([]);
    setCurrentTime(0);
    setStatus('STANDBY');
    simRef.current = {
      isRunning: false, time: 0, vBus: 0, schmittHigh: false,
      prechargeCmd: 0, airPlusCmd: 0, airMinusCmd: 0, timeAt95: null, status: 'STANDBY'
    };
  };

  const handleParamChange = (e) => {
    const { name, value, type, checked } = e.target;
    setParams(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : Number(value)
    }));
  };

  // --- SVG Graphing Helpers ---
  const svgWidth = 800;
  const svgHeight = 400;
  const getX = (t) => (t / MAX_SIM_TIME_MS) * svgWidth;
  
  const renderAnalogLine = (key, height, yOffset, color, maxValue) => {
    if (dataLog.length === 0) return null;
    const points = dataLog.map(d => {
      const x = getX(d.time);
      const y = yOffset + height - (d[key] / maxValue) * height;
      return `${x},${y}`;
    }).join(' ');
    return <polyline points={points} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" />;
  };

  const renderDigitalLine = (key, height, yOffset, color) => {
    if (dataLog.length === 0) return null;
    let path = `M 0,${yOffset + height}`;
    let lastY = yOffset + height;
    dataLog.forEach(d => {
      const x = getX(d.time);
      const y = d[key] === 1 ? yOffset + 5 : yOffset + height; 
      if (y !== lastY) {
        path += ` L ${x},${lastY} L ${x},${y}`;
        lastY = y;
      } else {
        path += ` L ${x},${y}`;
      }
    });
    return <path d={path} fill="none" stroke={color} strokeWidth="3" />;
  };

  const getStatusColor = () => {
    switch(status) {
      case 'STANDBY': return 'text-slate-400';
      case 'PRECHARGING': return 'text-blue-400';
      case 'OVERLAP': return 'text-purple-400';
      case 'RUN': return 'text-emerald-400';
      case 'FAULT': return 'text-red-500';
      default: return 'text-slate-400';
    }
  };

  const currentData = dataLog[dataLog.length - 1] || { vBus: 0, schmitt: 0, precharge: 0, airPlus: 0, airMinus: 0 };
  const busColor = currentData.vBus > 5 ? `rgba(239, 68, 68, ${Math.max(0.4, currentData.vBus / 100)})` : '#475569';
  const gndColor = currentData.airMinus ? '#3b82f6' : '#475569';

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex justify-between items-center border-b border-slate-700 pb-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Zap className="text-yellow-400" />
              Aeoulus Precharge Dashboard (KiCad Sync)
            </h1>
            <p className="text-slate-400 text-sm mt-1">3-Contactor Logic Simulation & Timing Analysis</p>
          </div>
          <div className={`px-4 py-2 rounded-full font-bold flex items-center gap-2 bg-slate-800 border border-slate-700 ${getStatusColor()}`}>
            <Activity size={18} />
            STATE: {status}
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Controls */}
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl space-y-6">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold border-b border-slate-600 pb-2">MCU Parameters</h2>
              <div>
                <label className="flex justify-between text-sm text-slate-300 mb-1">
                  <span>Physical Charge Time (RC τ)</span>
                  <span>{params.tau} ms</span>
                </label>
                <input type="range" name="tau" min="50" max="600" value={params.tau} onChange={handleParamChange} className="w-full accent-blue-500" disabled={status !== 'STANDBY'} />
              </div>
              <div>
                <label className="flex justify-between text-sm text-slate-300 mb-1">
                  <span>MCU Overlap Delay</span>
                  <span className={params.overlapDelay === 0 ? "text-red-400 font-bold" : ""}>{params.overlapDelay} ms</span>
                </label>
                <input type="range" name="overlapDelay" min="0" max="300" step="10" value={params.overlapDelay} onChange={handleParamChange} className="w-full accent-purple-500" disabled={status !== 'STANDBY'} />
              </div>
              <div>
                <label className="flex justify-between text-sm text-slate-300 mb-1">
                  <span>MCU Timeout Limit</span>
                  <span>{params.timeoutLimit} ms</span>
                </label>
                <input type="range" name="timeoutLimit" min="300" max="2000" step="100" value={params.timeoutLimit} onChange={handleParamChange} className="w-full accent-red-500" disabled={status !== 'STANDBY'} />
              </div>
              <label className="flex items-center gap-3 p-3 bg-slate-900 rounded-lg border border-slate-700 cursor-pointer hover:bg-slate-700 transition">
                <input type="checkbox" name="shortCircuit" checked={params.shortCircuit} onChange={handleParamChange} disabled={status !== 'STANDBY'} className="w-5 h-5 accent-red-500" />
                <span className="text-sm font-medium text-red-200">Simulate Short Circuit (Fault Test)</span>
              </label>
            </div>
            <div className="flex gap-3 pt-4 border-t border-slate-600">
              <button onClick={startSimulation} disabled={status !== 'STANDBY'} className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition">
                <Play size={18} /> START IGNITION
              </button>
              <button onClick={resetSimulation} className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-3 rounded-lg font-bold flex items-center justify-center transition" title="Reset Simulation">
                <RotateCcw size={18} />
              </button>
            </div>
          </div>

          {/* Live Circuit Schematic */}
          <div className="lg:col-span-2 bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl flex flex-col">
            <h2 className="text-lg font-semibold border-b border-slate-600 pb-2 mb-4">Live Hardware Block Diagram (Aeoulus Config)</h2>
            <div className="relative flex-1 bg-slate-900 rounded-lg border border-slate-700 flex items-center justify-center p-4 min-h-[280px]">
              <svg width="100%" height="100%" viewBox="0 0 500 280" className="max-w-full font-mono">
                
                {/* --- NEGATIVE RAIL (AIR-) --- */}
                <line x1="60" y1="180" x2="150" y2="180" stroke="#3b82f6" strokeWidth="4"/>
                <line x1="150" y1="180" x2={currentData.airMinus ? 190 : 185} y2={currentData.airMinus ? 180 : 165} stroke="#3b82f6" strokeWidth="4" className="transition-all duration-75"/>
                <line x1="190" y1="180" x2="440" y2="180" stroke={gndColor} strokeWidth="4"/>
                <text x="170" y="205" fill="#60a5fa" fontSize="10" textAnchor="middle">AIR-</text>
                
                {/* --- POSITIVE RAIL (PRECHARGE & AIR+) --- */}
                {/* Main Split */}
                <line x1="60" y1="80" x2="90" y2="80" stroke={busColor} strokeWidth="4"/>
                <line x1="90" y1="50" x2="90" y2="110" stroke={busColor} strokeWidth="4"/>
                
                {/* Precharge Branch */}
                <line x1="90" y1="50" x2="150" y2="50" stroke={busColor} strokeWidth="4"/>
                <line x1="150" y1="50" x2={currentData.precharge ? 190 : 185} y2={currentData.precharge ? 50 : 35} stroke={busColor} strokeWidth="4" className="transition-all duration-75"/>
                <rect x="190" y="40" width="40" height="20" fill="#1e293b" stroke={busColor} strokeWidth="2"/>
                <text x="210" y="54" fill="#94a3b8" fontSize="12" textAnchor="middle">100Ω</text>
                <line x1="230" y1="50" x2="260" y2="50" stroke={busColor} strokeWidth="4"/>
                <text x="170" y="30" fill="#fb923c" fontSize="10" textAnchor="middle">PRE-CHARGE</text>

                {/* AIR+ Branch */}
                <line x1="90" y1="110" x2="150" y2="110" stroke={busColor} strokeWidth="4"/>
                <line x1="150" y1="110" x2={currentData.airPlus ? 190 : 185} y2={currentData.airPlus ? 110 : 95} stroke={busColor} strokeWidth="4" className="transition-all duration-75"/>
                <line x1="190" y1="110" x2="260" y2="110" stroke={busColor} strokeWidth="4"/>
                <text x="170" y="135" fill="#34d399" fontSize="10" textAnchor="middle">AIR+</text>

                {/* Rejoin Positive */}
                <line x1="260" y1="50" x2="260" y2="110" stroke={busColor} strokeWidth="4"/>
                <line x1="260" y1="80" x2="440" y2="80" stroke={busColor} strokeWidth="4"/>

                {/* Battery Block */}
                <rect x="20" y="40" width="40" height="160" rx="4" fill="#334155" stroke="#94a3b8" strokeWidth="2"/>
                <text x="40" y="120" fill="white" fontSize="12" textAnchor="middle" transform="rotate(-90 40,120)">HV PACK</text>
                <circle cx="60" cy="80" r="4" fill="#ef4444"/>
                <circle cx="60" cy="180" r="4" fill="#3b82f6"/>

                {/* Motor Controller Block */}
                <rect x="440" y="40" width="50" height="160" rx="4" fill="#334155" stroke="#94a3b8" strokeWidth="2"/>
                <text x="465" y="120" fill="white" fontSize="10" textAnchor="middle" transform="rotate(-90 465,120)">INVERTER</text>
                {/* Capacitor Graphic */}
                <line x1="440" y1="130" x2="455" y2="130" stroke={busColor} strokeWidth="2"/>
                <line x1="455" y1="115" x2="455" y2="145" stroke={busColor} strokeWidth="4"/>
                <line x1="465" y1="115" x2="465" y2="145" stroke={gndColor} strokeWidth="4"/>
                <line x1="465" y1="130" x2="490" y2="130" stroke={gndColor} strokeWidth="2"/>
                <text x="465" y="165" fill="white" fontSize="12" textAnchor="middle">{Math.round(currentData.vBus)}%</text>
                
                {/* U3A Schmitt Trigger */}
                <polygon points="380,190 380,250 320,220" fill="#1e293b" stroke={currentData.schmitt ? "#facc15" : "#64748b"} strokeWidth="2"/>
                <text x="360" y="224" fill={currentData.schmitt ? "#facc15" : "#94a3b8"} fontSize="12" textAnchor="middle">U3A</text>
                <path d="M 350 80 L 350 210 L 320 210" stroke={busColor} strokeWidth="2" fill="none" strokeDasharray="2 2"/>
                <text x="310" y="200" fill="#94a3b8" fontSize="8">HV_SENSE_SAFE</text>

                {/* Microcontroller (STM32) */}
                <rect x="120" y="210" width="100" height="60" rx="4" fill="#1e293b" stroke="#38bdf8" strokeWidth="2"/>
                <text x="170" y="245" fill="#38bdf8" fontSize="14" fontWeight="bold" textAnchor="middle">STM32</text>
                
                {/* Logic Wires to STM32 */}
                {/* Schmitt to MCU (STM Input) */}
                <line x1="320" y1="220" x2="220" y2="220" stroke={currentData.schmitt ? "#facc15" : "#475569"} strokeWidth="2" strokeDasharray="4 4"/>
                <text x="270" y="215" fill="#facc15" fontSize="8" textAnchor="middle">STM Input</text>
                <circle cx="220" cy="220" r="3" fill="#38bdf8"/>
                
                {/* MCU to PRECHARGE */}
                <path d="M 135 210 L 135 70" stroke={currentData.precharge ? "#fb923c" : "#475569"} strokeWidth="2" strokeDasharray="4 4" fill="none" />
                <circle cx="135" cy="70" r="3" fill="#fb923c"/>
                
                {/* MCU to AIR+ */}
                <path d="M 165 210 L 165 130" stroke={currentData.airPlus ? "#34d399" : "#475569"} strokeWidth="2" strokeDasharray="4 4" fill="none" />
                <circle cx="165" cy="130" r="3" fill="#34d399"/>

                {/* MCU to AIR- */}
                <path d="M 195 210 L 195 195 L 170 195" stroke={currentData.airMinus ? "#60a5fa" : "#475569"} strokeWidth="2" strokeDasharray="4 4" fill="none" />
                <circle cx="170" cy="195" r="3" fill="#60a5fa"/>
              </svg>
            </div>
          </div>
        </div>

        {/* Oscilloscope */}
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl flex flex-col">
          <h2 className="text-lg font-semibold border-b border-slate-600 pb-2 mb-4 flex justify-between">
            <span>Logic Timing Diagram</span>
            <span className="text-sm text-slate-400 font-mono"><Clock size={14} className="inline mr-1"/>{currentTime} / {MAX_SIM_TIME_MS} ms</span>
          </h2>

          <div className="relative h-[400px] bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-24 bg-slate-800/80 border-r border-slate-700 flex flex-col text-xs font-mono text-slate-400 z-10">
              <div className="flex-1 flex flex-col justify-center px-2 border-b border-slate-700/50">
                <span className="text-blue-400 font-bold">CH1: V_BUS</span>
              </div>
              <div className="h-16 flex flex-col justify-center px-2 border-b border-slate-700/50">
                <span className="text-yellow-400 font-bold">CH2: U3A</span>
                <span>(STM In)</span>
              </div>
              <div className="h-16 flex flex-col justify-center px-2 border-b border-slate-700/50">
                <span className="text-orange-400 font-bold">CH3: PRE</span>
                <span>CTRL_PRE</span>
              </div>
              <div className="h-16 flex flex-col justify-center px-2">
                <span className="text-emerald-400 font-bold">CH4: AIR+</span>
                <span>CTRL_AIR+</span>
              </div>
            </div>

            <div className="absolute left-24 right-0 top-0 bottom-0">
              <svg width="100%" height="100%" viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="none">
                {[0, 1, 2, 3, 4, 5].map(i => (
                  <line key={`v-${i}`} x1={i * (svgWidth/5)} y1="0" x2={i * (svgWidth/5)} y2={svgHeight} stroke="#334155" strokeWidth="1" strokeDasharray="4 4" />
                ))}
                
                <line x1="0" y1={(svgHeight - 192) - (95/100)*(svgHeight - 192)} x2={svgWidth} y2={(svgHeight - 192) - (95/100)*(svgHeight - 192)} stroke="#ef4444" strokeWidth="1" strokeDasharray="5 5" opacity="0.5" />

                {renderAnalogLine('vBus', svgHeight - 192 - 10, 10, '#60a5fa', 100)}
                {renderDigitalLine('schmitt', 50, svgHeight - 192, '#facc15')}
                {renderDigitalLine('precharge', 50, svgHeight - 128, '#fb923c')}
                {renderDigitalLine('airPlus', 50, svgHeight - 64, '#34d399')}
                
                {simRef.current.isRunning && (
                  <line x1={getX(currentTime)} y1="0" x2={getX(currentTime)} y2={svgHeight} stroke="#ffffff" strokeWidth="1" opacity="0.5" />
                )}
              </svg>

              <div className="absolute bottom-0 w-full flex justify-between text-[10px] text-slate-500 px-1 pt-1 bg-slate-900/80">
                <span>0ms</span>
                <span>{MAX_SIM_TIME_MS / 2}ms</span>
                <span>{MAX_SIM_TIME_MS}ms</span>
              </div>
            </div>
          </div>

          {/* Status Explanations */}
          <div className="mt-4 p-4 bg-slate-900 rounded-lg border border-slate-700 min-h-[80px] flex items-center">
            {status === 'STANDBY' && (
              <p className="text-slate-400"><span className="text-white font-bold">Ready.</span> Note: AIR- closes simultaneously with PRE-CHARGE at ignition.</p>
            )}
            {status === 'PRECHARGING' && (
              <p className="text-blue-300"><span className="font-bold">Precharging...</span> MCU set CTRL_AIR_MINUS and CTRL_PRECHARGE High. Waiting for U3A to hit 95%.</p>
            )}
            {status === 'OVERLAP' && (
              <p className="text-purple-300"><span className="font-bold">Overlap Sequence!</span> U3A fired. MCU commanded CTRL_AIR_PLUS High. Holding overlap for {params.overlapDelay}ms.</p>
            )}
            {status === 'RUN' && (
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle size={20} />
                <p><span className="font-bold">Drive Mode.</span> CTRL_PRECHARGE is Low. Power flows via AIR+ and AIR-.</p>
              </div>
            )}
            {status === 'FAULT' && (
              <div className="flex items-center gap-2 text-red-500">
                <AlertTriangle size={20} />
                <p><span className="font-bold">MCU Timeout!</span> Voltage failed to rise. All contactors aborted.</p>
              </div>
            )}
          </div>
        </div>

        {/* Hardware Architecture Description Panel */}
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl mt-6">
          <h2 className="text-xl font-bold border-b border-slate-600 pb-3 mb-4 flex items-center gap-2">
            <Zap className="text-yellow-400" />
            Aeoulus Hardware Architecture (Schematic V2)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm text-slate-300">
            <div className="space-y-5">
              <div>
                <h3 className="text-blue-400 font-bold mb-1">Stage 1: HV Attenuation</h3>
                <p>A <strong>1MegΩ / 5kΩ</strong> resistive voltage divider reduces the raw HV pack voltage down to a safe, measurable low-voltage range suitable for the isolation amplifier.</p>
              </div>
              <div>
                <h3 className="text-blue-400 font-bold mb-1">Stage 2: Galvanic Isolation (U1)</h3>
                <p>The stepped-down HV signal passes through an <strong>ISO224 (U1)</strong> precision isolation amplifier. This safely bridges the high-voltage and low-voltage domains, outputting a proportional differential signal.</p>
              </div>
              <div>
                <h3 className="text-blue-400 font-bold mb-1">Stage 3: Single-Ended Conversion (U2)</h3>
                <p>An operational amplifier <strong>(U2)</strong> configured as a difference amplifier converts the ISO224's differential output into a clean, single-ended, ground-referenced analog voltage labeled <strong>HV_SENSE_SAFE</strong>.</p>
              </div>
            </div>
            
            <div className="space-y-5">
              <div>
                <h3 className="text-blue-400 font-bold mb-1">Stage 4: Hardware Schmitt Trigger (U3A)</h3>
                <p>A dedicated voltage comparator <strong>LM393 (U3A)</strong> monitors HV_SENSE_SAFE against an adjustable reference voltage.</p>
                <ul className="list-disc pl-5 mt-2 space-y-1 text-slate-400">
                  <li><strong>RV1 Trimmer:</strong> Tuned to represent 95% of the maximum HV pack voltage.</li>
                  <li><strong>Hysteresis (R13):</strong> A 100kΩ resistor provides positive feedback to prevent signal chatter.</li>
                  <li><strong>MCU Interface (R14):</strong> When the bus reaches 95%, the open-collector output releases, allowing the <strong>10kΩ pull-up resistor (R14)</strong> to snap the <strong>STM Input</strong> line HIGH to 3.3V.</li>
                </ul>
              </div>
              <div className="mt-4 p-3 bg-slate-900 border border-slate-700 rounded text-xs text-slate-400 flex items-start gap-2">
                <AlertTriangle size={16} className="text-yellow-500 shrink-0" />
                <span><strong>Design Note:</strong> The schematic utilizes a 3-contactor setup. The MCU manages CTRL_AIR_MINUS, CTRL_PRECHARGE, and CTRL_AIR_PLUS independently, triggered by the STM Input from U3A.</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
