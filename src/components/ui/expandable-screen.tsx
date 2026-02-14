/**
 * Expandable Screen Component
 * From: Cult UI (https://cult-ui.com/components/expandable-screen)
 *
 * This component allows smooth morphing from a trigger element to full-screen content
 */

'use client'

import * as React from 'react'
import { motion } from 'framer-motion'

interface ExpandableScreenContextType {
  isExpanded: boolean
  setIsExpanded: (value: boolean) => void
  layoutId: string
  triggerRadius: number
  contentRadius: number
}

const ExpandableScreenContext =
  React.createContext<ExpandableScreenContextType | undefined>(undefined)

function useExpandableScreen() {
  const context = React.useContext(ExpandableScreenContext)
  if (!context) {
    throw new Error('useExpandableScreen must be used within an ExpandableScreen')
  }
  return context
}

interface ExpandableScreenProps {
  children: React.ReactNode
  layoutId: string
  triggerRadius?: number
  contentRadius?: number
}

export function ExpandableScreen({
  children,
  layoutId,
  triggerRadius = 100,
  contentRadius = 24,
}: ExpandableScreenProps) {
  const [isExpanded, setIsExpanded] = React.useState(false)

  return (
    <ExpandableScreenContext.Provider
      value={{
        isExpanded,
        setIsExpanded,
        layoutId,
        triggerRadius,
        contentRadius,
      }}
    >
      <div className="relative">{children}</div>
    </ExpandableScreenContext.Provider>
  )
}

interface ExpandableScreenTriggerProps {
  children: React.ReactNode
}

export function ExpandableScreenTrigger({ children }: ExpandableScreenTriggerProps) {
  const { isExpanded, setIsExpanded, layoutId, triggerRadius } = useExpandableScreen()

  if (isExpanded) {
    return null
  }

  return (
    <motion.div
      layoutId={layoutId}
      onClick={() => setIsExpanded(true)}
      style={{
        borderRadius: triggerRadius,
      }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 30,
      }}
    >
      {children}
    </motion.div>
  )
}

interface ExpandableScreenContentProps {
  children: React.ReactNode | ((props: { close: () => void }) => React.ReactNode)
}

export function ExpandableScreenContent({ children }: ExpandableScreenContentProps) {
  const { isExpanded, setIsExpanded, layoutId, contentRadius } = useExpandableScreen()

  React.useEffect(() => {
    if (isExpanded) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'auto'
    }

    return () => {
      document.body.style.overflow = 'auto'
    }
  }, [isExpanded])

  const close = () => setIsExpanded(false)

  const content = typeof children === 'function'
    ? children({ close })
    : children

  return (
    <>
      {isExpanded && (
        <>
          {/* Content */}
          <motion.div
            layoutId={layoutId}
            className="fixed inset-0 z-50 overflow-hidden pointer-events-auto"
            style={{
              borderRadius: contentRadius,
            }}
            transition={{
              type: 'spring',
              stiffness: 300,
              damping: 30,
            }}
          >
            {content}
          </motion.div>

          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => {
              e.stopPropagation()
              setIsExpanded(false)
            }}
            className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm pointer-events-auto"
          />
        </>
      )}
    </>
  )
}

/**
 * Hook ให้ MaterialSelector เรียก close/open ได้จากปุ่มด้านใน
 */
export function useExpandableScreenControls() {
  const ctx = React.useContext(ExpandableScreenContext)

  if (!ctx) {
    return {
      isExpanded: false,
      open: () => {},
      close: () => {},
    }
  }

  return {
    isExpanded: ctx.isExpanded,
    open: () => ctx.setIsExpanded(true),
    close: () => ctx.setIsExpanded(false),
  }
}
