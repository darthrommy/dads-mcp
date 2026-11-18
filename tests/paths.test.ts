import path from "node:path";
import { expect, test } from "vitest";
import { resolveCacheDir } from "../src/paths.js";

test("DADS_MCP_CACHE_DIR wins", () =>
  expect(resolveCacheDir({ DADS_MCP_CACHE_DIR: "/x", XDG_CACHE_HOME: "/y" }, "linux", "/h")).toBe("/x"));
test("XDG_CACHE_HOME", () =>
  expect(resolveCacheDir({ XDG_CACHE_HOME: "/y" }, "darwin", "/h")).toBe(path.join("/y", "dads-mcp")));
test("default unix", () => expect(resolveCacheDir({}, "darwin", "/h")).toBe(path.join("/h", ".cache", "dads-mcp")));
test("windows LOCALAPPDATA", () =>
  expect(resolveCacheDir({ LOCALAPPDATA: "C:\\L" }, "win32", "C:\\h")).toBe(path.join("C:\\L", "dads-mcp")));
test("windows fallback", () =>
  expect(resolveCacheDir({}, "win32", "C:\\h")).toBe(path.join("C:\\h", "AppData", "Local", "dads-mcp")));
