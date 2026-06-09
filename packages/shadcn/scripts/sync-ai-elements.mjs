// Vendor AI SDK Elements (https://elements.ai-sdk.dev) into components/ai-elements/.
//
// Pulls the aggregate registry item, writes every file to its `target`, then
// runs the shared normalizer so committed source uses relative imports (this
// package ships raw .tsx with no build — see normalize-imports.mjs). Runtime
// deps are merged into package.json as OPTIONAL peerDependencies, so consumers
// that only use the base UI primitives aren't forced to install AI libs.
//
// Re-run any time to upgrade to the latest ai-elements. Review the diff.
//
// Usage: node scripts/sync-ai-elements.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const PKG = dirname(dirname(fileURLToPath(import.meta.url)));
const REGISTRY = "https://elements.ai-sdk.dev/api/registry/all.json";
const ALREADY_PEER = new Set(["lucide-react"]); // already a required peer dep

const sortObj = (o) =>
  Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));

// Idempotent fixups for upstream code that violates this package's strict
// tsconfig (noImplicitReturns etc.). Re-applied on every sync; warns (does not
// fail) if a pattern is gone, so an upstream change surfaces in typecheck.
function applyFixups() {
  const fixups = [
    {
      // noImplicitReturns: effect returns a cleanup only inside the if-branch
      file: "components/ai-elements/reasoning.tsx",
      done: "return undefined;\n    }, [isStreaming, isOpen, setIsOpen, hasAutoClosed]);",
      find: "        return () => clearTimeout(timer);\n      }\n    }, [isStreaming, isOpen, setIsOpen, hasAutoClosed]);",
      repl: "        return () => clearTimeout(timer);\n      }\n\n      return undefined;\n    }, [isStreaming, isOpen, setIsOpen, hasAutoClosed]);",
    },
    {
      // Array.prototype.toReversed is ES2023; consumers compile this raw .tsx
      // with their own (often ES2022) lib. [...x].reverse() is equivalent and
      // portable to any lib >= ES2015.
      file: "components/ai-elements/jsx-preview.tsx",
      done: "[...stack]\n      .reverse()",
      find: "stack\n      .toReversed()",
      repl: "[...stack]\n      .reverse()",
    },
  ];
  for (const fx of fixups) {
    const p = join(PKG, fx.file);
    if (!existsSync(p)) { console.warn(`⚠ fixup: ${fx.file} missing`); continue; }
    const s = readFileSync(p, "utf8");
    if (s.includes(fx.done)) continue; // already applied
    if (!s.includes(fx.find)) { console.warn(`⚠ fixup: pattern gone in ${fx.file} (upstream changed?) — verify typecheck`); continue; }
    writeFileSync(p, s.replace(fx.find, fx.repl));
    console.log(`fixup applied: ${fx.file}`);
  }
}

const res = await fetch(REGISTRY);
if (!res.ok) throw new Error(`registry fetch failed: ${res.status}`);
const reg = await res.json();
console.log(`registry "${reg.name}" — ${reg.files.length} files`);

// 1. write every file to its target
for (const f of reg.files) {
  const target = f.target || f.path.replace(/^registry\/default\//, "components/");
  const dest = join(PKG, target);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, f.content);
}
console.log(`wrote ${reg.files.length} files`);

// 2. normalize @/ imports -> relative (shared durable tool)
execFileSync("node", ["scripts/normalize-imports.mjs"], { cwd: PKG, stdio: "inherit" });

// 2b. apply strict-mode fixups, then regenerate per-directory barrels
applyFixups();
execFileSync("node", ["scripts/gen-barrels.mjs"], { cwd: PKG, stdio: "inherit" });

// 3. sanity: every shadcn dependency must already exist in components/ui
const missing = (reg.registryDependencies || [])
  .filter((d) => !/^https?:\/\//.test(d))
  .filter((d) => !existsSync(join(PKG, "components", "ui", `${d}.tsx`)));
if (missing.length) console.warn(`⚠ missing shadcn deps in components/ui: ${missing.join(", ")}`);

// 4. merge runtime deps into package.json as optional peers
const pkgPath = join(PKG, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const aiDeps = (reg.dependencies || []).filter((d) => !ALREADY_PEER.has(d));
const peers = { ...(pkg.peerDependencies || {}) };
const meta = { ...(pkg.peerDependenciesMeta || {}) };
const added = [];
for (const d of aiDeps) {
  if (!peers[d]) { peers[d] = "*"; added.push(d); }
  meta[d] = { optional: true };
}
pkg.peerDependencies = sortObj(peers);
pkg.peerDependenciesMeta = sortObj(meta);
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log(`peerDependencies: +${added.length} new (${added.join(", ") || "none"}); ${aiDeps.length} marked optional`);
console.log("done. Review `git diff`, then `pnpm install` and `pnpm typecheck`.");
