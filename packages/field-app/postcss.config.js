// App-local PostCSS config for @daph/field-app.
//
// The field app styles with plain CSS + design tokens (src/tokens.css) and does
// NOT use Tailwind. Without this file the build inherited the workspace-root
// postcss.config (which runs tailwindcss) and emitted
// "The `content` option in your Tailwind CSS configuration is missing or empty"
// while producing an empty Tailwind stylesheet (FS-B1-04). Running only
// autoprefixer here keeps the build warning-free and the CSS output identical.
export default {
  plugins: {
    autoprefixer: {},
  },
};
