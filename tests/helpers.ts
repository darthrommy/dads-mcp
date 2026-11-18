import { cpSync, mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import * as tar from "tar";
import { REPOS } from "../src/repos/github.js";
import type { RepoKind } from "../src/types.js";

async function pack(cwd: string, entry: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of tar.c({ gzip: true, cwd }, [entry]) as AsyncIterable<Buffer>) chunks.push(c);
  return Buffer.concat(chunks);
}

export async function makeRepoTarball(kind: RepoKind): Promise<Buffer> {
  const dir = mkdtempSync(path.join(os.tmpdir(), "dads-tgz-"));
  const root = `${REPOS[kind]}-main`;
  cpSync(new URL(`./fixtures/repos/${kind}`, import.meta.url), path.join(dir, root, "src", "components"), { recursive: true });
  return pack(dir, root);
}

export async function makeTokensTarball(): Promise<Buffer> {
  const dir = mkdtempSync(path.join(os.tmpdir(), "dads-npm-"));
  mkdirSync(path.join(dir, "package", "dist"), { recursive: true });
  cpSync(new URL("./fixtures/tokens/tokens.css", import.meta.url), path.join(dir, "package", "dist", "tokens.css"));
  cpSync(new URL("./fixtures/tokens/tokens-simple.css", import.meta.url), path.join(dir, "package", "dist", "tokens-simple.css"));
  writeFileSync(path.join(dir, "package", "package.json"), "{}");
  return pack(dir, "package");
}

export const fixtureText = (rel: string) => new URL(`./fixtures/${rel}`, import.meta.url);
