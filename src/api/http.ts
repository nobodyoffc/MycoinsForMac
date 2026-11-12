/**
 * fetch() with a hard timeout.
 *
 * The webview's fetch has no built-in timeout, so a slow or unreachable server
 * (e.g. a public explorer that's down, or the network not yet up after the Mac
 * wakes) would hang forever. That stalls Promise.all in fetchAllBalances and
 * leaves the dashboard's refresh spinner stuck (isLoading never clears).
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 15000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {...options, signal: controller.signal});
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
