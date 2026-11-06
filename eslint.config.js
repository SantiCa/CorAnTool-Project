// V0.40: minimal ESLint (flat config) for the web app and its tests. Run: npx eslint@9 app/js tests/app
// Correctness rules only (no style), so the existing code passes and new mistakes are caught.
export default [
  { ignores: ['app/vendor/**', 'dist/**', 'legacy/**', 'desktop/**', '**/node_modules/**'] },
  {
    files: ['app/js/**/*.js', 'tests/app/**/*.mjs', 'tools/**/*.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: {
      'no-dupe-keys': 'error', 'no-dupe-args': 'error', 'no-duplicate-case': 'error', 'no-unreachable': 'error',
      'no-self-assign': 'error', 'no-self-compare': 'error', 'no-redeclare': 'error', 'no-const-assign': 'error',
      'no-func-assign': 'error', 'no-import-assign': 'error', 'no-unsafe-negation': 'error', 'use-isnan': 'error',
      'valid-typeof': 'error', 'no-compare-neg-zero': 'error', 'no-cond-assign': ['error', 'except-parens'],
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
];
