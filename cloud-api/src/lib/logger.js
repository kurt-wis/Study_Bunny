/**
 * Content-free diagnostic logger.
 *
 * By construction this logger can only emit operational metadata. It accepts a
 * fixed set of named primitive fields and ignores everything else, so request or
 * response content (chunk text, questions, prompts, student names, secrets) can
 * never flow through it.
 */

/**
 * Emit a single structured diagnostic line as JSON.
 *
 * Only { handler, httpStatus, latencyMs, timestamp } are logged. Any extra
 * properties on the argument are deliberately discarded.
 *
 * @param {{ handler: string, httpStatus: number, latencyMs: number }} info
 */
export function logDiagnostic(info) {
  const record = {
    handler: typeof info?.handler === 'string' ? info.handler : 'unknown',
    httpStatus: Number.isFinite(info?.httpStatus) ? info.httpStatus : 0,
    latencyMs: Number.isFinite(info?.latencyMs) ? info.latencyMs : 0,
    timestamp: new Date().toISOString(),
  };
  console.log(JSON.stringify(record));
}
