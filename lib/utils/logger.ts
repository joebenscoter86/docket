type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  action: string;
  invoiceId?: string;
  orgId?: string;
  userId?: string;
  durationMs?: number;
  status?: string;
  error?: string;
  [key: string]: unknown;
}

function log(entry: LogEntry): void {
  const output = {
    ...entry,
    timestamp: new Date().toISOString(),
  };

  switch (entry.level) {
    case "error":
      // eslint-disable-next-line no-console
      console.error(JSON.stringify(output));
      break;
    case "warn":
      // eslint-disable-next-line no-console
      console.warn(JSON.stringify(output));
      break;
    default:
      // eslint-disable-next-line no-console
      console.info(JSON.stringify(output));
  }
}

export const logger = {
  info: (action: string, data?: Omit<LogEntry, "level" | "action">) =>
    log({ level: "info", action, ...data }),
  warn: (action: string, data?: Omit<LogEntry, "level" | "action">) =>
    log({ level: "warn", action, ...data }),
  error: (action: string, data?: Omit<LogEntry, "level" | "action">) =>
    log({ level: "error", action, ...data }),
};
