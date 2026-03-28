import React, { useState, useEffect, useRef } from 'react';

export default function ContactorSimulator() {
  const [sdcEnabled, setSdcEnabled] = useState(false);
  const [capVoltage, setCapVoltage] = useState(0);
  const [relayEnergized, setRelayEnergized] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [logs, setLogs] = useState([]);
  
  // Electrical Constants
  const BATTERY_VOLTAGE = 600;
  const THRESHOLD_HIGH = BATTERY_VOLTAGE * 0.95; // 570V
  const THRESHOLD_LOW = BATTERY_VOLTAGE * 0.90;  // 540V (Hysteresis)
  const PRECHARGE_RESISTANCE = 100; // Ohms
  
  // Discharge Physics Constants
  const DISCHARGE_RESISTANCE = 5600; // 5.6 kOhm PB171
  const INVERTER_CAPACITANCE = 0.0003; // 300 uF assumption
  const RC_TIME_CONSTANT = DISCHARGE_RESISTANCE * INVERTER_CAPACITANCE; // 1.68 seconds

  // Derived Physics Metrics
  const voltageDiff = BATTERY_VOLTAGE - capVoltage;
  const currentDraw = (sdcEnabled && !relayEnergized) ? (voltageDiff / PRECHARGE_RESISTANCE) : (relayEnergized ? 2.5 : 0);
  const powerDissipation = (sdcEnabled && !relayEnergized) ? (currentDraw * currentDraw * PRECHARGE_RESISTANCE) : 0;
  
  // Discharge Peak Power (for 5.6k resistor)
  const dischargePower = (!sdcEnabled && capVoltage > 1) ? ((capVoltage * capVoltage) / DISCHARGE_RESISTANCE) : 0;

  const addLog = (msg) => {
    const time = new Date().toISOString().substring(14, 23);
    setLogs(prev => [{ time, msg }, ...prev].slice(0, 7));
  };

  const prevSdc = useRef(sdcEnabled);
  const prevRelay = useRef(relayEnergized);
  const prevPaused = useRef(isPaused);

  // SDC state listener
  useEffect(() => {
    if (sdcEnabled !== prevSdc.current) {
      if (sdcEnabled) {
        addLog("⚡ SDC Closed: 24V Control Power Active");
        addLog("🔌 NC SSR OPENED (Discharge Paused)");
      } else {
        addLog("🛑 SDC Opened: System Fault / Emergency Kill");
        addLog("⚠️ NC SSR CLOSED. 5.6kΩ Bleed ACTIVATED!");
      }
      prevSdc.current = sdcEnabled;
    }
  }, [sdcEnabled]);

  // Relay state listener
  useEffect(() => {
    if (relayEnergized !== prevRelay.current) {
      if (relayEnergized) addLog("✅ 95% Reached: AIR+ CLOSED, Precharge OPENED");
      else if (sdcEnabled) addLog("⚠️ Voltage Dropped below 90%: Reverting to Precharge");
      prevRelay.current = relayEnergized;
    }
  }, [relayEnergized, sdcEnabled]);

  // Pause state listener
  useEffect(() => {
    if (isPaused !== prevPaused.current) {
      if (isPaused) addLog("⏸️ SIMULATION PAUSED");
      else addLog("▶️ SIMULATION RESUMED");
      prevPaused.current = isPaused;
    }
  }, [isPaused]);

  // Main Simulation Physics Loop
  useEffect(() => {
    if (isPaused) return; // Halt the physics loop if paused

    let interval = setInterval(() => {
      setCapVoltage((prevV) => {
        if (!sdcEnabled) {
          if (relayEnergized) setRelayEnergized(false);
          // Precise Active Discharge Curve for 5.6kOhm + 300uF Cap
          // dt = 0.05s. V(t) = V0 * e^(-dt/RC)
          const dischargeMultiplier = Math.exp(-0.05 / RC_TIME_CONSTANT);
          return prevV > 1 ? prevV * dischargeMultiplier : 0;
        }

        let nextV = prevV;
        if (!relayEnergized) {
          // Precharge RC Curve
          nextV = prevV + (BATTERY_VOLTAGE - prevV) * 0.04;
          if (nextV >= THRESHOLD_HIGH) setRelayEnergized(true);
        } else {
          // Direct Connection
          nextV = prevV + (BATTERY_VOLTAGE - prevV) * 0.3;
          if (nextV < THRESHOLD_LOW) setRelayEnergized(false);
        }
        return nextV;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [sdcEnabled, relayEnergized, RC_TIME_CONSTANT, isPaused]);

  const progressPercent = (capVoltage / BATTERY_VOLTAGE) * 100;

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-white font-sans w-full">
      <div className="w-full flex-grow bg-slate-900 shadow-2xl overflow-hidden flex flex-col">
        
        {/* Header Section */}
        <div className="bg-slate-950 p-6 border-b border-slate-800 flex justify-between items-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-2 h-full bg-cyan-500"></div>
          <div className="pl-4">
            <h1 className="text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">AEOLUS TELEMETRY</h1>
            <p className="text-slate-400 text-sm mt-1 font-mono">HV CONTACTOR CONTROL & PRECHARGE SIMULATOR | RULE EV5.7.1 & EV4.9</p>
          </div>
          <div className="flex gap-4 z-10">
            <button
              onClick={() => setIsPaused(!isPaused)}
              className={`px-8 py-5 rounded-xl text-lg font-black tracking-widest uppercase transition-all duration-300 ${
                isPaused 
                  ? 'bg-blue-500 text-white border-2 border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.6)]' 
                  : 'bg-slate-800 text-slate-300 border-2 border-slate-700 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {isPaused ? '▶ RESUME' : '⏸ PAUSE'}
            </button>
            <button
              onClick={() => {
                setSdcEnabled(!sdcEnabled);
                if (isPaused) setIsPaused(false); // Auto-resume if emergency switched while paused
              }}
              className={`px-10 py-5 rounded-xl text-lg font-black tracking-widest uppercase transition-all duration-300 ${
                sdcEnabled 
                  ? 'bg-red-500/10 text-red-500 border-2 border-red-500 hover:bg-red-500 hover:text-white shadow-[0_0_30px_rgba(239,68,68,0.4)]' 
                  : 'bg-green-500/10 text-green-500 border-2 border-green-500 hover:bg-green-500 hover:text-white shadow-[0_0_30px_rgba(34,197,94,0.4)]'
              }`}
            >
              {sdcEnabled ? 'EMERGENCY SHUTDOWN (KILL SDC)' : 'ACTIVATE TRACTIVE SYSTEM'}
            </button>
          </div>
        </div>

        {/* Dashboard Metrics */}
        <div className="grid grid-cols-4 gap-px bg-slate-800 border-b border-slate-800">
          <div className="bg-slate-950 p-6">
            <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${capVoltage > 60 ? 'bg-red-500 animate-pulse' : 'bg-cyan-500'}`}></span> Inverter Capacitor
            </p>
            <p className={`text-6xl font-mono ${capVoltage > 60 ? 'text-red-400' : 'text-white'}`}>
              {Math.round(capVoltage).toString().padStart(3, '0')}<span className="text-2xl text-slate-600 ml-1">VDC</span>
            </p>
            <p className="text-sm text-slate-500 mt-2 font-bold">{capVoltage > 60 ? '⚠️ LETHAL VOLTAGE' : '✅ SAFE (<60V)'}</p>
          </div>
          
          <div className="bg-slate-950 p-6">
            <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${currentDraw > 0 ? 'bg-yellow-500 animate-pulse' : 'bg-slate-600'}`}></span> Current Draw
            </p>
            <p className="text-6xl font-mono text-white">{currentDraw.toFixed(1)}<span className="text-2xl text-slate-600 ml-1">A</span></p>
            <p className="text-sm text-slate-500 mt-2">Nominal Load / Inrush</p>
          </div>

          <div className="bg-slate-950 p-6">
            <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${(!sdcEnabled && capVoltage > 1) ? 'bg-red-500 animate-pulse' : (powerDissipation > 0 ? 'bg-orange-500' : 'bg-slate-600')}`}></span> Peak Thermal Load
            </p>
            <p className={`text-6xl font-mono ${(!sdcEnabled && capVoltage > 1) ? 'text-red-400' : 'text-white'}`}>
              {Math.round(!sdcEnabled ? dischargePower : powerDissipation)}<span className="text-2xl text-slate-600 ml-1">W</span>
            </p>
            <p className="text-sm text-slate-500 mt-2">{!sdcEnabled ? '5.6kΩ PB171 Heat' : '100Ω Precharge Heat'}</p>
          </div>

          <div className="bg-slate-950 p-6">
            <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${isPaused ? 'bg-blue-500' : (sdcEnabled ? (relayEnergized ? 'bg-green-500' : 'bg-yellow-500') : 'bg-slate-600')}`}></span> System State
            </p>
            <p className={`text-3xl font-black mt-3 uppercase ${isPaused ? 'text-blue-400' : (!sdcEnabled ? 'text-slate-600' : (relayEnergized ? 'text-green-400' : 'text-yellow-400'))}`}>
              {isPaused ? 'PAUSED' : (!sdcEnabled ? 'DISCHARGING' : (relayEnergized ? 'TS ACTIVE' : 'PRECHARGING'))}
            </p>
            <p className="text-sm text-slate-500 mt-2 font-mono">Ref: {THRESHOLD_HIGH}V (ON) / {THRESHOLD_LOW}V (OFF)</p>
          </div>
        </div>

        {/* Visual Schematic & Log Area */}
        <div className="flex flex-row flex-grow min-h-[700px]">
          
          {/* Schematic Diagram (Full Width Edge-to-Edge) */}
          <div className="flex-grow bg-slate-950 relative overflow-hidden p-8">
            
            {/* PAUSE OVERLAY (Non-blocking) */}
            {isPaused && (
              <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
                <div className="text-center bg-slate-900/90 border-2 border-blue-500 p-5 rounded-2xl shadow-[0_0_40px_rgba(59,130,246,0.5)]">
                  <h2 className="text-3xl font-black text-white tracking-widest uppercase">
                    SIMULATION PAUSED
                  </h2>
                  <p className="text-blue-300 mt-2 text-sm tracking-widest uppercase font-bold">Physics engine frozen. Values locked for inspection.</p>
                </div>
              </div>
            )}

            <svg className="w-full h-full" viewBox="0 0 1400 650" preserveAspectRatio="xMidYMid meet">
              
              {/* --- HIGH VOLTAGE SECTION --- */}
              
              {/* TSAC (Accumulator) */}
              <rect x="40" y="40" width="120" height="280" rx="12" fill="#0f172a" stroke="#334155" strokeWidth="4" />
              <text x="100" y="180" fill="#94a3b8" fontSize="32" fontWeight="bold" textAnchor="middle" transform="rotate(-90 100,180)">TSAC</text>
              <text x="100" y="280" fill="#ef4444" fontSize="20" fontWeight="bold" textAnchor="middle">600V</text>

              {/* Inverter (Load) & Discharge Circuit */}
              <rect x="1100" y="40" width="250" height="280" rx="12" fill="#0f172a" stroke="#334155" strokeWidth="4" />
              <text x="1130" y="180" fill="#94a3b8" fontSize="28" fontWeight="bold" textAnchor="middle" transform="rotate(-90 1130,180)">INVERTER</text>
              <text x="1275" y="30" fill="#3b82f6" fontSize="16" fontWeight="bold" textAnchor="middle">DC Link: {Math.round(capVoltage)}V</text>
              
              {/* Inside Inverter: Capacitors */}
              <line x1="1170" y1="80" x2="1170" y2="165" stroke="#3b82f6" strokeWidth="6" />
              <line x1="1170" y1="185" x2="1170" y2="280" stroke="#3b82f6" strokeWidth="6" />
              <line x1="1150" y1="165" x2="1190" y2="165" stroke="#3b82f6" strokeWidth="6" />
              <line x1="1150" y1="185" x2="1190" y2="185" stroke="#3b82f6" strokeWidth="6" />
              <text x="1170" y="210" fill="#3b82f6" fontSize="12" fontWeight="bold" textAnchor="middle" transform="rotate(-90 1170,210)">~300µF CAP</text>

              {/* Inside Inverter: Active Discharge Circuit with SSR */}
              <line x1="1260" y1="80" x2="1260" y2="110" stroke="#ef4444" strokeWidth="4" />
              <line x1="1260" y1="230" x2="1260" y2="280" stroke="#ef4444" strokeWidth="4" />
              
              {/* Normally Closed SSR (Solid State Relay) */}
              <rect x="1245" y="110" width="30" height="40" fill="#020617" stroke="#cbd5e1" strokeWidth="2" />
              <text x="1260" y="125" fill="#cbd5e1" fontSize="10" fontWeight="bold" textAnchor="middle">NC</text>
              <text x="1260" y="140" fill="#cbd5e1" fontSize="10" fontWeight="bold" textAnchor="middle">SSR</text>
              {/* SSR Control Wire (Active Low) */}
              <polyline points="1245,130 1200,130" fill="none" stroke="#ec4899" strokeWidth="2" strokeDasharray="4,4" />
              <text x="1220" y="120" fill="#ec4899" fontSize="10" textAnchor="middle">SDC</text>

              {/* 5.6k PB171 Bleed Resistor */}
              <rect x="1245" y="160" width="30" height="70" fill="#1e293b" stroke="#ef4444" strokeWidth="3" />
              <text x="1305" y="195" fill="#ef4444" fontSize="12" fontWeight="bold" textAnchor="middle">5.6kΩ</text>
              <text x="1305" y="210" fill="#ef4444" fontSize="10" textAnchor="middle">PB171</text>
              <line x1="1260" y1="150" x2="1260" y2="160" stroke="#ef4444" strokeWidth="4" />
              
              {/* Discharge Animation (Red Loop inside inverter) */}
              {(!sdcEnabled && capVoltage > 5 && !isPaused) && (
                <polyline points="1170,80 1260,80 1260,280 1170,280" fill="none" stroke="#ef4444" strokeWidth="4" strokeDasharray="15,15">
                  <animate attributeName="stroke-dashoffset" from="60" to="0" dur="0.4s" repeatCount="indefinite" />
                </polyline>
              )}
              {(!sdcEnabled && capVoltage > 5 && isPaused) && (
                <polyline points="1170,80 1260,80 1260,280 1170,280" fill="none" stroke="#ef4444" strokeWidth="4" strokeDasharray="15,15" />
              )}

              {/* HV- Path (Bottom) */}
              <line x1="160" y1="280" x2="1100" y2="280" stroke="#1d4ed8" strokeWidth="10" />
              <text x="630" y="310" fill="#1d4ed8" fontSize="18" fontWeight="bold" textAnchor="middle">HV NEGATIVE</text>
              <line x1="1100" y1="280" x2="1260" y2="280" stroke="#1d4ed8" strokeWidth="10" />

              {/* --- AIR+ PATH (Top) --- */}
              <line x1="160" y1="80" x2="520" y2="80" stroke={relayEnergized ? "#22c55e" : (sdcEnabled ? "#ef4444" : "#334155")} strokeWidth="10" />
              <line x1="660" y1="80" x2="1100" y2="80" stroke={relayEnergized ? "#22c55e" : "#334155"} strokeWidth="10" />
              <line x1="1100" y1="80" x2="1260" y2="80" stroke={relayEnergized ? "#22c55e" : "#334155"} strokeWidth="10" />
              
              {/* Detailed AIR+ Contactor */}
              <g transform="translate(0, 0)">
                <rect x="520" y="10" width="140" height="150" rx="10" fill="#0f172a" stroke="#475569" strokeWidth="4" />
                <text x="590" y="40" fill="#cbd5e1" fontSize="16" fontWeight="bold" textAnchor="middle">AIR+ (GV241)</text>
                
                <rect x="540" y="70" width="20" height="15" fill="#94a3b8" />
                <rect x="620" y="70" width="20" height="15" fill="#94a3b8" />
                
                <line x1="535" y1={relayEnergized ? "80" : "55"} x2="645" y2={relayEnergized ? "80" : "55"} stroke={relayEnergized ? "#22c55e" : "#cbd5e1"} strokeWidth="10" className="transition-all duration-300" />
                
                <line x1="590" y1={relayEnergized ? "80" : "55"} x2="590" y2="120" stroke="#475569" strokeWidth="6" className="transition-all duration-300" />
                <rect x="550" y="120" width="80" height="25" rx="6" fill="#1e293b" stroke={relayEnergized ? "#ec4899" : "#475569"} strokeWidth="3" className="transition-colors" />
                <path d="M 565 132 Q 575 120 590 132 T 615 132" fill="none" stroke={relayEnergized ? "#ec4899" : "#475569"} strokeWidth="4" />
                
                <circle cx="570" cy="150" r="4" fill="#ec4899" />
                <circle cx="610" cy="150" r="4" fill="#ec4899" />
              </g>

              {/* Animated Current Flow (AIR+) */}
              {(relayEnergized && !isPaused) && (
                <line x1="160" y1="80" x2="1100" y2="80" stroke="#86efac" strokeWidth="4" strokeDasharray="25,25">
                  <animate attributeName="stroke-dashoffset" from="100" to="0" dur="0.4s" repeatCount="indefinite" />
                </line>
              )}
              {(relayEnergized && isPaused) && (
                <line x1="160" y1="80" x2="1100" y2="80" stroke="#86efac" strokeWidth="4" strokeDasharray="25,25" />
              )}

              {/* --- PRECHARGE PATH (Middle) --- */}
              <polyline points="220,80 220,200 520,200" fill="none" stroke={sdcEnabled && !relayEnergized ? "#eab308" : "#334155"} strokeWidth="10" />
              <circle cx="220" cy="80" r="6" fill="#64748b" />

              {/* Detailed Precharge Relay */}
              <g transform="translate(0, 0)">
                <rect x="520" y="150" width="140" height="150" rx="10" fill="#0f172a" stroke="#475569" strokeWidth="4" />
                <text x="590" y="180" fill="#cbd5e1" fontSize="16" fontWeight="bold" textAnchor="middle">PRECHARGE</text>
                
                <rect x="540" y="190" width="20" height="15" fill="#94a3b8" />
                <rect x="620" y="190" width="20" height="15" fill="#94a3b8" />
                
                <line x1="535" y1={sdcEnabled && !relayEnergized ? "200" : "175"} x2="645" y2={sdcEnabled && !relayEnergized ? "200" : "175"} stroke={sdcEnabled && !relayEnergized ? "#eab308" : "#cbd5e1"} strokeWidth="10" className="transition-all duration-300" />
                
                <line x1="590" y1={sdcEnabled && !relayEnergized ? "200" : "175"} x2="590" y2="260" stroke="#475569" strokeWidth="6" className="transition-all duration-300" />
                <rect x="550" y="260" width="80" height="25" rx="6" fill="#1e293b" stroke={sdcEnabled && !relayEnergized ? "#ec4899" : "#475569"} strokeWidth="3" className="transition-colors" />
                <path d="M 565 272 Q 575 260 590 272 T 615 272" fill="none" stroke={sdcEnabled && !relayEnergized ? "#ec4899" : "#475569"} strokeWidth="4" />
                
                <circle cx="570" cy="290" r="4" fill="#ec4899" />
                <circle cx="610" cy="290" r="4" fill="#ec4899" />
              </g>

              {/* Precharge Resistor */}
              <line x1="660" y1="200" x2="730" y2="200" stroke={sdcEnabled && !relayEnergized ? "#eab308" : "#334155"} strokeWidth="10" />
              <rect x="730" y="180" width="100" height="40" rx="6" fill="#1e293b" stroke={powerDissipation > 1000 ? "#ef4444" : "#64748b"} strokeWidth="5" className="transition-colors duration-200" />
              <text x="780" y="205" fill="white" fontSize="20" fontWeight="bold" textAnchor="middle">100Ω</text>
              <polyline points="830,200 950,200 950,80" fill="none" stroke={sdcEnabled && !relayEnergized ? "#eab308" : "#334155"} strokeWidth="10" />
              <circle cx="950" cy="80" r="6" fill="#64748b" />

              {/* Animated Current Flow (Precharge) */}
              {(sdcEnabled && !relayEnergized && !isPaused) && (
                <polyline points="160,80 220,80 220,200 730,200 830,200 950,200 950,80 1100,80" fill="none" stroke="#fef08a" strokeWidth="5" strokeDasharray="20,20">
                  <animate attributeName="stroke-dashoffset" from="80" to="0" dur="0.6s" repeatCount="indefinite" />
                </polyline>
              )}
              {(sdcEnabled && !relayEnergized && isPaused) && (
                <polyline points="160,80 220,80 220,200 730,200 830,200 950,200 950,80 1100,80" fill="none" stroke="#fef08a" strokeWidth="5" strokeDasharray="20,20" />
              )}


              {/* --- GALVANIC ISOLATION BARRIER --- */}
              <line x1="0" y1="360" x2="1400" y2="360" stroke="#0ea5e9" strokeWidth="4" strokeDasharray="16,16" opacity="0.4" />
              <text x="1200" y="345" fill="#0ea5e9" fontSize="18" fontWeight="bold" opacity="0.7">GALVANIC ISOLATION BARRIER</text>


              {/* --- LOW VOLTAGE LOGIC SECTION --- */}
              <rect x="180" y="400" width="950" height="190" rx="16" fill="#020617" stroke="#0ea5e9" strokeWidth="4" />
              <text x="650" y="570" fill="#0ea5e9" fontSize="18" fontWeight="bold" opacity="0.3" textAnchor="middle">24V AUTOMATED HARDWARE CONTROL LOGIC</text>

              {/* 1. Voltage Divider */}
              <rect x="230" y="420" width="170" height="130" rx="8" fill="#0f172a" stroke="#3b82f6" strokeWidth="3" />
              <text x="315" y="465" fill="white" fontSize="16" fontWeight="bold" textAnchor="middle">VOLTAGE</text>
              <text x="315" y="490" fill="white" fontSize="16" fontWeight="bold" textAnchor="middle">DIVIDER</text>
              <text x="315" y="525" fill="#94a3b8" fontSize="14" textAnchor="middle">1MΩ / 5kΩ</text>

              {/* 2. Schmitt Trigger */}
              <rect x="480" y="420" width="190" height="130" rx="8" fill="#0f172a" stroke="#8b5cf6" strokeWidth="3" />
              <text x="575" y="465" fill="white" fontSize="16" fontWeight="bold" textAnchor="middle">SCHMITT</text>
              <text x="575" y="490" fill="white" fontSize="16" fontWeight="bold" textAnchor="middle">TRIGGER</text>
              <text x="575" y="520" fill="#c4b5fd" fontSize="14" textAnchor="middle">LM393 Op-Amp</text>
              <text x="575" y="535" fill="#8b5cf6" fontSize="12" textAnchor="middle">Ref: 95% + Hyst.</text>

              {/* 3. Relay Driver */}
              <rect x="750" y="420" width="200" height="130" rx="8" fill="#0f172a" stroke="#ec4899" strokeWidth="3" />
              <text x="850" y="470" fill="white" fontSize="16" fontWeight="bold" textAnchor="middle">RELAY DRIVER</text>
              <text x="850" y="500" fill="#fbcfe8" fontSize="14" textAnchor="middle">IRLZ44N (NMOS)</text>
              <text x="850" y="525" fill="#ec4899" fontSize="14" textAnchor="middle">+ Flyback Diodes</text>

              {/* Internal LV Box Connections */}
              <line x1="400" y1="485" x2="480" y2="485" stroke="#3b82f6" strokeWidth="4" />
              <polyline points="670,485 750,485" fill="none" stroke={relayEnergized ? "#22c55e" : "#8b5cf6"} strokeWidth="4" />
              <text x="710" y="475" fill={relayEnergized ? "#22c55e" : "#8b5cf6"} fontSize="14" fontWeight="bold" textAnchor="middle">{relayEnergized ? "HIGH" : "LOW"}</text>

              {/* HV Sense Line (Isolated Tap) */}
              <polyline points="1020,80 1020,380 315,380 315,420" fill="none" stroke="#0ea5e9" strokeWidth="4" opacity="0.6" />
              <circle cx="1020" cy="80" r="5" fill="#0ea5e9" />
              <text x="1010" y="320" fill="#0ea5e9" fontSize="14" fontWeight="bold" transform="rotate(-90 1010,320)">HV SENSE MEASUREMENT</text>

              {/* --- NEAT, ORGANIZED CONTROL WIRING (Pink) --- */}
              {/* Common 24V SDC Power (Solid) */}
              <g>
                <polyline points="910,420 910,150 610,150" fill="none" stroke="#ec4899" strokeWidth="4" />
                <polyline points="910,290 610,290" fill="none" stroke="#ec4899" strokeWidth="4" />
                <circle cx="910" cy="290" r="5" fill="#ec4899" />
                <text x="925" y="190" fill="#ec4899" fontSize="14" fontWeight="bold" transform="rotate(-90 925,190)">24V SDC POWER</text>
              </g>

              {/* Precharge Switched GND (Dashed) */}
              <g>
                <polyline points="870,420 870,310 570,310 570,290" fill="none" stroke={sdcEnabled && !relayEnergized ? "#ec4899" : "#475569"} strokeWidth="4" strokeDasharray="8,8" />
                <text x="855" y="340" fill="#ec4899" fontSize="12" opacity="0.8" transform="rotate(-90 855,340)">PRE-CHRG GND</text>
              </g>

              {/* AIR+ Switched GND (Dashed) */}
              <g>
                <polyline points="830,420 830,130 570,130 570,150" fill="none" stroke={relayEnergized ? "#ec4899" : "#475569"} strokeWidth="4" strokeDasharray="8,8" />
                <text x="815" y="340" fill="#ec4899" fontSize="12" opacity="0.8" transform="rotate(-90 815,340)">AIR+ SW. GND</text>
              </g>

            </svg>
          </div>

          {/* Side Panel: Event Logger & Knowledge */}
          <div className="w-[450px] flex-shrink-0 bg-slate-900 border-l border-slate-800 flex flex-col">
            
            {/* Rule Explanation Box */}
            <div className="p-8 bg-slate-800/50 border-b border-slate-800">
              <h3 className="text-lg font-black text-cyan-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <span className="bg-cyan-500 text-slate-900 px-3 py-1 rounded text-sm">INFO</span> 
                Discharge Math Check
              </h3>
              <p className="text-base text-slate-300 leading-relaxed">
                Using a <strong className="text-red-400">5.6kΩ PB171</strong> resistor:
              </p>
              <ul className="text-base text-slate-400 mt-3 list-disc list-inside space-y-2">
                <li>Peak Power: 600V² / 5.6kΩ = <strong>64.2W</strong></li>
                <li>RC Const (w/ 300µF): <strong>1.68s</strong></li>
                <li>5s Discharge to 60V: <strong className="text-green-400">PASS</strong></li>
              </ul>
              <p className="text-sm text-yellow-400 mt-4 bg-yellow-400/10 p-3 rounded leading-relaxed border border-yellow-500/20">
                <strong>WARNING:</strong> Ensure the SSR is <strong>Normally Closed (NC)</strong> so it automatically fails "closed" when SDC 24V power is lost!
              </p>
            </div>

            {/* Event Logger */}
            <div className="p-6 bg-slate-950 border-b border-slate-800 flex-grow flex flex-col">
              <h3 className="text-base font-bold text-slate-400 uppercase tracking-widest">Live Event Logger</h3>
              <div className="flex-1 mt-4 overflow-hidden flex flex-col justify-end">
                <div className="space-y-4">
                  {logs.slice().reverse().map((log, i) => (
                    <div key={i} className="text-sm font-mono animate-[fadeIn_0.3s_ease-out]">
                      <span className="text-cyan-600 font-bold">[{log.time}]</span>
                      <span className={`ml-3 block mt-1 ${
                        log.msg.includes('CLOSED') ? 'text-green-400' : 
                        log.msg.includes('OPENED') ? 'text-red-400' : 
                        log.msg.includes('ACTIVATED') ? 'text-orange-400' : 
                        log.msg.includes('PAUSED') || log.msg.includes('RESUMED') ? 'text-blue-400 font-bold' :
                        log.msg.includes('Voltage') ? 'text-yellow-400' : 'text-slate-300'
                      }`}>
                        {log.msg}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Bottom Progress Bar */}
        <div className="bg-slate-950 px-10 py-8 border-t border-slate-800 flex-shrink-0">
          <div className="flex justify-between text-base font-bold text-slate-500 mb-4 font-mono">
            <span>0V</span>
            <span className="text-red-500 bg-red-500/10 px-4 py-1 rounded">THRESHOLD: {THRESHOLD_HIGH}V</span>
            <span>{BATTERY_VOLTAGE}V</span>
          </div>
          <div className="h-8 w-full bg-slate-900 rounded-full overflow-hidden relative border border-slate-700">
            <div 
              className={`h-full transition-all duration-75 ${relayEnergized ? 'bg-green-500' : 'bg-yellow-500'}`}
              style={{ width: `${Math.min(100, progressPercent)}%` }}
            />
            {/* 95% Marker */}
            <div className="absolute top-0 bottom-0 w-2 bg-red-500 z-10" style={{ left: '95%' }} />
          </div>
        </div>

      </div>
    </div>
  );
}
