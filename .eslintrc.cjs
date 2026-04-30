/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: { es2022: true, node: true, browser: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    'complexity': ['error', { max: 10 }],
    '@typescript-eslint/no-explicit-any': 'error',
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    // Algorithm A1 invariant (§2.17.2): Math.random is forbidden — use crypto.randomInt.
    // Other Math methods (max/min/floor/abs/...) are required for Bresenham LOS (A4)
    // and other geometry, so we narrow the ban to the property `random` only.
    'no-restricted-properties': [
      'error',
      {
        object: 'Math',
        property: 'random',
        message: 'Math.random forbidden — use crypto.randomInt (A1 invariant, §2.17.2)',
      },
    ],
  },
  ignorePatterns: ['dist/', 'node_modules/', 'coverage/'],
};
