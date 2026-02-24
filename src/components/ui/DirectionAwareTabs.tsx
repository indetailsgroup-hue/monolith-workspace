"use client"

/**
 * DirectionAwareTabs - Animated tabs with direction-aware indicator
 * 
 * Features:
 * - Smooth sliding indicator
 * - Direction-aware animation
 * - Content transition with blur effect
 * 
 * Requires: npm install motion
 */

import { useState, ReactNode } from "react"
import { motion, AnimatePresence } from "motion/react"

// ============================================
// TYPES
// ============================================

interface Tab {
  id: number
  label: string
  icon?: ReactNode
  content: ReactNode
}

interface DirectionAwareTabsProps {
  tabs: Tab[]
  className?: string
  rounded?: string
  onChange?: (tabId: number) => void
}

// ============================================
// UTILITY
// ============================================

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

// ============================================
// DIRECTION AWARE TABS
// ============================================

export function DirectionAwareTabs({
  tabs,
  className = "",
  rounded = "rounded-lg",
  onChange
}: DirectionAwareTabsProps) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? 0)
  const [direction, setDirection] = useState(0)
  
  const handleTabClick = (tabId: number) => {
    setDirection(tabId > activeTab ? 1 : -1)
    setActiveTab(tabId)
    onChange?.(tabId)
  }
  
  const activeContent = tabs.find(tab => tab.id === activeTab)?.content
  
  return (
    <div className={cn("w-full", className)}>
      {/* Tab Headers */}
      <div className={cn(
        "relative flex items-center gap-1 p-1 bg-zinc-900/50 border border-zinc-800",
        rounded
      )}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={cn(
              "relative flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors z-10",
              activeTab === tab.id 
                ? "text-white" 
                : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            {/* Active Background */}
            {activeTab === tab.id && (
              <motion.div
                layoutId="activeTab"
                className={cn(
                  "absolute inset-0 bg-zinc-800 border border-zinc-700",
                  rounded
                )}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            
            {/* Icon & Label */}
            <span className="relative z-10 flex items-center gap-1">
              {tab.icon}
              {tab.label}
            </span>
          </button>
        ))}
      </div>
      
      {/* Tab Content */}
      <div className="mt-3 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            initial={{ 
              x: direction * 20, 
              opacity: 0, 
              filter: "blur(4px)" 
            }}
            animate={{ 
              x: 0, 
              opacity: 1, 
              filter: "blur(0px)" 
            }}
            exit={{ 
              x: direction * -20, 
              opacity: 0, 
              filter: "blur(4px)" 
            }}
            transition={{ 
              type: "spring", 
              stiffness: 300, 
              damping: 30 
            }}
          >
            {activeContent}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

export default DirectionAwareTabs
