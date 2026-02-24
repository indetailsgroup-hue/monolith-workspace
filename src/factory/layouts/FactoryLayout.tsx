/**
 * FactoryLayout - Wrapper layout for factory pages
 * PR-P1.1-C.1 Factory Dashboard Integration
 *
 * Provides consistent header, navigation, and layout structure.
 *
 * @version 0.12.0
 */

import React from "react";
import { IncidentBanner } from "../components/IncidentBanner";

export interface FactoryLayoutProps {
  /** Page content */
  children: React.ReactNode;
  /** Title for the page header */
  title?: string;
  /** Back button callback */
  onBack?: () => void;
  /** Right side header content */
  headerRight?: React.ReactNode;
  /** Whether to show incident banner */
  showIncidentBanner?: boolean;
  /** Whether to show header */
  showHeader?: boolean;
}

export function FactoryLayout({
  children,
  title,
  onBack,
  headerRight,
  showIncidentBanner = true,
  showHeader = true,
}: FactoryLayoutProps): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        backgroundColor: "#0a0a15",
        color: "#fff",
      }}
    >
      {/* Incident Banner (always on top) */}
      {showIncidentBanner && <IncidentBanner />}

      {/* Header */}
      {showHeader && (title || onBack || headerRight) && (
        <LayoutHeader
          title={title}
          onBack={onBack}
          rightContent={headerRight}
        />
      )}

      {/* Content */}
      <main
        style={{
          flex: 1,
          overflow: "auto",
        }}
      >
        {children}
      </main>
    </div>
  );
}

// ============================================================================
// Layout Header
// ============================================================================

interface LayoutHeaderProps {
  title?: string;
  onBack?: () => void;
  rightContent?: React.ReactNode;
}

function LayoutHeader({
  title,
  onBack,
  rightContent,
}: LayoutHeaderProps): React.ReactElement {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "16px 20px",
        borderBottom: "1px solid #3a3a5a",
        backgroundColor: "#1a1a2e",
      }}
    >
      {/* Back Button */}
      {onBack && (
        <button
          onClick={onBack}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 12px",
            backgroundColor: "transparent",
            border: "1px solid #3a3a5a",
            borderRadius: 8,
            color: "#888",
            fontSize: 14,
            cursor: "pointer",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "#8b5cf6";
            e.currentTarget.style.color = "#8b5cf6";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "#3a3a5a";
            e.currentTarget.style.color = "#888";
          }}
        >
          <span>←</span>
          <span>Back</span>
        </button>
      )}

      {/* Title */}
      {title && (
        <h1
          style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 700,
            color: "#fff",
            flex: 1,
          }}
        >
          {title}
        </h1>
      )}

      {/* Right Content */}
      {rightContent && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          {rightContent}
        </div>
      )}
    </header>
  );
}

// ============================================================================
// Page Content Wrapper
// ============================================================================

export interface PageContentProps {
  /** Content to render */
  children: React.ReactNode;
  /** Maximum width of content */
  maxWidth?: number | string;
  /** Padding around content */
  padding?: number;
  /** Center content horizontally */
  centered?: boolean;
}

export function PageContent({
  children,
  maxWidth,
  padding = 20,
  centered = false,
}: PageContentProps): React.ReactElement {
  return (
    <div
      style={{
        padding,
        maxWidth,
        margin: centered ? "0 auto" : undefined,
      }}
    >
      {children}
    </div>
  );
}

// ============================================================================
// Split Layout (e.g., sidebar + main)
// ============================================================================

export interface SplitLayoutProps {
  /** Sidebar content */
  sidebar: React.ReactNode;
  /** Main content */
  children: React.ReactNode;
  /** Sidebar width */
  sidebarWidth?: number;
  /** Sidebar position */
  sidebarPosition?: "left" | "right";
}

export function SplitLayout({
  sidebar,
  children,
  sidebarWidth = 300,
  sidebarPosition = "left",
}: SplitLayoutProps): React.ReactElement {
  const sidebarElement = (
    <aside
      style={{
        width: sidebarWidth,
        flexShrink: 0,
        borderRight: sidebarPosition === "left" ? "1px solid #3a3a5a" : undefined,
        borderLeft: sidebarPosition === "right" ? "1px solid #3a3a5a" : undefined,
        backgroundColor: "#1a1a2e",
        overflow: "auto",
      }}
    >
      {sidebar}
    </aside>
  );

  const mainElement = (
    <main
      style={{
        flex: 1,
        overflow: "auto",
      }}
    >
      {children}
    </main>
  );

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
      {sidebarPosition === "left" ? (
        <>
          {sidebarElement}
          {mainElement}
        </>
      ) : (
        <>
          {mainElement}
          {sidebarElement}
        </>
      )}
    </div>
  );
}

// ============================================================================
// Card Grid Layout
// ============================================================================

export interface CardGridProps {
  /** Cards to render */
  children: React.ReactNode;
  /** Minimum card width */
  minCardWidth?: number;
  /** Gap between cards */
  gap?: number;
}

export function CardGrid({
  children,
  minCardWidth = 300,
  gap = 20,
}: CardGridProps): React.ReactElement {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(${minCardWidth}px, 1fr))`,
        gap,
      }}
    >
      {children}
    </div>
  );
}

export default FactoryLayout;
