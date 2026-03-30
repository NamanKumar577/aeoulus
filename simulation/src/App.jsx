import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, RotateCcw, AlertTriangle, CheckCircle, Zap, Clock, Activity } from 'lucide-react';

const MAX_SIM_TIME_MS = 2500;
const TICK_RATE_MS = 20;

export default function App() {
  // --- Simulation Parameters ---
  const [params, setParams] = useState({
    tau: 300,             // RC time constant (determines charge speed)
    overlapDelay: 100,    // MCU programmed delay (Make-Before-Break)
    timeoutLimit: 1000,   // MCU fault timeout
    shortCircuit: false   // Simulates a fault where voltage won't rise
  });

  // --- Simulation State ---
  const [status, setStatus] = useState('STANDBY'); // STANDBY, PRECHARGING, OVERLAP, RUN, FAULT
  const [currentTime, setCurrentTime] = useState(0);
  const [dataLog, setDataLog] = useState([]);
  
  // Refs for loop mutability without triggering re-renders inside the loop
  const simRef = useRef({
    isRunning: false,
    time: 0,
    vBus: 0,
    schmittHigh: false,
    prechargeCmd: 0,
    mainCmd: 0,
    timeAt95: null,
    status: 'STANDBY'
  });

  const timerRef = useRef(null);

  // --- Core Simulation Logic ---
  const tick = useCallback(() => {
    if (!simRef.current.isRunning) return;

    const state = simRef.current;
    state.time += TICK_RATE_MS;

    // 1. Calculate physical voltage (RC charge curve)
    if (state.status === 'PRECHARGING' || state.status === 'OVERLAP') {
      if (params.shortCircuit) {
        // Voltage barely rises if there is a dead short
        state.vBus = Math.min(state.vBus + 0.5, 10); 
      } else {
        // Standard capacitor charging equation: V = Vmax * (1 - e^(-t/RC))
        // We calculate delta to make it continuous
        const target = 100;
        state.vBus = state.vBus + (target - state.vBus) * (TICK_RATE_MS / params.tau);
      }
    }

    // 2. Hardware Schmitt Trigger Logic (95% threshold)
    if (state.vBus >= 95 && !state.schmittHigh) {
      state.schmittHigh = true;
      state.timeAt95 = state.time;
      
      if (state.status === 'PRECHARGING') {
        state.status = 'OVERLAP';
        state.mainCmd = 1; // IMMEDIATELY close main contactor (Make)
      }
    }

    // 3. MCU Timeout Logic
    if (state.status === 'PRECHARGING' && state.time >= params.timeoutLimit) {
      state.status = 'FAULT';
      state.prechargeCmd = 0;
      state.mainCmd = 0;
      state.isRunning = false;
    }

    // 4. MCU Overlap / Make-Before-Break Logic
    if (state.status === 'OVERLAP') {
      if (state.time >= state.timeAt95 + params.overlapDelay) {
        state.prechargeCmd = 0; // Open precharge relay (Break)
        state.status = 'RUN';
      }
    }

    // Stop simulation when reaching the end of the graph
    if (state.time >= MAX_SIM_TIME_MS) {
      state.isRunning = false;
    }

    // Update React state for UI rendering
    setCurrentTime(state.time);
    setStatus(state.status);
    
    // Log data for the oscilloscope
    setDataLog(prev => [...prev, {
      time: state.time,
      vBus: state.vBus,
      schmitt: state.schmittHigh ? 1 : 0,
      precharge: state.prechargeCmd,
      main: state.mainCmd
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
  }, [tick, status]); // Re-bind if status changes to catch isRunning updates

  const startSimulation = () => {
    setDataLog([]);
    simRef.current = {
      isRunning: true,
      time: 0,
      vBus: 0,
      schmittHigh: false,
      prechargeCmd: 1, // Start by closing precharge
      mainCmd: 0,
      timeAt95: null,
      status: 'PRECHARGING'
    };
    setCurrentTime(0);
    setStatus('PRECHARGING');
    
    // Log time 0
    setDataLog([{
      time: 0, vBus: 0, schmitt: 0, precharge: 1, main: 0
    }]);
  };

  const resetSimulation = () => {
    simRef.current.isRunning = false;
    setDataLog([]);
    setCurrentTime(0);
    setStatus('STANDBY');
    simRef.current = {
      isRunning: false, time: 0, vBus: 0, schmittHigh: false,
      prechargeCmd: 0, mainCmd: 0, timeAt95: null, status: 'STANDBY'
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
      const y = d[key] === 1 ? yOffset + 5 : yOffset + height; // 5px padding from top
      
      // Draw vertical line if state changed, then horizontal
      if (y !== lastY) {
        path += ` L ${x},${lastY} L ${x},${y}`;
        lastY = y;
      } else {
        path += ` L ${x},${y}`;
      }
    });
    
    return <path d={path} fill="none" stroke={color} strokeWidth="3" />;
  };

  // --- UI Components ---
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

  const currentData = dataLog[dataLog.length - 1] || { vBus: 0, schmitt: 0, precharge: 0, main: 0 };
  const busColor = currentData.vBus > 5 ? `rgba(239, 68, 68, ${Math.max(0.4, currentData.vBus / 100)})` : '#475569';

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex justify-between items-center border-b border-slate-700 pb-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Zap className="text-yellow-400" />
              Hybrid Precharge Controller (Hardware Schmitt + STM32)
            </h1>
            <p className="text-slate-400 text-sm mt-1">Logic Simulation & Timing Analysis</p>
          </div>
          <div className={`px-4 py-2 rounded-full font-bold flex items-center gap-2 bg-slate-800 border border-slate-700 ${getStatusColor()}`}>
            <Activity size={18} />
            STATE: {status}
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Panel: Controls */}
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl space-y-6">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold border-b border-slate-600 pb-2">MCU Parameters</h2>
              
              <div>
                <label className="flex justify-between text-sm text-slate-300 mb-1">
                  <span>Physical Charge Time (RC τ)</span>
                  <span>{params.tau} ms</span>
                </label>
                <input type="range" name="tau" min="50" max="600" value={params.tau} onChange={handleParamChange} className="w-full accent-blue-500" disabled={status !== 'STANDBY'} />
                <p className="text-xs text-slate-500 mt-1">Simulates battery/capacitor physical characteristics.</p>
              </div>

              <div>
                <label className="flex justify-between text-sm text-slate-300 mb-1">
                  <span>MCU Overlap Delay</span>
                  <span className={params.overlapDelay === 0 ? "text-red-400 font-bold" : ""}>{params.overlapDelay} ms</span>
                </label>
                <input type="range" name="overlapDelay" min="0" max="300" step="10" value={params.overlapDelay} onChange={handleParamChange} className="w-full accent-purple-500" disabled={status !== 'STANDBY'} />
                <p className="text-xs text-slate-500 mt-1">Make-Before-Break delay programmed in STM32.</p>
              </div>

              <div>
                <label className="flex justify-between text-sm text-slate-300 mb-1">
                  <span>MCU Timeout Limit</span>
                  <span>{params.timeoutLimit} ms</span>
                </label>
                <input type="range" name="timeoutLimit" min="300" max="2000" step="100" value={params.timeoutLimit} onChange={handleParamChange} className="w-full accent-red-500" disabled={status !== 'STANDBY'} />
                <p className="text-xs text-slate-500 mt-1">Max time allowed to hit 95% before faulting.</p>
              </div>

              <label className="flex items-center gap-3 p-3 bg-slate-900 rounded-lg border border-slate-700 cursor-pointer hover:bg-slate-700 transition">
                <input type="checkbox" name="shortCircuit" checked={params.shortCircuit} onChange={handleParamChange} disabled={status !== 'STANDBY'} className="w-5 h-5 accent-red-500" />
                <span className="text-sm font-medium text-red-200">Simulate Short Circuit (Fault Test)</span>
              </label>
            </div>

            <div className="flex gap-3 pt-4 border-t border-slate-600">
              <button 
                onClick={startSimulation} 
                disabled={status !== 'STANDBY'}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition"
              >
                <Play size={18} /> START IGNITION
              </button>
              <button 
                onClick={resetSimulation}
                className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-3 rounded-lg font-bold flex items-center justify-center transition"
                title="Reset Simulation"
              >
                <RotateCcw size={18} />
              </button>
            </div>
          </div>

          {/* Right Panel: Live Circuit Schematic */}
          <div className="lg:col-span-2 bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl flex flex-col">
            <h2 className="text-lg font-semibold border-b border-slate-600 pb-2 mb-4">
              Live Hardware Block Diagram
            </h2>
            <div className="relative flex-1 bg-slate-900 rounded-lg border border-slate-700 flex items-center justify-center p-4 min-h-[280px]">
              <svg width="100%" height="100%" viewBox="0 0 500 280" className="max-w-full font-mono">
                {/* Ground Line */}
                <line x1="60" y1="160" x2="440" y2="160" stroke="#475569" strokeWidth="4"/>
                
                {/* Precharge Line & Components */}
                <line x1="60" y1="60" x2="150" y2="60" stroke={busColor} strokeWidth="4"/>
                <line x1="150" y1="60" x2={currentData.precharge ? 190 : 185} y2={currentData.precharge ? 60 : 45} stroke={busColor} strokeWidth="4" className="transition-all duration-75"/>
                <rect x="190" y="50" width="40" height="20" fill="#1e293b" stroke={busColor} strokeWidth="2"/>
                <text x="210" y="64" fill="#94a3b8" fontSize="12" textAnchor="middle">R</text>
                <line x1="230" y1="60" x2="440" y2="60" stroke={busColor} strokeWidth="4"/>
                <text x="170" y="30" fill="#fb923c" fontSize="10" textAnchor="middle">PRECHARGE RELAY</text>

                {/* Main Line & Switch */}
                <line x1="60" y1="110" x2="150" y2="110" stroke={busColor} strokeWidth="4"/>
                <line x1="150" y1="110" x2={currentData.main ? 190 : 185} y2={currentData.main ? 110 : 95} stroke={busColor} strokeWidth="4" className="transition-all duration-75"/>
                <line x1="190" y1="110" x2="440" y2="110" stroke={busColor} strokeWidth="4"/>
                <text x="170" y="135" fill="#34d399" fontSize="10" textAnchor="middle">MAIN AIR</text>

                {/* Battery Block */}
                <rect x="20" y="40" width="40" height="140" rx="4" fill="#334155" stroke="#94a3b8" strokeWidth="2"/>
                <text x="40" y="110" fill="white" fontSize="12" textAnchor="middle" transform="rotate(-90 40,110)">HV PACK</text>
                <circle cx="60" cy="60" r="4" fill="#ef4444"/>
                <circle cx="60" cy="110" r="4" fill="#ef4444"/>
                <circle cx="60" cy="160" r="4" fill="#3b82f6"/>

                {/* Motor Controller Block */}
                <rect x="440" y="40" width="50" height="140" rx="4" fill="#334155" stroke="#94a3b8" strokeWidth="2"/>
                <text x="465" y="110" fill="white" fontSize="10" textAnchor="middle" transform="rotate(-90 465,110)">INVERTER</text>
                {/* Capacitor Graphic */}
                <line x1="440" y1="90" x2="455" y2="90" stroke={busColor} strokeWidth="2"/>
                <line x1="455" y1="75" x2="455" y2="105" stroke={busColor} strokeWidth="4"/>
                <line x1="465" y1="75" x2="465" y2="105" stroke="#475569" strokeWidth="4"/>
                <line x1="465" y1="90" x2="490" y2="90" stroke="#475569" strokeWidth="2"/>
                <text x="465" y="130" fill="white" fontSize="12" textAnchor="middle">{Math.round(currentData.vBus)}%</text>
                
                {/* Schmitt Trigger */}
                <polygon points="380,180 380,240 320,210" fill="#1e293b" stroke={currentData.schmitt ? "#facc15" : "#64748b"} strokeWidth="2"/>
                <text x="360" y="214" fill={currentData.schmitt ? "#facc15" : "#94a3b8"} fontSize="12" textAnchor="middle">95%</text>
                <path d="M 420 60 L 420 210 L 380 210" stroke={busColor} strokeWidth="2" fill="none" strokeDasharray="2 2"/>
                <text x="400" y="200" fill="#94a3b8" fontSize="8">SENSE</text>

                {/* Microcontroller (STM32) */}
                <rect x="120" y="190" width="100" height="60" rx="4" fill="#1e293b" stroke="#38bdf8" strokeWidth="2"/>
                <text x="170" y="225" fill="#38bdf8" fontSize="14" fontWeight="bold" textAnchor="middle">STM32</text>
                
                {/* Logic Wires */}
                {/* Schmitt to MCU */}
                <line x1="320" y1="210" x2="220" y2="210" stroke={currentData.schmitt ? "#facc15" : "#475569"} strokeWidth="2" strokeDasharray="4 4"/>
                <circle cx="220" cy="210" r="3" fill="#38bdf8"/>
                {/* MCU to Precharge */}
                <path d="M 150 190 L 150 70" stroke={currentData.precharge ? "#fb923c" : "#475569"} strokeWidth="2" strokeDasharray="4 4" fill="none" />
                <circle cx="150" cy="70" r="3" fill="#fb923c"/>
                {/* MCU to Main */}
                <path d="M 180 190 L 180 120" stroke={currentData.main ? "#34d399" : "#475569"} strokeWidth="2" strokeDasharray="4 4" fill="none" />
                <circle cx="180" cy="120" r="3" fill="#34d399"/>
              </svg>
            </div>
          </div>
        </div>

        {/* Bottom Panel: Oscilloscope / Timing Diagram */}
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl flex flex-col">
          <h2 className="text-lg font-semibold border-b border-slate-600 pb-2 mb-4 flex justify-between">
            <span>Logic Timing Diagram</span>
            <span className="text-sm text-slate-400 font-mono"><Clock size={14} className="inline mr-1"/>{currentTime} / {MAX_SIM_TIME_MS} ms</span>
          </h2>

          <div className="relative h-[400px] bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
                <p className="text-blue-300"><span className="font-bold">Precharging...</span> MCU has closed Precharge Relay. Waiting for hardware Schmitt Trigger (CH2) to fire at 95% bus voltage.</p>
              )}
              {status === 'OVERLAP' && (
                <p className="text-purple-300"><span className="font-bold">Make-Before-Break Overlap!</span> Schmitt fired. MCU immediately commanded Main Contactor CLOSED. MCU is now waiting {params.overlapDelay}ms before opening Precharge.</p>
              )}
              {status === 'RUN' && (
                <div className="flex items-center gap-2 text-emerald-400">
                  <CheckCircle size={20} />
                  <p><span className="font-bold">Drive Mode Active.</span> Sequence successful. Main contactor holds the load.</p>
                  {params.overlapDelay === 0 && (
                    <span className="text-red-400 text-sm ml-2 font-bold flex items-center gap-1"><AlertTriangle size={14}/> DANGER: 0ms Overlap causes power interruption!</span>
                  )}
                </div>
              )}
              {status === 'FAULT' && (
                <div className="flex items-center gap-2 text-red-500">
                  <AlertTriangle size={20} />
                  <p><span className="font-bold">MCU Timeout Fault!</span> Voltage did not reach 95% within {params.timeoutLimit}ms. MCU aborted sequence to prevent precharge resistor fire.</p>
                </div>
              )}
            </div>
          </div>

        {/* --- Hardware Architecture Description Panel --- */}
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl mt-6">
          <h2 className="text-xl font-bold border-b border-slate-600 pb-3 mb-4 flex items-center gap-2">
            <Zap className="text-yellow-400" />
            Hardware Architecture & Signal Flow
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm text-slate-300">
            <div className="space-y-5">
              <p className="text-slate-200">
                <strong className="text-white text-base">Overview:</strong><br/>
                This circuit safely steps down, isolates, and monitors the High Voltage (HV) traction bus. It provides both a continuous analog telemetry signal and a hardware-level digital trigger to the MCU for executing the Make-Before-Break precharge contactor sequence.
              </p>
              <div>
                <h3 className="text-blue-400 font-bold mb-1">Stage 1: HV Attenuation</h3>
                <p>A 1MΩ / 5kΩ resistive voltage divider reduces the raw HV pack voltage down to a safe, measurable low-voltage range suitable for the isolation amplifier.</p>
              </div>
              <div>
                <h3 className="text-blue-400 font-bold mb-1">Stage 2: Galvanic Isolation (ISO224)</h3>
                <p>The stepped-down HV signal passes through an ISO224 precision isolation amplifier. This safely bridges the high-voltage and low-voltage domains, outputting a proportional differential signal while protecting the low-voltage control electronics from deadly potentials.</p>
              </div>
            </div>
            
            <div className="space-y-5">
              <div>
                <h3 className="text-blue-400 font-bold mb-1">Stage 3: Differential to Single-Ended Conversion</h3>
                <p>An operational amplifier (U2) configured as a difference amplifier converts the ISO224's differential output into a clean, single-ended, ground-referenced analog voltage (HV_SENSE_SAFE).</p>
              </div>
              <div>
                <h3 className="text-blue-400 font-bold mb-1">Stage 4: Hardware Schmitt Trigger (LM393)</h3>
                <p>A dedicated voltage comparator (U3A) monitors HV_SENSE_SAFE against an adjustable reference voltage set by trimmer RV1.</p>
                <ul className="list-disc pl-5 mt-2 space-y-1 text-slate-400">
                  <li>RV1 is tuned to represent 95% of the maximum HV pack voltage.</li>
                  <li>R13 (100kΩ) provides positive feedback (hysteresis) to prevent signal chatter.</li>
                  <li>When the bus reaches 95%, the open-collector output releases, allowing an external 3.3V pull-up resistor to snap the STM32 input line HIGH. This hardware trigger commands the MCU to immediately close the Main AIR and subsequently open the Precharge relay.</li>
                </ul>
              </div>
              <div className="mt-4 p-3 bg-slate-900 border border-slate-700 rounded text-xs text-slate-400 flex items-start gap-2">
                <AlertTriangle size={16} className="text-yellow-500 shrink-0" />
                <span><strong>Note:</strong> Unused comparator inputs (U3B) are tied to GND to prevent parasitic oscillation from EV powertrain EMI.</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
