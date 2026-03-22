'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

const TOTAL_FRAMES = 121
const FRAME_PATH = '/images/hero-frames/frame-'

function getFrameSrc(index: number): string {
  const num = String(Math.max(1, Math.min(TOTAL_FRAMES, index))).padStart(4, '0')
  return `${FRAME_PATH}${num}.jpg`
}

export default function ScrollHero() {
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
        const scrollable = rect.height - window.innerHeight
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
      {/* Sticky hero -- stays pinned while animation plays */}
      <div className="sticky top-0 h-screen w-full overflow-hidden flex items-center justify-center" style={{ background: 'transparent' }}>
        {/* The pill card container -- matches existing landing page design */}
        <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-8 pt-24 pb-8">
          <div className="rounded-[40px] bg-gradient-to-br from-[#EAF4FF] via-[#F4F9FF] to-[#FAFBFF] shadow-2xl ring-1 ring-white/20 overflow-hidden">
            <div className="py-16 sm:py-20 px-6 sm:px-12">
              <div className="mx-auto grid max-w-[1300px] w-full grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-12 xl:gap-20 items-center">

                {/* LEFT COLUMN: Hero Copy & CTA */}
                <div className="flex flex-col justify-center text-center lg:text-left z-10 w-full min-w-0">
                  <h1 className="font-headings text-[40px] font-extrabold leading-[1.1] tracking-tight text-[#0F172A] sm:text-5xl lg:text-[48px] xl:text-[64px]">
                    From invoice to{' '}
                    <span className="bg-gradient-to-r from-[#00C6FF] to-[#0072FF] bg-clip-text text-transparent">
                      QuickBooks or Xero
                    </span>
                    <br />
                    in under a minute.
                  </h1>

                  <p className="mt-6 mx-auto lg:mx-0 max-w-lg text-[20px] sm:text-[22px] leading-relaxed text-[#475569]">
                    Upload your invoices. AI pulls out the details.
                    <br />
                    One click syncs to QuickBooks or Xero.
                  </p>

                  <div className="mt-8 sm:mt-10">
                    <Link
                      href="/signup"
                      className="group inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#00C6FF] to-[#00A3FF] px-8 py-4 sm:px-10 sm:py-5 text-lg sm:text-xl font-bold text-white shadow-[0_8px_32px_rgba(0,198,255,0.4)] transition-all hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(0,198,255,0.5)]"
                    >
                      Get Started Free
                    </Link>
                  </div>
                </div>

                {/* RIGHT COLUMN: Scroll-driven animation canvas */}
                <div className="w-full max-w-[640px] mx-auto lg:ml-auto flex-shrink-0">
                  {!loaded && (
                    <div className="flex items-center justify-center h-48 sm:h-[340px] text-[#94A3B8]">
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 border-2 border-[#0072FF] border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm">Loading...</span>
                      </div>
                    </div>
                  )}
                  <canvas
                    ref={canvasRef}
                    className={`w-full h-auto ${loaded ? '' : 'hidden'}`}
                  />
                </div>

              </div>
            </div>
          </div>
        </div>

        {/* Scroll indicator at bottom of viewport */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-[#94A3B8] animate-bounce">
          <span className="text-sm">Scroll to explore</span>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M7 13l5 5 5-5M7 7l5 5 5-5" />
          </svg>
        </div>
      </div>
    </div>
  )
}
