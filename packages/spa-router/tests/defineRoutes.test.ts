import { describe, expect, it } from "vitest";
import { buildRoutePath, defineRoutes } from "../src/defineRoutes";

describe("typed route helpers", () => {
  it("preserves route definitions and builds encoded paths", () => {
    const routes = defineRoutes({ user: "/users/:id", home: "/" });
    expect(routes.user).toBe("/users/:id");
    expect(buildRoutePath(routes.user, { id: "a b" })).toBe("/users/a%20b");
    expect(buildRoutePath(routes.home, {})).toBe("/");
  });

  it("rejects missing runtime parameters", () => {
    expect(() => buildRoutePath("/users/:id", {} as { id: string })).toThrow("Missing route parameter 'id'");
  });
});
