module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
    jest: true
  },
  extends: [
    'eslint:recommended',
    'plugin:node/recommended',
    'plugin:security/recommended',
    'prettier'
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  rules: {
    'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'node/no-unsupported-features/es-syntax': 'off',
    'node/no-missing-require': 'error',
    'node/no-unpublished-require': 'off',
    'security/detect-object-injection': 'off',
    'prefer-const': 'error',
    'no-var': 'error',
    'object-shorthand': 'error',
    'prefer-template': 'error',
    'prefer-destructuring': ['error', { object: true, array: false }],
    'no-param-reassign': ['error', { props: false }],
    'no-use-before-define': ['error', { functions: false }],
    eqeqeq: ['error', 'always'],
    curly: ['error', 'all'],
    'brace-style': ['error', '1tbs'],
    indent: ['error', 2, { SwitchCase: 1 }],
    quotes: ['error', 'single', { avoidEscape: true }],
    semi: ['error', 'always'],
    'comma-dangle': ['error', 'always-multiline'],
    'no-multiple-empty-lines': ['error', { max: 1 }],
    'no-trailing-spaces': 'error',
    'arrow-spacing': 'error',
    'space-before-blocks': 'error',
    'keyword-spacing': 'error'
  },
  ignorePatterns: [
    'node_modules/**',
    'lib/**',
    'build/**',
    'dist/**',
    'legacy/**',
    '*.min.js'
  ]
};
