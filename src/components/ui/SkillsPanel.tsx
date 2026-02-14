/**
 * SkillsPanel - UI for Running Skills
 *
 * Provides a simple interface to execute skills
 * and view their results.
 *
 * @version 1.0.0
 */

import { useState, useEffect } from 'react';
import { useCabinetStore } from '../../core/store/useCabinetStore';
import {
  initializeSkills,
  runSkill,
  getAvailableSkills,
  getSkillsByCategory,
  type Skill,
  type SkillResult,
} from '../../core/skills';

// ============================================
// TYPES
// ============================================

type CategoryFilter = 'all' | 'verify' | 'generate' | 'calculate' | 'export';

interface SkillResultDisplay {
  skillId: string;
  skillName: string;
  result: SkillResult;
  timestamp: number;
}

// ============================================
// MAIN COMPONENT
// ============================================

export function SkillsPanel() {
  const [initialized, setInitialized] = useState(false);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<SkillResultDisplay[]>([]);

  // Get cabinet data for context
  const cabinets = useCabinetStore(state => state.cabinets);
  const activeCabinetId = useCabinetStore(state => state.activeCabinetId);
  const activeCabinet = cabinets.find(c => c.id === activeCabinetId);

  // Initialize skills on mount
  useEffect(() => {
    initializeSkills().then(() => {
      setInitialized(true);
      setSkills(getAvailableSkills());
    });
  }, []);

  // Filter skills by category
  const filteredSkills = filter === 'all'
    ? skills
    : getSkillsByCategory(filter);

  // Run a skill
  const handleRunSkill = async (skill: Skill) => {
    setRunning(skill.id);

    const context = {
      cabinet: activeCabinet,
      cabinets,
      projectId: 'current',
    };

    try {
      const result = await runSkill(skill.id, context);

      setResults(prev => [{
        skillId: skill.id,
        skillName: skill.name,
        result,
        timestamp: Date.now(),
      }, ...prev.slice(0, 9)]); // Keep last 10 results
    } catch (error) {
      console.error(`[Skills] Error running ${skill.id}:`, error);
    } finally {
      setRunning(null);
    }
  };

  // Clear results
  const handleClearResults = () => {
    setResults([]);
  };

  if (!initialized) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading skills...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h3 style={styles.title}>⚡ Skills</h3>
        <span style={styles.badge}>{skills.length}</span>
      </div>

      {/* Category Filter */}
      <div style={styles.filterRow}>
        {(['all', 'verify', 'generate', 'calculate', 'export'] as CategoryFilter[]).map(cat => (
          <button
            key={cat}
            style={{
              ...styles.filterButton,
              ...(filter === cat ? styles.filterButtonActive : {}),
            }}
            onClick={() => setFilter(cat)}
          >
            {cat === 'all' ? 'All' :
             cat === 'verify' ? '✓ Verify' :
             cat === 'generate' ? '📋 Generate' :
             cat === 'calculate' ? '🔢 Calculate' :
             '📤 Export'}
          </button>
        ))}
      </div>

      {/* Skills List */}
      <div style={styles.skillsList}>
        {filteredSkills.length === 0 ? (
          <div style={styles.empty}>No skills in this category</div>
        ) : (
          filteredSkills.map(skill => (
            <div key={skill.id} style={styles.skillCard}>
              <div style={styles.skillInfo}>
                <span style={styles.skillIcon}>{skill.icon}</span>
                <div>
                  <div style={styles.skillName}>{skill.name}</div>
                  <div style={styles.skillDesc}>{skill.description}</div>
                </div>
              </div>
              <button
                style={{
                  ...styles.runButton,
                  ...(running === skill.id ? styles.runButtonDisabled : {}),
                }}
                onClick={() => handleRunSkill(skill)}
                disabled={running === skill.id}
              >
                {running === skill.id ? '...' : 'Run'}
              </button>
            </div>
          ))
        )}
      </div>

      {/* Results Section */}
      {results.length > 0 && (
        <div style={styles.resultsSection}>
          <div style={styles.resultsHeader}>
            <span style={styles.resultsTitle}>Results</span>
            <button style={styles.clearButton} onClick={handleClearResults}>
              Clear
            </button>
          </div>
          <div style={styles.resultsList}>
            {results.map((r, index) => (
              <ResultCard key={`${r.skillId}-${r.timestamp}`} display={r} />
            ))}
          </div>
        </div>
      )}

      {/* Context Info */}
      <div style={styles.contextInfo}>
        <span>Context: </span>
        {activeCabinet ? (
          <span style={styles.contextActive}>
            {activeCabinet.name || 'Active Cabinet'}
          </span>
        ) : (
          <span style={styles.contextAll}>
            All {cabinets.length} cabinets
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================
// RESULT CARD COMPONENT
// ============================================

function ResultCard({ display }: { display: SkillResultDisplay }) {
  const [expanded, setExpanded] = useState(false);
  const { skillName, result } = display;

  const statusColor = result.status === 'success' ? '#22c55e' :
                      result.status === 'warning' ? '#f59e0b' :
                      '#ef4444';

  return (
    <div style={styles.resultCard}>
      <div
        style={styles.resultHeader}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={styles.resultInfo}>
          <span style={{ ...styles.statusDot, backgroundColor: statusColor }} />
          <span style={styles.resultName}>{skillName}</span>
        </div>
        <div style={styles.resultMeta}>
          <span style={styles.duration}>{result.duration.toFixed(0)}ms</span>
          <span style={styles.expandIcon}>{expanded ? '▼' : '▶'}</span>
        </div>
      </div>

      {expanded && (
        <div style={styles.resultBody}>
          <div style={styles.summary}>{result.summary}</div>

          {result.issues.length > 0 && (
            <div style={styles.issues}>
              {result.issues.map((issue, i) => (
                <div key={i} style={styles.issue}>
                  <span style={{
                    ...styles.issueSeverity,
                    color: issue.severity === 'error' ? '#ef4444' :
                           issue.severity === 'warning' ? '#f59e0b' :
                           '#8b5cf6',
                  }}>
                    {issue.severity === 'error' ? '✗' :
                     issue.severity === 'warning' ? '⚠' : 'ℹ'}
                  </span>
                  <span>{issue.message}</span>
                </div>
              ))}
            </div>
          )}

          {result.data !== undefined && (
            <details style={styles.dataDetails}>
              <summary style={styles.dataSummary}>Data</summary>
              <pre style={styles.dataCode}>
                {JSON.stringify(result.data as object, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// STYLES
// ============================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '12px',
    backgroundColor: '#1a1a2e',
    borderRadius: '8px',
    border: '1px solid #3a3a5a',
    maxHeight: '500px',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 600,
    color: '#e0e0e0',
  },
  badge: {
    backgroundColor: '#8b5cf6',
    color: 'white',
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '11px',
    fontWeight: 600,
  },
  loading: {
    color: '#888',
    textAlign: 'center',
    padding: '20px',
  },
  filterRow: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap',
  },
  filterButton: {
    padding: '4px 10px',
    fontSize: '11px',
    border: '1px solid #3a3a5a',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    color: '#888',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  filterButtonActive: {
    backgroundColor: '#8b5cf6',
    borderColor: '#8b5cf6',
    color: 'white',
  },
  skillsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    overflowY: 'auto',
    maxHeight: '150px',
  },
  empty: {
    color: '#666',
    textAlign: 'center',
    padding: '20px',
    fontSize: '12px',
  },
  skillCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 10px',
    backgroundColor: '#252540',
    borderRadius: '6px',
    border: '1px solid #3a3a5a',
  },
  skillInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  skillIcon: {
    fontSize: '18px',
  },
  skillName: {
    fontSize: '12px',
    fontWeight: 500,
    color: '#e0e0e0',
  },
  skillDesc: {
    fontSize: '10px',
    color: '#888',
    maxWidth: '200px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  runButton: {
    padding: '4px 12px',
    fontSize: '11px',
    fontWeight: 600,
    backgroundColor: '#22c55e',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  runButtonDisabled: {
    backgroundColor: '#666',
    cursor: 'not-allowed',
  },
  resultsSection: {
    borderTop: '1px solid #3a3a5a',
    paddingTop: '10px',
  },
  resultsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  resultsTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#888',
  },
  clearButton: {
    padding: '2px 8px',
    fontSize: '10px',
    backgroundColor: 'transparent',
    border: '1px solid #3a3a5a',
    borderRadius: '4px',
    color: '#888',
    cursor: 'pointer',
  },
  resultsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    maxHeight: '150px',
    overflowY: 'auto',
  },
  resultCard: {
    backgroundColor: '#252540',
    borderRadius: '6px',
    border: '1px solid #3a3a5a',
    overflow: 'hidden',
  },
  resultHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 10px',
    cursor: 'pointer',
    userSelect: 'none',
  },
  resultInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  resultName: {
    fontSize: '12px',
    color: '#e0e0e0',
  },
  resultMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  duration: {
    fontSize: '10px',
    color: '#666',
  },
  expandIcon: {
    fontSize: '10px',
    color: '#666',
  },
  resultBody: {
    padding: '10px',
    borderTop: '1px solid #3a3a5a',
    backgroundColor: '#1f1f35',
  },
  summary: {
    fontSize: '11px',
    color: '#e0e0e0',
    marginBottom: '8px',
  },
  issues: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    marginBottom: '8px',
  },
  issue: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '6px',
    fontSize: '10px',
    color: '#888',
  },
  issueSeverity: {
    fontWeight: 600,
  },
  dataDetails: {
    marginTop: '8px',
  },
  dataSummary: {
    fontSize: '10px',
    color: '#666',
    cursor: 'pointer',
    userSelect: 'none',
  },
  dataCode: {
    fontSize: '9px',
    color: '#888',
    backgroundColor: '#151525',
    padding: '8px',
    borderRadius: '4px',
    overflow: 'auto',
    maxHeight: '100px',
    margin: '4px 0 0 0',
  },
  contextInfo: {
    fontSize: '10px',
    color: '#666',
    textAlign: 'center',
    paddingTop: '8px',
    borderTop: '1px solid #3a3a5a',
  },
  contextActive: {
    color: '#22c55e',
    fontWeight: 500,
  },
  contextAll: {
    color: '#8b5cf6',
    fontWeight: 500,
  },
};
