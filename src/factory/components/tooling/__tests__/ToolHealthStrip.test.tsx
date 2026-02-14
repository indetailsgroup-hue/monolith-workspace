/**
 * ToolHealthStrip.test.tsx - Tool Health Strip Component Tests
 *
 * Tests for the ToolHealthStrip UI component.
 *
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ToolHealthStrip } from '../ToolHealthStrip';
import type { ToolHealth, ToolHealthTrend } from '../../../tooling';

// ============================================
// MOCKS
// ============================================

// Mock the tooling query functions
vi.mock('../../../tooling', async () => {
  const actual = await vi.importActual('../../../tooling');
  return {
    ...actual,
    listToolHealth: vi.fn(),
    listNearingLimitTools: vi.fn(),
    listToolHealthTrend: vi.fn(),
  };
});

import { listToolHealth, listNearingLimitTools, listToolHealthTrend } from '../../../tooling';

const mockListToolHealth = vi.mocked(listToolHealth);
const mockListNearingLimitTools = vi.mocked(listNearingLimitTools);
const mockListToolHealthTrend = vi.mocked(listToolHealthTrend);

// Sample tool health data
const mockHealthyTool: ToolHealth = {
  toolId: 'DRILL_5',
  wearUnits: 1000,
  maxWearUnits: 10000,
  healthPct: 90,
  status: 'OK',
};

const mockNearingLimitTool: ToolHealth = {
  toolId: 'DRILL_8',
  wearUnits: 8500,
  maxWearUnits: 10000,
  healthPct: 15,
  status: 'NEARING_LIMIT',
};

const mockOverLimitTool: ToolHealth = {
  toolId: 'BORE_35',
  wearUnits: 12000,
  maxWearUnits: 10000,
  healthPct: 0,
  status: 'OVER_LIMIT',
};

// ============================================
// TESTS
// ============================================

describe('ToolHealthStrip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders nothing when loading', () => {
      mockListNearingLimitTools.mockImplementation(() => new Promise(() => {})); // Never resolves

      const { container } = render(<ToolHealthStrip />);
      expect(container.firstChild).toBeNull();
    });

    it('renders nothing when no tools need attention (default mode)', async () => {
      mockListNearingLimitTools.mockResolvedValue([]);

      const { container } = render(<ToolHealthStrip />);

      await waitFor(() => {
        expect(mockListNearingLimitTools).toHaveBeenCalled();
      });

      // Should not render anything when no tools need attention
      expect(container.firstChild).toBeNull();
    });

    it('renders empty state when showAllTools=true and no tools tracked', async () => {
      mockListToolHealth.mockResolvedValue([]);

      render(<ToolHealthStrip showAllTools={true} />);

      await waitFor(() => {
        expect(screen.getByText('No tools tracked')).toBeInTheDocument();
      });
    });

    it('renders tool chips for nearing limit tools', async () => {
      mockListNearingLimitTools.mockResolvedValue([mockNearingLimitTool, mockOverLimitTool]);

      render(<ToolHealthStrip />);

      await waitFor(() => {
        // Tool IDs should be shortened (DRILL_8 → D8, BORE_35 → B35)
        expect(screen.getByText('D8')).toBeInTheDocument();
        expect(screen.getByText('B35')).toBeInTheDocument();
      });
    });

    it('shows wear percentage on tool chips', async () => {
      mockListNearingLimitTools.mockResolvedValue([mockNearingLimitTool]);

      render(<ToolHealthStrip />);

      await waitFor(() => {
        // 100 - 15 = 85% worn
        expect(screen.getByText('85%')).toBeInTheDocument();
      });
    });

    it('respects maxTools prop', async () => {
      const manyTools: ToolHealth[] = [
        { ...mockNearingLimitTool, toolId: 'DRILL_1' },
        { ...mockNearingLimitTool, toolId: 'DRILL_2' },
        { ...mockNearingLimitTool, toolId: 'DRILL_3' },
        { ...mockNearingLimitTool, toolId: 'DRILL_4' },
        { ...mockNearingLimitTool, toolId: 'DRILL_5' },
      ];
      mockListNearingLimitTools.mockResolvedValue(manyTools);

      render(<ToolHealthStrip maxTools={2} />);

      await waitFor(() => {
        // Should only show first 2 tools
        expect(screen.getByText('D1')).toBeInTheDocument();
        expect(screen.getByText('D2')).toBeInTheDocument();
        expect(screen.queryByText('D3')).not.toBeInTheDocument();
      });
    });
  });

  describe('Size variants', () => {
    it('renders small variant correctly', async () => {
      mockListNearingLimitTools.mockResolvedValue([mockNearingLimitTool]);

      render(<ToolHealthStrip size="sm" />);

      await waitFor(() => {
        expect(screen.getByText('D8')).toBeInTheDocument();
      });
    });

    it('renders medium variant correctly', async () => {
      mockListNearingLimitTools.mockResolvedValue([mockNearingLimitTool]);

      render(<ToolHealthStrip size="md" />);

      await waitFor(() => {
        expect(screen.getByText('D8')).toBeInTheDocument();
      });
    });
  });

  describe('Interactions', () => {
    it('calls onToolClick when tool chip is clicked', async () => {
      mockListNearingLimitTools.mockResolvedValue([mockNearingLimitTool]);
      const handleClick = vi.fn();

      render(<ToolHealthStrip onToolClick={handleClick} />);

      await waitFor(() => {
        expect(screen.getByText('D8')).toBeInTheDocument();
      });

      // Find and click the button containing D8
      const toolChip = screen.getByRole('button', { name: /D8/i });
      fireEvent.click(toolChip);

      expect(handleClick).toHaveBeenCalledWith(mockNearingLimitTool);
    });

    it('disables click when no onToolClick provided', async () => {
      mockListNearingLimitTools.mockResolvedValue([mockNearingLimitTool]);

      render(<ToolHealthStrip />);

      await waitFor(() => {
        expect(screen.getByText('D8')).toBeInTheDocument();
      });

      const toolChip = screen.getByRole('button', { name: /D8/i });
      expect(toolChip).toBeDisabled();
    });
  });

  describe('Show all tools mode', () => {
    it('fetches all tools when showAllTools=true', async () => {
      mockListToolHealth.mockResolvedValue([mockHealthyTool, mockNearingLimitTool]);

      render(<ToolHealthStrip showAllTools={true} />);

      await waitFor(() => {
        expect(mockListToolHealth).toHaveBeenCalled();
        expect(mockListNearingLimitTools).not.toHaveBeenCalled();
      });
    });

    it('shows healthy tools when showAllTools=true', async () => {
      mockListToolHealth.mockResolvedValue([mockHealthyTool]);

      render(<ToolHealthStrip showAllTools={true} />);

      await waitFor(() => {
        expect(screen.getByText('D5')).toBeInTheDocument();
        expect(screen.getByText('10%')).toBeInTheDocument(); // 100 - 90 = 10% worn
      });
    });
  });

  describe('Trend mode', () => {
    const mockTrendTool: ToolHealthTrend = {
      ...mockNearingLimitTool,
      wearHistory: [
        { timestamp: 1000, wearUnits: 5000 },
        { timestamp: 2000, wearUnits: 7000 },
        { timestamp: 3000, wearUnits: 8500 },
      ],
      trend: 'INCREASING',
      avgWearPerJob: 1500,
    };

    it('fetches trend data when showTrend=true', async () => {
      mockListToolHealthTrend.mockResolvedValue([mockTrendTool]);

      render(<ToolHealthStrip showTrend={true} />);

      await waitFor(() => {
        expect(mockListToolHealthTrend).toHaveBeenCalled();
      });
    });
  });

  describe('Error handling', () => {
    it('handles fetch errors gracefully', async () => {
      mockListNearingLimitTools.mockRejectedValue(new Error('Network error'));

      const { container } = render(<ToolHealthStrip />);

      await waitFor(() => {
        expect(mockListNearingLimitTools).toHaveBeenCalled();
      });

      // Should render empty on error
      expect(container.firstChild).toBeNull();
    });
  });

  describe('Tool ID shortening', () => {
    it('shortens DRILL_X to DX', async () => {
      mockListNearingLimitTools.mockResolvedValue([
        { ...mockNearingLimitTool, toolId: 'DRILL_15' },
      ]);

      render(<ToolHealthStrip />);

      await waitFor(() => {
        expect(screen.getByText('D15')).toBeInTheDocument();
      });
    });

    it('shortens BORE_X to BX', async () => {
      mockListNearingLimitTools.mockResolvedValue([
        { ...mockNearingLimitTool, toolId: 'BORE_35' },
      ]);

      render(<ToolHealthStrip />);

      await waitFor(() => {
        expect(screen.getByText('B35')).toBeInTheDocument();
      });
    });

    it('truncates unknown tool IDs to 6 chars', async () => {
      mockListNearingLimitTools.mockResolvedValue([
        { ...mockNearingLimitTool, toolId: 'CUSTOM_TOOL_123' },
      ]);

      render(<ToolHealthStrip />);

      await waitFor(() => {
        expect(screen.getByText('CUSTOM')).toBeInTheDocument();
      });
    });
  });
});
