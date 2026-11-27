import { expect, test } from "vitest";
import { collectDeps, fontLinkTags, parseExample, pickRepresentative } from "../src/examples.js";

const doc = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>アイコン付き（架空）｜ボタン</title>
<link rel="preconnect" href="https://fonts.example">
<link href="https://fonts.googleapis.com/css2?family=Fake+Sans&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../global.css">
<link rel="stylesheet" href="button.css">
<link rel="stylesheet" href="../link/link.css">
<script type="module" src="button.js"></script>
<script type="module">
  console.log("架空");
</script>
</head>
<body class="x">

<button class="dads-button">架空</button>

</body>
</html>
`;

test("parseExample splits head and body", () => {
  const ex = parseExample("button", "with-icon.html", doc);
  expect(ex.file).toBe("with-icon.html");
  expect(ex.title).toBe("アイコン付き（架空）");
  expect(ex.deps).toEqual([
    { kind: "font", target: "https://fonts.googleapis.com/css2?family=Fake+Sans&display=swap" },
    { kind: "css", target: "global.css" },
    { kind: "css", target: "button/button.css" },
    { kind: "css", target: "link/link.css" },
    { kind: "js", target: "button/button.js" },
  ]);
  expect(ex.snippet).toBe(
    '<script type="module" src="button.js"></script>\n<script type="module">\n  console.log("架空");\n</script>\n\n<button class="dads-button">架空</button>',
  );
});

test("parseExample keeps fragments as they are", () => {
  const ex = parseExample("button", "fragment.html", "\n<p>架空の断片</p>\n");
  expect(ex).toEqual({ file: "fragment.html", title: undefined, deps: [], snippet: "<p>架空の断片</p>" });
});

test("parseExample keeps absolute script and stylesheet urls", () => {
  const ex = parseExample(
    "x",
    "a.html",
    '<html><head><link rel="stylesheet" href="https://cdn.example/a.css"><script src="https://cdn.example/b.js"></script></head><body><p>架空</p></body></html>',
  );
  expect(ex.deps).toEqual([
    { kind: "css", target: "https://cdn.example/a.css" },
    { kind: "js", target: "https://cdn.example/b.js" },
  ]);
});

test("pickRepresentative", () => {
  expect(pickRepresentative(["a.html", "basic.html", "playground.html"])).toBe("playground.html");
  expect(pickRepresentative(["a.html", "basic.html"])).toBe("basic.html");
  expect(pickRepresentative(["b.html", "example.html"])).toBe("example.html");
  expect(pickRepresentative(["on.html", "playground-mode.html"])).toBe("playground-mode.html");
  expect(pickRepresentative(["example-2.html", "example-1.html"])).toBe("example-1.html");
  expect(pickRepresentative(["x.css"])).toBeUndefined();
});

test("collectDeps keeps first-seen order and records users", () => {
  const a = parseExample("button", "a.html", doc);
  const b = parseExample("button", "b.html", '<html><head><link rel="stylesheet" href="../../global.css"></head><body></body></html>');
  const deps = collectDeps([a, b]);
  expect(deps.map((d) => d.target)).toEqual([
    "https://fonts.googleapis.com/css2?family=Fake+Sans&display=swap",
    "global.css",
    "button/button.css",
    "link/link.css",
    "button/button.js",
  ]);
  expect(deps[1].usedBy).toEqual(["a.html", "b.html"]);
  expect(deps[3].usedBy).toEqual(["a.html"]);
});

test("fontLinkTags keeps preconnect links", () => {
  const html =
    '<html><head><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Fake+Sans" rel="stylesheet"><link rel="stylesheet" href="x.css"></head><body></body></html>';
  expect(fontLinkTags(html)).toEqual([
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link href="https://fonts.googleapis.com/css2?family=Fake+Sans" rel="stylesheet">',
  ]);
});
