/**
 * AnimatedList - Animated list with smooth reorder, add, remove animations
 * 
 * Features:
 * - Smooth enter/exit animations
 * - Drag to reorder
 * - Staggered animations
 * - Layout animations when items change
 * 
 * Uses Framer Motion for animations
 */

import { useState, useEffect, ReactNode } from 'react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';

// Animation configuration
const ANIMATION_DURATION = 300;
// const _STAGGER_DELAY = 50;

// ============================================
// SORTABLE LIST (Drag to Reorder)
// ============================================

export interface SortableItem {
  id: string;
  [key: string]: any;
}

interface SortableListProps<T extends SortableItem> {
  items: T[];
  setItems: (items: T[]) => void;
  renderItem: (item: T, index: number, dragControls: any) => ReactNode;
  onReorder?: (items: T[]) => void;
  className?: string;
}

export function SortableList<T extends SortableItem>({
  items,
  setItems,
  renderItem,
  onReorder,
  className = ''
}: SortableListProps<T>) {
  const handleReorder = (newItems: T[]) => {
    setItems(newItems);
    onReorder?.(newItems);
  };

  return (
    <Reorder.Group
      axis="y"
      values={items}
      onReorder={handleReorder}
      className={`space-y-2 ${className}`}
    >
      <AnimatePresence mode="popLayout">
        {items.map((item, index) => (
          <SortableListItem key={item.id} item={item} index={index}>
            {(dragControls) => renderItem(item, index, dragControls)}
          </SortableListItem>
        ))}
      </AnimatePresence>
    </Reorder.Group>
  );
}

interface SortableListItemProps<T extends SortableItem> {
  item: T;
  index: number;
  children: (dragControls: any) => ReactNode;
}

function SortableListItem<T extends SortableItem>({ 
  item, 
  index,
  children 
}: SortableListItemProps<T>) {
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={dragControls}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }}
      transition={{ 
        type: 'spring', 
        stiffness: 300, 
        damping: 25,
        delay: index * 0.05 
      }}
      whileDrag={{ 
        scale: 1.02, 
        boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
        zIndex: 50 
      }}
      className="relative"
    >
      {children(dragControls)}
    </Reorder.Item>
  );
}

// Drag Handle Component
interface DragHandleProps {
  dragControls: any;
  className?: string;
}

export function DragHandle({ dragControls, className = '' }: DragHandleProps) {
  return (
    <button
      onPointerDown={(e) => {
        e.preventDefault();
        dragControls.start(e);
      }}
      className={`cursor-grab active:cursor-grabbing touch-none ${className}`}
    >
      <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
      </svg>
    </button>
  );
}

// ============================================
// ANIMATED LIST ITEM (Simple)
// ============================================

interface AnimatedListItemProps {
  children: ReactNode;
  index: number;
  isNew?: boolean;
  isRemoving?: boolean;
  onRemoveComplete?: () => void;
}

export function AnimatedListItem({ 
  children, 
  index, 
  isNew = false,
  isRemoving = false,
  onRemoveComplete 
}: AnimatedListItemProps) {
  const [mounted, setMounted] = useState(!isNew);
  const [removing, setRemoving] = useState(false);
  
  useEffect(() => {
    if (isNew) {
      const timer = setTimeout(() => setMounted(true), 10);
      return () => clearTimeout(timer);
    }
  }, [isNew]);
  
  useEffect(() => {
    if (isRemoving && !removing) {
      setRemoving(true);
      const timer = setTimeout(() => {
        onRemoveComplete?.();
      }, ANIMATION_DURATION);
      return () => clearTimeout(timer);
    }
  }, [isRemoving, removing, onRemoveComplete]);
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ 
        opacity: mounted && !removing ? 1 : 0,
        y: mounted && !removing ? 0 : removing ? -10 : 10,
        scale: mounted && !removing ? 1 : 0.95
      }}
      transition={{ 
        type: 'spring',
        stiffness: 300,
        damping: 25,
        delay: isNew ? index * 0.05 : 0
      }}
    >
      {children}
    </motion.div>
  );
}

// ============================================
// EXPANDABLE PANEL ITEM
// ============================================

interface ExpandablePanelItemProps {
  title: string;
  subtitle?: string;
  badge?: string;
  badgeColor?: string;
  isSelected?: boolean;
  isExpanded?: boolean;
  onClick?: () => void;
  onToggleExpand?: () => void;
  children?: ReactNode;
  actions?: ReactNode;
  dragControls?: any;
}

export function ExpandablePanelItem({
  title,
  subtitle,
  badge,
  badgeColor = 'bg-zinc-700',
  isSelected = false,
  isExpanded = false,
  onClick,
  onToggleExpand,
  children,
  actions,
  dragControls
}: ExpandablePanelItemProps) {
  return (
    <motion.div 
      layout
      className={`
        group rounded-lg border transition-colors
        ${isSelected 
          ? 'bg-blue-500/10 border-blue-500/50 shadow-lg shadow-blue-500/10' 
          : 'bg-zinc-800/50 border-zinc-700/50 hover:border-zinc-600'
        }
      `}
    >
      {/* Header */}
      <div 
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer"
        onClick={onClick}
      >
        {/* Drag handle */}
        {dragControls && (
          <DragHandle dragControls={dragControls} className="opacity-50 hover:opacity-100" />
        )}
        
        {/* Expand toggle */}
        {children && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand?.();
            }}
            className="p-0.5 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <motion.svg 
              animate={{ rotate: isExpanded ? 90 : 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="w-4 h-4" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </motion.svg>
          </button>
        )}
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium truncate ${isSelected ? 'text-blue-300' : 'text-white'}`}>
              {title}
            </span>
            {badge && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${badgeColor} text-zinc-300`}>
                {badge}
              </span>
            )}
          </div>
          {subtitle && (
            <div className="text-xs text-zinc-500 truncate mt-0.5">
              {subtitle}
            </div>
          )}
        </div>
        
        {/* Actions */}
        {actions && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {actions}
          </div>
        )}
        
        {/* Selected indicator */}
        {isSelected && (
          <motion.div 
            layoutId="selected-indicator"
            className="w-1.5 h-1.5 rounded-full bg-blue-400"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
          />
        )}
      </div>
      
      {/* Expandable content */}
      <AnimatePresence>
        {children && isExpanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1 border-t border-zinc-700/50">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ============================================
// ANIMATED PANEL LIST (Simple)
// ============================================

interface AnimatedPanelListProps<T extends { id: string }> {
  items: T[];
  selectedId?: string | null;
  onSelectItem?: (id: string) => void;
  renderItem: (item: T, index: number, isSelected: boolean) => ReactNode;
  emptyMessage?: string;
  className?: string;
}

export function AnimatedPanelList<T extends { id: string }>({
  items,
  selectedId,
  onSelectItem: _onSelectItem,
  renderItem,
  emptyMessage = 'No items',
  className = ''
}: AnimatedPanelListProps<T>) {
  if (items.length === 0) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center text-zinc-500 text-sm py-8"
      >
        {emptyMessage}
      </motion.div>
    );
  }
  
  return (
    <div className={`space-y-2 ${className}`}>
      <AnimatePresence mode="popLayout">
        {items.map((item, index) => (
          <motion.div
            key={item.id}
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ 
              type: 'spring', 
              stiffness: 300, 
              damping: 25,
              delay: index * 0.03 
            }}
          >
            {renderItem(item, index, selectedId === item.id)}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ============================================
// COLLAPSIBLE SECTION
// ============================================

interface CollapsibleSectionProps {
  title: string;
  count?: number;
  defaultExpanded?: boolean;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  count,
  defaultExpanded = true,
  children
}: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  
  return (
    <div className="mb-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full text-left mb-2 group"
      >
        <motion.svg 
          animate={{ rotate: isExpanded ? 90 : 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="w-3 h-3 text-zinc-500"
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </motion.svg>
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider group-hover:text-zinc-300 transition-colors">
          {title}
        </span>
        {count !== undefined && (
          <span className="text-xs text-zinc-600 ml-auto">
            {count}
          </span>
        )}
      </button>
      
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

