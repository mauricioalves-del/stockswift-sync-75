type EdgeFunctionFailure = {
  ok: false;
  code?: string;
  error?: string;
};

export async function readEdgeFunctionFailure(error: unknown): Promise<EdgeFunctionFailure | null> {
  const ctx = (error as { context?: unknown } | null)?.context;
  if (ctx && typeof (ctx as Response).text === "function") {
    try {
      const text = await (ctx as Response).text();
      if (!text) return null;
      try {
        const parsed = JSON.parse(text) as Partial<EdgeFunctionFailure>;
        return { ok: false, code: parsed.code, error: parsed.error ?? text };
      } catch {
        return { ok: false, error: text };
      }
    } catch {
      // fall through to message extraction
    }
  }

  const message = (error as { message?: string } | null)?.message;
  return message ? { ok: false, error: message } : null;
}
