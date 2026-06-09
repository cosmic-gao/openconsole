// Rewrite shadcn-registry `@/...` import aliases to relative paths.
//
// Why: this package ships raw .tsx (no build) and is consumed via Next
// `transpilePackages`, where a dependency's `@/` alias is NOT resolvable —
// the consumer's own `@/` would capture it. So every component must use
// relative imports. The shadcn / ai-elements CLIs (and the raw registry
// JSON) emit `@/` aliases; run this after every `add`/sync to normalize.
//
// `@/` maps to the package root. Registry-internal prefixes
// (`@/registry/default/ui`, …) are first folded onto our components.json
// aliases, then turned into a path relative to each file.
//
// Usage:
//   node scripts/normalize-imports.mjs            # normalize components/**
//   node scripts/normalize-imports.mjs <files...> # normalize specific files
//   node scripts/normalize-imports.mjs --check    # exit 1 if anything would change (CI)
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, dirname, relative, sep, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PKG = dirname(dirname(fileURLToPath(import.meta.url)));

/** Fold registry-internal prefixes onto components.json aliases, then make
 *  the `@/`-rooted specifier relative to the importing file's directory. */
function toRelative(spec, fileDir) {
  let s = spec
    .replace(/^@\/registry\/default\/ui\//, "@/components/ui/")
    .replace(/^@\/registry\/default\/ai-elements\//, "@/components/ai-elements/")
    .replace(/^@\/registry\/default\/hooks\//, "@/hooks/")
    .replace(/^@\/registry\/default\/lib\//, "@/lib/")
    .replace(/^@\/registry\/default\//, "@/components/");
  const abs = join(PKG, s.slice(2)); // strip leading "@/"
  let rel = relative(fileDir, abs).split(sep).join("/");
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel;
}

const SPECIFIER = /@\/[^"']+/;
// `import x from "@/.."`, `export { x } from "@/.."`, side-effect `import "@/.."`
const STATIC = /((?:from|import)\s+)(["'])(@\/[^"']+)\2/g;
// dynamic `import("@/..")`
const DYNAMIC = /(import\(\s*)(["'])(@\/[^"']+)\2/g;

function normalize(content, fileDir) {
  return content
    .replace(STATIC, (_m, kw, q, spec) => `${kw}${q}${toRelative(spec, fileDir)}${q}`)
    .replace(DYNAMIC, (_m, kw, q, spec) => `${kw}${q}${toRelative(spec, fileDir)}${q}`);
}

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const args = process.argv.slice(2);
const check = args.includes("--check");
const explicit = args.filter((a) => a !== "--check");
const files = explicit.length
  ? explicit.map((f) => resolve(f))
  : walk(join(PKG, "components")).filter((f) => statSync(f).isFile());

let changed = 0;
for (const file of files) {
  const before = readFileSync(file, "utf8");
  if (!SPECIFIER.test(before)) continue;
  const after = normalize(before, dirname(file));
  if (after !== before) {
    changed++;
    if (check) console.log("would normalize:", relative(PKG, file).split(sep).join("/"));
    else writeFileSync(file, after);
  }
}

if (check) {
  if (changed) {
    console.error(`\n${changed} file(s) contain un-normalized @/ imports. Run: node scripts/normalize-imports.mjs`);
    process.exit(1);
  }
  console.log("all imports normalized (relative).");
} else {
  console.log(`normalized ${changed} file(s).`);
}
