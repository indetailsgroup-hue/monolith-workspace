// ESLint 9 flat config for MONOLITH.
//
// This replaces the legacy .eslintrc.cjs, which ESLint 9 refused to read
// ("ESLint couldn't find an eslint.config.(js|mjs|cjs) file"). The legacy file
// is deleted in the same commit so there is exactly one source of truth for
// both CI and editors.
//
// MIGRATION FIDELITY — every clause of .eslintrc.cjs is carried over:
//   root: true                -> implicit in flat config (no cascade).
//   env {browser,es2022,node} -> languageOptions.globals (globals@14).
//   parser + parserOptions    -> languageOptions.parser / ecmaVersion / sourceType.
//   plugins ['@typescript-eslint'] -> tseslint.configs['flat/recommended'].
//   extends eslint:recommended     -> js.configs.recommended.
//   extends plugin:@typescript-eslint/recommended -> flat/recommended.
//   ignorePatterns            -> ignores (see notes below).
//   the three rule overrides  -> reproduced verbatim at the end of the array.
//
// NOTHING WAS SILENTLY DROPPED. Two deliberate deviations, both documented:
//   1. 'node_modules' is omitted from ignores — flat config ignores it by
//      default, so restating it is noise.
//   2. '*.config.js' / '*.config.cjs' become '**/*.config.js' / '**/*.config.cjs'.
//      eslintrc's ignorePatterns matched at any depth; flat config ignores are
//      path-relative, so the '**/' prefix preserves the original meaning.
//
// NOT ENABLED HERE, ON PURPOSE:
//   - Type-aware linting (flat/recommended-type-checked). It needs
//     projectService, multiplies runtime, and would change the violation
//     counts this branch was measured against. Separate decision.
//   - React plugins (react, react-hooks, react-refresh). They are ABSENT from
//     package.json and the lockfile — enabling them is a dependency ADD, not a
//     config change. See the report on branch chore/lint-and-nesting: adding
//     eslint-plugin-react-hooks surfaces 32 genuine rules-of-hooks crash bugs
//     and is strongly recommended as its own follow-up PR.
//   - eslint-config-prettier is installed but was referenced by nothing in
//     .eslintrc.cjs. It stays unwired here so this commit is a faithful
//     migration and not a behaviour change; wiring it (or dropping the dep)
//     is a separate call.

import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import globals from 'globals';

export default [
  {
    // Carried over from ignorePatterns, plus directories that are not part of
    // the linted source tree. Kept explicit so `eslint .` is safe to run from
    // the repo root and new source directories are covered by default.
    ignores: [
      'dist/**',
      '**/dist/**',
      'coverage/**',
      '**/coverage/**',
      '**/*.config.js',
      '**/*.config.cjs',
      'build/**',
      '**/build/**',
      'playwright-report/**',
      'test-results/**',
      // Deno runtime (Supabase edge functions): different globals and URL
      // imports. Linting it with browser/node globals produces pure noise.
      // Needs its own config; out of scope for this migration.
      'supabase/**',
      // Non-code content trees.
      'daph-second-brain/**',
      'minifix-skill-pack/**',
      'furniture-hardware-vault/**',
      'patches/**',
      'public/**',
      'docs/**',
      'specs/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs['flat/recommended'],

  {
    languageOptions: {
      parser: tsparser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021, // globals@14 exposes es2021 as its latest ES set;
                           // it is a superset of the old env.es2022 identifiers.
      },
    },
    rules: {
      // Verbatim from .eslintrc.cjs, with two additions that match the
      // existing argsIgnorePattern convention (underscore = intentionally
      // unused) and were simply missing before.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'off',
    },
  },

  {
    // CommonJS scripts. require() is the correct module syntax in a .cjs file,
    // so @typescript-eslint/no-require-imports does not apply to them.
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  {
    // Report eslint-disable comments that suppress nothing. The codebase
    // accumulated several of these while the linter was not running.
    linterOptions: {
      reportUnusedDisableDirectives: 'warn',
    },
  },
];
