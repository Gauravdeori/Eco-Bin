/**
 * Runtime error sink for the client error boundary.
 *
 * Production React does not re-throw boundary-caught errors to window.onerror,
 * so anything caught by the root boundary would otherwise vanish. Logging it
 * here keeps it visible in the browser console and gives a single place to
 * forward errors to a monitoring service later.
 */
export function reportRuntimeError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;

  // Loaders and server functions commonly throw a raw Response; String(it)
  // gives the opaque "[object Response]", so pull out the status and URL.
  const message =
    error instanceof Response
      ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error);

  console.error("[EcoBin] runtime error:", message, {
    ...context,
    route: window.location.pathname,
    ...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
  });
}
