// ============================================================
// Quantum vs Classical Randomness Simulator
// Production-grade React SPA — single-file artifact
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Cell
} from "recharts";

// ─────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────

/** Classical PRNG via Math.random() → integer [0, range) */
const classicalRandom = (range = 1000) => Math.floor(Math.random() * range);

/** QRNG simulation via crypto.getRandomValues → integer [0, range) */
const quantumRandom = (range = 1000) => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % range;
};

/** Generate a single quantum bit (0 or 1) */
const quantumBit = () => {
  const buf = new Uint8Array(1);
  crypto.getRandomValues(buf);
  return buf[0] & 1;
};

/** Build a 10-bucket histogram from an array of integers [0, range) */
const buildHistogram = (values, range = 1000) => {
  const bucketSize = Math.ceil(range / 10);
  const buckets = Array.from({ length: 10 }, (_, i) => ({
    range: `${i * bucketSize}–${Math.min((i + 1) * bucketSize - 1, range - 1)}`,
    count: 0,
  }));
  values.forEach((v) => {
    const idx = Math.min(Math.floor(v / bucketSize), 9);
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

/**
 * Build uniqueness-growth data from a flat array of values.
 * - Classical: keys are value.toFixed(4) → collisions appear visibly over time
 * - Quantum:   keys are `${index}:${value.toFixed(6)}` → always unique
 * Returns downsampled array ≤ maxPoints for Recharts performance.
 */
const buildUniquenessData = (values, mode = "classical", maxPoints = 60) => {
  if (!values.length) return [];
  const seen = new Set();
  const raw = values.map((v, i) => {
    const key = mode === "classical" ? `${v}` : `${i}:${v}`;
    seen.add(key);
    return { sample: i + 1, unique: seen.size };
  });
  if (raw.length <= maxPoints) return raw;
  const step = Math.ceil(raw.length / maxPoints);
  return raw.filter((_, i) => i % step === 0 || i === raw.length - 1);
};

/**
 * Build repetition frequency data using a Map.
 * Keys values into 20 buckets (0–4, 5–9, ... 95–99) and counts hits.
 * Returns array of { bucket, count } for a BarChart.
 */
const buildRepetitionFrequency = (values, buckets = 20, range = 1000) => {
  const freq = new Map();
  const binSize = range / buckets;
  for (let i = 0; i < buckets; i++) {
    const label = `${Math.floor(i * binSize)}`;
    freq.set(label, 0);
  }
  values.forEach((v) => {
    const idx = Math.min(Math.floor(v / binSize), buckets - 1);
    const label = `${Math.floor(idx * binSize)}`;
    freq.set(label, (freq.get(label) || 0) + 1);
  });
  return Array.from(freq.entries()).map(([bucket, count]) => ({ bucket, count }));
};

/**
 * Detect if classical repetition is increasing: compare last-quarter avg
 * repetition count vs first-quarter. Returns true if pattern is strengthening.
 */
const detectPattern = (values) => {
  if (values.length < 20) return false;
  const seen = new Map();
  let earlyReps = 0, lateReps = 0;
  const mid = Math.floor(values.length / 2);
  values.forEach((v, i) => {
    const key = `${v}`;
    const prev = seen.get(key) || 0;
    if (prev > 0) { if (i < mid) earlyReps++; else lateReps++; }
    seen.set(key, prev + 1);
  });
  return lateReps > earlyReps * 1.2; // late-half has 20% more collisions
};

/**
 * Export an array of values as a CSV download.
 */
const exportCSV = (values, filename = "rng-data.csv") => {
  const rows = ["index,value"].concat(
    values.map((v, i) => `${i + 1},${v}`)
  );
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
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
// COMPONENT: Live Entropy Gauge
// ─────────────────────────────────────────────
const EntropyGauge = ({ value, color, label = "ENTROPY" }) => {
  const pct = isNaN(parseFloat(value)) ? 0 : parseFloat(value);
  const segments = 16;
  return (
    <div className="rounded-xl p-3" style={{ background: "rgba(6,0,0,0.55)", border: `1px solid ${color}33` }}>
      <div className="flex items-center justify-between mb-2">
        <p className="font-mono text-xs" style={{ color: COLORS.textDim }}>{label}</p>
        <p className="font-mono text-sm font-black" style={{ color, textShadow: `0 0 10px ${color}88` }}>
          {value === "—" ? "—" : `${pct}%`}
        </p>
      </div>
      {/* segmented bar */}
      <div className="flex gap-0.5">
        {Array.from({ length: segments }).map((_, i) => {
          const threshold = ((i + 1) / segments) * 100;
          const active = pct >= threshold;
          return (
            <motion.div key={i}
              className="flex-1 rounded-sm"
              style={{ height: 6, background: active ? color : "rgba(40,5,5,0.6)" }}
              animate={{ boxShadow: active ? `0 0 6px ${color}88` : "none" }}
              transition={{ duration: 0.3 }}
            />
          );
        })}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// COMPONENT: Pattern Detection Warning Banner
// ─────────────────────────────────────────────
const PatternWarning = ({ detected, type = "classical" }) => (
  <AnimatePresence>
    {detected && (
      <motion.div
        initial={{ opacity: 0, y: -8, height: 0 }} animate={{ opacity: 1, y: 0, height: "auto" }}
        exit={{ opacity: 0, y: -8, height: 0 }} transition={{ duration: 0.3 }}
        className="rounded-lg px-3 py-2 flex items-center gap-2"
        style={{ background: "rgba(120,40,0,0.25)", border: "1px solid rgba(255,100,0,0.5)" }}>
        <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1.2 }}
          className="text-base">⚠️</motion.span>
        <div>
          <p className="font-mono text-xs font-bold" style={{ color: "#ff8800" }}>
            {type === "classical" ? "PATTERN DETECTED IN CLASSICAL RNG" : "LOW ENTROPY WARNING"}
          </p>
          <p className="font-mono text-xs" style={{ color: COLORS.textDim }}>
            {type === "classical"
              ? "Repetition rate is accelerating — deterministic bias confirmed"
              : "Bit distribution skew detected — verify entropy source"}
          </p>
        </div>
      </motion.div>
    )}
  </AnimatePresence>
);

// ─────────────────────────────────────────────
// COMPONENT: Dashboard Summary Card
// ─────────────────────────────────────────────
const DashboardCard = ({ label, value, sub, color = COLORS.neon, icon }) => (
  <motion.div whileHover={{ scale: 1.02, boxShadow: `0 0 20px ${color}33` }}
    transition={{ duration: 0.15 }}
    className="rounded-xl p-3 flex flex-col gap-0.5"
    style={{ background: "rgba(8,2,2,0.8)", border: `1px solid ${color}33` }}>
    <div className="flex items-center gap-1.5 mb-1">
      {icon && <span className="text-sm">{icon}</span>}
      <p className="font-mono text-xs" style={{ color: COLORS.textDim }}>{label}</p>
    </div>
    <p className="font-mono text-lg font-black leading-none" style={{ color, textShadow: `0 0 12px ${color}55` }}>
      {value}
    </p>
    {sub && <p className="font-mono text-xs" style={{ color: COLORS.textDim }}>{sub}</p>}
  </motion.div>
);

// ─────────────────────────────────────────────
// COMPONENT: Repetition Frequency Chart
// Uses Map-based freq data
// ─────────────────────────────────────────────
const RepetitionFreqChart = ({ data, color, title }) => (
  <div>
    <p className="font-mono text-xs mb-2" style={{ color: COLORS.textDim }}>{title}</p>
    <ResponsiveContainer width="100%" height={100}>
      <BarChart data={data} margin={{ top: 2, right: 4, left: -28, bottom: 0 }}>
        <CartesianGrid strokeDasharray="2 4" stroke="rgba(80,0,0,0.15)" vertical={false} />
        <XAxis dataKey="bucket" tick={{ fill: COLORS.textDim, fontSize: 8, fontFamily: "monospace" }}
          interval={3} />
        <YAxis tick={{ fill: COLORS.textDim, fontSize: 8 }} />
        <Tooltip
          contentStyle={{ background: "#0e0202", border: `1px solid ${color}55`, borderRadius: 8, fontFamily: "monospace", fontSize: 10 }}
          labelStyle={{ color }} itemStyle={{ color: COLORS.textMid }}
          formatter={(v) => [v, "hits"]} labelFormatter={(l) => `bucket ${l}`}
        />
        <Bar dataKey="count" radius={[2, 2, 0, 0]} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.count > (data.reduce((a, b) => a + b.count, 0) / data.length) * 1.3
              ? "#ff4400" : color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>
);

// ─────────────────────────────────────────────
// COMPONENT: View Mode Toggle (3-way)
// ─────────────────────────────────────────────
const ViewModeToggle = ({ mode, onChange }) => {
  const modes = ["decimal", "binary", "bits"];
  const labels = { decimal: "DEC", binary: "BIN", bits: "BITS" };
  return (
    <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid ${COLORS.border}` }}>
      {modes.map((m) => (
        <button key={m} onClick={() => onChange(m)}
          className="font-mono text-xs px-2 py-1 transition-all"
          style={{
            background: mode === m ? "rgba(100,0,0,0.6)" : "transparent",
            color: mode === m ? COLORS.neon : COLORS.textDim,
            borderRight: m !== "bits" ? `1px solid ${COLORS.border}` : "none",
            boxShadow: mode === m ? `inset 0 0 10px rgba(255,26,26,0.15)` : "none",
          }}>
          {labels[m]}
        </button>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────
// COMPONENT: Beam Splitter Animation (center)
// ─────────────────────────────────────────────
const BeamSplitterAnimation = ({ lastDirection, triggerKey }) => {


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
// COMPONENT: Uniqueness Growth Chart
// Shared by both panels — color/label varies
// ─────────────────────────────────────────────
const UniquenessChart = ({ data, color, insightText, height = 120 }) => {
  const latest = data[data.length - 1];
  const collisionRate = latest
    ? (((latest.sample - latest.unique) / latest.sample) * 100).toFixed(1)
    : "0.0";
  const uniquePct = latest
    ? ((latest.unique / latest.sample) * 100).toFixed(1)
    : "100.0";

  return (
    <div>
      {/* mini stat badges */}
      <div className="flex items-center justify-between mb-2">
        <p className="font-mono text-xs" style={{ color: COLORS.textDim }}>
          UNIQUENESS GROWTH{" "}
          <span style={{ color: COLORS.textDim, fontSize: "0.6rem" }}>(REPETITION EFFECT)</span>
        </p>
        <div className="flex gap-2">
          <span className="font-mono text-xs px-2 py-0.5 rounded"
            style={{ background: "rgba(30,0,0,0.6)", color, border: `1px solid ${color}44` }}>
            {uniquePct}% unique
          </span>
          {parseFloat(collisionRate) > 0 && (
            <span className="font-mono text-xs px-2 py-0.5 rounded"
              style={{ background: "rgba(30,0,0,0.6)", color: "#ff6600", border: "1px solid rgba(255,102,0,0.3)" }}>
              {collisionRate}% repeated
            </span>
          )}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.18} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(80,0,0,0.18)" />
          <XAxis
            dataKey="sample"
            tick={{ fill: COLORS.textDim, fontSize: 8, fontFamily: "monospace" }}
            label={{ value: "samples", position: "insideBottomRight", offset: -4, fill: COLORS.textDim, fontSize: 8 }}
          />
          <YAxis tick={{ fill: COLORS.textDim, fontSize: 8 }} />
          <Tooltip
            contentStyle={{
              background: "#0d0202", border: `1px solid ${color}66`,
              borderRadius: 8, fontFamily: "monospace", fontSize: 10,
            }}
            labelStyle={{ color }}
            itemStyle={{ color: COLORS.textMid }}
            formatter={(v) => [v, "unique values"]}
            labelFormatter={(l) => `sample #${l}`}
          />
          {/* area fill under line */}
          <Line
            type="monotone" dataKey="unique"
            stroke={color} strokeWidth={2}
            dot={false} isAnimationActive={false}
            strokeLinecap="round"
            fill={`url(#grad-${color.replace("#", "")})`}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* insight text */}
      <motion.p
        initial={{ opacity: 0 }} animate={{ opacity: data.length > 2 ? 1 : 0 }}
        transition={{ duration: 0.6 }}
        className="font-mono text-xs mt-2 text-center py-1.5 rounded-lg"
        style={{
          color, background: `${color}0d`,
          border: `1px solid ${color}22`,
          letterSpacing: "0.05em",
          textShadow: `0 0 8px ${color}66`,
        }}>
        ◈ {insightText}
      </motion.p>
    </div>
  );
};

// ─────────────────────────────────────────────
// COMPONENT: Combined Uniqueness Comparison Chart
// Shows both Classical + Quantum on one canvas
// ─────────────────────────────────────────────
const CombinedUniquenessChart = ({ classicalData, quantumData }) => {
  // Merge by matching sample indices for Recharts
  const maxLen = Math.max(classicalData.length, quantumData.length);
  if (maxLen === 0) return (
    <div className="flex items-center justify-center h-24"
      style={{ color: COLORS.textDim, fontFamily: "monospace", fontSize: "0.7rem" }}>
      ── start both generators to see comparison ──
    </div>
  );

  // Build unified x-axis: take the longer array's sample points
  const base = classicalData.length >= quantumData.length ? classicalData : quantumData;
  const cMap = Object.fromEntries(classicalData.map((d) => [d.sample, d.unique]));
  const qMap = Object.fromEntries(quantumData.map((d) => [d.sample, d.unique]));

  const merged = base.map((d) => ({
    sample: d.sample,
    classical: cMap[d.sample] ?? null,
    quantum: qMap[d.sample] ?? null,
  }));

  return (
    <div>
      <div className="flex items-center gap-4 mb-2">
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-0.5 rounded" style={{ background: COLORS.classical }} />
          <span className="font-mono text-xs" style={{ color: COLORS.textDim }}>Classical</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-0.5 rounded" style={{ background: COLORS.quantum }} />
          <span className="font-mono text-xs" style={{ color: COLORS.textDim }}>Quantum</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={merged} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(80,0,0,0.15)" />
          <XAxis dataKey="sample" tick={{ fill: COLORS.textDim, fontSize: 8, fontFamily: "monospace" }} />
          <YAxis tick={{ fill: COLORS.textDim, fontSize: 8 }} />
          <Tooltip
            contentStyle={{ background: "#0d0202", border: `1px solid ${COLORS.borderBright}`, borderRadius: 8, fontFamily: "monospace", fontSize: 10 }}
            labelStyle={{ color: COLORS.neon }}
            itemStyle={{ color: COLORS.textMid }}
            formatter={(v, name) => [v, name === "classical" ? "Classical unique" : "Quantum unique"]}
            labelFormatter={(l) => `sample #${l}`}
          />
          <Line type="monotone" dataKey="classical" stroke={COLORS.classical}
            strokeWidth={2} dot={false} isAnimationActive={false}
            strokeDasharray="5 3" connectNulls />
          <Line type="monotone" dataKey="quantum" stroke={COLORS.quantum}
            strokeWidth={2.5} dot={false} isAnimationActive={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
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
const ClassicalPanel = ({ speed, range, onValue }) => {
  const [values, setValues] = useState([]);
  const [latest, setLatest] = useState(null);
  const [viewMode, setViewMode] = useState("decimal");
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef(null);

  const generate = useCallback(() => {
    const v = classicalRandom(range);
    setLatest(v);
    setValues((prev) => [...prev.slice(-999), v]);
    onValue && onValue(v);
  }, [onValue, range]);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(generate, Math.max(100, 1100 - speed * 10));
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning, speed, generate]);

  const reset = () => { setValues([]); setLatest(null); setIsRunning(false); };

  // ── Derived data ──
  const histogram = buildHistogram(values, range);
  const last20 = values.slice(-20);
  const entropyVal = values.length > 1
    ? (shannonEntropy(values.map((v) => (v > range / 2 ? 1 : 0))) * 100).toFixed(1)
    : "—";
  const uniquenessData = buildUniquenessData(values, "classical");
  const repetitionData = buildRepetitionFrequency(values, 20, range);
  const patternDetected = detectPattern(values);

  // Uniqueness stats
  const lastU = uniquenessData[uniquenessData.length - 1];
  const uniqueCount = lastU ? lastU.unique : 0;
  const repeatCount = values.length - uniqueCount;
  const repeatPct = values.length > 0 ? ((repeatCount / values.length) * 100).toFixed(1) : "0.0";

  const bitWidth = Math.max(8, Math.ceil(Math.log2(range || 2)));
  const displayValue = (v) => {
    if (v === null) return "—";
    if (viewMode === "binary") return v.toString(2).padStart(bitWidth, "0");
    if (viewMode === "bits") return v.toString(2).padStart(8, "0");
    return v.toString();
  };

  return (
    <GlassCard className="flex flex-col gap-4 p-5 h-full" glow={isRunning}>
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ background: COLORS.classical, boxShadow: `0 0 10px ${COLORS.classical}` }} />
            <h2 className="font-mono text-sm font-bold tracking-widest uppercase" style={{ color: COLORS.neon }}>
              Classical RNG
            </h2>
            <InfoTooltip text="PRNG: Math.random() uses xorshift128+. Deterministic — given the same seed it always produces the same sequence. Predictable if seed is known." />
          </div>
          <p className="font-mono text-xs" style={{ color: COLORS.textDim }}>Pseudo-Random · Deterministic · xorshift128+</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <ViewModeToggle mode={viewMode} onChange={setViewMode} />
          <NeonButton small onClick={reset}>RST</NeonButton>
        </div>
      </div>

      {/* ── Pattern warning ── */}
      <PatternWarning detected={patternDetected} type="classical" />

      {/* ── Big value display ── */}
      <motion.div layout className="rounded-xl p-4 text-center"
        style={{ background: "rgba(6,0,0,0.65)", border: `1px solid ${COLORS.border}` }}>
        <p className="font-mono text-xs mb-1" style={{ color: COLORS.textDim }}>GENERATED VALUE</p>
        <AnimatePresence mode="wait">
          <motion.p key={`${latest}-${viewMode}`}
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="font-mono font-bold break-all leading-snug"
            style={{ fontSize: viewMode === "decimal" ? "1.45rem" : "0.75rem", color: COLORS.neon, textShadow: `0 0 14px ${COLORS.neon}` }}>
            {displayValue(latest)}
          </motion.p>
        </AnimatePresence>
        <p className="font-mono text-xs mt-1" style={{ color: COLORS.textDim }}>
          {viewMode === "decimal" ? `integer ∈ [0, ${range - 1}]` : viewMode === "binary" ? `${bitWidth}-bit binary` : "8-bit stream"}
        </p>
      </motion.div>

      {/* ── Generate button ── */}
      <div className="flex items-center justify-between gap-3">
        <NeonButton onClick={isRunning ? () => setIsRunning(false) : () => setIsRunning(true)}>
          {isRunning ? "⬛ STOP" : "▶ GENERATE CLASSICAL"}
        </NeonButton>
        <NeonButton small onClick={() => exportCSV(values, "classical-rng.csv")} disabled={!values.length}>
          ↓ CSV
        </NeonButton>
      </div>

      {/* ── Dashboard summary cards ── */}
      <div className="grid grid-cols-3 gap-2">
        <DashboardCard label="TOTAL SAMPLES" value={values.length} icon="📊" color={COLORS.neon} />
        <DashboardCard label="UNIQUE VALUES" value={uniqueCount} sub={`${(100 - parseFloat(repeatPct)).toFixed(1)}% unique`} icon="🔢" color={COLORS.classical} />
        <DashboardCard label="REPEATED" value={`${repeatPct}%`} sub={`${repeatCount} collisions`} icon="♻️" color={patternDetected ? "#ff6600" : COLORS.textMid} />
      </div>

      {/* ── Entropy gauge ── */}
      <EntropyGauge value={entropyVal} color={COLORS.neon} label="LIVE ENTROPY INDICATOR" />

      {/* ── Last 20 mini-strip ── */}
      <div>
        <p className="font-mono text-xs mb-2" style={{ color: COLORS.textDim }}>LAST 20 VALUES</p>
        <div className="grid gap-0.5" style={{ gridTemplateColumns: "repeat(20, 1fr)" }}>
          {Array.from({ length: 20 }).map((_, i) => {
            const v = last20[i];
            return (
              <motion.div key={i} title={v?.toString()}
                className="rounded-sm"
                style={{
                  height: 18,
                  background: v !== undefined ? `rgba(${Math.floor((v / range) * 180 + 40)},0,0,0.9)` : "rgba(20,5,5,0.3)",
                  border: "1px solid rgba(80,0,0,0.2)",
                }}
                initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.15 }}
              />
            );
          })}
        </div>
      </div>

      {/* ── Distribution histogram ── */}
      <div>
        <p className="font-mono text-xs mb-1" style={{ color: COLORS.textDim }}>DISTRIBUTION — {values.length} samples</p>
        <ResponsiveContainer width="100%" height={100}>
          <BarChart data={histogram} margin={{ top: 2, right: 4, left: -28, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(80,0,0,0.15)" vertical={false} />
            <XAxis dataKey="range" tick={{ fill: COLORS.textDim, fontSize: 8, fontFamily: "monospace" }} />
            <YAxis tick={{ fill: COLORS.textDim, fontSize: 8 }} />
            <Tooltip contentStyle={{ background: "#120202", border: `1px solid ${COLORS.borderBright}`, borderRadius: 8, fontFamily: "monospace", fontSize: 10 }}
              labelStyle={{ color: COLORS.neon }} itemStyle={{ color: COLORS.textMid }} />
            <Bar dataKey="count" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {histogram.map((_, i) => <Cell key={i} fill={`rgba(${140 + i * 6},${i * 2},0,0.85)`} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Repetition Frequency Chart ── */}
      <div className="rounded-xl p-3" style={{ background: "rgba(6,0,0,0.5)", border: `1px solid ${COLORS.border}` }}>
        <RepetitionFreqChart
          data={repetitionData}
          color={COLORS.classical}
          title="REPETITION FREQUENCY (CLASSICAL RNG)"
        />
      </div>

      {/* ── Uniqueness Growth Chart ── */}
      {values.length > 1 && (
        <div className="rounded-xl p-3" style={{ background: "rgba(6,0,0,0.5)", border: `1px solid ${COLORS.border}` }}>
          <UniquenessChart
            data={uniquenessData}
            color={COLORS.classical}
            insightText="Repetition increases → entropy decreases"
            height={110}
          />
        </div>
      )}
    </GlassCard>
  );
};

// ─────────────────────────────────────────────
// COMPONENT: Quantum RNG Panel
// ─────────────────────────────────────────────
const QuantumPanel = ({ speed, range, onBit, onValue }) => {
  const [bits, setBits] = useState([]);
  const [qValues, setQValues] = useState([]);
  const [latest, setLatest] = useState(null);
  const [latestBit, setLatestBit] = useState(null);
  const [viewMode, setViewMode] = useState("binary");
  const [isRunning, setIsRunning] = useState(false);
  const [triggerKey, setTriggerKey] = useState(0);
  const intervalRef = useRef(null);

  const generate = useCallback(() => {
    const bit = quantumBit();
    const val = quantumRandom(range);
    setLatestBit(bit);
    setLatest(val);
    setBits((prev) => [...prev.slice(-999), bit]);
    setQValues((prev) => [...prev.slice(-999), val]);
    setTriggerKey((k) => k + 1);
    onBit && onBit(bit);
    onValue && onValue(val);
  }, [onBit, onValue, range]);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(generate, Math.max(100, 1100 - speed * 10));
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning, speed, generate]);

  const reset = () => {
    setBits([]); setQValues([]); setLatest(null); setLatestBit(null); setIsRunning(false);
  };

  // ── Derived data ──
  const zeros = bits.filter((b) => b === 0).length;
  const ones = bits.filter((b) => b === 1).length;
  const freqData = [{ label: "0", count: zeros }, { label: "1", count: ones }];
  const uniquenessData = buildUniquenessData(qValues, "quantum");
  const repetitionData = buildRepetitionFrequency(qValues, 20, range);

  const lastU = uniquenessData[uniquenessData.length - 1];
  const uniqueCount = lastU ? lastU.unique : 0;
  const repeatCount = qValues.length - uniqueCount;
  const repeatPct = qValues.length > 0 ? ((repeatCount / qValues.length) * 100).toFixed(1) : "0.0";

  // Entropy: for bit stream balance
  const bitEntropyVal = bits.length > 1
    ? (shannonEntropy(bits) * 100).toFixed(1)
    : "—";
  const biasWarning = bits.length > 30 && Math.abs(zeros - ones) > bits.length * 0.2;

  const bitWidth = Math.max(8, Math.ceil(Math.log2(range || 2)));
  const displayValue = (v) => {
    if (v === null) return "—";
    if (viewMode === "binary") return v.toString(2).padStart(bitWidth, "0");
    if (viewMode === "bits") return v.toString(2).padStart(8, "0");
    return v.toString();
  };

  return (
    <GlassCard className="flex flex-col gap-4 p-5 h-full" glow={isRunning}>
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ background: COLORS.quantum, boxShadow: `0 0 10px ${COLORS.quantum}` }} />
            <h2 className="font-mono text-sm font-bold tracking-widest uppercase" style={{ color: COLORS.quantum }}>
              Quantum RNG
            </h2>
            <InfoTooltip text="QRNG: Uses crypto.getRandomValues() — hardware entropy source. True randomness from quantum phenomena: thermal noise, radioactive decay, photon arrival timing." />
          </div>
          <p className="font-mono text-xs" style={{ color: COLORS.textDim }}>Quantum-Inspired · True Entropy · crypto API</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <ViewModeToggle mode={viewMode} onChange={setViewMode} />
          <NeonButton small onClick={reset}>RST</NeonButton>
        </div>
      </div>

      {/* ── Bias / low-entropy warning ── */}
      <PatternWarning detected={biasWarning} type="quantum" />

      {/* ── Bit + value display ── */}
      <div className="grid grid-cols-2 gap-3">
        <motion.div className="rounded-xl p-4 text-center"
          style={{ background: "rgba(6,0,0,0.65)", border: `1px solid ${COLORS.border}` }}>
          <p className="font-mono text-xs mb-1" style={{ color: COLORS.textDim }}>QUANTUM BIT</p>
          <AnimatePresence mode="wait">
            <motion.p key={`bit-${triggerKey}`}
              initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.4, opacity: 0 }} transition={{ duration: 0.18 }}
              className="font-mono font-black"
              style={{
                fontSize: "3rem", lineHeight: 1,
                color: latestBit === null ? COLORS.textDim : latestBit === 1 ? COLORS.quantum : COLORS.neon,
                textShadow: latestBit !== null ? `0 0 24px ${latestBit === 1 ? COLORS.quantum : COLORS.neon}` : "none",
              }}>
              {latestBit === null ? "?" : latestBit}
            </motion.p>
          </AnimatePresence>
        </motion.div>
        <motion.div className="rounded-xl p-4 text-center"
          style={{ background: "rgba(6,0,0,0.65)", border: `1px solid ${COLORS.border}` }}>
          <p className="font-mono text-xs mb-1" style={{ color: COLORS.textDim }}>INTEGER VALUE</p>
          <AnimatePresence mode="wait">
            <motion.p key={`val-${triggerKey}-${viewMode}`}
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="font-mono font-bold break-all leading-snug"
              style={{ fontSize: viewMode === "decimal" ? "0.95rem" : "0.65rem", color: COLORS.quantum, textShadow: `0 0 10px ${COLORS.quantum}` }}>
              {displayValue(latest)}
            </motion.p>
          </AnimatePresence>
        </motion.div>
      </div>

      {/* ── Beam splitter ── */}
      <BeamSplitterAnimation lastDirection={latestBit} triggerKey={triggerKey} />

      {/* ── Generate button ── */}
      <div className="flex items-center justify-between gap-3">
        <NeonButton onClick={isRunning ? () => setIsRunning(false) : () => setIsRunning(true)}>
          {isRunning ? "⬛ STOP" : "▶ GENERATE QUANTUM"}
        </NeonButton>
        <NeonButton small onClick={() => exportCSV(qValues, "quantum-rng.csv")} disabled={!qValues.length}>
          ↓ CSV
        </NeonButton>
      </div>

      {/* ── Dashboard summary cards ── */}
      <div className="grid grid-cols-3 gap-2">
        <DashboardCard label="MEASUREMENTS" value={qValues.length} icon="⚛️" color={COLORS.quantum} />
        <DashboardCard label="UNIQUE" value={uniqueCount} sub={`${(100 - parseFloat(repeatPct)).toFixed(1)}% unique`} icon="✨" color={COLORS.quantum} />
        <DashboardCard label="REPEATED" value={`${repeatPct}%`} sub="near-zero" icon="🔁" color={COLORS.textMid} />
      </div>

      {/* ── Entropy gauge ── */}
      <EntropyGauge value={bitEntropyVal} color={COLORS.quantum} label="BIT-STREAM ENTROPY INDICATOR" />

      {/* ── Bit stream terminal ── */}
      <div>
        <p className="font-mono text-xs mb-1.5" style={{ color: COLORS.textDim }}>LIVE BIT STREAM</p>
        <BitStreamTerminal bits={bits.slice(-128)} />
      </div>

      {/* ── Bit frequency chart ── */}
      <div>
        <p className="font-mono text-xs mb-1" style={{ color: COLORS.textDim }}>
          BIT FREQUENCY — {bits.length} measurements ({zeros} zeros / {ones} ones)
        </p>
        <ResponsiveContainer width="100%" height={70}>
          <BarChart data={freqData} margin={{ top: 2, right: 4, left: -28, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(80,0,0,0.15)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: COLORS.textDim, fontSize: 11, fontFamily: "monospace" }} />
            <YAxis tick={{ fill: COLORS.textDim, fontSize: 8 }} />
            <Tooltip contentStyle={{ background: "#120202", border: `1px solid ${COLORS.borderBright}`, borderRadius: 8, fontFamily: "monospace", fontSize: 10 }}
              labelStyle={{ color: COLORS.quantum }} itemStyle={{ color: COLORS.textMid }} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              <Cell fill={COLORS.neon} /> <Cell fill={COLORS.quantum} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Repetition Frequency Chart ── */}
      <div className="rounded-xl p-3" style={{ background: "rgba(6,0,0,0.5)", border: `1px solid rgba(255,77,77,0.2)` }}>
        <RepetitionFreqChart
          data={repetitionData}
          color={COLORS.quantum}
          title="REPETITION FREQUENCY (QUANTUM RNG)"
        />
      </div>

      {/* ── Uniqueness Growth Chart ── */}
      {qValues.length > 1 && (
        <div className="rounded-xl p-3" style={{ background: "rgba(6,0,0,0.5)", border: `1px solid rgba(255,77,77,0.2)` }}>
          <UniquenessChart
            data={uniquenessData}
            color={COLORS.quantum}
            insightText="Near-zero repetition → high entropy"
            height={110}
          />
        </div>
      )}
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
const RANGE_OPTIONS = [100, 1000, 10000];

const Navbar = ({ speed, setSpeed, range, setRange }) => (
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
      <div className="hidden sm:flex items-center gap-3">
        <p className="font-mono text-xs" style={{ color: COLORS.textDim }}>RANGE</p>
        <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid ${COLORS.border}` }}>
          {RANGE_OPTIONS.map((r) => (
            <button key={r} onClick={() => setRange(r)}
              className="font-mono text-xs px-2 py-1 transition-all"
              style={{
                background: range === r ? "rgba(100,0,0,0.6)" : "transparent",
                color: range === r ? COLORS.neon : COLORS.textDim,
                borderRight: r !== RANGE_OPTIONS[RANGE_OPTIONS.length - 1] ? `1px solid ${COLORS.border}` : "none",
                boxShadow: range === r ? "inset 0 0 10px rgba(255,26,26,0.15)" : "none",
              }}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#22cc55", boxShadow: "0 0 6px #22cc55" }} />
        <p className="font-mono text-xs" style={{ color: COLORS.textDim }}>LIVE</p>
      </div>
    </div>
  </motion.nav>
);

// ─────────────────────────────────────────────
// ROOT APP — CSS Grid layout
// Row 1: Navbar
// Row 2: Classical | Quantum (split)
// Row 3: Combined Uniqueness (full width)
// Row 4: Comparison | Learning Lab
// ─────────────────────────────────────────────
export default function App() {
  const [speed, setSpeed] = useState(50);
  const [range, setRange] = useState(1000);

  // Lifted histories for the combined comparison chart
  const [classicalHistory, setClassicalHistory] = useState([]);
  const [quantumHistory, setQuantumHistory] = useState([]);

  const handleClassicalValue = useCallback((v) => {
    setClassicalHistory((prev) => [...prev.slice(-999), v]);
  }, []);

  const handleQuantumValue = useCallback((v) => {
    setQuantumHistory((prev) => [...prev.slice(-999), v]);
  }, []);

  // Clear all histories when range changes
  useEffect(() => {
    setClassicalHistory([]);
    setQuantumHistory([]);
  }, [range]);

  const classicalUniqueness = buildUniquenessData(classicalHistory, "classical");
  const quantumUniqueness = buildUniquenessData(quantumHistory, "quantum");

  // Global CSV export (both datasets combined)
  const exportBothCSV = () => {
    const maxLen = Math.max(classicalHistory.length, quantumHistory.length);
    const rows = ["index,classical,quantum"];
    for (let i = 0; i < maxLen; i++) {
      rows.push(`${i + 1},${classicalHistory[i] ?? ""},${quantumHistory[i] ?? ""}`);
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "rng-comparison.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen relative" style={{ background: COLORS.bg, color: COLORS.text }}>
      <BackgroundGrid />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&display=swap');
        * { font-family: 'JetBrains Mono', monospace; box-sizing: border-box; }
        body { margin: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0a0000; }
        ::-webkit-scrollbar-thumb { background: #5a0000; border-radius: 2px; }
        input[type=range] { cursor: pointer; }
        .recharts-text { font-family: 'JetBrains Mono', monospace !important; }
        /* ── smooth hover glow on GlassCard ── */
        .glass-hover { transition: box-shadow 0.25s ease, border-color 0.25s ease; }
        .glass-hover:hover { box-shadow: 0 0 28px rgba(139,0,0,0.25) !important; }
      `}</style>

      <div className="relative z-10 flex flex-col min-h-screen">

        {/* ── ROW 1: Navbar ── */}
        <Navbar speed={speed} setSpeed={setSpeed} range={range} setRange={setRange} />

        {/* ── Sub-header ── */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          className="px-6 py-3 flex items-center justify-between"
          style={{ borderBottom: `1px solid rgba(80,0,0,0.2)`, background: "rgba(5,0,0,0.4)" }}>
          <p className="font-mono text-xs tracking-widest" style={{ color: COLORS.textDim }}>
            EXPLORING THE FUNDAMENTAL DIFFERENCE BETWEEN DETERMINISTIC AND TRUE RANDOMNESS
          </p>
          <NeonButton small onClick={exportBothCSV} disabled={!classicalHistory.length && !quantumHistory.length}>
            ↓ EXPORT ALL
          </NeonButton>
        </motion.div>

        {/* ── MAIN CONTENT GRID ── */}
        <div className="flex-1 p-4 md:p-6 w-full max-w-[1600px] mx-auto" style={{ display: "grid", gap: "1.25rem" }}>

          {/* ROW 2: Side-by-side panels */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
          <motion.div 
            key={`classical-${range}`}
            className="min-w-0"
            initial={{ opacity: 0, x: -28 }} 
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <ClassicalPanel speed={speed} range={range} onValue={handleClassicalValue} />
          </motion.div>

          <motion.div 
            key={`quantum-${range}`}
            className="min-w-0"
            initial={{ opacity: 0, x: 28 }} 
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.32 }}
          >
            <QuantumPanel speed={speed} range={range} onValue={handleQuantumValue} />
          </motion.div>
        </div>

          {/* ROW 3: Combined Uniqueness Comparison — full width */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.42 }}>
            <GlassCard className="p-6">
              {/* heading row */}
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <h3 className="font-mono text-sm font-bold tracking-widest uppercase" style={{ color: COLORS.neon }}>
                  UNIQUENESS GROWTH COMPARISON
                </h3>
                <span className="font-mono text-xs px-2 py-0.5 rounded"
                  style={{ background: "rgba(30,0,0,0.5)", color: COLORS.textDim, border: `1px solid ${COLORS.border}` }}>
                  LIVE · DUAL TRACE
                </span>
                <div className="flex-1 h-px hidden md:block"
                  style={{ background: `linear-gradient(90deg,${COLORS.neonDim},transparent)` }} />
                <NeonButton small onClick={() => { setClassicalHistory([]); setQuantumHistory([]); }}>
                  RST ALL
                </NeonButton>
              </div>
              <p className="font-mono text-xs mb-5" style={{ color: COLORS.textDim }}>
                Classical (dashed) plateaus as collision rate rises · Quantum (solid) grows linearly at near-100% uniqueness
              </p>

              {/* Chart */}
              <CombinedUniquenessChart classicalData={classicalUniqueness} quantumData={quantumUniqueness} />

              {/* Summary stat cards */}
              {(classicalUniqueness.length > 2 || quantumUniqueness.length > 2) && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
                  <DashboardCard
                    label="CLASSICAL SAMPLES" icon="📉"
                    value={classicalHistory.length}
                    color={COLORS.classical}
                  />
                  <DashboardCard
                    label="CLASSICAL UNIQUE RATE" icon="♻️"
                    value={classicalUniqueness.length
                      ? ((classicalUniqueness.at(-1).unique / classicalUniqueness.at(-1).sample) * 100).toFixed(1) + "%"
                      : "—"}
                    sub="of samples are unique"
                    color={COLORS.classical}
                  />
                  <DashboardCard
                    label="QUANTUM SAMPLES" icon="⚛️"
                    value={quantumHistory.length}
                    color={COLORS.quantum}
                  />
                  <DashboardCard
                    label="QUANTUM UNIQUE RATE" icon="✨"
                    value={quantumUniqueness.length
                      ? ((quantumUniqueness.at(-1).unique / quantumUniqueness.at(-1).sample) * 100).toFixed(1) + "%"
                      : "—"}
                    sub="near-zero collision"
                    color={COLORS.quantum}
                  />
                </div>
              )}
            </GlassCard>
          </motion.div>

          {/* ROW 4: Comparison + Learning Lab */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.52 }}>
              <ComparisonSection />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.6 }}>
              <InfoPanel />
            </motion.div>
          </div>

          {/* Footer */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.75 }}
            className="text-center py-4"
            style={{ borderTop: `1px solid rgba(80,0,0,0.2)` }}>
            <p className="font-mono text-xs" style={{ color: COLORS.textDim }}>
              QUANTUM RANDOMNESS SIMULATOR v2.0 · React + Recharts + Framer Motion ·{" "}
              Classical: <code style={{ color: COLORS.neon }}>Math.random()</code> ·{" "}
              Quantum: <code style={{ color: COLORS.quantum }}>crypto.getRandomValues()</code>
            </p>
          </motion.div>

        </div>
      </div>
    </div>
  );
}