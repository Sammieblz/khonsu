import type { SequenceRequest } from "@/features/explorer/interfaces";

export class ApiClientError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
    this.name = "ApiClientError";
  }
}

function apiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");
}

export function resolveAssetUrl(imageUrl: string): string {
  return new URL(imageUrl, `${apiBaseUrl()}/`).toString();
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export async function requestSequence(request: SequenceRequest, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(`${apiBaseUrl()}/v1/sequences`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const body = record(payload);
    const detail = record(body?.error) ?? record(body?.detail) ?? body;
    const message = typeof detail?.message === "string" ? detail.message : "The observation service could not complete this request.";
    const code = typeof detail?.code === "string" ? detail.code : "REQUEST_FAILED";
    throw new ApiClientError(message, response.status, code);
  }
  return payload;
}
