# Monolith Architectural Decisions

## Active Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Crypto | Ed25519 + SHA-256 + Base64 | Fast, small keys, Web Crypto native, JSON-safe |
| Policy | Immutable signed artifact, Bundle > Installed > None | Offline factory, tamper-evident, designer controls |
| FACTORY mode | Auto requirePolicy | Eliminates "forgot opts" bugs |
| State | Zustand, multiple stores | Simple API, smaller re-render scope |
| Modes | DESIGNER (flexible) vs FACTORY (strict) | Different trust requirements |
| UI | Dark theme, inline styles | CAD eye strain, zero runtime overhead |
| Structure | Feature-based (`src/release/policy/`) | Easy to find related files |
| Scope mismatch | QUARANTINE + admin override | Recovery path with audit trail |
| Revocation | Time-based | Pre-revocation manifests stay valid |

## Hardware: Häfele S200 Minifix Bolt

- Ball Head Ø = **6.5mm** (NOT 7.5mm) per catalog
- B = 3.25 + 6.5 + 14.25 = **24mm** (Ball Head CENTER → Sleeve BOTTOM)
- Total = B + Thread(11mm) = **35mm**
- neckShaftLength=6.5mm, sleeveLength=14.25mm, shaftLength=11mm
