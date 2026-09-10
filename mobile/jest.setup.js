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

jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(() => Promise.resolve([])),
  isErrorWithCode: jest.fn(() => false),
  errorCodes: { OPERATION_CANCELED: 'OPERATION_CANCELED' },
}));

function mockSound() {
  return {
    startRecorder: jest.fn(() => Promise.resolve('')),
    stopRecorder: jest.fn(() => Promise.resolve('')),
    pauseRecorder: jest.fn(() => Promise.resolve('')),
    resumeRecorder: jest.fn(() => Promise.resolve('')),
    addRecordBackListener: jest.fn(),
    removeRecordBackListener: jest.fn(),
    startPlayer: jest.fn(() => Promise.resolve('')),
    stopPlayer: jest.fn(() => Promise.resolve('')),
    pausePlayer: jest.fn(() => Promise.resolve('')),
    resumePlayer: jest.fn(() => Promise.resolve('')),
    addPlayBackListener: jest.fn(),
    removePlayBackListener: jest.fn(),
    addPlaybackEndListener: jest.fn(),
    removePlaybackEndListener: jest.fn(),
  };
}

jest.mock('react-native-nitro-sound', () => ({
  createSound: jest.fn(() => mockSound()),
  Sound: mockSound(),
}));
