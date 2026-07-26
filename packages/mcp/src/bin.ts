#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { createGateway } from './index.js';

async function main(): Promise<void> {
  const file = process.argv[2] ?? 'openmcp.yaml';
  const gateway = await createGateway(parse(readFileSync(file, 'utf8')));

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      console.log(`[openmcp] 收到 ${signal}，正在关闭`);
      void gateway.close().then(() => process.exit(0));
    });
  }
}

// 读文件与解析都是同步抛出，必须连同 createGateway 一起兜住
main().catch((error: unknown) => {
  console.error(`[openmcp] 启动失败: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
