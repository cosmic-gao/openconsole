#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { createGateway } from './index.js';

const file = process.argv[2] ?? 'openmcp.yaml';
const gateway = await createGateway(parse(readFileSync(file, 'utf8')));

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    console.log(`\n[openmcp] 收到 ${sig}，正在关闭...`);
    void gateway.close().then(() => process.exit(0));
  });
}
