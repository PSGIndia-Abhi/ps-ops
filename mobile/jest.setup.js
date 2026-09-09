/* eslint-env jest */
/**
 * Native modules that don't exist in the Jest (Node) environment. Each
 * library ships either its own official Jest shim (gesture-handler) or is
 * simple enough to hand-mock (keychain) - this is the standard pattern for
 * bare React Native projects, not app-specific test hacks.
 */
import 'react-native-gesture-handler/jestSetup';

jest.mock('react-native-keychain', () => ({
  setGenericPassword: jest.fn(() => Promise.resolve(true)),
  getGenericPassword: jest.fn(() => Promise.resolve(false)),
  resetGenericPassword: jest.fn(() => Promise.resolve(true)),
}));

jest.mock('@react-native-community/geolocation', () => ({
  getCurrentPosition: jest.fn(),
  watchPosition: jest.fn(),
  clearWatch: jest.fn(),
  setRNConfiguration: jest.fn(),
}));

jest.mock('react-native-image-picker', () => ({
  launchCamera: jest.fn(() => Promise.resolve({ didCancel: true })),
  launchImageLibrary: jest.fn(() => Promise.resolve({ didCancel: true })),
}));
