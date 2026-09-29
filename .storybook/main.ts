import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [
    '@storybook/addon-essentials',    // controls, actions, docs, viewport, backgrounds
    '@storybook/addon-interactions',  // play function step-through debugger
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  docs: {
    autodocs: 'tag',
  },
  // Reuse the project's Vite config (Tailwind CSS plugin, aliases, etc.)
  viteFinal: async (config) => {
    return config;
  },
};

export default config;
