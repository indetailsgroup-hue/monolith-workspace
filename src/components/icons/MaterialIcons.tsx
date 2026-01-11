import React from 'react';

/**
 * Core Structure Icon
 * แสดงภาพตัดขวางของแผ่นวัสดุหลัก (Particle Board, MDF, HMR, Plywood)
 * แสดงเป็นชั้นๆ เพื่อสื่อถึง core structure
 */
export const CoreStructureIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg 
    width="16" 
    height="16" 
    viewBox="0 0 16 16" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* Outer border - แผ่นวัสดุ */}
    <rect 
      x="2" 
      y="3" 
      width="12" 
      height="10" 
      stroke="currentColor" 
      strokeWidth="1.5"
      rx="0.5"
    />
    
    {/* Internal layers - ชั้นภายในของวัสดุ */}
    <line 
      x1="2" 
      y1="6" 
      x2="14" 
      y2="6" 
      stroke="currentColor" 
      strokeWidth="0.75" 
      opacity="0.6"
    />
    <line 
      x1="2" 
      y1="8" 
      x2="14" 
      y2="8" 
      stroke="currentColor" 
      strokeWidth="0.75" 
      opacity="0.6"
    />
    <line 
      x1="2" 
      y1="10" 
      x2="14" 
      y2="10" 
      stroke="currentColor" 
      strokeWidth="0.75" 
      opacity="0.6"
    />
    
    {/* Fiber dots - แสดงเนื้อไม้/เส้นใย */}
    <circle cx="5" cy="4.5" r="0.4" fill="currentColor" opacity="0.4" />
    <circle cx="8" cy="5" r="0.4" fill="currentColor" opacity="0.4" />
    <circle cx="11" cy="4.5" r="0.4" fill="currentColor" opacity="0.4" />
    <circle cx="6" cy="7" r="0.4" fill="currentColor" opacity="0.4" />
    <circle cx="10" cy="7" r="0.4" fill="currentColor" opacity="0.4" />
    <circle cx="5" cy="9" r="0.4" fill="currentColor" opacity="0.4" />
    <circle cx="9" cy="9.5" r="0.4" fill="currentColor" opacity="0.4" />
    <circle cx="7" cy="11.5" r="0.4" fill="currentColor" opacity="0.4" />
    <circle cx="11" cy="11" r="0.4" fill="currentColor" opacity="0.4" />
  </svg>
);

/**
 * Surface Finish Icon
 * แสดงภาพตัดขวางของ surface layer (Melamine, HPL, Veneer)
 * แสดงเป็นชั้นบางๆ ด้านบนและด้านล่าง พร้อมลาย wood grain
 */
export const SurfaceFinishIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg 
    width="16" 
    height="16" 
    viewBox="0 0 16 16" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* Core layer (gray, subtle) */}
    <rect 
      x="2" 
      y="5" 
      width="12" 
      height="6" 
      fill="currentColor" 
      opacity="0.15"
      rx="0.5"
    />
    
    {/* Top surface layer */}
    <rect 
      x="2" 
      y="3" 
      width="12" 
      height="1.5" 
      fill="currentColor"
      rx="0.5"
    />
    
    {/* Bottom surface layer */}
    <rect 
      x="2" 
      y="11.5" 
      width="12" 
      height="1.5" 
      fill="currentColor"
      rx="0.5"
    />
    
    {/* Wood grain pattern - top surface */}
    <path 
      d="M3 3.75 Q5 3.5, 7 3.75 Q9 4, 11 3.75 Q13 3.5, 13.5 3.75" 
      stroke="currentColor" 
      strokeWidth="0.5" 
      fill="none"
      opacity="0.4"
    />
    
    {/* Wood grain pattern - bottom surface */}
    <path 
      d="M3 12.25 Q5 12, 7 12.25 Q9 12.5, 11 12.25 Q13 12, 13.5 12.25" 
      stroke="currentColor" 
      strokeWidth="0.5" 
      fill="none"
      opacity="0.4"
    />
    
    {/* Shine/gloss effect */}
    <line 
      x1="3" 
      y1="3.3" 
      x2="6" 
      y2="3.3" 
      stroke="white" 
      strokeWidth="0.4" 
      opacity="0.6"
    />
  </svg>
);

/**
 * Edge Banding Icon
 * แสดงภาพตัดขวางของ edge banding (PVC, ABS, Veneer)
 * เน้นที่ขอบด้านข้างของแผ่น
 */
export const EdgeBandingIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg 
    width="16" 
    height="16" 
    viewBox="0 0 16 16" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* Core panel (subtle) */}
    <rect 
      x="3" 
      y="3" 
      width="10" 
      height="10" 
      stroke="currentColor" 
      strokeWidth="1" 
      opacity="0.3"
      rx="0.5"
    />
    
    {/* Left edge banding - highlighted */}
    <rect 
      x="2" 
      y="3" 
      width="1.5" 
      height="10" 
      fill="currentColor"
      rx="0.3"
    />
    
    {/* Right edge banding - highlighted */}
    <rect 
      x="12.5" 
      y="3" 
      width="1.5" 
      height="10" 
      fill="currentColor"
      rx="0.3"
    />
    
    {/* Top edge banding */}
    <rect 
      x="3" 
      y="2" 
      width="10" 
      height="1.5" 
      fill="currentColor"
      opacity="0.7"
      rx="0.3"
    />
    
    {/* Bottom edge banding */}
    <rect 
      x="3" 
      y="12.5" 
      width="10" 
      height="1.5" 
      fill="currentColor"
      opacity="0.7"
      rx="0.3"
    />
    
    {/* Edge detail lines - show thickness */}
    <line 
      x1="2.75" 
      y1="5" 
      x2="2.75" 
      y2="11" 
      stroke="white" 
      strokeWidth="0.4" 
      opacity="0.4"
    />
    <line 
      x1="13.25" 
      y1="5" 
      x2="13.25" 
      y2="11" 
      stroke="white" 
      strokeWidth="0.4" 
      opacity="0.4"
    />
  </svg>
);

/**
 * Material Stack Icon - for section header
 * แสดงภาพรวมของ material stack (3 layers)
 */
export const MaterialStackIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg 
    width="16" 
    height="16" 
    viewBox="0 0 16 16" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path d="M2 3h12v2H2z M2 6h12v2H2z M2 9h12v2H2z" fill="currentColor"/>
  </svg>
);

/**
 * Simplified versions for smaller sizes or alternative styles
 */
export const CoreStructureIconSimple: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={className}>
    <rect x="2" y="3" width="12" height="10" stroke="currentColor" strokeWidth="1.5" rx="0.5"/>
    <line x1="2" y1="6.5" x2="14" y2="6.5" stroke="currentColor" strokeWidth="1" opacity="0.5"/>
    <line x1="2" y1="9.5" x2="14" y2="9.5" stroke="currentColor" strokeWidth="1" opacity="0.5"/>
  </svg>
);

export const SurfaceFinishIconSimple: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={className}>
    <rect x="2" y="5" width="12" height="6" fill="currentColor" opacity="0.2"/>
    <rect x="2" y="3" width="12" height="1.5" fill="currentColor"/>
    <rect x="2" y="11.5" width="12" height="1.5" fill="currentColor"/>
  </svg>
);

export const EdgeBandingIconSimple: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={className}>
    <rect x="3" y="3" width="10" height="10" stroke="currentColor" strokeWidth="1" opacity="0.3"/>
    <rect x="2" y="3" width="1.5" height="10" fill="currentColor"/>
    <rect x="12.5" y="3" width="1.5" height="10" fill="currentColor"/>
  </svg>
);
