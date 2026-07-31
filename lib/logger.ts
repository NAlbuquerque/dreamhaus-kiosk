// Thin logging wrapper. In development it writes to the console; in
// production the sendToApm stub is the integration point for Dynatrace,
// New Relic, Sentry, or any other APM tool added later.

const isDev = process.env.NODE_ENV !== "production";

// Replace this with the APM SDK call when the tool is chosen.
function sendToApm(
  _level: "error" | "warn" | "info",
  _message: string,
  _data?: unknown
): void {
  // TODO: wire up APM (e.g. Dynatrace, New Relic, Sentry)
}

export const log = {
  error(message: string, error?: unknown, data?: Record<string, unknown>): void {
    console.error(`[dreamhaus] ${message}`, ...(error ? [error] : []), ...(data ? [data] : []));
    sendToApm("error", message, { error, ...data });
  },

  warn(message: string, data?: Record<string, unknown>): void {
    if (isDev) console.warn(`[dreamhaus] ${message}`, ...(data ? [data] : []));
    sendToApm("warn", message, data);
  },

  info(message: string, data?: Record<string, unknown>): void {
    if (isDev) console.info(`[dreamhaus] ${message}`, ...(data ? [data] : []));
    sendToApm("info", message, data);
  },
};
