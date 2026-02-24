"use client"

/**
 * DimensionSlider - Cult UI style slider with animated number
 *
 * Features:
 * - Smooth animated number updates (Spring physics)
 * - Direct number input (Click on number to type)
 * - Gradient track with dynamic fill
 * - Hover and drag states
 * - Keyboard support (Arrow keys, Home, End, PageUp/PageDown)
 * - ARIA accessibility
 * - Responsive touch support
 *
 * Direct Input Mode:
 * - Click on the displayed number to enter typing mode
 * - Type digits (0-9) and decimal point (.)
 * - Press Enter to confirm, Escape to cancel
 * - Auto-confirms after 2 seconds of inactivity
 * - Value is automatically clamped to min/max range
 *
 * Inspired by: https://www.cult-ui.com/docs/components/animated-number
 */

import React, { useState, useCallback, useRef, useEffect } from "react"
import { motion, useSpring, useTransform } from "motion/react"
import { SpringAnimatedNumber } from "./AnimatedNumber"

interface DimensionSliderProps {
  label: string
  value: number
  unit: string
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  decimals?: number
  showInput?: boolean
  color?: "emerald" | "blue" | "amber" | "cyan"
  icon?: React.ReactNode
}

const colorClasses = {
  emerald: {
    track: "from-emerald-500/20 to-emerald-500/40",
    thumb: "bg-emerald-500 shadow-emerald-500/50",
    text: "text-emerald-400",
    glow: "shadow-emerald-500/20",
  },
  blue: {
    track: "from-blue-500/20 to-blue-500/40",
    thumb: "bg-blue-500 shadow-blue-500/50",
    text: "text-blue-400",
    glow: "shadow-blue-500/20",
  },
  amber: {
    track: "from-amber-500/20 to-amber-500/40",
    thumb: "bg-amber-500 shadow-amber-500/50",
    text: "text-amber-400",
    glow: "shadow-amber-500/20",
  },
  cyan: {
    track: "from-cyan-500/20 to-cyan-500/40",
    thumb: "bg-cyan-500 shadow-cyan-500/50",
    text: "text-cyan-400",
    glow: "shadow-cyan-500/20",
  },
}

export function DimensionSlider({
  label,
  value,
  unit,
  min,
  max,
  step = 1,
  onChange,
  decimals = 0,
  showInput = true,
  color = "emerald",
  icon,
}: DimensionSliderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [typedValue, setTypedValue] = useState("")
  const sliderRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Animated value with spring physics
  const springValue = useSpring(value, {
    stiffness: 300,
    damping: 30,
  })

  // Update spring when value changes
  useEffect(() => {
    springValue.set(value)
  }, [value, springValue])

  // Calculate percentage
  const percentage = ((value - min) / (max - min)) * 100

  // Transform percentage to width
  // const _trackWidth = useTransform(springValue, [min, max], [0, 100])

  // Handle slider change
  const handleSliderChange = useCallback(
    (clientX: number) => {
      if (!sliderRef.current) return

      const rect = sliderRef.current.getBoundingClientRect()
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width))
      const percentage = x / rect.width
      const newValue = min + percentage * (max - min)
      const steppedValue = Math.round(newValue / step) * step
      const clampedValue = Math.max(min, Math.min(max, steppedValue))

      onChange(clampedValue)
    },
    [min, max, step, onChange]
  )

  // Mouse handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setIsDragging(true)
      handleSliderChange(e.clientX)

      const handleMouseMove = (e: MouseEvent) => {
        handleSliderChange(e.clientX)
      }

      const handleMouseUp = () => {
        setIsDragging(false)
        document.removeEventListener("mousemove", handleMouseMove)
        document.removeEventListener("mouseup", handleMouseUp)
      }

      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
    },
    [handleSliderChange]
  )

  // Touch handlers
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      setIsDragging(true)
      const touch = e.touches[0]
      handleSliderChange(touch.clientX)
    },
    [handleSliderChange]
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0]
      handleSliderChange(touch.clientX)
    },
    [handleSliderChange]
  )

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Keyboard handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      let newValue = value

      switch (e.key) {
        case "ArrowLeft":
        case "ArrowDown":
          e.preventDefault()
          newValue = Math.max(min, value - step)
          break
        case "ArrowRight":
        case "ArrowUp":
          e.preventDefault()
          newValue = Math.min(max, value + step)
          break
        case "Home":
          e.preventDefault()
          newValue = min
          break
        case "End":
          e.preventDefault()
          newValue = max
          break
        case "PageDown":
          e.preventDefault()
          newValue = Math.max(min, value - step * 10)
          break
        case "PageUp":
          e.preventDefault()
          newValue = Math.min(max, value + step * 10)
          break
        default:
          return
      }

      onChange(newValue)
    },
    [value, min, max, step, onChange]
  )

  // Input handler
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = Number(e.target.value)
      if (!isNaN(newValue)) {
        onChange(Math.max(min, Math.min(max, newValue)))
      }
    },
    [min, max, onChange]
  )

  // Direct number input handlers
  const handleNumberClick = useCallback(() => {
    setIsTyping(true)
    setTypedValue("")
  }, [])

  const handleTypingChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    // Only allow numbers and decimal point
    if (val === "" || /^[0-9]*\.?[0-9]*$/.test(val)) {
      setTypedValue(val)
    }
  }, [])

  const handleTypingKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        // Confirm typed value
        e.preventDefault()
        const newValue = Number(typedValue)
        if (!isNaN(newValue) && typedValue !== "") {
          onChange(Math.max(min, Math.min(max, newValue)))
        }
        setIsTyping(false)
        setTypedValue("")
      } else if (e.key === "Escape") {
        // Cancel typing
        e.preventDefault()
        setIsTyping(false)
        setTypedValue("")
      }
    },
    [typedValue, min, max, onChange]
  )

  const handleTypingBlur = useCallback(() => {
    // Confirm on blur
    const newValue = Number(typedValue)
    if (!isNaN(newValue) && typedValue !== "") {
      onChange(Math.max(min, Math.min(max, newValue)))
    }
    setIsTyping(false)
    setTypedValue("")
  }, [typedValue, min, max, onChange])

  // Auto-confirm after typing stops (removed - using onBlur instead)
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }
    }
  }, [])

  const colors = colorClasses[color]

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon && (
            <div className="w-5 h-5 flex items-center justify-center text-zinc-400">
              {icon}
            </div>
          )}
          <label className="text-xs font-medium text-zinc-300">{label}</label>
        </div>

        {/* Animated Number Display */}
        <div className="flex items-center gap-2">
          <div
            className={`relative text-sm font-semibold tabular-nums ${colors.text} ${
              !isTyping && "cursor-pointer hover:opacity-80 transition-opacity"
            }`}
            onClick={!isTyping ? handleNumberClick : undefined}
            title={!isTyping ? "Click to type value" : undefined}
          >
            {isTyping ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={typedValue}
                  onChange={handleTypingChange}
                  onKeyDown={handleTypingKeyDown}
                  onBlur={handleTypingBlur}
                  placeholder={value.toString()}
                  className={`w-20 px-2 py-0.5 bg-zinc-800 border-2 ${colors.text.replace(
                    "text-",
                    "border-"
                  )} rounded text-center font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-zinc-950 ${colors.text.replace(
                    "text-",
                    "focus:ring-"
                  )}`}
                  autoFocus
                />
                <span className="text-[10px] text-zinc-500 animate-pulse">
                  ↵
                </span>
              </div>
            ) : (
              <SpringAnimatedNumber value={value} decimals={decimals} />
            )}
          </div>
          <span className="text-xs text-zinc-500">{unit}</span>
        </div>
      </div>

      {/* Slider Track */}
      <div
        ref={sliderRef}
        className="relative h-1 cursor-pointer touch-none select-none"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${value}${unit}`}
      >
        {/* Background Track */}
        <div className="absolute inset-0 bg-zinc-800 rounded-full" />

        {/* Active Track */}
        <motion.div
          className={`absolute inset-y-0 left-0 bg-gradient-to-r ${colors.track} rounded-full transition-opacity ${
            isDragging || isHovered ? "opacity-100" : "opacity-80"
          }`}
          style={{ width: `${percentage}%` }}
        />

        {/* Thumb */}
        <motion.div
          className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full ${colors.thumb} shadow-md transition-all ${
            isDragging ? "scale-125 shadow-lg" : isHovered ? "scale-110" : ""
          }`}
          style={{
            left: `calc(${percentage}% - 6px)`,
          }}
          whileHover={{ scale: 1.2 }}
          whileTap={{ scale: 1.3 }}
        />

        {/* Glow effect when dragging */}
        {isDragging && (
          <motion.div
            className={`absolute top-1/2 -translate-y-1/2 w-6 h-6 rounded-full ${colors.glow} blur-lg opacity-40`}
            style={{
              left: `calc(${percentage}% - 12px)`,
            }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 0.4, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
          />
        )}
      </div>

      {/* Optional Input Field */}
      {showInput && (
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="number"
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={handleInputChange}
            className="flex-1 px-3 py-1.5 text-sm bg-zinc-800/50 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500 text-white text-center tabular-nums transition-colors"
            aria-label={`${label} input`}
          />
          <div className="flex items-center gap-1 text-xs text-zinc-500">
            <span>Range:</span>
            <span className="text-zinc-400">{min}</span>
            <span>-</span>
            <span className="text-zinc-400">{max}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default DimensionSlider
