import {describe, test, expect, jest} from '@jest/globals';

jest.unstable_mockModule('../../../persistence', () => ({
  readAllPersistedSessions: jest.fn(async () => []),
  removePersistedSession: jest.fn(async () => {}),
}));

jest.unstable_mockModule('../../../session-store', () => ({
  getDriver: jest.fn(),
  setSession: jest.fn(),
  getPlatformName: jest.fn(),
  isAndroidUiautomator2DriverSession: jest.fn(() => false),
  isRemoteDriverSession: jest.fn(() => true),
  isXCUITestDriverSession: jest.fn(() => false),
  PLATFORM: {ios: 'iOS', android: 'Android'},
  getCurrentContext: jest.fn(),
  getSessionInfo: jest.fn(),
}));

jest.unstable_mockModule('../../../logger', () => ({
  default: {debug: () => {}, info: () => {}, warn: () => {}, error: () => {}},
}));

const mockPerformVerticalScroll = jest.fn(async () => undefined);

jest.unstable_mockModule('../../../tools/gestures/handlers/swipe-scroll.js', () => ({
  performVerticalScroll: mockPerformVerticalScroll,
}));

const {handleScrollToElement} = await import('../../../tools/gestures/handlers/scroll-to-element.js');

function resultText(result: {content: Array<{type: string}>}): string {
  return (result.content[0] as unknown as {text: string}).text;
}

const NO_SUCH_ELEMENT = {
  error: 'no such element',
  message: 'An element could not be located on the page using the given search parameters',
};

describe('handleScrollToElement', () => {
  test('does not treat remote swallowed no-such-element as already visible', async () => {
    const remoteDriver = {
      findElement: jest.fn(async () => NO_SUCH_ELEMENT),
      getPageSource: jest
        .fn<() => Promise<string>>()
        .mockResolvedValueOnce('<before/>')
        .mockResolvedValueOnce('<after/>'),
    };
    mockPerformVerticalScroll.mockClear();

    const result = await handleScrollToElement(remoteDriver as never, {
      action: 'scroll_to_element',
      strategy: 'accessibility id',
      selector: 'missing',
      maxScrollAttempts: 1,
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('not found after 1 scroll');
    expect(resultText(result)).not.toContain('already visible');
    expect(mockPerformVerticalScroll).toHaveBeenCalledTimes(1);
  });

  test('reports already visible when findElement succeeds', async () => {
    const remoteDriver = {
      findElement: jest.fn(async () => ({
        'element-6066-11e4-a52e-4f735466cecf': 'el-1',
      })),
      getPageSource: jest.fn(async () => '<xml/>'),
    };
    mockPerformVerticalScroll.mockClear();

    const result = await handleScrollToElement(remoteDriver as never, {
      action: 'scroll_to_element',
      strategy: 'accessibility id',
      selector: 'submit',
      maxScrollAttempts: 1,
    });

    expect(result.isError).toBeFalsy();
    expect(resultText(result)).toContain('already visible');
    expect(mockPerformVerticalScroll).not.toHaveBeenCalled();
  });

  test('reuses the page source after each scroll as the next baseline', async () => {
    let page = 0;
    const remoteDriver = {
      findElement: jest.fn(async () => NO_SUCH_ELEMENT),
      getPageSource: jest.fn(async () => `<page-${page++}/>`),
    };
    mockPerformVerticalScroll.mockClear();

    const result = await handleScrollToElement(remoteDriver as never, {
      action: 'scroll_to_element',
      strategy: 'accessibility id',
      selector: 'missing',
      maxScrollAttempts: 3,
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('not found after 3 scroll');
    expect(mockPerformVerticalScroll).toHaveBeenCalledTimes(3);
    expect(remoteDriver.getPageSource).toHaveBeenCalledTimes(4);
  });

  test('stops when the page source does not change after a scroll', async () => {
    const pages = ['<top/>', '<bottom/>', '<bottom/>'];
    const remoteDriver = {
      findElement: jest.fn(async () => NO_SUCH_ELEMENT),
      getPageSource: jest.fn(async () => pages.shift() ?? '<unexpected/>'),
    };
    mockPerformVerticalScroll.mockClear();

    const result = await handleScrollToElement(remoteDriver as never, {
      action: 'scroll_to_element',
      strategy: 'accessibility id',
      selector: 'missing',
      maxScrollAttempts: 5,
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('page source did not change');
    expect(mockPerformVerticalScroll).toHaveBeenCalledTimes(2);
    expect(remoteDriver.getPageSource).toHaveBeenCalledTimes(3);
  });
});
