/**
 * IncidentBanner - Key incident warning display
 * P1.1 Factory Ops UX
 *
 * Shows immediately if there's a key incident active.
 * Cannot be dismissed - must be visible at all times.
 *
 * @version 0.11.0
 */

import React from "react";
import { useFactoryStore } from "../state/factoryStore";

export interface IncidentBannerProps {
  /** Override auto-fetch from store */
  active?: boolean;
  message?: string;
}

export function IncidentBanner({
  active: propActive,
  message: propMessage,
}: IncidentBannerProps): React.ReactElement | null {
  const { incidentActive, incidentMessage } = useFactoryStore();

  const isActive = propActive ?? incidentActive;
  const displayMessage = propMessage ?? incidentMessage;

  if (!isActive) {
    return null;
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 20px",
        backgroundColor: "#ef444420",
        borderBottom: "2px solid #ef4444",
        animation: "pulse-bg 2s infinite",
      }}
    >
      {/* Warning Icon */}
      <span
        style={{
          fontSize: 24,
          animation: "shake 0.5s infinite",
        }}
      >
        ⚠️
      </span>

      {/* Message */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "#ef4444",
            textTransform: "uppercase",
          }}
        >
          Security Incident Active
        </span>
        {displayMessage && (
          <span
            style={{
              fontSize: 13,
              color: "#fca5a5",
            }}
          >
            {displayMessage}
          </span>
        )}
      </div>

      {/* Action */}
      <a
        href="mailto:security@monolith.com"
        style={{
          padding: "8px 16px",
          backgroundColor: "#ef4444",
          border: "none",
          borderRadius: 6,
          color: "#fff",
          fontSize: 13,
          fontWeight: 600,
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        Contact Security
      </a>

      {/* Animations */}
      <style>{`
        @keyframes pulse-bg {
          0%, 100% {
            background-color: rgba(239, 68, 68, 0.12);
          }
          50% {
            background-color: rgba(239, 68, 68, 0.2);
          }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-2px); }
          75% { transform: translateX(2px); }
        }
      `}</style>
    </div>
  );
}

export default IncidentBanner;
