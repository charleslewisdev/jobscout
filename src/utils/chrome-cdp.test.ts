import { afterEach, describe, expect, it, vi } from "vitest";

import { ChromeCDP } from "./chrome-cdp.js";

// Mock puppeteer-core
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockGoto = vi.fn().mockResolvedValue(undefined);
const mockWaitForSelector = vi.fn().mockResolvedValue(undefined);
const mockContent = vi.fn().mockResolvedValue("<html><body>rendered</body></html>");

const mockPage = {
  goto: mockGoto,
  waitForSelector: mockWaitForSelector,
  content: mockContent,
  close: mockClose,
};

const mockDisconnect = vi.fn();
const mockNewPage = vi.fn().mockResolvedValue(mockPage);

const mockBrowser = {
  newPage: mockNewPage,
  disconnect: mockDisconnect,
};

const mockConnect = vi.fn().mockResolvedValue(mockBrowser);

vi.mock("puppeteer-core", () => ({
  default: {
    connect: (...args: unknown[]) => mockConnect(...args),
  },
}));

// Mock fetch for /json/version endpoint
const originalFetch = globalThis.fetch;

afterEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = originalFetch;
});

function mockVersionEndpoint(wsUrl = "ws://localhost:9222/devtools/browser/abc123") {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ webSocketDebuggerUrl: wsUrl }),
  }) as unknown as typeof fetch;
}

describe("ChromeCDP", () => {
  describe("getRenderedHtml", () => {
    it("navigates, waits for selector, and returns page content", async () => {
      mockVersionEndpoint();
      const cdp = new ChromeCDP("http://localhost:9222");

      const html = await cdp.getRenderedHtml("https://example.com/page", {
        waitForSelector: ".content",
        timeoutMs: 10000,
      });

      expect(html).toBe("<html><body>rendered</body></html>");
      expect(mockConnect).toHaveBeenCalledWith({
        browserWSEndpoint: "ws://localhost:9222/devtools/browser/abc123",
      });
      expect(mockGoto).toHaveBeenCalledWith("https://example.com/page", {
        waitUntil: "networkidle0",
        timeout: 10000,
      });
      expect(mockWaitForSelector).toHaveBeenCalledWith(".content", {
        timeout: 10000,
      });
      expect(mockContent).toHaveBeenCalled();
    });

    it("uses default selector and timeout when options not provided", async () => {
      mockVersionEndpoint();
      const cdp = new ChromeCDP("http://localhost:9222");

      await cdp.getRenderedHtml("https://example.com");

      expect(mockGoto).toHaveBeenCalledWith("https://example.com", {
        waitUntil: "networkidle0",
        timeout: 30000,
      });
      expect(mockWaitForSelector).toHaveBeenCalledWith("body", {
        timeout: 30000,
      });
    });

    it("returns null on navigation error", async () => {
      mockVersionEndpoint();
      mockGoto.mockRejectedValueOnce(new Error("net::ERR_CONNECTION_REFUSED"));

      const cdp = new ChromeCDP("http://localhost:9222");
      const html = await cdp.getRenderedHtml("https://bad-site.com");

      expect(html).toBeNull();
    });

    it("returns null on timeout (selector never appears)", async () => {
      mockVersionEndpoint();
      mockWaitForSelector.mockRejectedValueOnce(
        new Error("Timeout waiting for selector")
      );

      const cdp = new ChromeCDP("http://localhost:9222");
      const html = await cdp.getRenderedHtml("https://slow-site.com", {
        waitForSelector: ".never-loads",
      });

      expect(html).toBeNull();
    });

    it("always closes page even on error", async () => {
      mockVersionEndpoint();
      mockGoto.mockRejectedValueOnce(new Error("navigation failed"));

      const cdp = new ChromeCDP("http://localhost:9222");
      await cdp.getRenderedHtml("https://error-site.com");

      expect(mockClose).toHaveBeenCalled();
      expect(mockDisconnect).toHaveBeenCalled();
    });

    it("disconnects browser after successful call", async () => {
      mockVersionEndpoint();
      const cdp = new ChromeCDP("http://localhost:9222");

      await cdp.getRenderedHtml("https://example.com");

      expect(mockDisconnect).toHaveBeenCalled();
    });

    it("handles page.close() throwing without propagating", async () => {
      mockVersionEndpoint();
      mockClose.mockRejectedValueOnce(new Error("page already closed"));

      const cdp = new ChromeCDP("http://localhost:9222");
      const html = await cdp.getRenderedHtml("https://example.com");

      // Should still return content despite close error
      expect(html).toBe("<html><body>rendered</body></html>");
      expect(mockDisconnect).toHaveBeenCalled();
    });

    it("returns null when Chrome connection fails", async () => {
      mockVersionEndpoint();
      mockConnect.mockRejectedValueOnce(new Error("Connection refused"));

      const cdp = new ChromeCDP("http://localhost:9222");
      const html = await cdp.getRenderedHtml("https://example.com");

      expect(html).toBeNull();
    });
  });

  describe("isAvailable", () => {
    it("returns true when Chrome responds to /json/version", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
      }) as unknown as typeof fetch;

      const cdp = new ChromeCDP("http://localhost:9222");
      const available = await cdp.isAvailable();

      expect(available).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:9222/json/version",
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    it("returns false on connection error", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(
        new Error("ECONNREFUSED")
      ) as unknown as typeof fetch;

      const cdp = new ChromeCDP("http://localhost:9222");
      const available = await cdp.isAvailable();

      expect(available).toBe(false);
    });

    it("returns false when Chrome returns non-OK status", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }) as unknown as typeof fetch;

      const cdp = new ChromeCDP("http://localhost:9222");
      const available = await cdp.isAvailable();

      expect(available).toBe(false);
    });
  });
});
