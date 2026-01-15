# IIMOS Architectural Decisions

> Document the "why" behind key decisions.
> Preserves context that code comments can't capture.

## Cryptography

### Decision: Ed25519 over RSA
**Why**: Ed25519 is faster, smaller keys (32 bytes), and Web Crypto API native support.
**Trade-off**: Less widely supported in legacy systems, but acceptable for new project.

### Decision: SHA-256 for content hashing
**Why**: Industry standard, Web Crypto native, sufficient security for artifact integrity.

### Decision: Base64 encoding for signatures
**Why**: JSON-safe, human-readable in manifests, easy copy/paste for debugging.

## Policy System

### Decision: Policy as immutable artifact (v0.7)
**Why**:
- Policy must be tamper-evident (signed)
- Must work offline (bundled with release)
- Must be auditable (versioned in release)

**Rejected alternatives**:
- Server-based policy: Requires online access, not suitable for factory floor
- Policy in manifest: Couples policy updates with release cycle

### Decision: Policy precedence (Bundle > Installed > None) (v0.9)
**Why**:
- Bundle policy = designer's intent at release time
- Installed policy = factory's local override (for emergencies)
- Bundle takes precedence = designer controls what factory can run

**Trade-off**: Factory cannot override bundle policy → this is intentional for safety.

### Decision: Auto requirePolicy in FACTORY mode (v0.10)
**Why**:
- Eliminates "forgot to pass opts" bugs
- Centralizes policy requirement logic
- DESIGNER mode remains flexible for development

## State Management

### Decision: Zustand over Redux
**Why**: Simpler API, less boilerplate, works well with React 18.
**Trade-off**: Less ecosystem tooling, but sufficient for our needs.

### Decision: Multiple stores instead of single store
**Why**:
- Separation of concerns (cabinets vs spec vs tools)
- Smaller re-render scope
- Easier testing

## Runtime Modes

### Decision: DESIGNER vs FACTORY modes
**Why**:
- Different trust requirements for different environments
- Designers need flexibility (iterate quickly)
- Factory needs safety (no unauthorized changes)

**How it works**:
```
DESIGNER: Policy optional, scope flexible
FACTORY:  Policy required, scope enforced, factoryId binding
```

## UI/UX

### Decision: Dark theme as default
**Why**:
- Reduces eye strain for CAD-style work
- Better contrast for 3D visualization
- Modern aesthetic matching target users

### Decision: Inline styles over CSS-in-JS library
**Why**:
- Zero runtime overhead
- No build complexity
- Good enough for component-scoped styles

**Trade-off**: Harder to share styles, but we use constants for theme colors.

## File Structure

### Decision: Feature-based organization
**Why**:
- `src/release/policy/` contains all policy-related code
- Easy to find related files
- Clear ownership boundaries

**Rejected**: Type-based organization (all types in `/types`, all utils in `/utils`)
- Scatters related code across directories

## Security

### Decision: Quarantine severity for scope mismatch (v0.6)
**Why**:
- Allows admin override with proper authentication
- Better than hard reject (no recovery path)
- Audit trail captures all overrides

### Decision: Time-based revocation
**Why**:
- Manifests created before revocation remain valid
- Prevents breaking already-deployed releases
- Standard practice in certificate revocation

---

*Add new decisions as they are made. Include context and rejected alternatives.*
