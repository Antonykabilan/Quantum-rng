// ============================================================
// Quantum vs Classical Randomness Simulator
// Production-grade React SPA — single-file artifact
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, useAnimationControls } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Cell
} from "recharts";

// ─────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────

/** Classical PRNG via Math.random() → float [0,1) */
const classicalRandom = () => Math.random();

/** QRNG simulation via crypto.getRandomValues → true hardware entropy */
const quantumRandom = () => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 0xFFFFFFFF; // normalise to [0,1)
};

/** Generate a single quantum bit (0 or 1) */
const quantumBit = () => {
  const buf = new Uint8Array(1);
  crypto.getRandomValues(buf);
  return buf[0] & 1;
};

/** Build a 10-bucket histogram from an array of [0,1) floats */
const buildHistogram = (values) => {
  const buckets = Array.from({ length: 10 }, (_, i) => ({
    range: `${i * 10}–${i * 10 + 9}`,
    count: 0,
  }));
  values.forEach((v) => {
    const idx = Math.min(Math.floor(v * 10), 9);
    buckets[idx].count += 1;
  });
  return buckets;
};

/** Shannon entropy in bits for an array of 0/1 values */
const shannonEntropy = (bits) => {
  if (!bits.length) return 0;
  const p1 = bits.filter(Boolean).length / bits.length;
  const p0 = 1 - p1;
  if (p0 === 0 || p1 === 0) return 0;
  return -(p0 * Math.log2(p0) + p1 * Math.log2(p1));
};

// ─────────────────────────────────────────────
// INLINE STYLES / CONSTANTS
// ─────────────────────────────────────────────

const COLORS = {
  bg: "#050508",
  surface: "rgba(18,6,6,0.75)",
  border: "rgba(139,0,0,0.35)",
  borderBright: "rgba(255,26,26,0.6)",
  neon: "#ff1a1a",
  neonDim: "#8b0000",
  neonGlow: "0 0 18px rgba(255,26,26,0.55), 0 0 40px rgba(139,0,0,0.3)",
  neonGlowBright: "0 0 24px rgba(255,26,26,0.85), 0 0 60px rgba(255,26,26,0.35)",
  quantum: "#ff4d4d",
  classical: "#cc0000",
  text: "#e8d5d5",
  textDim: "#7a5555",
  textMid: "#b08080",
};

// ─────────────────────────────────────────────
// REUSABLE: GlassCard
// ─────────────────────────────────────────────
const GlassCard = ({ children, className = "", glow = false, style = {} }) => (
  <div
    className={`rounded-2xl border backdrop-blur-md relative overflow-hidden ${className}`}
    style={{
      background: "linear-gradient(135deg, rgba(20,4,4,0.85) 0%, rgba(10,2,2,0.92) 100%)",
      borderColor: glow ? COLORS.borderBright : COLORS.border,
      boxShadow: glow ? COLORS.neonGlow : "0 4px 32px rgba(0,0,0,0.6)",
      ...style,
    }}
  >
    {/* subtle corner accent */}
    <div className="absolute top-0 left-0 w-8 h-8 pointer-events-none"
      style={{ background: "linear-gradient(135deg, rgba(139,0,0,0.25) 0%, transparent 70%)" }} />
    <div className="absolute bottom-0 right-0 w-12 h-12 pointer-events-none"
      style={{ background: "radial-gradient(circle at 100% 100%, rgba(139,0,0,0.15) 0%, transparent 70%)" }} />
    {children}
  </div>
);

// ─────────────────────────────────────────────
// REUSABLE: NeonButton
// ─────────────────────────────────────────────
const NeonButton = ({ onClick, children, disabled = false, small = false }) => (
  <motion.button
    whileHover={!disabled ? { scale: 1.04 } : {}}
    whileTap={!disabled ? { scale: 0.96 } : {}}
    onClick={onClick}
    disabled={disabled}
    className="relative font-mono font-bold tracking-widest uppercase rounded-lg border transition-all select-none"
    style={{
      padding: small ? "6px 16px" : "10px 28px",
      fontSize: small ? "0.65rem" : "0.75rem",
      letterSpacing: "0.15em",
      color: disabled ? COLORS.textDim : COLORS.neon,
      borderColor: disabled ? COLORS.neonDim : COLORS.neon,
      background: disabled
        ? "rgba(30,4,4,0.4)"
        : "linear-gradient(135deg, rgba(50,0,0,0.6) 0%, rgba(20,0,0,0.8) 100%)",
      boxShadow: disabled ? "none" : COLORS.neonGlow,
      cursor: disabled ? "not-allowed" : "pointer",
    }}
  >
    {children}
  </motion.button>
);

// ─────────────────────────────────────────────
// REUSABLE: Tooltip
// ─────────────────────────────────────────────
const InfoTooltip = ({ text }) => {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-block ml-1 align-middle cursor-pointer"
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <span className="rounded-full font-mono text-xs px-1.5 py-0.5 border"
        style={{ color: COLORS.neon, borderColor: COLORS.neonDim, background: "rgba(80,0,0,0.25)" }}>?</span>
      <AnimatePresence>
        {show && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
            className="absolute z-50 rounded-xl p-3 text-xs font-mono leading-relaxed"
            style={{
              width: 220, bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)",
              background: "rgba(15,3,3,0.97)", border: `1px solid ${COLORS.borderBright}`,
              boxShadow: COLORS.neonGlow, color: COLORS.textMid,
            }}>
            {text}
            <div className="absolute bottom-0 left-1/2 -mb-1.5 -translate-x-1/2 w-3 h-3 rotate-45"
              style={{ background: "rgba(15,3,3,0.97)", borderRight: `1px solid ${COLORS.borderBright}`, borderBottom: `1px solid ${COLORS.borderBright}` }} />
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
};

// ─────────────────────────────────────────────
// COMPONENT: Beam Splitter Animation (center)
// ─────────────────────────────────────────────
const BeamSplitterAnimation = ({ lastDirection, triggerKey }) => {
  const pathVariants = {
    incoming: {
      pathLength: [0, 1],
      opacity: [0, 1, 1, 0.2],
      transition: { duration: 0.5, ease: "easeInOut" },
    },
    left: {
      pathLength: [0, 1],
      opacity: [0, 1, 1, 0],
      transition: { duration: 0.45, delay: 0.45, ease: "easeOut" },
    },
    right: {
      pathLength: [0, 1],
      opacity: [0, 1, 1, 0],
      transition: { duration: 0.45, delay: 0.45, ease: "easeOut" },
    },
  };

  return (
    <div className="flex flex-col items-center justify-center" style={{ minHeight: 120 }}>
      <svg viewBox="0 0 200 100" className="w-full" style={{ maxWidth: 260, overflow: "visible" }}>
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glowStrong">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* beam splitter diamond */}
        <g transform="translate(100,50)">
          <rect x="-10" y="-10" width="20" height="20" rx="2"
            transform="rotate(45)"
            style={{ fill: "rgba(100,0,0,0.3)", stroke: COLORS.neon, strokeWidth: 1.2, filter: "url(#glow)" }} />
          <line x1="-10" y1="-10" x2="10" y2="10" stroke={COLORS.neon} strokeWidth="1" opacity="0.6" />
        </g>

        {/* incoming photon path */}
        <AnimatePresence mode="wait">
          <motion.line key={`in-${triggerKey}`}
            x1="20" y1="50" x2="88" y2="50"
            stroke={COLORS.neon} strokeWidth="2" strokeLinecap="round"
            style={{ filter: "url(#glow)" }}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: [0, 1, 1, 0.4] }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
          />
        </AnimatePresence>

        {/* photon dot incoming */}
        <AnimatePresence>
          <motion.circle key={`dot-${triggerKey}`}
            r="4" fill={COLORS.neon} style={{ filter: "url(#glowStrong)" }}
            initial={{ cx: 20, cy: 50, opacity: 0, scale: 0 }}
            animate={{ cx: 100, cy: 50, opacity: [0, 1, 1, 0], scale: [0, 1, 1, 0.5] }}
            transition={{ duration: 0.45, ease: "easeInOut" }}
          />
        </AnimatePresence>

        {/* branched path LEFT */}
        <AnimatePresence>
          {lastDirection === 0 && (
            <motion.line key={`left-${triggerKey}`}
              x1="112" y1="42" x2="170" y2="10"
              stroke={COLORS.neon} strokeWidth="2" strokeLinecap="round"
              style={{ filter: "url(#glow)" }}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: [0, 1, 1, 0] }}
              transition={{ duration: 0.4, delay: 0.4, ease: "easeOut" }}
            />
          )}
        </AnimatePresence>

        {/* branched path RIGHT */}
        <AnimatePresence>
          {lastDirection === 1 && (
            <motion.line key={`right-${triggerKey}`}
              x1="112" y1="58" x2="170" y2="90"
              stroke={COLORS.quantum} strokeWidth="2" strokeLinecap="round"
              style={{ filter: "url(#glow)" }}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: [0, 1, 1, 0] }}
              transition={{ duration: 0.4, delay: 0.4, ease: "easeOut" }}
            />
          )}
        </AnimatePresence>

        {/* exiting photon dot */}
        <AnimatePresence>
          {lastDirection === 0 && (
            <motion.circle key={`exitL-${triggerKey}`}
              r="4" fill={COLORS.neon} style={{ filter: "url(#glowStrong)" }}
              initial={{ cx: 112, cy: 42, opacity: 0 }}
              animate={{ cx: 170, cy: 10, opacity: [0, 1, 0] }}
              transition={{ duration: 0.35, delay: 0.42, ease: "easeOut" }}
            />
          )}
          {lastDirection === 1 && (
            <motion.circle key={`exitR-${triggerKey}`}
              r="4" fill={COLORS.quantum} style={{ filter: "url(#glowStrong)" }}
              initial={{ cx: 112, cy: 58, opacity: 0 }}
              animate={{ cx: 170, cy: 90, opacity: [0, 1, 0] }}
              transition={{ duration: 0.35, delay: 0.42, ease: "easeOut" }}
            />
          )}
        </AnimatePresence>

        {/* labels */}
        <text x="10" y="46" fontSize="7" fill={COLORS.textDim} fontFamily="monospace">PHOTON</text>
        <text x="155" y="8" fontSize="7" fill={COLORS.neon} fontFamily="monospace" opacity={lastDirection === 0 ? 1 : 0.2}>0</text>
        <text x="155" y="96" fontSize="7" fill={COLORS.quantum} fontFamily="monospace" opacity={lastDirection === 1 ? 1 : 0.2}>1</text>
      </svg>

      <p className="font-mono text-center mt-1" style={{ fontSize: "0.6rem", color: COLORS.textDim, letterSpacing: "0.1em" }}>
        BEAM SPLITTER SIMULATION — QUANTUM SUPERPOSITION COLLAPSE
      </p>
    </div>
  );
};

// ─────────────────────────────────────────────
// COMPONENT: Streaming bits terminal
// ─────────────────────────────────────────────
const BitStreamTerminal = ({ bits }) => {
  const containerRef = useRef(null);
  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [bits]);

  const grouped = [];
  for (let i = 0; i < bits.length; i += 8) grouped.push(bits.slice(i, i + 8));

  return (
    <div ref={containerRef}
      className="rounded-lg p-3 font-mono text-xs leading-relaxed overflow-y-auto"
      style={{
        height: 110, background: "rgba(4,0,0,0.7)", border: `1px solid ${COLORS.border}`,
        color: COLORS.neon, letterSpacing: "0.12em",
      }}>
      {grouped.length === 0
        ? <span style={{ color: COLORS.textDim }}>_ awaiting quantum measurement...</span>
        : grouped.map((group, i) => (
          <motion.span key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }} className="inline-block mr-2 mb-0.5">
            {group.join("")}
          </motion.span>
        ))}
      <motion.span animate={{ opacity: [1, 0] }} transition={{ repeat: Infinity, duration: 0.7 }}
        style={{ color: COLORS.neon }}>█</motion.span>
    </div>
  );
};

// ─────────────────────────────────────────────
// COMPONENT: Classical RNG Panel
// ─────────────────────────────────────────────
const ClassicalPanel = ({ speed }) => {
  const [values, setValues] = useState([]);
  const [latest, setLatest] = useState(null);
  const [viewMode, setViewMode] = useState("decimal"); // decimal | binary
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef(null);

  const generate = useCallback(() => {
    const v = classicalRandom();
    setLatest(v);
    setValues((prev) => [...prev.slice(-99), v]);
  }, []);

  // auto-run loop
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(generate, Math.max(100, 1100 - speed * 10));
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning, speed, generate]);

  const reset = () => { setValues([]); setLatest(null); setIsRunning(false); };

  const histogram = buildHistogram(values);
  const last20 = values.slice(-20);
  const entropyVal = values.length > 1
    ? (shannonEntropy(values.map((v) => (v > 0.5 ? 1 : 0))) * 100).toFixed(1)
    : "—";

  const displayValue = (v) => {
    if (v === null) return "—";
    if (viewMode === "binary") return (Math.floor(v * 65536)).toString(2).padStart(16, "0");
    return v.toFixed(8);
  };

  return (
    <GlassCard className="flex flex-col gap-4 p-5 h-full" glow={isRunning}>
      {/* header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full" style={{ background: COLORS.classical, boxShadow: `0 0 8px ${COLORS.classical}` }} />
            <h2 className="font-mono text-sm font-bold tracking-widest uppercase" style={{ color: COLORS.neon }}>
              Classical RNG
            </h2>
            <InfoTooltip text="PRNG (Pseudo-Random Number Generator): Uses a deterministic algorithm seeded by system state. Math.random() in JS uses xorshift128+. Predictable if the seed is known." />
          </div>
          <p className="font-mono text-xs" style={{ color: COLORS.textDim }}>Pseudo-Random · Deterministic</p>
        </div>
        <div className="flex gap-2">
          <NeonButton small onClick={() => setViewMode(m => m === "decimal" ? "binary" : "decimal")}>
            {viewMode === "decimal" ? "BIN" : "DEC"}
          </NeonButton>
          <NeonButton small onClick={reset}>RST</NeonButton>
        </div>
      </div>

      {/* big number display */}
      <motion.div layout className="rounded-xl p-4 text-center"
        style={{ background: "rgba(6,0,0,0.6)", border: `1px solid ${COLORS.border}` }}>
        <p className="font-mono text-xs mb-1" style={{ color: COLORS.textDim }}>GENERATED VALUE</p>
        <motion.p key={latest} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className="font-mono font-bold break-all"
          style={{ fontSize: viewMode === "binary" ? "0.72rem" : "1.5rem", color: COLORS.neon, textShadow: `0 0 14px ${COLORS.neon}` }}>
          {displayValue(latest)}
        </motion.p>
        {latest !== null && viewMode === "decimal" && (
          <p className="font-mono text-xs mt-1" style={{ color: COLORS.textDim }}>
            ×10⁰ float ∈ [0, 1)
          </p>
        )}
      </motion.div>

      {/* generate button */}
      <div className="flex justify-center">
        <NeonButton onClick={isRunning ? () => setIsRunning(false) : () => setIsRunning(true)}>
          {isRunning ? "⬛ STOP" : "▶ GENERATE CLASSICAL"}
        </NeonButton>
      </div>

      {/* last 20 mini-strip */}
      <div>
        <p className="font-mono text-xs mb-2" style={{ color: COLORS.textDim }}>LAST 20 VALUES</p>
        <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(10, 1fr)" }}>
          {Array.from({ length: 20 }).map((_, i) => {
            const v = last20[last20.length - 20 + i];
            return (
              <motion.div key={i} title={v?.toFixed(4)}
                className="rounded h-5"
                style={{
                  background: v !== undefined
                    ? `rgba(${Math.floor(v * 180 + 40)},0,0,0.85)`
                    : "rgba(20,5,5,0.4)",
                  border: "1px solid rgba(80,0,0,0.3)",
                }}
                initial={{ scale: 0 }} animate={{ scale: 1 }}
              />
            );
          })}
        </div>
      </div>

      {/* histogram */}
      <div>
        <p className="font-mono text-xs mb-2" style={{ color: COLORS.textDim }}>
          DISTRIBUTION — {values.length} samples
        </p>
        <ResponsiveContainer width="100%" height={110}>
          <BarChart data={histogram} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(80,0,0,0.2)" />
            <XAxis dataKey="range" tick={{ fill: COLORS.textDim, fontSize: 9, fontFamily: "monospace" }} />
            <YAxis tick={{ fill: COLORS.textDim, fontSize: 9 }} />
            <Tooltip
              contentStyle={{ background: "#120202", border: `1px solid ${COLORS.borderBright}`, borderRadius: 8, fontFamily: "monospace", fontSize: 11 }}
              labelStyle={{ color: COLORS.neon }}
              itemStyle={{ color: COLORS.textMid }}
            />
            <Bar dataKey="count" radius={[3, 3, 0, 0]}>
              {histogram.map((_, i) => (
                <Cell key={i} fill={`rgba(${140 + i * 8},0,0,0.85)`} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* stats footer */}
      <div className="grid grid-cols-3 gap-2 mt-auto">
        {[
          { label: "Samples", value: values.length },
          { label: "Entropy", value: `${entropyVal}%` },
          { label: "Algorithm", value: "xorshift+" },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg p-2 text-center"
            style={{ background: "rgba(10,2,2,0.7)", border: `1px solid ${COLORS.border}` }}>
            <p className="font-mono text-xs" style={{ color: COLORS.textDim }}>{label}</p>
            <p className="font-mono text-sm font-bold" style={{ color: COLORS.neon }}>{value}</p>
          </div>
        ))}
      </div>
    </GlassCard>
  );
};

// ─────────────────────────────────────────────
// COMPONENT: Quantum RNG Panel
// ─────────────────────────────────────────────
const QuantumPanel = ({ speed, onBit }) => {
  const [bits, setBits] = useState([]);
  const [latest, setLatest] = useState(null);
  const [latestBit, setLatestBit] = useState(null);
  const [viewMode, setViewMode] = useState("binary");
  const [isRunning, setIsRunning] = useState(false);
  const [triggerKey, setTriggerKey] = useState(0);
  const intervalRef = useRef(null);

  const generate = useCallback(() => {
    const bit = quantumBit();
    const val = quantumRandom();
    setLatestBit(bit);
    setLatest(val);
    setBits((prev) => [...prev.slice(-255), bit]);
    setTriggerKey((k) => k + 1);
    onBit && onBit(bit);
  }, [onBit]);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(generate, Math.max(100, 1100 - speed * 10));
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning, speed, generate]);

  const reset = () => { setBits([]); setLatest(null); setLatestBit(null); setIsRunning(false); };

  const zeros = bits.filter((b) => b === 0).length;
  const ones = bits.filter((b) => b === 1).length;
  const freqData = [
    { label: "0", count: zeros },
    { label: "1", count: ones },
  ];

  const displayValue = (v) => {
    if (v === null) return "—";
    if (viewMode === "binary") return (Math.floor(v * 65536)).toString(2).padStart(16, "0");
    return v.toFixed(8);
  };

  return (
    <GlassCard className="flex flex-col gap-4 p-5 h-full" glow={isRunning}>
      {/* header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full" style={{ background: COLORS.quantum, boxShadow: `0 0 10px ${COLORS.quantum}` }} />
            <h2 className="font-mono text-sm font-bold tracking-widest uppercase" style={{ color: COLORS.quantum }}>
              Quantum RNG
            </h2>
            <InfoTooltip text="QRNG (Quantum Random Number Generator): Uses quantum phenomena (superposition, measurement collapse) for true randomness. Simulated here via crypto.getRandomValues() — the browser's hardware entropy source." />
          </div>
          <p className="font-mono text-xs" style={{ color: COLORS.textDim }}>Quantum-Inspired · True Entropy</p>
        </div>
        <div className="flex gap-2">
          <NeonButton small onClick={() => setViewMode(m => m === "binary" ? "decimal" : "binary")}>
            {viewMode === "binary" ? "DEC" : "BIN"}
          </NeonButton>
          <NeonButton small onClick={reset}>RST</NeonButton>
        </div>
      </div>

      {/* quantum bit display */}
      <div className="grid grid-cols-2 gap-3">
        <motion.div className="rounded-xl p-4 text-center"
          style={{ background: "rgba(6,0,0,0.6)", border: `1px solid ${COLORS.border}` }}>
          <p className="font-mono text-xs mb-1" style={{ color: COLORS.textDim }}>QUANTUM BIT</p>
          <AnimatePresence mode="wait">
            <motion.p key={`bit-${triggerKey}`}
              initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.4, opacity: 0 }} transition={{ duration: 0.2 }}
              className="font-mono font-black"
              style={{
                fontSize: "3rem", lineHeight: 1,
                color: latestBit === null ? COLORS.textDim : latestBit === 1 ? COLORS.quantum : COLORS.neon,
                textShadow: latestBit !== null ? `0 0 20px ${latestBit === 1 ? COLORS.quantum : COLORS.neon}` : "none",
              }}>
              {latestBit === null ? "?" : latestBit}
            </motion.p>
          </AnimatePresence>
        </motion.div>

        <motion.div className="rounded-xl p-4 text-center"
          style={{ background: "rgba(6,0,0,0.6)", border: `1px solid ${COLORS.border}` }}>
          <p className="font-mono text-xs mb-1" style={{ color: COLORS.textDim }}>FLOAT VALUE</p>
          <motion.p key={`val-${triggerKey}`} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
            className="font-mono font-bold break-all"
            style={{ fontSize: viewMode === "binary" ? "0.58rem" : "0.95rem", color: COLORS.quantum, textShadow: `0 0 10px ${COLORS.quantum}` }}>
            {displayValue(latest)}
          </motion.p>
        </motion.div>
      </div>

      {/* beam splitter */}
      <BeamSplitterAnimation lastDirection={latestBit} triggerKey={triggerKey} />

      {/* generate button */}
      <div className="flex justify-center">
        <NeonButton onClick={isRunning ? () => setIsRunning(false) : () => setIsRunning(true)}>
          {isRunning ? "⬛ STOP" : "▶ GENERATE QUANTUM"}
        </NeonButton>
      </div>

      {/* bit stream terminal */}
      <div>
        <p className="font-mono text-xs mb-2" style={{ color: COLORS.textDim }}>LIVE BIT STREAM</p>
        <BitStreamTerminal bits={bits.slice(-128)} />
      </div>

      {/* frequency chart */}
      <div>
        <p className="font-mono text-xs mb-2" style={{ color: COLORS.textDim }}>
          BIT FREQUENCY — {bits.length} measurements
        </p>
        <ResponsiveContainer width="100%" height={80}>
          <BarChart data={freqData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(80,0,0,0.2)" />
            <XAxis dataKey="label" tick={{ fill: COLORS.textDim, fontSize: 11, fontFamily: "monospace" }} />
            <YAxis tick={{ fill: COLORS.textDim, fontSize: 9 }} />
            <Tooltip contentStyle={{ background: "#120202", border: `1px solid ${COLORS.borderBright}`, borderRadius: 8, fontFamily: "monospace", fontSize: 11 }}
              labelStyle={{ color: COLORS.quantum }} itemStyle={{ color: COLORS.textMid }} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              <Cell fill={COLORS.neon} />
              <Cell fill={COLORS.quantum} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* stats footer */}
      <div className="grid grid-cols-3 gap-2 mt-auto">
        {[
          { label: "Bits", value: bits.length },
          { label: "0s / 1s", value: `${zeros}/${ones}` },
          { label: "Source", value: "crypto API" },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg p-2 text-center"
            style={{ background: "rgba(10,2,2,0.7)", border: `1px solid ${COLORS.border}` }}>
            <p className="font-mono text-xs" style={{ color: COLORS.textDim }}>{label}</p>
            <p className="font-mono text-sm font-bold" style={{ color: COLORS.quantum }}>{value}</p>
          </div>
        ))}
      </div>
    </GlassCard>
  );
};

// ─────────────────────────────────────────────
// COMPONENT: Comparison Section
// ─────────────────────────────────────────────
const ComparisonSection = () => {
  const rows = [
    {
      metric: "Predictability",
      classical: { value: "HIGH", bar: 0.85, color: "#cc3300" },
      quantum: { value: "ZERO", bar: 0.02, color: "#00cc88" },
      icon: "🎯",
    },
    {
      metric: "True Entropy",
      classical: { value: "PSEUDO", bar: 0.45, color: "#cc6600" },
      quantum: { value: "MAXIMAL", bar: 0.98, color: "#00cc88" },
      icon: "🔀",
    },
    {
      metric: "Security Level",
      classical: { value: "MODERATE", bar: 0.5, color: "#cc9900" },
      quantum: { value: "QUANTUM-SAFE", bar: 0.97, color: "#00cc88" },
      icon: "🔐",
    },
    {
      metric: "Reproducibility",
      classical: { value: "SEEDED", bar: 0.9, color: "#cc3300" },
      quantum: { value: "IMPOSSIBLE", bar: 0.0, color: "#00cc88" },
      icon: "♻️",
    },
    {
      metric: "Speed",
      classical: { value: "VERY FAST", bar: 0.98, color: "#00cc88" },
      quantum: { value: "FAST", bar: 0.8, color: "#55cc44" },
      icon: "⚡",
    },
  ];

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <h3 className="font-mono text-sm font-bold tracking-widest uppercase" style={{ color: COLORS.neon }}>
          COMPARATIVE ANALYSIS
        </h3>
        <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${COLORS.neonDim}, transparent)` }} />
      </div>

      <div className="grid gap-4">
        {rows.map(({ metric, classical, quantum, icon }, i) => (
          <motion.div key={metric}
            initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08 }}
            className="grid items-center gap-4"
            style={{ gridTemplateColumns: "1fr 2fr 2fr" }}>
            {/* metric label */}
            <div className="flex items-center gap-2">
              <span>{icon}</span>
              <span className="font-mono text-xs" style={{ color: COLORS.textMid }}>{metric}</span>
            </div>
            {/* classical bar */}
            <div>
              <div className="flex justify-between mb-1">
                <span className="font-mono text-xs" style={{ color: COLORS.textDim }}>Classical</span>
                <span className="font-mono text-xs font-bold" style={{ color: classical.color }}>{classical.value}</span>
              </div>
              <div className="rounded-full overflow-hidden" style={{ height: 6, background: "rgba(50,10,10,0.6)" }}>
                <motion.div className="h-full rounded-full"
                  initial={{ width: 0 }} animate={{ width: `${classical.bar * 100}%` }}
                  transition={{ duration: 0.8, delay: i * 0.08 + 0.3 }}
                  style={{ background: classical.color, boxShadow: `0 0 8px ${classical.color}` }} />
              </div>
            </div>
            {/* quantum bar */}
            <div>
              <div className="flex justify-between mb-1">
                <span className="font-mono text-xs" style={{ color: COLORS.textDim }}>Quantum</span>
                <span className="font-mono text-xs font-bold" style={{ color: quantum.color }}>{quantum.value}</span>
              </div>
              <div className="rounded-full overflow-hidden" style={{ height: 6, background: "rgba(50,10,10,0.6)" }}>
                <motion.div className="h-full rounded-full"
                  initial={{ width: 0 }} animate={{ width: `${quantum.bar * 100}%` }}
                  transition={{ duration: 0.8, delay: i * 0.08 + 0.3 }}
                  style={{ background: quantum.color, boxShadow: `0 0 8px ${quantum.color}` }} />
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </GlassCard>
  );
};

// ─────────────────────────────────────────────
// COMPONENT: Info / Learning Panel
// ─────────────────────────────────────────────
const InfoPanel = () => {
  const [active, setActive] = useState(0);
  const cards = [
    {
      title: "What is a PRNG?",
      tag: "Classical",
      color: COLORS.classical,
      body: "A Pseudo-Random Number Generator uses a deterministic mathematical algorithm. Given the same seed, it always produces the same sequence. JavaScript's Math.random() uses xorshift128+. PRNGs are fast but not cryptographically secure for high-stakes applications.",
    },
    {
      title: "What is a QRNG?",
      tag: "Quantum",
      color: COLORS.quantum,
      body: "A Quantum Random Number Generator exploits quantum mechanical phenomena — photon beam splitters, radioactive decay, vacuum fluctuations — to produce true randomness. The result is fundamentally unpredictable, even with full knowledge of the system. The browser's crypto.getRandomValues() uses hardware entropy sources as a practical approximation.",
    },
    {
      title: "Why does it matter?",
      tag: "Security",
      color: "#ffaa00",
      body: "Cryptographic keys, session tokens, and nonces require true randomness. Weak PRNGs have led to real-world exploits — Netscape 1.1's SSL, Debian's OpenSSL bug (2008), and PS3 private key exposure. QRNGs are used in quantum cryptography, quantum key distribution (QKD), and post-quantum security protocols.",
    },
  ];

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <h3 className="font-mono text-sm font-bold tracking-widest uppercase" style={{ color: COLORS.neon }}>
          LEARNING LAB
        </h3>
        <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${COLORS.neonDim}, transparent)` }} />
      </div>

      {/* tab selector */}
      <div className="flex gap-2 mb-4">
        {cards.map((c, i) => (
          <button key={i} onClick={() => setActive(i)}
            className="font-mono text-xs px-3 py-1.5 rounded-lg border transition-all"
            style={{
              borderColor: active === i ? c.color : COLORS.border,
              color: active === i ? c.color : COLORS.textDim,
              background: active === i ? `rgba(${c === cards[0] ? "140,0,0" : c === cards[1] ? "180,40,40" : "120,80,0"},0.2)` : "transparent",
              boxShadow: active === i ? `0 0 12px ${c.color}44` : "none",
            }}>
            {c.tag}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={active}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="rounded-xl p-4"
          style={{ background: "rgba(8,2,2,0.7)", border: `1px solid ${COLORS.border}` }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full" style={{ background: cards[active].color }} />
            <p className="font-mono font-bold text-sm" style={{ color: cards[active].color }}>{cards[active].title}</p>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: COLORS.textMid, fontFamily: "sans-serif" }}>
            {cards[active].body}
          </p>
        </motion.div>
      </AnimatePresence>
    </GlassCard>
  );
};

// ─────────────────────────────────────────────
// COMPONENT: Animated background grid
// ─────────────────────────────────────────────
const BackgroundGrid = () => (
  <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
    {/* grid lines */}
    <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice">
      <defs>
        <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
          <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(80,0,0,0.08)" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
    </svg>
    {/* radial vignette */}
    <div className="absolute inset-0"
      style={{ background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(80,0,0,0.12) 0%, transparent 70%)" }} />
    {/* bottom fade */}
    <div className="absolute bottom-0 left-0 right-0 h-32"
      style={{ background: "linear-gradient(to top, rgba(5,0,0,0.8), transparent)" }} />
  </div>
);

// ─────────────────────────────────────────────
// COMPONENT: Navbar
// ─────────────────────────────────────────────
const Navbar = ({ speed, setSpeed }) => (
  <motion.nav initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
    transition={{ duration: 0.6, ease: "easeOut" }}
    className="sticky top-0 z-50 flex items-center justify-between px-6 py-3"
    style={{
      background: "rgba(5,0,0,0.85)", backdropFilter: "blur(20px)",
      borderBottom: `1px solid ${COLORS.border}`,
      boxShadow: "0 4px 40px rgba(0,0,0,0.6)",
    }}>
    {/* logo / title */}
    <div className="flex items-center gap-3">
      <div className="relative flex items-center justify-center w-8 h-8 rounded-lg"
        style={{ background: "rgba(80,0,0,0.3)", border: `1px solid ${COLORS.borderBright}`, boxShadow: COLORS.neonGlow }}>
        <span className="font-mono font-black text-xs" style={{ color: COLORS.neon }}>Q</span>
      </div>
      <div>
        <p className="font-mono font-bold text-sm leading-none" style={{ color: COLORS.neon }}>
          QUANTUM<span style={{ color: COLORS.textDim }}> vs </span>CLASSICAL
        </p>
        <p className="font-mono text-xs leading-none mt-0.5" style={{ color: COLORS.textDim }}>
          Randomness Simulator v1.0
        </p>
      </div>
    </div>

    {/* speed control */}
    <div className="flex items-center gap-4">
      <div className="hidden sm:flex items-center gap-3">
        <p className="font-mono text-xs" style={{ color: COLORS.textDim }}>SPEED</p>
        <input type="range" min={1} max={100} value={speed} onChange={(e) => setSpeed(+e.target.value)}
          className="w-24 accent-red-600" />
        <p className="font-mono text-xs w-8 text-right" style={{ color: COLORS.neon }}>{speed}</p>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#22cc55", boxShadow: "0 0 6px #22cc55" }} />
        <p className="font-mono text-xs" style={{ color: COLORS.textDim }}>LIVE</p>
      </div>
    </div>
  </motion.nav>
);

// ─────────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────────
export default function App() {
  const [speed, setSpeed] = useState(50);

  return (
    <div className="min-h-screen relative" style={{ background: COLORS.bg, color: COLORS.text }}>
      <BackgroundGrid />

      {/* inject Google font */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&display=swap');
        * { font-family: 'JetBrains Mono', monospace; box-sizing: border-box; }
        body { margin: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0a0000; }
        ::-webkit-scrollbar-thumb { background: #5a0000; border-radius: 2px; }
        input[type=range] { cursor: pointer; }
        .recharts-text { font-family: 'JetBrains Mono', monospace !important; }
      `}</style>

      <div className="relative z-10 flex flex-col min-h-screen">
        <Navbar speed={speed} setSpeed={setSpeed} />

        {/* hero bar */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
          className="px-6 py-4 text-center"
          style={{ borderBottom: `1px solid rgba(80,0,0,0.2)` }}>
          <p className="font-mono text-xs tracking-widest" style={{ color: COLORS.textDim }}>
            EXPLORING THE FUNDAMENTAL DIFFERENCE BETWEEN DETERMINISTIC AND TRUE RANDOMNESS
          </p>
        </motion.div>

        {/* main 2-col panels */}
        <div className="flex-1 p-4 md:p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6" style={{ minHeight: 640 }}>
            <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }} className="h-full">
              <ClassicalPanel speed={speed} />
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.35 }} className="h-full">
              <QuantumPanel speed={speed} />
            </motion.div>
          </div>

          {/* bottom section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.5 }}>
              <ComparisonSection />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.6 }}>
              <InfoPanel />
            </motion.div>
          </div>

          {/* footer */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
            className="mt-6 text-center py-4"
            style={{ borderTop: `1px solid rgba(80,0,0,0.2)` }}>
            <p className="font-mono text-xs" style={{ color: COLORS.textDim }}>
              QUANTUM RANDOMNESS SIMULATOR · Built with React + Recharts + Framer Motion · Classical uses{" "}
              <code style={{ color: COLORS.neon }}>Math.random()</code> · Quantum uses{" "}
              <code style={{ color: COLORS.quantum }}>crypto.getRandomValues()</code>
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
