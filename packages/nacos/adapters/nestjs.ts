// 零依赖:不 import @nestjs/common,本地声明用到的最小 Nest 形状(跨 Nest 8–11 稳定)。
// 无装饰器:仓库 tsconfig 未开 experimentalDecorators,故用程序化 API + Nest 对生命周期钩子的鸭子类型识别。
import {
  create,
  currentRequestHeaders,
  resolveOptions,
  withRequestHeaders,
  type Client,
  type FetchOptions,
  type Hint,
  type Instance,
  type OptionsOverride,
  type Runtime,
  type Service,
} from "../core";

type InjectionToken = string | symbol | (new (...args: never[]) => unknown);

interface Provider {
  provide: InjectionToken;
  useFactory?: (...args: never[]) => unknown;
  useValue?: unknown;
  inject?: InjectionToken[];
}

interface DynamicModule {
  module: unknown;
  global?: boolean;
  providers?: Provider[];
  exports?: InjectionToken[];
}

interface OnModuleInit {
  onModuleInit(): unknown;
}
interface OnModuleDestroy {
  onModuleDestroy(): unknown;
}

export const NACOS: symbol = Symbol.for("@openconsole/nacos");

export const nestRuntime: Runtime = {
  markDynamic(): void {},
  upstreamHeaders(): Headers | null {
    return currentRequestHeaders();
  },
  revalidate(): void {},
};

function makeRuntime(onRevalidate?: (tag: string) => void | Promise<void>): Runtime {
  return onRevalidate ? { ...nestRuntime, revalidate: (tag) => onRevalidate(tag) } : nestRuntime;
}

// 无装饰器:Nest 通过检测 onModuleInit / onModuleDestroy 是否存在来调用,勿加 @Injectable()。
export class NacosService implements OnModuleInit, OnModuleDestroy {
  readonly client: Client;

  constructor(options: Parameters<typeof create>[0]) {
    this.client = create(options);
  }

  onModuleInit(): Promise<void> {
    return this.client.start();
  }

  onModuleDestroy(): Promise<void> {
    return this.client.stop();
  }

  fetch(input: string | URL | Request, init?: FetchOptions): Promise<Response> {
    return this.client.fetch(input, init);
  }

  discover(service: string, hint?: Hint): Promise<Instance> {
    return this.client.discover(service, hint);
  }

  service(name: string): Service {
    return this.client.service(name);
  }

  get config(): Client["config"] {
    return this.client.config;
  }
}

export interface NacosModuleOptions extends OptionsOverride {
  onRevalidate?: (tag: string) => void | Promise<void>;
  global?: boolean;
}

export interface NacosModuleAsyncOptions {
  inject?: InjectionToken[];
  useFactory: (...args: never[]) => NacosModuleOptions | Promise<NacosModuleOptions>;
  global?: boolean;
}

function clientProvider(): Provider {
  return {
    provide: NACOS,
    useFactory: (svc: NacosService): Client => svc.client,
    inject: [NacosService],
  };
}

export class NacosModule {
  static forRoot(options: NacosModuleOptions = {}): DynamicModule {
    const { onRevalidate, global = false, ...override } = options;
    const runtime = makeRuntime(onRevalidate);
    const serviceProvider: Provider = {
      provide: NacosService,
      useFactory: (): NacosService => new NacosService({ ...resolveOptions(override), runtime }),
    };
    return {
      module: NacosModule,
      global,
      providers: [serviceProvider, clientProvider()],
      exports: [NacosService, NACOS],
    };
  }

  static forRootAsync(options: NacosModuleAsyncOptions): DynamicModule {
    const serviceProvider: Provider = {
      provide: NacosService,
      useFactory: async (...args: never[]): Promise<NacosService> => {
        const { onRevalidate, ...override } = await options.useFactory(...args);
        const runtime = makeRuntime(onRevalidate);
        return new NacosService({ ...resolveOptions(override), runtime });
      },
      inject: options.inject ?? [],
    };
    return {
      module: NacosModule,
      global: options.global ?? false,
      providers: [serviceProvider, clientProvider()],
      exports: [NacosService, NACOS],
    };
  }
}

// 把当前请求入站头灌进核心共享 ALS,让 forward() 在 Nest handler 内透传。
// 参数按 Node IncomingMessage 最小子集声明,Express / Fastify 平台通用。
export function nacosRequestScope(
  req: { headers: Record<string, string | string[] | undefined> },
  _res: unknown,
  next: () => void,
): void {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value != null) {
      headers.set(name, value);
    }
  }
  withRequestHeaders(headers, next);
}
