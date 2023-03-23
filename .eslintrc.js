module.exports = {
  extends: ['standard', 'prettier'],
  env: {
    node: true,
    mocha: true,
  },
  rules: {
    'no-console': ['off'],
    // Temporarily disabled as we mass upgrade codebases to prettier and newer eslint versions:
    'array-callback-return': ['off'],
    camelcase: ['off'],
    'n/no-deprecated-api': ['off'],
    'no-prototype-builtins': ['off'],
    'no-unused-expressions': ['off'],
    'prefer-const': ['off'],
  },
}
