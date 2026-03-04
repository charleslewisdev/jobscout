import puppeteer from "puppeteer-core";

import { logger } from "./logger.js";

export class ChromeCDP {
  constructor(private browserUrl: string) {}

  /**
   * Navigate to a URL, wait for content to render, return the full HTML.
   * Opens a new page for each request and closes it after (no zombie pages).
   */
  async getRenderedHtml(
    targetUrl: string,
    options?: { waitForSelector?: string; timeoutMs?: number }
  ): Promise<string | null> {
    const { waitForSelector = "body", timeoutMs = 30000 } = options ?? {};
    let browser;
    let page;
    try {
      browser = await puppeteer.connect({
        browserWSEndpoint: await this.getWsEndpoint(),
      });
      page = await browser.newPage();
      await page.goto(targetUrl, {
        waitUntil: "networkidle0",
        timeout: timeoutMs,
      });
      await page.waitForSelector(waitForSelector, { timeout: timeoutMs });
      return await page.content();
    } catch (err) {
      logger.warn({ err, url: targetUrl }, "ChromeCDP: navigation failed");
      return null;
    } finally {
      if (page) await page.close().catch(() => {});
      if (browser) browser.disconnect();
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.browserUrl}/json/version`, {
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Get the WebSocket debugger URL from the Chrome HTTP API */
  private async getWsEndpoint(): Promise<string> {
    const res = await fetch(`${this.browserUrl}/json/version`);
    const data = (await res.json()) as { webSocketDebuggerUrl: string };
    return data.webSocketDebuggerUrl;
  }
}
