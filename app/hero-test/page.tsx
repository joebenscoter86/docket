'use client'

import { useEffect, useRef, useState } from 'react'

const TOTAL_FRAMES = 121
const FRAME_PATH = '/images/hero-frames/frame-'

function getFrameSrc(index: number): string {
  const num = String(Math.max(1, Math.min(TOTAL_FRAMES, index))).padStart(4, '0')
  return `${FRAME_PATH}${num}.jpg`
}

export default function HeroTestPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imagesRef = useRef<HTMLImageElement[]>([])
  const [loaded, setLoaded] = useState(false)

  // Preload all frames
  useEffect(() => {
    let loadedCount = 0
    const images: HTMLImageElement[] = new Array(TOTAL_FRAMES)

    for (let i = 0; i < TOTAL_FRAMES; i++) {
      const img = new Image()
      img.src = getFrameSrc(i + 1)
      img.onload = () => {
        loadedCount++
        if (loadedCount === TOTAL_FRAMES) {
          imagesRef.current = images
          setLoaded(true)
        }
      }
      images[i] = img
    }
  }, [])

  // Draw first frame once loaded
  useEffect(() => {
    if (!loaded) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const firstImage = imagesRef.current[0]
    if (!canvas || !ctx || !firstImage) return

    canvas.width = firstImage.naturalWidth
    canvas.height = firstImage.naturalHeight
    ctx.drawImage(firstImage, 0, 0)
  }, [loaded])

  // Scroll-driven frame rendering
  useEffect(() => {
    if (!loaded) return
    const canvas = canvasRef.current
    const container = containerRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !container || !ctx) return

    let rafId: number
    let currentFrame = 0

    const handleScroll = () => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        const rect = container.getBoundingClientRect()
        const scrollable = container.scrollHeight - window.innerHeight
        const scrolled = -rect.top
        const progress = Math.max(0, Math.min(1, scrolled / scrollable))
        const frameIndex = Math.round(progress * (TOTAL_FRAMES - 1))

        if (frameIndex !== currentFrame) {
          currentFrame = frameIndex
          const img = imagesRef.current[frameIndex]
          if (img) {
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            ctx.drawImage(img, 0, 0)
          }
        }
      })
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      cancelAnimationFrame(rafId)
    }
  }, [loaded])

  return (
    <div
      ref={containerRef}
      style={{ height: '400vh' }}
      className="relative"
    >
      {/* Sticky hero section */}
      <div className="sticky top-0 h-screen w-full overflow-hidden flex flex-col items-center justify-center bg-white">
        {/* Headline above video */}
        <div className="text-center mb-8 px-6 z-10">
          <h1
            className="text-5xl md:text-7xl font-extrabold tracking-tight"
            style={{ fontFamily: 'var(--font-headings)' }}
          >
            <span className="text-[#0F172A]">From invoice to </span>
            <span className="bg-gradient-to-r from-[#00C6FF] to-[#0072FF] bg-clip-text text-transparent">
              QuickBooks
            </span>
            <br />
            <span className="text-[#0F172A]">in under a minute</span>
          </h1>
          <p
            className="mt-4 text-lg md:text-xl text-[#475569] max-w-2xl mx-auto"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            Upload your invoices. AI pulls out the details. You review, approve, and sync. Done.
          </p>
        </div>

        {/* Canvas container */}
        <div className="relative w-full max-w-4xl px-6">
          {!loaded && (
            <div className="flex items-center justify-center h-64 text-[#94A3B8]">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-[#0072FF] border-t-transparent rounded-full animate-spin" />
                <span style={{ fontFamily: 'var(--font-body)' }}>Loading animation...</span>
              </div>
            </div>
          )}
          <canvas
            ref={canvasRef}
            className={`w-full h-auto ${loaded ? '' : 'hidden'}`}
          />
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 flex flex-col items-center gap-2 text-[#94A3B8] animate-bounce">
          <span className="text-sm" style={{ fontFamily: 'var(--font-body)' }}>
            Scroll to explore
          </span>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M7 13l5 5 5-5M7 7l5 5 5-5" />
          </svg>
        </div>
      </div>

      {/* Content sections that appear as you scroll past the hero */}
      <div className="relative z-10 bg-white">
        <div className="max-w-4xl mx-auto px-6 py-24 space-y-16">
          <div className="text-center">
            <h2
              className="text-3xl md:text-4xl font-bold text-[#0F172A]"
              style={{ fontFamily: 'var(--font-headings)' }}
            >
              How it works
            </h2>
            <p className="mt-4 text-[#475569] text-lg" style={{ fontFamily: 'var(--font-body)' }}>
              Three steps. Zero data entry.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Upload', desc: 'Drop your invoice -- PDF, photo, or scan. We handle the rest.' },
              { step: '02', title: 'Review', desc: 'AI extracts every field. You verify in a clean side-by-side view.' },
              { step: '03', title: 'Sync', desc: 'One click pushes the bill straight into QuickBooks.' },
            ].map((item) => (
              <div
                key={item.step}
                className="p-6 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC]"
              >
                <div
                  className="text-sm font-mono font-medium bg-gradient-to-r from-[#00C6FF] to-[#0072FF] bg-clip-text text-transparent"
                >
                  {item.step}
                </div>
                <h3
                  className="mt-2 text-xl font-bold text-[#0F172A]"
                  style={{ fontFamily: 'var(--font-headings)' }}
                >
                  {item.title}
                </h3>
                <p className="mt-2 text-[#475569]" style={{ fontFamily: 'var(--font-body)' }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
