module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['./jest.setup.js'],
  transformIgnorePatterns: [
    // `@react-native-.*` (not just `@react-native`) so scoped packages like
    // `@react-native-documents/picker` also get transformed - the previous
    // pattern only matched `@react-native` immediately followed by `/`, so
    // any hyphenated `@react-native-something` scope (ships ESM `export`
    // syntax Jest's default CJS transform can't parse) silently fell
    // through to being treated as already-CJS and left untransformed.
    'node_modules/(?!(react-native|@react-native.*|react-native-.*|@react-navigation)/)',
  ],
};
