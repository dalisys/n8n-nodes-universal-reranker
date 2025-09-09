module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  env: {
    node: true,
    es2020: true,
  },
  plugins: ['n8n-nodes-base'],
  extends: ['plugin:n8n-nodes-base/nodes', 'plugin:n8n-nodes-base/credentials'],
  rules: {
    'n8n-nodes-base/cred-class-field-documentation-url-miscased': 'off',
  },
  ignorePatterns: ['dist/**'],
};
