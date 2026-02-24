"use client"

/**
 * SortableList - Animated sortable list with Framer Motion
 * 
 * Features:
 * - Drag to reorder
 * - Smooth spring animations
 * - Expandable items with tabs
 * 
 * Requires: npm install motion lucide-react
 */

import React, { ReactNode } from "react"
import { Reorder, useDragControls, motion } from "motion/react"
import { GripVertical, Check, Trash2 } from "lucide-react"

// ============================================
// TYPES
// ============================================

export interface Item {
  text: string
  checked: boolean
  id: number
  description: string
  // Extended properties for furniture context
  core?: string
  surface?: string
  edge?: string
}

interface SortableListProps {
  items: Item[]
  setItems: (items: Item[]) => void
  onCompleteItem: (id: number) => void
  renderItem: (
    item: Item,
    order: number,
    onCompleteItem: (id: number) => void,
    onRemoveItem: (id: number) => void
  ) => ReactNode
}

interface SortableListItemProps {
  item: Item
  order: number
  isExpanded: boolean
  onCompleteItem: (id: number) => void
  onRemoveItem: (id: number) => void
  handleDrag: () => void
  className?: string
  renderExtra?: (item: Item) => ReactNode
}

// ============================================
// UTILITY
// ============================================

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

// ============================================
// SORTABLE LIST ITEM
// ============================================

export function SortableListItem({
  item,
  isExpanded,
  onCompleteItem,
  handleDrag,
  className,
  renderExtra,
}: SortableListItemProps) {
  const dragControls = useDragControls()

  return (
    <Reorder.Item
      value={item}
      id={String(item.id)}
      dragListener={false}
      dragControls={dragControls}
      onDragEnd={handleDrag}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className={cn(
        "relative flex w-full flex-col overflow-hidden rounded-xl border border-white/5 bg-zinc-900 transition-colors",
        isExpanded ? "bg-zinc-800/50 border-emerald-500/30" : "hover:bg-zinc-800",
        className
      )}
    >
      <div className="flex items-center gap-3 p-3">
        {/* Drag Handle */}
        <div
          className="cursor-grab touch-none p-1 text-zinc-500 hover:text-white active:cursor-grabbing"
          onPointerDown={(e) => dragControls.start(e)}
        >
          <GripVertical size={16} />
        </div>

        {/* Checkbox */}
        <div 
          onClick={() => onCompleteItem(item.id)}
          className={cn(
            "flex h-5 w-5 cursor-pointer items-center justify-center rounded border transition-colors",
            item.checked 
              ? "bg-emerald-500 border-emerald-500 text-black" 
              : "border-zinc-600 bg-transparent hover:border-emerald-500"
          )}
        >
          {item.checked && <Check size={14} strokeWidth={3} />}
        </div>

        {/* Text Content */}
        <span className={cn(
          "flex-1 text-sm font-medium text-zinc-200", 
          item.checked && "text-zinc-500 line-through"
        )}>
          {item.text}
        </span>
      </div>

      {/* Expanded Content Area */}
      {isExpanded && renderExtra && (
        <div className="border-t border-white/5 bg-black/20 px-4 pb-4">
          {renderExtra(item)}
        </div>
      )}
    </Reorder.Item>
  )
}

// ============================================
// SORTABLE LIST
// ============================================

export default function SortableList({
  items,
  setItems,
  onCompleteItem,
  renderItem,
}: SortableListProps) {
  return (
    <Reorder.Group 
      axis="y" 
      values={items} 
      onReorder={setItems} 
      className="flex flex-col gap-2"
    >
      {items.map((item, index) => (
        <React.Fragment key={item.id}>
          {renderItem(item, index, onCompleteItem, () => {})}
        </React.Fragment>
      ))}
    </Reorder.Group>
  )
}

// ============================================
// PANEL LIST (For Cabinet Panels in MONOLITH)
// ============================================

export interface PanelItem {
  id: string
  name: string
  role: string
  finishWidth: number
  finishHeight: number
  thickness?: number
  checked?: boolean
}

interface PanelSortableListProps {
  panels: PanelItem[]
  selectedId: string | null
  onSelectPanel: (id: string) => void
  onDeletePanel?: (id: string, role: string) => void
  onExpandPanel?: (id: string) => void
  expandedId?: string | null
}

export function PanelSortableList({
  panels,
  selectedId,
  onSelectPanel,
  onDeletePanel,
}: PanelSortableListProps) {
  const [items, setItems] = React.useState(panels)

  // Sync with props
  React.useEffect(() => {
    setItems(panels)
  }, [panels])

  return (
    <Reorder.Group
      axis="y"
      values={items}
      onReorder={setItems}
      className="flex flex-col gap-0.5"
    >
      {items.map((panel, index) => (
        <PanelReorderItem
          key={panel.id}
          panel={panel}
          index={index}
          isSelected={selectedId === panel.id}
          onSelect={() => onSelectPanel(panel.id)}
          onDelete={onDeletePanel ? () => onDeletePanel(panel.id, panel.role) : undefined}
        />
      ))}
    </Reorder.Group>
  )
}

// Separate component to use hooks properly
function PanelReorderItem({
  panel,
  index,
  isSelected,
  onSelect,
  onDelete
}: {
  panel: PanelItem
  index: number
  isSelected: boolean
  onSelect: () => void
  onDelete?: () => void
}) {
  const dragControls = useDragControls()

  // Check if this panel is deletable (SHELF or DIVIDER)
  const isDeletable = panel.role === 'SHELF' || panel.role === 'DIVIDER'

  return (
    <Reorder.Item
      value={panel}
      dragListener={false}
      dragControls={dragControls}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{
        type: "spring",
        stiffness: 400,
        damping: 30,
        delay: index * 0.02
      }}
      onClick={onSelect}
      className={cn(
        "relative rounded border cursor-pointer transition-all duration-200 group",
        isSelected
          ? "bg-blue-500/15 border-blue-500/50"
          : "bg-zinc-800/50 border-zinc-700/50 hover:border-zinc-600 hover:bg-zinc-800"
      )}
    >
      <div className="flex items-center gap-1.5 px-1.5 py-1">
        {/* Drag Handle */}
        <div
          className="cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400 flex-shrink-0"
          onPointerDown={(e) => dragControls.start(e)}
        >
          <GripVertical size={10} />
        </div>

        {/* Color Bar */}
        <motion.div
          className={cn(
            "w-0.5 h-6 rounded-full flex-shrink-0",
            isSelected ? "bg-blue-400" : "bg-zinc-600"
          )}
          layoutId={`bar-${panel.id}`}
        />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <motion.div
            className={cn(
              "text-xs font-medium truncate leading-tight",
              isSelected ? "text-blue-300" : "text-zinc-200"
            )}
            layout
          >
            {panel.name}
          </motion.div>
          <div className="text-[9px] text-zinc-500 leading-tight">
            {panel.role}
          </div>
        </div>

        {/* Dimensions */}
        <div className="text-right flex-shrink-0">
          <div className="text-[10px] text-zinc-400 leading-tight">
            {panel.finishWidth.toFixed(1)} × {panel.finishHeight.toFixed(1)}
          </div>
          {panel.thickness && (
            <div className="text-[9px] text-zinc-600 leading-tight">
              t={panel.thickness.toFixed(1)}
            </div>
          )}
        </div>

        {/* Delete Button - only for SHELF and DIVIDER */}
        {isDeletable && onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            className="flex-shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-all"
            title={`Delete ${panel.role.toLowerCase()}`}
          >
            <Trash2 size={10} />
          </button>
        )}
      </div>
    </Reorder.Item>
  )
}
