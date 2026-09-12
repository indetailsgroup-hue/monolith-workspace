import React from 'react';
import { render } from '@testing-library/react';
import { composeStories } from '@storybook/react';
import { restoreAllMocks } from '@storybook/test';
import { it } from 'vitest';
import * as stories from '../TeamPulseBoard.stories';

const { MemberSubmission } = composeStories(stories);

it('submits the member story after Storybook restores its action mocks', async () => {
  restoreAllMocks();
  const { container } = render(<MemberSubmission />);
  await MemberSubmission.play!({ canvasElement: container });
});
