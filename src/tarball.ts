import * as tar from "tar";

/** gzip 済み tarball から、filter に合うファイルだけを UTF-8 文字列で読む */
export async function readTarFiles(tgz: Buffer, filter: (entryPath: string) => boolean): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await new Promise<void>((resolve, reject) => {
    const parser = new tar.Parser({
      onReadEntry: (entry) => {
        if (entry.type !== "File" || !filter(entry.path)) {
          entry.resume();
          return;
        }
        const chunks: Buffer[] = [];
        entry.on("data", (c: Buffer) => chunks.push(c));
        entry.on("end", () => out.set(entry.path, Buffer.concat(chunks).toString("utf8")));
      },
    });
    parser.on("end", () => resolve());
    parser.on("error", reject);
    parser.end(tgz);
  });
  return out;
}
