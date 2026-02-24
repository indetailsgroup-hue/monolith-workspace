/**
 * Profile Browser - Edge Profile Library
 *
 * Browse and select edge profiles for cabinet edges.
 * Each profile has:
 * - 2D curve preview
 * - CAM validation (tool radius, depth limits)
 * - Tags for search
 *
 * v1.0: Initial profile browser
 */

import React, { useState, useMemo } from 'react';
import { useModelingStore } from '@/core/modeling';
import { BUILT_IN_PROFILES, type ProfileAsset } from '@/core/modeling/types';

interface ProfileBrowserProps {
  /** Callback when profile is selected */
  onSelect?: (profile: ProfileAsset) => void;
  /** Current panel thickness for validation */
  panelThickness?: number;
  /** Show as modal or inline */
  mode?: 'modal' | 'inline' | 'panel';
  /** Is visible (for modal mode) */
  isOpen?: boolean;
  /** Close callback (for modal mode) */
  onClose?: () => void;
}

type CategoryFilter = 'all' | ProfileAsset['category'];

export function ProfileBrowser({
  onSelect,
  panelThickness = 18,
  mode = 'panel',
  isOpen = true,
  onClose,
}: ProfileBrowserProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [hoveredProfile, setHoveredProfile] = useState<ProfileAsset | null>(null);

  const selectProfile = useModelingStore((s) => s.selectProfile);
  const selectedProfileId = useModelingStore((s) => s.tool.selectedProfileId);
  const customProfiles = useModelingStore((s) => s.customProfiles);

  // Combine built-in and custom profiles
  const allProfiles = useMemo(() => {
    return [...BUILT_IN_PROFILES, ...customProfiles];
  }, [customProfiles]);

  // Filter profiles
  const filteredProfiles = useMemo(() => {
    let profiles = allProfiles;

    // Category filter
    if (categoryFilter !== 'all') {
      profiles = profiles.filter((p) => p.category === categoryFilter);
    }

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      profiles = profiles.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    return profiles;
  }, [allProfiles, categoryFilter, searchQuery]);

  // Handle profile selection
  const handleSelect = (profile: ProfileAsset) => {
    selectProfile(profile.id);
    onSelect?.(profile);
    if (mode === 'modal') {
      onClose?.();
    }
  };

  // Check if profile is valid for current panel
  const isProfileValid = (profile: ProfileAsset) => {
    return profile.minThickness <= panelThickness;
  };

  if (mode === 'modal' && !isOpen) return null;

  const content = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: mode === 'modal' ? '#1a1a2e' : 'transparent',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: mode === 'panel' ? '12px 0' : '16px 20px',
          borderBottom: '1px solid #3a3a5a',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}
        >
          <h3
            style={{
              margin: 0,
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Edge Profiles
          </h3>
          {mode === 'modal' && (
            <button
              onClick={onClose}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                color: '#6b7280',
                cursor: 'pointer',
                fontSize: 18,
              }}
            >
              ×
            </button>
          )}
        </div>

        {/* Search */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            borderRadius: 8,
            marginBottom: 12,
          }}
        >
          <SearchIcon />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search profiles..."
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#fff',
              fontSize: 13,
            }}
          />
        </div>

        {/* Category Pills */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['all', 'finger-pull', 'reveal', 'bevel', 'round', 'decorative'] as CategoryFilter[]).map(
            (cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                style={{
                  padding: '4px 10px',
                  fontSize: 11,
                  borderRadius: 12,
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor:
                    categoryFilter === cat ? 'rgba(139, 92, 246, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                  color: categoryFilter === cat ? '#8b5cf6' : '#a0a0a0',
                  textTransform: 'capitalize',
                  transition: 'all 0.15s ease',
                }}
              >
                {cat === 'all' ? 'All' : cat.replace('-', ' ')}
              </button>
            )
          )}
        </div>
      </div>

      {/* Profile Grid */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: mode === 'panel' ? '12px 0' : '16px 20px',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: mode === 'modal' ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)',
            gap: 10,
          }}
        >
          {filteredProfiles.map((profile) => {
            const isSelected = selectedProfileId === profile.id;
            const isValid = isProfileValid(profile);

            return (
              <div
                key={profile.id}
                onClick={() => isValid && handleSelect(profile)}
                onMouseEnter={() => setHoveredProfile(profile)}
                onMouseLeave={() => setHoveredProfile(null)}
                style={{
                  padding: 12,
                  backgroundColor: isSelected
                    ? 'rgba(139, 92, 246, 0.2)'
                    : 'rgba(255, 255, 255, 0.05)',
                  border: isSelected ? '2px solid #8b5cf6' : '2px solid transparent',
                  borderRadius: 10,
                  cursor: isValid ? 'pointer' : 'not-allowed',
                  opacity: isValid ? 1 : 0.5,
                  transition: 'all 0.15s ease',
                }}
              >
                {/* Profile Preview (SVG) */}
                <div
                  style={{
                    height: 60,
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: 6,
                    marginBottom: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                >
                  <ProfilePreviewSVG profile={profile} />
                </div>

                {/* Profile Info */}
                <div style={{ fontSize: 12, fontWeight: 500, color: '#fff', marginBottom: 4 }}>
                  {profile.name}
                </div>

                {/* Specs */}
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    fontSize: 10,
                    color: '#6b7280',
                  }}
                >
                  <span>≥{profile.minThickness}mm</span>
                  <span>R{profile.toolRadius}</span>
                  {profile.camSafe && (
                    <span style={{ color: '#22c55e' }}>✓ CAM</span>
                  )}
                </div>

                {/* Invalid warning */}
                {!isValid && (
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 10,
                      color: '#ef4444',
                    }}
                  >
                    Panel too thin ({panelThickness}mm &lt; {profile.minThickness}mm)
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {filteredProfiles.length === 0 && (
          <div
            style={{
              padding: 32,
              textAlign: 'center',
              color: '#6b7280',
            }}
          >
            No profiles found
          </div>
        )}
      </div>

      {/* Profile Detail Panel (on hover) */}
      {hoveredProfile && (
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid #3a3a5a',
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 8 }}>
            {hoveredProfile.name}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '4px 16px',
              fontSize: 11,
            }}
          >
            <div style={{ color: '#6b7280' }}>Min Thickness:</div>
            <div style={{ color: '#fff' }}>{hoveredProfile.minThickness}mm</div>
            <div style={{ color: '#6b7280' }}>Tool Radius:</div>
            <div style={{ color: '#fff' }}>{hoveredProfile.toolRadius}mm</div>
            <div style={{ color: '#6b7280' }}>Max Depth:</div>
            <div style={{ color: '#fff' }}>{hoveredProfile.maxDepth}mm</div>
            <div style={{ color: '#6b7280' }}>CAM Safe:</div>
            <div style={{ color: hoveredProfile.camSafe ? '#22c55e' : '#ef4444' }}>
              {hoveredProfile.camSafe ? 'Yes' : 'No (undercuts)'}
            </div>
          </div>
          <div
            style={{
              marginTop: 8,
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
            }}
          >
            {hoveredProfile.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  padding: '2px 8px',
                  backgroundColor: 'rgba(139, 92, 246, 0.2)',
                  borderRadius: 4,
                  fontSize: 10,
                  color: '#8b5cf6',
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // Modal wrapper
  if (mode === 'modal') {
    return (
      <>
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            zIndex: 9998,
          }}
        />
        <div
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 600,
            maxWidth: '90vw',
            maxHeight: '80vh',
            backgroundColor: '#1a1a2e',
            border: '1px solid #3a3a5a',
            borderRadius: 12,
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            zIndex: 9999,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {content}
        </div>
      </>
    );
  }

  return content;
}

// ============================================================================
// Profile Preview SVG
// ============================================================================

function ProfilePreviewSVG({ profile }: { profile: ProfileAsset }) {
  // Generate SVG path from bezier segments
  const pathD = useMemo(() => {
    const segments = profile.curve2D;
    if (!segments.length) return '';

    let d = '';
    segments.forEach((seg, i) => {
      if (seg.type === 'line') {
        if (i === 0) {
          d += `M ${seg.points[0].x + 30} ${-seg.points[0].y + 30} `;
        }
        d += `L ${seg.points[1].x + 30} ${-seg.points[1].y + 30} `;
      } else if (seg.type === 'quadratic') {
        if (i === 0) {
          d += `M ${seg.points[0].x + 30} ${-seg.points[0].y + 30} `;
        }
        d += `Q ${seg.points[1].x + 30} ${-seg.points[1].y + 30} ${seg.points[2].x + 30} ${-seg.points[2].y + 30} `;
      } else if (seg.type === 'cubic') {
        if (i === 0) {
          d += `M ${seg.points[0].x + 30} ${-seg.points[0].y + 30} `;
        }
        d += `C ${seg.points[1].x + 30} ${-seg.points[1].y + 30} ${seg.points[2].x + 30} ${-seg.points[2].y + 30} ${seg.points[3].x + 30} ${-seg.points[3].y + 30} `;
      }
    });

    return d;
  }, [profile.curve2D]);

  return (
    <svg width="100%" height="100%" viewBox="0 0 80 60" style={{ padding: 4 }}>
      {/* Panel background */}
      <rect x="25" y="0" width="30" height="60" fill="rgba(139, 92, 246, 0.1)" stroke="#3a3a5a" strokeWidth="0.5" />
      {/* Profile curve */}
      <path d={pathD} fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" />
      {/* Reference point */}
      <circle cx="30" cy="30" r="2" fill="#8b5cf6" />
    </svg>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export default ProfileBrowser;
