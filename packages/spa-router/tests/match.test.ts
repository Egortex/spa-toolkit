import { describe, expect, it } from "vitest";
import { matchPath } from "../src/match";

describe("matchPath", () => {
  it("matches exact paths, root and decoded parameters", () => {
    expect(matchPath("/", "/")).toEqual({});
    expect(matchPath("/users/:id", "/users/a%20b")).toEqual({ id: "a b" });
  });

  it("rejects different lengths and static segments", () => {
    expect(matchPath("/users", "/users/1")).toBeNull();
    expect(matchPath("/users/:id", "/tasks/1")).toBeNull();
  });
});
