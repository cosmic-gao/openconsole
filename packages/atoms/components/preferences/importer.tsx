"use client";

import * as React from "react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Textarea,
} from "@openclound/shadcn";
import type { ImportedTheme } from "./types";

interface ImporterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (theme: ImportedTheme) => void;
}

const PLACEHOLDER = `:root {
  --background: 0 0% 100%;
  --foreground: oklch(0.52 0.13 144.17);
  --primary: #3e2723;
  /* And more */
}
.dark {
  --background: 222.2 84% 4.9%;
  --foreground: hsl(37.50 36.36% 95.69%);
  --primary: rgb(46, 125, 50);
  /* And more */
}`;

function body(css: string, selector: RegExp): string | null {
  const start = css.search(selector);
  if (start < 0) return null;
  const open = css.indexOf("{", start);
  if (open < 0) return null;
  let depth = 1;
  for (let i = open + 1; i < css.length; i++) {
    const ch = css[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  return null;
}

function declarations(
  css: string,
  selector: RegExp,
): Record<string, string> {
  const block = body(css, selector);
  if (!block) return {};
  const vars: Record<string, string> = {};
  for (const decl of block.matchAll(/--([\w-]+)\s*:\s*([^;]+?)\s*(?:;|$)/g)) {
    vars[decl[1].trim()] = decl[2].trim();
  }
  return vars;
}

export function Importer({ open, onOpenChange, onImport }: ImporterProps) {
  const [text, setText] = React.useState("");

  const submit = () => {
    if (!text.trim()) return;
    const css = text.replace(/\/\*[\s\S]*?\*\//g, "");
    onImport({
      light: declarations(css, /:root\s*\{/),
      dark: declarations(css, /\.dark\s*\{/),
    });
    onOpenChange(false);
    setText("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={true}>
      <DialogContent className="max-w-4xl w-[90vw]">
        <DialogHeader>
          <DialogTitle>Import Custom CSS</DialogTitle>
          <DialogDescription>
            Paste your CSS theme below. Include both <code>:root</code> (light
            mode) and <code>.dark</code> (dark mode) sections with CSS variables
            like <code>--primary</code>, <code>--background</code>, etc. The
            theme will automatically switch between light and dark modes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Textarea
            id="theme-css"
            className="max-h-[400px] min-h-[300px] font-mono text-sm resize-none"
            placeholder={PLACEHOLDER}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={!text.trim()}
              className="cursor-pointer"
            >
              Import Theme
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
