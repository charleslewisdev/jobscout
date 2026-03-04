import cron, { type ScheduledTask } from "node-cron";

import { logger } from "./utils/logger.js";

export class Scheduler {
  private task: ScheduledTask | null = null;
  private cronExpression: string;
  private enabled: boolean;
  private fn: () => Promise<void>;

  constructor(cronExpression: string, fn: () => Promise<void>) {
    this.cronExpression = cronExpression;
    this.fn = fn;
    this.enabled = true;
  }

  start(): void {
    if (!cron.validate(this.cronExpression)) {
      throw new Error(`Invalid cron expression: ${this.cronExpression}`);
    }

    if (this.task) {
      this.task.stop();
    }

    this.task = cron.schedule(this.cronExpression, async () => {
      logger.info("Scheduled pipeline run starting");
      try {
        await this.fn();
      } catch (err) {
        logger.error({ err }, "Scheduled pipeline run failed");
      }
    });

    this.enabled = true;
    logger.info({ cron: this.cronExpression }, "Scheduler started");
  }

  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
    }
    this.enabled = false;
    logger.info("Scheduler stopped");
  }

  reconfigure(cronExpression: string): void {
    if (!cron.validate(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }

    this.cronExpression = cronExpression;
    if (this.enabled) {
      this.start();
    }
    logger.info({ cron: cronExpression }, "Scheduler reconfigured");
  }

  setEnabled(enabled: boolean): void {
    if (enabled && !this.enabled) {
      this.start();
    } else if (!enabled && this.enabled) {
      this.stop();
    }
  }

  get state() {
    return {
      cronExpression: this.cronExpression,
      enabled: this.enabled,
    };
  }
}

