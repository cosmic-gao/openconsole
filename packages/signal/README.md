# @opendesign/signal

类型安全、支持通配符监听、与 AbortSignal / Disposable 集成的事件发射器。

## 特性

- 完整的 TS 事件映射:事件键 → 载荷类型,逐方法重载推导
- `*` 通配符监听全部事件
- `once()` 一次性监听,并可通过原始 handler 在触发前手动 `off`
- `on()` 支持 `AbortSignal`:abort 即自动取消订阅
- `Symbol.dispose` 集成:`using signal = new Signal()` 自动 `clear()`
- `emit()` 返回 `boolean`(是否有监听器接收)
- 反射 API:`count` / `has` / `names` / `listeners`
- 派发期间对监听器列表浅拷贝,handler 内部 `on/off` 不影响当次派发
- 可选 `rescue` 钩子接管 handler 异常,emit 继续向后派发
- 零运行时依赖

## 在本仓库中使用

```json
{
  "dependencies": {
    "@opendesign/signal": "workspace:*"
  }
}
```

## 使用指南

### 基础用法

```ts
import { Signal } from '@opendesign/signal';

interface AppEvents {
  'user:login': { id: number; name: string };
  'user:logout': void;
  error: Error;
}

const signal = new Signal<AppEvents>();

const off = signal.on('user:login', (user) => {
  console.log(`User logged in: ${user.name}`);
});

signal.emit('user:login', { id: 1, name: 'Alice' });
off();
```

### 通配符监听

```ts
signal.watch((type, event) => {
  console.log(`[event] ${String(type)}`, event);
});

// 等价 signal.on('*', ...);
```

### 一次性监听

```ts
const handler = (error: Error) => console.error(error.message);

signal.once('error', handler);

// 触发前手动取消也可以(通过原 handler 反查 wrapper):
signal.off('error', handler);
```

### AbortSignal 集成

```ts
const ac = new AbortController();
signal.on('user:login', handler, { signal: ac.signal });

// 一次 abort 即清理全部关联订阅
ac.abort();
```

### Disposable 资源管理(TC39 Explicit Resource Management)

```ts
{
  using signal = new Signal<AppEvents>();
  signal.on('user:login', handler);
}
// 离开作用域,自动 signal.clear()
```

### 异常托管

```ts
const signal = new Signal<AppEvents>({
  rescue(error, type, handler) {
    logger.error(`handler for ${String(type)} threw`, error);
  },
});

// handler 抛错被吞到 rescue,emit 继续派发剩余 handler
```

### 反射 / 调试

```ts
signal.has();             // 全图是否有监听器
signal.has('user:login'); // 指定事件键
signal.count('user:login');
signal.names();
signal.listeners('user:login');  // 浅拷贝,外部修改不影响内部
```

### 清理

```ts
signal.off('user:login');      // 移除该事件下所有监听器
signal.clear();                // 移除全部
signal[Symbol.dispose]();      // 等价 clear()
```

## API

### `class Signal<E>` / `interface Emitter<E>`

泛型 `E` 是事件名到载荷类型的映射。

| 方法 | 说明 | 返回 |
|---|---|---|
| `on(type, handler, options?)` | 注册监听器 | unsubscribe 函数 |
| `once(type, handler, options?)` | 注册一次性监听 | unsubscribe 函数 |
| `off(type, handler?)` | 取消监听(handler 省略 = 移除该事件下全部) | `void` |
| `emit(type, event)` | 派发事件 | `boolean`(是否有人接收) |
| `watch(handler, options?)` | `on('*', handler, ...)` 别名 | unsubscribe |
| `unwatch(handler?)` | `off('*', handler?)` 别名 | `void` |
| `has(type?)` | 是否存在监听器(无参数 = 全图) | `boolean` |
| `count(type)` | 监听器数 | `number` |
| `names()` | 所有有监听器的事件键 | `Array<Key \| '*'>` |
| `listeners(type)` | 监听器列表浅拷贝 | `Array<Listener>` |
| `clear()` | 清空全部监听器 | `void` |
| `[Symbol.dispose]()` | `clear()` 的 Disposable 别名 | `void` |

### `Options`

```ts
interface Options {
  /** abort 时自动取消订阅 */
  signal?: AbortSignal;
  /** 一次性触发 */
  once?: boolean;
}
```

### `Init<E>`

```ts
interface Init<E> {
  /** handler 抛错时的钩子;不提供则异常上抛中断 emit */
  rescue?: (error: unknown, type: EventType<E> | '*', handler: Listener<E>) => void;
}
```

## 行为说明

- **派发顺序**:先具体事件 handler,再通配符 handler。
- **派发拷贝**:emit 前对 handler 列表 `slice()`,handler 内部 `on/off` 不影响当次派发(但下一次 emit 反映新状态)。
- **重复注册**:同一 handler 多次 `on()` 会被多次注册并多次调用;每次 `off()` 只移除一份。
- **`once` 反向 off**:`off(type, originalHandler)` 通过内部 `WeakMap<wrapper, source>` 反查包装函数,可正常解绑。
- **异常处理**:默认 handler 抛错会中断当次 emit 剩余派发;构造时传 `rescue` 则吞错继续。
- **AbortSignal**:`on()` 时若 signal 已 aborted,直接 no-op 不注册。

## 开发

```bash
pnpm --filter @opendesign/signal check    # tsc + tests
pnpm --filter @opendesign/signal test
pnpm --filter @opendesign/signal typecheck
```

## License

MIT
