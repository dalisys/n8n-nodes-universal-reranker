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
    // Community packages should use an HTTP URL for documentationUrl, not camel-cased slug
    'n8n-nodes-base/cred-class-field-documentation-url-miscased': 'off',
    // Allow enum form for inputs/outputs rather than literal ['main']
    'n8n-nodes-base/node-class-description-inputs-wrong-regular-node': 'off',
    'n8n-nodes-base/node-class-description-outputs-wrong': 'off',
  },
  ignorePatterns: ['dist/**'],
};
