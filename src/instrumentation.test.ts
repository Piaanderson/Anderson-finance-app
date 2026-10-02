import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestError } from "@/instrumentation";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("request error instrumentation", () => {
  it("logs only allowlisted request metadata", async () => {
    const secret = "access-sandbox-sensitive-token";
    const error = Object.assign(new Error(`transaction payload ${secret}`), {
      digest: "safe-digest"
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await onRequestError(
      error,
      {
        method: "POST",
        path: `/api/transactions?description=${secret}`,
        headers: {
          authorization: `Bearer ${secret}`
        }
      } as never,
      {
        routePath: "/api/transactions",
        routeType: "route",
        routerKind: "App Router"
      } as never
    );

    expect(consoleError).toHaveBeenCalledOnce();
    const serialized = String(consoleError.mock.calls[0]?.[0]);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("transaction payload");
    expect(JSON.parse(serialized)).toEqual({
      level: "error",
      event: "request.failed",
      method: "POST",
      path: "/api/transactions",
      routeType: "route",
      digest: "safe-digest"
    });
  });
});
