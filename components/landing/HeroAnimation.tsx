'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect, useMemo, useCallback } from 'react'

const TEAL = '#26C1C9'
const NAVY = '#0A192F'
const TEAL_GLOW = 'rgba(38, 193, 201, 0.6)'
const TEAL_SOFT = 'rgba(38, 193, 201, 0.15)'

// Cycle timing (ms)
const T_TRAVERSE = 800
const T_EXPLODE = 2200
const T_RESOLVE = 3200
const T_FADE = 7200 // hold resolve for 4s, then fade
const T_RESTART = 8200 // 1s fade, then restart
const CYCLE_MS = T_RESTART

type Phase = 'enter' | 'traverse' | 'explode' | 'resolve' | 'fade'

/** Glassmorphic invoice sheet */
function GlassInvoice({
  className,
  style,
  prominent,
}: {
  className?: string
  style?: React.CSSProperties
  prominent?: boolean
}) {
  return (
    <div
      className={className}
      style={{
        background: prominent ? 'rgba(255, 255, 255, 0.92)' : 'rgba(255, 255, 255, 0.12)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: prominent
          ? '1px solid rgba(226, 232, 240, 0.8)'
          : '1px solid rgba(255, 255, 255, 0.25)',
        borderRadius: 12,
        boxShadow: prominent
          ? '0 20px 60px -12px rgba(10, 25, 47, 0.18), 0 8px 24px -4px rgba(38, 193, 201, 0.12)'
          : 'none',
        ...style,
      }}
    >
      <svg viewBox="0 0 64 82" fill="none" className="h-full w-full">
        <rect x="8" y="8" width="20" height="3" rx="1.5" fill={TEAL} opacity={0.9} />
        <rect x="8" y="8" width="20" height="3" rx="1.5" fill="url(#headerShine)" />
        <rect x="8" y="18" width="48" height="2" rx="1" fill={NAVY} opacity={0.25} />
        <rect x="8" y="24" width="44" height="2" rx="1" fill={NAVY} opacity={0.18} />
        <rect x="8" y="30" width="48" height="2" rx="1" fill={NAVY} opacity={0.25} />
        <rect x="8" y="36" width="32" height="2" rx="1" fill={NAVY} opacity={0.18} />
        <rect x="8" y="42" width="44" height="2" rx="1" fill={NAVY} opacity={0.2} />
        <line x1="8" y1="52" x2="56" y2="52" stroke={NAVY} strokeOpacity={0.12} strokeWidth="1" />
        <rect x="8" y="58" width="16" height="3" rx="1.5" fill={NAVY} opacity={0.45} />
        <rect x="36" y="58" width="20" height="3" rx="1.5" fill={TEAL} opacity={0.7} />
        <path d="M48 0 L64 0 L64 16 Z" fill="rgba(38, 193, 201, 0.08)" />
        <path d="M48 0 L48 16 L64 16" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
        <defs>
          <linearGradient id="headerShine" x1="8" y1="8" x2="28" y2="8">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="50%" stopColor="white" stopOpacity="0.4" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  )
}

/** Dockett portal frame */
function PortalFrame() {
  return (
    <svg viewBox="0 0 100 100" fill="none" className="h-full w-full">
      <defs>
        <linearGradient id="frameGrad" x1="0" y1="0" x2="100" y2="100">
          <stop offset="0%" stopColor={TEAL} />
          <stop offset="50%" stopColor="#4DE8E0" />
          <stop offset="100%" stopColor={TEAL} />
        </linearGradient>
        <filter id="portalInnerGlow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      <rect
        x="8" y="8" width="84" height="84" rx="18"
        stroke="url(#frameGrad)" strokeWidth="4.5" fill="none"
        filter="url(#portalInnerGlow)"
      />
      <rect
        x="22" y="22" width="56" height="56" rx="12"
        stroke={TEAL} strokeWidth="2" fill="none" opacity={0.3}
      />
      <circle cx="50" cy="50" r="4" fill={TEAL} />
      <circle cx="50" cy="50" r="7" fill="none" stroke={TEAL} strokeWidth="1" opacity={0.3} />
    </svg>
  )
}

const DATA_CHIPS = [
  { label: 'Vendor', value: 'Amazon Web Services', icon: '🏢' },
  { label: 'Amount', value: '$1,429.00', icon: '💰' },
  { label: 'Due Date', value: 'Apr 1, 2026', icon: '📅' },
  { label: 'Invoice', value: 'INV-2026-0483', icon: '📄' },
]

const CHIP_CENTER_Y = [72, 136, 200, 264]

export default function HeroAnimation() {
  const [phase, setPhase] = useState<Phase>('enter')
  const [cycle, setCycle] = useState(0)

  // Stable random values — regenerated each cycle for visual variety
  const burstParticles = useMemo(
    () =>
      Array.from({ length: 20 }, (_, i) => ({
        id: i,
        angle: ((Math.random() * 140 - 70) * Math.PI) / 180,
        distance: 80 + Math.random() * 120,
        size: 4 + Math.random() * 7,
        duration: 0.8 + Math.random() * 0.6,
        delay: Math.random() * 0.15,
        bright: Math.random() > 0.6,
      })),
    [cycle]
  )

  const streamParticles = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => ({
        id: i,
        yOffset: (Math.random() - 0.5) * 40,
        size: 2 + Math.random() * 3,
        duration: 1.2 + Math.random() * 0.8,
        delay: i * 0.35,
      })),
    [cycle]
  )

  const runCycle = useCallback(() => {
    setPhase('enter')
    const timers = [
      setTimeout(() => setPhase('traverse'), T_TRAVERSE),
      setTimeout(() => setPhase('explode'), T_EXPLODE),
      setTimeout(() => setPhase('resolve'), T_RESOLVE),
      setTimeout(() => setPhase('fade'), T_FADE),
      setTimeout(() => setCycle((c) => c + 1), CYCLE_MS),
    ]
    return timers
  }, [])

  useEffect(() => {
    const timers = runCycle()
    return () => timers.forEach(clearTimeout)
  }, [cycle, runCycle])

  const isActive = phase === 'resolve'
  const isFading = phase === 'fade'

  return (
    <motion.div
      className="relative mx-auto flex h-[340px] w-full max-w-[640px] items-center justify-center overflow-hidden sm:h-[400px]"
      style={{ color: NAVY }}
      // Fade the whole container out during the fade phase, back in on restart
      animate={{ opacity: isFading ? 0 : 1 }}
      transition={{ duration: isFading ? 0.8 : 0.5, ease: 'easeInOut' }}
    >
      {/* ── Background ambient glow ── */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 60% 50% at 50% 50%, ${TEAL_SOFT} 0%, transparent 70%)`,
        }}
        animate={{ opacity: [0.3, 0.7, 0.3] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* ── Glass invoice ── */}
      <AnimatePresence mode="wait">
        {(phase === 'enter' || phase === 'traverse') && (
          <motion.div
            key={`invoice-${cycle}`}
            className="absolute z-20"
            style={{ width: 80, height: 102 }}
            initial={{ x: -180, opacity: 0, rotateY: -15 }}
            animate={
              phase === 'enter'
                ? { x: -180, opacity: 1, rotateY: -8 }
                : { x: -10, opacity: 1, rotateY: 0 }
            }
            exit={{
              x: 10,
              opacity: 0,
              scale: 0.3,
              filter: `brightness(3) drop-shadow(0 0 20px ${TEAL})`,
            }}
            transition={
              phase === 'enter'
                ? { duration: 0.6, ease: 'easeOut' }
                : { duration: 1.2, ease: [0.22, 1, 0.36, 1] }
            }
          >
            <GlassInvoice className="h-full w-full" prominent />
            <motion.div
              className="absolute inset-0 rounded-[12px]"
              style={{
                background:
                  'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.35) 50%, transparent 60%)',
              }}
              animate={{ x: [-100, 100] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', repeatDelay: 1 }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Static ghost invoice at start ── */}
      <motion.div
        className="absolute z-[5]"
        style={{ width: 70, height: 90, left: 'calc(50% - 180px)' }}
        animate={{ opacity: isActive ? 0.1 : 0 }}
        transition={{ duration: 0.8 }}
      >
        <GlassInvoice className="h-full w-full" prominent />
      </motion.div>

      {/* ── Central portal ── */}
      <div
        className="absolute z-30 h-[90px] w-[90px] sm:h-[110px] sm:w-[110px]"
        style={{ left: 'calc(50% - 100px)' }}
      >
        {/* Rotating outer glow ring */}
        <motion.div
          className="absolute inset-[-14px] rounded-[26px]"
          style={{
            background: `conic-gradient(from 0deg, transparent 0%, ${TEAL_GLOW} 25%, transparent 50%, ${TEAL_GLOW} 75%, transparent 100%)`,
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
        />

        {/* Secondary counter-rotating ring */}
        <motion.div
          className="absolute inset-[-8px] rounded-[22px] opacity-40"
          style={{
            background: `conic-gradient(from 180deg, transparent 0%, ${TEAL_GLOW} 20%, transparent 40%, ${TEAL_GLOW} 60%, transparent 80%, ${TEAL_GLOW} 100%)`,
          }}
          animate={{ rotate: -360 }}
          transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
        />

        {/* Pulsing radial light */}
        <motion.div
          className="absolute inset-[-20px] rounded-[32px]"
          style={{
            background: `radial-gradient(circle, ${TEAL}50 0%, transparent 60%)`,
          }}
          animate={{
            scale: phase === 'explode' ? [1, 1.8, 1.1] : [1, 1.1, 1],
            opacity: phase === 'explode' ? [0.5, 1, 0.3] : [0.2, 0.35, 0.2],
          }}
          transition={{
            duration: phase === 'explode' ? 0.6 : 3,
            repeat: phase === 'explode' ? 0 : Infinity,
            ease: 'easeInOut',
          }}
        />

        {/* Scanning beam */}
        <motion.div
          className="absolute left-0 z-10 h-[3px] w-full"
          style={{
            background: `linear-gradient(90deg, transparent, ${TEAL}, transparent)`,
            boxShadow: `0 0 12px ${TEAL_GLOW}, 0 0 24px ${TEAL_GLOW}`,
            borderRadius: 2,
          }}
          animate={{ top: ['15%', '85%', '15%'] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Transformation flash */}
        <AnimatePresence>
          {phase === 'explode' && (
            <motion.div
              key={`flash-${cycle}`}
              className="absolute inset-[-30px] rounded-full"
              style={{
                background: `radial-gradient(circle, white 0%, ${TEAL} 30%, transparent 60%)`,
              }}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: [0, 1, 0.8, 0], scale: [0.5, 1.8, 2.2, 2.5] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          )}
        </AnimatePresence>

        {/* The portal frame */}
        <motion.div
          className="relative h-full w-full"
          style={{ filter: `drop-shadow(0 0 16px ${TEAL}80)` }}
          animate={
            phase === 'explode'
              ? {
                  scale: [1, 1.15, 1],
                  filter: [
                    `drop-shadow(0 0 16px ${TEAL}80)`,
                    `drop-shadow(0 0 30px ${TEAL})`,
                    `drop-shadow(0 0 16px ${TEAL}80)`,
                  ],
                }
              : {}
          }
          transition={{ duration: 0.5 }}
        >
          <PortalFrame />
        </motion.div>
      </div>

      {/* ── Big particle burst ── */}
      <AnimatePresence>
        {phase === 'explode' &&
          burstParticles.map((p) => {
            const tx = Math.cos(p.angle) * p.distance
            const ty = Math.sin(p.angle) * p.distance
            return (
              <motion.div
                key={`burst-${cycle}-${p.id}`}
                className="absolute z-40 rounded-full"
                style={{
                  width: p.size,
                  height: p.size,
                  background: p.bright
                    ? `radial-gradient(circle, white 0%, ${TEAL} 50%, transparent 100%)`
                    : `radial-gradient(circle, ${TEAL} 0%, rgba(38,193,201,0.4) 60%, transparent 100%)`,
                  boxShadow: p.bright
                    ? `0 0 12px ${TEAL}, 0 0 24px ${TEAL_GLOW}`
                    : `0 0 6px ${TEAL_GLOW}`,
                  left: 'calc(50% - 100px + 45px)',
                  top: '50%',
                  marginLeft: -p.size / 2,
                  marginTop: -p.size / 2,
                }}
                initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
                animate={{
                  x: [0, tx * 0.4, tx * 0.8, tx],
                  y: [0, ty * 0.4, ty * 0.8, ty],
                  opacity: [1, 1, 0.8, 0],
                  scale: [0, 1.8, 1.2, 0],
                }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: p.duration,
                  delay: p.delay,
                  ease: 'easeOut',
                  times: [0, 0.3, 0.7, 1],
                }}
              />
            )
          })}
      </AnimatePresence>

      {/* ── Expanding ring burst ── */}
      <AnimatePresence>
        {phase === 'explode' && (
          <motion.div
            key={`ring-${cycle}`}
            className="absolute rounded-full"
            style={{
              width: 20,
              height: 20,
              border: `2px solid ${TEAL}`,
              left: 'calc(50% - 100px + 45px)',
              top: '50%',
              marginLeft: -10,
              marginTop: -10,
              zIndex: 35,
            }}
            initial={{ scale: 0, opacity: 1 }}
            animate={{ scale: [0, 8, 12], opacity: [1, 0.6, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

      {/* ── Continuous energy stream: portal → chips ── */}
      <AnimatePresence>
        {isActive &&
          streamParticles.map((p) => (
            <motion.div
              key={`stream-${cycle}-${p.id}`}
              className="absolute z-[15] rounded-full"
              style={{
                width: p.size,
                height: p.size,
                background: `radial-gradient(circle, ${TEAL} 0%, transparent 100%)`,
                boxShadow: `0 0 6px ${TEAL_GLOW}`,
                left: 'calc(50% - 55px)',
                top: `calc(50% + ${p.yOffset}px)`,
              }}
              initial={{ opacity: 0 }}
              animate={{
                x: [0, 60, 120, 180],
                opacity: [0, 0.9, 0.7, 0],
                scale: [0.5, 1, 0.8, 0.3],
              }}
              exit={{ opacity: 0 }}
              transition={{
                duration: p.duration,
                delay: p.delay,
                repeat: Infinity,
                repeatDelay: 0.3,
                ease: 'easeInOut',
              }}
            />
          ))}
      </AnimatePresence>

      {/* ── Persistent energy arcs from portal to chips ── */}
      <AnimatePresence>
        {isActive && (
          <motion.svg
            key={`arcs-${cycle}`}
            className="pointer-events-none absolute inset-0 z-[12] h-full w-full"
            viewBox="0 0 640 400"
            preserveAspectRatio="xMidYMid meet"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <defs>
              <linearGradient id="streamGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={TEAL} stopOpacity={0.6} />
                <stop offset="50%" stopColor={TEAL} stopOpacity={0.3} />
                <stop offset="100%" stopColor={TEAL} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            {DATA_CHIPS.map((_, i) => {
              const chipY = CHIP_CENTER_Y[i] * (400 / 340)
              return (
                <motion.path
                  key={`arc-${i}`}
                  d={`M 230 200 Q 340 ${200 + (chipY - 200) * 0.4} 450 ${chipY}`}
                  stroke="url(#streamGrad)"
                  strokeWidth="1.5"
                  fill="none"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 0.6 }}
                  transition={{ duration: 0.6, delay: i * 0.12 + 0.1, ease: 'easeOut' }}
                />
              )
            })}
          </motion.svg>
        )}
      </AnimatePresence>

      {/* ── Data chips ── */}
      <div className="absolute right-[2%] z-10 flex flex-col gap-3 sm:right-[5%] sm:gap-3">
        {DATA_CHIPS.map((chip, i) => (
          <motion.div
            key={`${chip.label}-${cycle}`}
            className="relative flex items-center gap-2.5 rounded-brand-md border px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3"
            style={{
              background: 'rgba(255, 255, 255, 0.85)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              borderColor: isActive ? `${TEAL}40` : 'rgba(226, 232, 240, 0.6)',
              boxShadow: isActive
                ? `0 4px 24px -4px rgba(38, 193, 201, 0.15), 0 12px 40px -8px rgba(15, 23, 42, 0.06)`
                : '0 12px 40px -8px rgba(15, 23, 42, 0.06)',
            }}
            initial={{ x: 60, opacity: 0, scale: 0.7 }}
            animate={
              isActive
                ? { x: 0, opacity: 1, scale: 1 }
                : { x: 60, opacity: 0, scale: 0.7 }
            }
            transition={{
              type: 'spring',
              stiffness: 200,
              damping: 18,
              delay: i * 0.12,
            }}
          >
            <span className="text-base sm:text-lg">{chip.icon}</span>
            <div className="flex flex-col">
              <span
                className="text-[9px] font-bold uppercase tracking-widest sm:text-[10px]"
                style={{ color: TEAL }}
              >
                {chip.label}
              </span>
              <span className="text-xs font-bold sm:text-sm" style={{ color: NAVY }}>
                {chip.value}
              </span>
            </div>

            {/* Arrival flash */}
            <motion.div
              className="pointer-events-none absolute inset-0 rounded-brand-md"
              style={{
                background: `linear-gradient(135deg, ${TEAL}30 0%, transparent 60%)`,
              }}
              initial={{ opacity: 0 }}
              animate={isActive ? { opacity: [0, 1, 0] } : {}}
              transition={{ duration: 0.5, delay: i * 0.12 + 0.1 }}
            />

            {/* Persistent left-edge glow */}
            {isActive && (
              <motion.div
                className="pointer-events-none absolute bottom-0 left-0 top-0 w-[3px] rounded-l-brand-md"
                style={{ background: TEAL }}
                initial={{ opacity: 0, scaleY: 0 }}
                animate={{ opacity: [0.4, 0.8, 0.4], scaleY: 1 }}
                transition={{
                  opacity: { duration: 2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.3 },
                  scaleY: { duration: 0.3, delay: i * 0.12 + 0.2 },
                }}
              />
            )}
          </motion.div>
        ))}
      </div>

      {/* ── Connecting energy path ── */}
      <svg
        className="pointer-events-none absolute inset-0 z-[1] h-full w-full"
        viewBox="0 0 640 400"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="pathGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={TEAL} stopOpacity={0.1} />
            <stop offset="50%" stopColor={TEAL} stopOpacity={0.5} />
            <stop offset="100%" stopColor={TEAL} stopOpacity={0.1} />
          </linearGradient>
        </defs>
        <motion.path
          key={`path-${cycle}`}
          d="M 100 200 C 200 200, 220 200, 320 200 C 420 200, 440 200, 540 200"
          stroke="url(#pathGrad)"
          strokeWidth="1.5"
          strokeDasharray="4 8"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.5 }}
          transition={{ duration: 2.5, delay: 0.3, ease: 'easeInOut' }}
        />
        <motion.circle
          key={`dot-${cycle}`}
          r="3"
          fill={TEAL}
          filter="url(#energyPulse)"
          initial={{ opacity: 0 }}
          animate={
            phase === 'traverse' || phase === 'explode'
              ? { opacity: [0, 1, 1, 0], cx: [100, 250, 400, 540], cy: [200, 200, 200, 200] }
              : { opacity: 0 }
          }
          transition={{ duration: 1.4, ease: 'easeInOut' }}
        />
        <defs>
          <filter id="energyPulse">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
      </svg>

      {/* ── Ambient floating particles ── */}
      {[...Array(5)].map((_, i) => (
        <motion.div
          key={`ambient-${i}`}
          className="pointer-events-none absolute rounded-full"
          style={{
            width: 2 + i,
            height: 2 + i,
            background: TEAL,
            opacity: 0.2,
            left: `${15 + i * 16}%`,
            top: `${20 + (i % 3) * 25}%`,
          }}
          animate={{
            y: [0, -12, 0, 12, 0],
            opacity: [0.1, 0.3, 0.1],
          }}
          transition={{
            duration: 4 + i,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.7,
          }}
        />
      ))}
    </motion.div>
  )
}
