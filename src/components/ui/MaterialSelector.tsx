/**
 * MaterialSelector - Expandable Screen Material Picker
 *
 * Visual material selector that expands from a compact card to full-screen
 * gallery view using Cult UI's Expandable Screen component.
 */

import React, { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ArrowLeft, Check, Info, Search, Star, Clock } from 'lucide-react'

import {
  ExpandableScreen,
  ExpandableScreenTrigger,
  ExpandableScreenContent,
} from '@/components/ui/expandable-screen'
import { useMaterialHistoryStore } from '@/core/materials/useMaterialHistoryStore'
import { useMaterialFavoritesStore } from '@/core/materials/useMaterialFavoritesStore'
import { useMaterialStore, useThumbnail } from '@/core/materials/useMaterialStore'

interface Material {
  id: string
  name: string
  type: string
  thickness?: number
  textureUrl?: string
  thumbnail?: string
  texture?: string
  density?: number
  cost?: number
  costPerSqm?: number
  description?: string
  manufacturer?: string
  category?: string
}

interface MaterialSelectorProps {
  title: string
  materials: Record<string, Material>
  selectedId: string | null
  onSelect: (materialId: string, applyMode?: 'selected' | 'all') => void
  icon: React.ReactNode
  color: 'orange' | 'blue' | 'cyan'
  number: number
}

interface MaterialSelectorContentProps {
  title: string
  materials: Record<string, Material>
  selectedId: string | null
  onSelect: (materialId: string, applyMode?: 'selected' | 'all') => void
  icon: React.ReactNode
  color: 'orange' | 'blue' | 'cyan'
  onClose: () => void
}

function getTypeDisplayName(type: string) {
  const displayNames: Record<string, string> = {
    'MELAMINE': 'Melamine',
    'HPL': 'HPL Wood',
    'FENIX_NTM': 'FENIX NTM (Super Matte)',
    'FENIX_NTA': 'FENIX NTA (Metal)',
  }
  return displayNames[type] || type
}

function getTypeDescription(type: string) {
  const descriptions: Record<string, string> = {
    'MELAMINE': 'Economy finish',
    'HPL': 'Premium wood grain textures',
    'FENIX_NTM': 'Super matte anti-fingerprint',
    'FENIX_NTA': 'Metallic brushed finish',
  }
  return descriptions[type] || ''
}

/**
 * T016: Material thumbnail component that uses cached thumbnails from store
 */
function MaterialThumbnail({
  materialId,
  fallbackUrl,
  isHovered,
}: {
  materialId: string
  fallbackUrl?: string
  isHovered: boolean
}) {
  const { thumbDataUrl, isLoaded } = useThumbnail(materialId)

  // Use store thumbnail if available, otherwise show loading or fallback
  if (isLoaded && thumbDataUrl) {
    return (
      <img
        src={thumbDataUrl}
        alt=""
        className={`
          w-full h-full object-cover transition-transform duration-300
          ${isHovered ? 'scale-110' : 'scale-100'}
        `}
        loading="lazy"
        decoding="async"
      />
    )
  }

  // Show loading state while thumbnail loads
  if (fallbackUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-zinc-800/50">
        <div className="text-center">
          <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin mb-2 mx-auto" />
          <div className="text-xs text-white/30">Loading...</div>
        </div>
      </div>
    )
  }

  // No texture available
  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-2">🎨</div>
        <div className="text-xs text-white/30">No Preview</div>
      </div>
    </div>
  )
}

function MaterialSelectorContent({
  title,
  materials,
  selectedId,
  onSelect,
  icon,
  color,
  onClose,
}: MaterialSelectorContentProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [applyMode, setApplyMode] = useState<'selected' | 'all'>('selected')
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')

  // Material history and favorites stores
  const addToHistory = useMaterialHistoryStore((s) => s.addToHistory)
  const recentIds = useMaterialHistoryStore((s) => s.getRecentIds(10))
  const { favoriteIds, toggleFavorite, isFavorite } = useMaterialFavoritesStore()

  // T016: Preload visible thumbnails when filtered materials change
  const preloadVisibleThumbnails = useMaterialStore((s) => s.preloadVisibleThumbnails)
  const allMaterialIds = useMemo(() => Object.keys(materials), [materials])

  useEffect(() => {
    // Preload first 36 materials' thumbnails (visible on screen)
    const visibleIds = allMaterialIds.slice(0, 36)
    preloadVisibleThumbnails(visibleIds)
  }, [allMaterialIds, preloadVisibleThumbnails])

  const colorThemes = {
    orange: {
      iconBg: 'bg-orange-400/10',
      iconText: 'text-orange-400',
      border: 'border-orange-400/20',
      hoverBorder: 'hover:border-orange-400/40',
      selected: 'border-orange-400 bg-orange-400/10',
      selectedRing: 'ring-2 ring-orange-400/50',
      button: 'bg-orange-500 hover:bg-orange-600 active:bg-orange-700',
      gradient: 'from-orange-500/20 to-transparent',
    },
    blue: {
      iconBg: 'bg-blue-400/10',
      iconText: 'text-blue-400',
      border: 'border-blue-400/20',
      hoverBorder: 'hover:border-blue-400/40',
      selected: 'border-blue-400 bg-blue-400/10',
      selectedRing: 'ring-2 ring-blue-400/50',
      button: 'bg-blue-500 hover:bg-blue-600 active:bg-blue-700',
      gradient: 'from-blue-500/20 to-transparent',
    },
    cyan: {
      iconBg: 'bg-cyan-400/10',
      iconText: 'text-cyan-400',
      border: 'border-cyan-400/20',
      hoverBorder: 'hover:border-cyan-400/40',
      selected: 'border-cyan-400 bg-cyan-400/10',
      selectedRing: 'ring-2 ring-cyan-400/50',
      button: 'bg-cyan-500 hover:bg-cyan-600 active:bg-cyan-700',
      gradient: 'from-cyan-500/20 to-transparent',
    },
  }

  const theme = colorThemes[color]
  const selectedMaterial = selectedId ? materials[selectedId] : null
  const materialArray = Object.values(materials).filter(Boolean) // Filter out undefined/null values
  const materialCount = materialArray.length // Use filtered array length

  // Filter materials by search query
  const filterMaterials = (mats: typeof materialArray, query: string) => {
    if (!query.trim()) return mats
    const q = query.toLowerCase().trim()
    return mats.filter(
      (mat) =>
        mat.name.toLowerCase().includes(q) ||
        mat.type.toLowerCase().includes(q) ||
        (mat.manufacturer?.toLowerCase().includes(q) ?? false) ||
        (mat.category?.toLowerCase().includes(q) ?? false)
    )
  }

  // Group materials by type
  const getMaterialGroups = () => {
    // Apply search filter first
    const filtered = filterMaterials(materialArray, searchQuery)
    const groups: Record<string, typeof materialArray> = {}

    filtered.forEach(material => {
      const type = material.type || 'OTHER'
      if (!groups[type]) groups[type] = []
      groups[type].push(material)
    })


    // Order: MELAMINE → HPL → FENIX_NTM → FENIX_NTA → (then any others)
    const typeOrder = ['MELAMINE', 'HPL', 'FENIX_NTM', 'FENIX_NTA']
    const sortedGroups: typeof groups = {}

    // First add known types in order
    typeOrder.forEach(type => {
      if (groups[type]) {
        sortedGroups[type] = groups[type]
      }
    })

    // Then add any remaining types not in typeOrder
    Object.keys(groups).forEach(type => {
      if (!typeOrder.includes(type)) {
        sortedGroups[type] = groups[type]
      }
    })

    return sortedGroups
  }

  const materialGroups = getMaterialGroups()

  // Filter materials based on active filter
  const filteredMaterialGroups = Object.entries(materialGroups).reduce((acc, [type, materials]) => {
    if (activeFilter === 'all' || activeFilter === type) {
      acc[type] = materials
    }
    return acc
  }, {} as Record<string, typeof materialArray>)

  const handleApply = () => {
    if (!selectedMaterial) return
    // Add to history for recent materials
    addToHistory(selectedMaterial.id)
    // Call onSelect with the material ID and apply mode
    onSelect(selectedMaterial.id, applyMode)
    onClose()
  }

  return (
    <div className="relative h-full w-full bg-[#0a0a0a] overflow-hidden flex flex-col">
      <div
        className={`absolute inset-0 bg-gradient-to-br ${theme.gradient} opacity-5 pointer-events-none`}
      />

      {/* HEADER */}
      <div className="sticky top-0 z-20 bg-[#0a0a0a]/95 backdrop-blur-xl border-b border-white/10">
        <div className="flex items-center justify-between p-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <button
              className="p-2 hover:bg-white/5 rounded-lg transition-colors group"
              onClick={onClose}
            >
              <ArrowLeft className="w-5 h-5 text-white/50 group-hover:text-white transition-colors" />
            </button>

            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center ${theme.iconBg} ${theme.iconText}`}
            >
              {icon}
            </div>

            <div>
              <h2 className="text-xl font-semibold text-white">{title}</h2>
              <p className="text-sm text-white/50">
                {materialCount} materials available
              </p>
            </div>
          </div>

          <button
            className="p-2 hover:bg-white/5 rounded-lg transition-colors group"
            onClick={onClose}
          >
            <X className="w-5 h-5 text-white/50 group-hover:text-white transition-colors" />
          </button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-7xl mx-auto">
          {/* SEARCH INPUT */}
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search materials by name, type, or manufacturer..."
                className="w-full pl-10 pr-10 py-3 bg-white/5 border border-white/10 rounded-xl
                         text-sm text-white placeholder:text-white/40 focus:outline-none
                         focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-all"
                autoFocus
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded transition-colors"
                >
                  <X className="w-4 h-4 text-white/40 hover:text-white/60" />
                </button>
              )}
            </div>
          </div>

          {/* FAVORITES SECTION */}
          {favoriteIds.length > 0 && !searchQuery && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-yellow-400/80 mb-3 flex items-center gap-2">
                <Star className="w-4 h-4" fill="currentColor" /> Favorites
              </h3>
              <div className="flex gap-2 flex-wrap">
                {favoriteIds.map((id) => {
                  const mat = materials[id]
                  if (!mat) return null
                  return (
                    <button
                      key={id}
                      onClick={() => onSelect(id)}
                      className={`px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-all ${
                        selectedId === id
                          ? `${theme.selected} ${theme.iconText}`
                          : 'bg-white/5 text-white/70 hover:bg-white/10 border border-white/10'
                      }`}
                    >
                      {mat.textureUrl ? (
                        <img
                          src={mat.textureUrl}
                          alt=""
                          className="w-6 h-6 rounded object-cover"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded bg-white/10 flex items-center justify-center text-[10px]">
                          🎨
                        </div>
                      )}
                      <span className="truncate max-w-[100px]">{mat.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* RECENT SECTION */}
          {recentIds.length > 0 && !searchQuery && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-white/60 mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4" /> Recent
              </h3>
              <div className="flex gap-2 flex-wrap">
                {recentIds.map((id) => {
                  const mat = materials[id]
                  if (!mat) return null
                  return (
                    <button
                      key={id}
                      onClick={() => onSelect(id)}
                      className={`px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-all ${
                        selectedId === id
                          ? `${theme.selected} ${theme.iconText}`
                          : 'bg-white/5 text-white/70 hover:bg-white/10 border border-white/10'
                      }`}
                    >
                      {mat.textureUrl ? (
                        <img
                          src={mat.textureUrl}
                          alt=""
                          className="w-6 h-6 rounded object-cover"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded bg-white/10 flex items-center justify-center text-[10px]">
                          🎨
                        </div>
                      )}
                      <span className="truncate max-w-[100px]">{mat.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* FILTER TABS */}
          <div className="mb-6 flex gap-2 flex-wrap">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all
                ${
                  activeFilter === 'all'
                    ? `${theme.selected} ${theme.iconText} ${theme.selectedRing}`
                    : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border border-white/10'
                }
              `}
            >
              All
            </button>
            {Object.keys(materialGroups).map(type => (
              <button
                key={type}
                onClick={() => setActiveFilter(type)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all
                  ${
                    activeFilter === type
                      ? `${theme.selected} ${theme.iconText} ${theme.selectedRing}`
                      : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border border-white/10'
                  }
                `}
              >
                {getTypeDisplayName(type)}
              </button>
            ))}
          </div>

          {/* MATERIALS SECTIONS */}
          {Object.entries(filteredMaterialGroups).map(([type, materials], _sectionIndex) => (
            <div key={type} className="mb-8">
              {/* Section Header */}
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-white mb-1">
                  {getTypeDisplayName(type)}
                </h3>
                <p className="text-xs text-white/40">
                  {getTypeDescription(type)} • {materials.length} options
                </p>
              </div>

              {/* Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {materials.map((material, index) => {
                  const isSelected = material.id === selectedId
                  const isHovered = material.id === hoveredId

                  return (
                    <motion.div
                      key={material.id}
                      onClick={() => onSelect(material.id)}
                      onMouseEnter={() => setHoveredId(material.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      className={`
                        relative rounded-xl border-2 overflow-hidden cursor-pointer
                        transition-all
                        ${
                          isSelected
                            ? `${theme.selected} ${theme.selectedRing}`
                            : 'border-white/10 hover:border-white/30'
                        }
                      `}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                      whileHover={{ y: -8, scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="aspect-square bg-zinc-900 relative overflow-hidden">
                        {/* Favorite Star Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleFavorite(material.id)
                          }}
                          className={`absolute top-2 left-2 w-7 h-7 rounded-full flex items-center justify-center
                                    transition-all z-10 ${
                                      isFavorite(material.id)
                                        ? 'bg-yellow-500 text-white shadow-lg'
                                        : 'bg-black/50 text-white/50 hover:text-yellow-400 hover:bg-black/70'
                                    }`}
                        >
                          <Star
                            className="w-4 h-4"
                            fill={isFavorite(material.id) ? 'currentColor' : 'none'}
                          />
                        </button>

                        {/* T016: Use cached thumbnail from store */}
                        <MaterialThumbnail
                          materialId={material.id}
                          fallbackUrl={material.textureUrl || material.texture || material.thumbnail}
                          isHovered={isHovered}
                        />

                        {isHovered && !isSelected && (
                          <motion.div
                            className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-end p-3"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                          >
                            <div className="text-xs text-white/70">
                              Click to select
                            </div>
                          </motion.div>
                        )}
                      </div>

                      <AnimatePresence>
                        {isSelected && (
                          <motion.div
                            className={`absolute top-3 right-3 w-8 h-8 rounded-full ${theme.button} flex items-center justify-center shadow-lg`}
                            initial={{ scale: 0, rotate: -180 }}
                            animate={{ scale: 1, rotate: 0 }}
                            exit={{ scale: 0, rotate: 180 }}
                            transition={{
                              type: 'spring',
                              stiffness: 300,
                              damping: 20,
                            }}
                          >
                            <Check className="w-5 h-5 text-white" strokeWidth={3} />
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <div className="p-3 bg-[#1a1a1a]">
                        <div className="text-sm font-medium text-white mb-1 truncate">
                          {material.name}
                        </div>
                        <div className="text-xs text-white/50 flex items-center gap-1">
                          <span>{material.type}</span>
                          {material.thickness && (
                            <>
                              <span className="text-white/30">•</span>
                              <span className="font-mono">{material.thickness}mm</span>
                            </>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* PROPERTIES */}
          {selectedMaterial && (
            <motion.div
              className="bg-[#1a1a1a] rounded-2xl border border-white/10 overflow-hidden"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <div
                className={`p-4 border-b border-white/10 bg-gradient-to-r ${theme.gradient}`}
              >
                <div className="flex items-center gap-2">
                  <Info className={`w-5 h-5 ${theme.iconText}`} />
                  <h3 className="text-sm font-semibold text-white">
                    Material Properties
                  </h3>
                </div>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
                  <div>
                    <div className="text-xs text-white/50 mb-1.5 uppercase tracking-wide">
                      Material
                    </div>
                    <div className="text-base text-white font-medium">
                      {selectedMaterial.name}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-white/50 mb-1.5 uppercase tracking-wide">
                      Type
                    </div>
                    <div className="text-base text-white font-medium">
                      {selectedMaterial.type}
                    </div>
                  </div>

                  {selectedMaterial.thickness && (
                    <div>
                      <div className="text-xs text-white/50 mb-1.5 uppercase tracking-wide">
                        Thickness
                      </div>
                      <div className="text-base text-white font-mono">
                        {selectedMaterial.thickness}mm
                      </div>
                    </div>
                  )}

                  {selectedMaterial.density && (
                    <div>
                      <div className="text-xs text-white/50 mb-1.5 uppercase tracking-wide">
                        Density
                      </div>
                      <div className="text-base text-white font-mono">
                        {selectedMaterial.density} kg/m³
                      </div>
                    </div>
                  )}

                  {selectedMaterial.cost && (
                    <div>
                      <div className="text-xs text-white/50 mb-1.5 uppercase tracking-wide">
                        Cost
                      </div>
                      <div className="text-base text-white font-mono">
                        ฿{selectedMaterial.cost.toLocaleString()}/sqm
                      </div>
                    </div>
                  )}

                  {selectedMaterial.manufacturer && (
                    <div>
                      <div className="text-xs text-white/50 mb-1.5 uppercase tracking-wide">
                        Manufacturer
                      </div>
                      <div className="text-base text-white">
                        {selectedMaterial.manufacturer}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mb-6">
                  <div className="text-xs text-white/50 mb-3 uppercase tracking-wide">
                    Apply To
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setApplyMode('selected')}
                      className={`
                        flex-1 px-4 py-3 rounded-lg border-2 transition-all font-medium text-sm
                        ${
                          applyMode === 'selected'
                            ? `${theme.selected} ${theme.iconText}`
                            : 'border-white/10 text-white/50 hover:border-white/20 hover:text-white/70'
                        }
                      `}
                    >
                      Selected Panels Only
                    </button>
                    <button
                      onClick={() => setApplyMode('all')}
                      className={`
                        flex-1 px-4 py-3 rounded-lg border-2 transition-all font-medium text-sm
                        ${
                          applyMode === 'all'
                            ? `${theme.selected} ${theme.iconText}`
                            : 'border-white/10 text-white/50 hover:border-white/20 hover:text-white/70'
                        }
                      `}
                    >
                      All Panels
                    </button>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleApply}
                    className={`
                      flex-1 px-6 py-3 rounded-xl ${theme.button}
                      text-white font-semibold text-sm transition-all
                      shadow-lg hover:shadow-xl
                    `}
                  >
                    Apply Material
                  </button>
                  <button
                    onClick={onClose}
                    className="
                      px-6 py-3 rounded-xl border-2 border-white/20
                      text-white/70 hover:text-white hover:bg-white/5 hover:border-white/30
                      font-semibold text-sm transition-all
                    "
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}

export function MaterialSelector({
  title,
  materials,
  selectedId,
  onSelect,
  icon,
  color,
  number,
}: MaterialSelectorProps) {
  const colorThemes = {
    orange: {
      iconBg: 'bg-orange-400/10',
      iconText: 'text-orange-400',
      border: 'border-orange-400/20',
      hoverBorder: 'hover:border-orange-400/40',
    },
    blue: {
      iconBg: 'bg-blue-400/10',
      iconText: 'text-blue-400',
      border: 'border-blue-400/20',
      hoverBorder: 'hover:border-blue-400/40',
    },
    cyan: {
      iconBg: 'bg-cyan-400/10',
      iconText: 'text-cyan-400',
      border: 'border-cyan-400/20',
      hoverBorder: 'hover:border-cyan-400/40',
    },
  }

  const theme = colorThemes[color]
  const selectedMaterial = selectedId ? materials[selectedId] : null

  return (
    <ExpandableScreen
      layoutId={`material-selector-${title.replace(/\s+/g, '-').toLowerCase()}`}
      triggerRadius={8}
      contentRadius={0}
    >
      {/* TRIGGER - Compact Card (30% smaller) */}
      <ExpandableScreenTrigger>
        <motion.div
          className={`
            flex items-center gap-2 p-2 rounded-lg border transition-all cursor-pointer
            ${theme.border} ${theme.hoverBorder} bg-[#1a1a1a] hover:bg-[#222]
          `}
          whileHover={{ x: 2 }}
          whileTap={{ scale: 0.98 }}
        >
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-white/5 flex-shrink-0">
            <span className="text-[10px] font-mono text-white/50">{number}</span>
          </div>

          <div
            className={`
              flex-shrink-0 w-6 h-6 rounded flex items-center justify-center
              ${theme.iconBg} ${theme.iconText}
            `}
          >
            {icon}
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-white/90">{title}</div>
            <div className="text-[10px] text-white/50 truncate font-mono">
              {selectedMaterial ? (
                <>
                  {selectedMaterial.name}
                  {selectedMaterial.thickness && ` ${selectedMaterial.thickness}mm`}
                </>
              ) : (
                'Not selected'
              )}
            </div>
          </div>
        </motion.div>
      </ExpandableScreenTrigger>

      {/* CONTENT - Full Screen with render prop that provides close() function */}
      <ExpandableScreenContent>
        {({ close }) => (
          <MaterialSelectorContent
            title={title}
            materials={materials}
            selectedId={selectedId}
            onSelect={onSelect}
            icon={icon}
            color={color}
            onClose={close}
          />
        )}
      </ExpandableScreenContent>
    </ExpandableScreen>
  )
}

export default MaterialSelector
