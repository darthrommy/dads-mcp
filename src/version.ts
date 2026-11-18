import { createRequire } from "node:module";

const pkg = createRequire(import.meta.url)("../package.json") as { version: string };

export const VERSION: string = pkg.version;
export const REPO_URL = "https://github.com/darthrommy/dads-mcp";
export const USER_AGENT = `dads-mcp/${VERSION} (+${REPO_URL})`;
export const UPDATE_COMMAND = "npx -y github:darthrommy/dads-mcp update";
