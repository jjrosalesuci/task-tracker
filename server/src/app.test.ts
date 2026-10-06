import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { app } from "./app";

vi.mock("./lib/prisma", () => ({ prisma: {} }));

describe("security headers", () => {
  it("allows Cloudflare analytics without relaxing other CSP protections", async () => {
    const response = await request(app).get("/health/live").expect(200);
    const directives = Object.fromEntries(
      response.headers["content-security-policy"].split(";").map((directive: string) => {
        const [name, ...sources] = directive.trim().split(/\s+/);
        return [name, sources];
      }),
    );

    expect(directives["script-src"]).toEqual(["'self'", "https://static.cloudflareinsights.com"]);
    expect(directives["connect-src"]).toEqual(["'self'", "https://cloudflareinsights.com"]);
    expect(directives["default-src"]).toEqual(["'self'"]);
    expect(directives["script-src-attr"]).toEqual(["'none'"]);
    expect(directives["object-src"]).toEqual(["'none'"]);
    expect(directives["frame-ancestors"]).toEqual(["'self'"]);
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });
});
