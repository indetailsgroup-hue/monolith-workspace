import React from 'react';
import { render, screen } from '@testing-library/react';
import { composeStories } from '@storybook/react';
import { restoreAllMocks } from '@storybook/test';
import { describe, it, expect } from 'vitest';
import * as stories from '../OrgHealthScoreBoard.stories';

const { ConfigPanelEditSave } = composeStories(stories);

describe('OrgHealthScoreBoard story interactions', () => {
  it('edits and saves the scoring config', async () => {
    // Storybook restores module-level fn() spies before rendering each story.
    restoreAllMocks();
    const { container } = render(<ConfigPanelEditSave />);
    await ConfigPanelEditSave.play!({ canvasElement: container });
    expect(screen.queryByTestId('ohs-config-save-btn-SAFETY')).not.toBeInTheDocument();
  });
});
