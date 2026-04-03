import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("trusted proxy-aware rate-limit identity", () => {
  it("uses getClientIp in /api/ideas POST", () => {
    const source = readFileSync(
      resolve(__dirname, "../../app/api/ideas/route.ts"),
      "utf8",
    );

    expect(source).toContain('import { getClientIp } from "@/lib/get-client-ip"');
    expect(source).toContain("const ip = getClientIp(req);");
    expect(source).not.toContain('x-forwarded-for")?.split(",")[0]');
  });

  it("uses getClientIp in /api/applications POST", () => {
    const source = readFileSync(
      resolve(__dirname, "../../app/api/applications/route.ts"),
      "utf8",
    );

    expect(source).toContain('import { getClientIp } from "@/lib/get-client-ip"');
    expect(source).toContain("const ip = getClientIp(req);");
    expect(source).not.toContain('x-forwarded-for")?.split(",")[0]');
  });
});
