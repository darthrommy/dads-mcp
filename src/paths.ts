import path from "node:path";

export function resolveCacheDir(env: NodeJS.ProcessEnv, platform: NodeJS.Platform, home: string): string {
  if (env.DADS_MCP_CACHE_DIR) return env.DADS_MCP_CACHE_DIR;
  if (env.XDG_CACHE_HOME) return path.join(env.XDG_CACHE_HOME, "dads-mcp");
  if (platform === "win32") return path.join(env.LOCALAPPDATA ?? path.join(home, "AppData", "Local"), "dads-mcp");
  return path.join(home, ".cache", "dads-mcp");
}
