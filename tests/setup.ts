// Global test setup
beforeEach(() => {
  // Clear any module cache to ensure clean state
  jest.clearAllMocks();
});

// Global timeout for async operations
jest.setTimeout(30000);

// Mock console methods in tests to reduce noise
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};