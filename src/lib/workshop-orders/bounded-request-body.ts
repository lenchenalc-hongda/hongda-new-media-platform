const DEFAULT_TIMEOUT_MS = 10000;

async function readWithDeadline(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  remainingMs: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('REQUEST_BODY_TIMEOUT')),
          remainingMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function readBoundedRequestBody(
  request: Request,
  maxBytes: number,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<string | null> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  const deadline = Date.now() + timeoutMs;
  let bytesRead = 0;
  let text = '';
  try {
    while (true) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        await reader.cancel();
        return null;
      }
      const read = await readWithDeadline(reader, remaining);
      if (read.done) {
        text += decoder.decode();
        return text;
      }
      bytesRead += read.value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(read.value, { stream: true });
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return null;
  }
}
