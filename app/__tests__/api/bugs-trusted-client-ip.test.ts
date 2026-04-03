import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("POST /api/bugs trusted client IP forwarding", () => {
  it("uses getClientIp rather than parsing first forwarded hop", () => {
    const source = readFileSync(
      resolve(__dirname, "../../app/api/bugs/route.ts"),
      "utf8",
    );

    expect(source).toContain('import { getClientIp } from "@/lib/get-client-ip"');
    expect(source).toContain("const ip = getClientIp(req);");
    expect(source).not.toContain('x-forwarded-for")?.split(",")[0]');
  });
});
