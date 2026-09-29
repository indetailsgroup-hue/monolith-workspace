import type { Preview } from '@storybook/react-vite';
import '../src/index.css';

const preview: Preview = {
  parameters: {
    /**
     * Controls addon: use color picker for *color* / *background* args,
     * date picker for *Date* args.
     */
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    /**
     * Default backgrounds: white (matches the PeopleDirectory surface colour).
     */
    backgrounds: {
      default: 'white',
      values: [
        { name: 'white', value: '#ffffff' },
        { name: 'gray-50', value: '#f9fafb' },
      ],
    },
    /**
     * Limit viewport to desktop-first widths that match the MONOLITH admin UI.
     */
    viewport: {
      defaultViewport: 'desktop',
      viewports: {
        mobile: { name: 'Mobile (375px)', styles: { width: '375px', height: '812px' } },
        tablet: { name: 'Tablet (768px)', styles: { width: '768px', height: '1024px' } },
        desktop: { name: 'Desktop (1280px)', styles: { width: '1280px', height: '800px' } },
      },
    },
    layout: 'padded',
  },
};

export default preview;
