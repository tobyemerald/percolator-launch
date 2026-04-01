import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../../app/api/rpc/route";

describe("/api/rpc origin guard", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ jsonrpc: "2.0", id: 1, result: "ok" }),
    } as Response) as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function makeReq(origin: string): NextRequest {
    return new NextRequest("http://localhost/api/rpc", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getHealth",
        params: [],
      }),
    });
  }

  it("blocks lookalike hostnames that only contain allowed domain as substring", async () => {
    const req = makeReq("https://evilpercolatorlaunch.com");
    const res = await POST(req);

    expect(res.status).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("allows valid first-party subdomains", async () => {
    const req = makeReq("https://api.percolatorlaunch.com");
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
