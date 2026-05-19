import { describe, expect, it, vi } from 'vitest';

import Signal, { type Watcher } from './index';

interface TestEvents {
  ready: { ok: boolean };
  error: Error;
  done: void;
  tick: number;
}

describe('Signal · 基础 on / emit / off', () => {
  it('向匹配的监听器发送带类型的事件载荷', () => {
    const signal = new Signal<TestEvents>();
    const handler = vi.fn();

    signal.on('ready', handler);
    signal.emit('ready', { ok: true });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ ok: true });
  });

  it('emit 返回是否有监听器接收', () => {
    const signal = new Signal<TestEvents>();
    expect(signal.emit('ready', { ok: true })).toBe(false);

    signal.on('ready', () => {});
    expect(signal.emit('ready', { ok: true })).toBe(true);
  });

  it('emit 通配符监听也算"被接收"', () => {
    const signal = new Signal<TestEvents>();
    signal.watch(() => {});
    expect(signal.emit('ready', { ok: true })).toBe(true);
  });

  it('on 返回的 unsubscribe 函数可正确解绑', () => {
    const signal = new Signal<TestEvents>();
    const handler = vi.fn();

    const off = signal.on('ready', handler);
    off();
    signal.emit('ready', { ok: true });

    expect(handler).not.toHaveBeenCalled();
    expect(signal.has('ready')).toBe(false);
  });

  it('off(type) 不带 handler 时移除该事件下所有监听器', () => {
    const signal = new Signal<TestEvents>();
    signal.on('ready', vi.fn());
    signal.on('ready', vi.fn());

    expect(signal.count('ready')).toBe(2);
    signal.off('ready');
    expect(signal.count('ready')).toBe(0);
    expect(signal.has('ready')).toBe(false);
  });

  it('同一 handler 可以重复注册并被多次触发', () => {
    const signal = new Signal<TestEvents>();
    const handler = vi.fn();

    signal.on('ready', handler);
    signal.on('ready', handler);
    signal.emit('ready', { ok: true });

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('off 只移除一份注册（重复注册时）', () => {
    const signal = new Signal<TestEvents>();
    const handler = vi.fn();

    signal.on('ready', handler);
    signal.on('ready', handler);
    signal.off('ready', handler);
    signal.emit('ready', { ok: true });

    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('Signal · 通配符 watch / unwatch', () => {
  it('支持通配符监听器', () => {
    const signal = new Signal<TestEvents>();
    const wildcard = vi.fn();

    signal.on('*', wildcard);
    signal.emit('error', new Error('boom'));

    expect(wildcard).toHaveBeenCalledTimes(1);
    expect(wildcard.mock.calls[0]?.[0]).toBe('error');
    expect(wildcard.mock.calls[0]?.[1]).toBeInstanceOf(Error);
  });

  it('watch / unwatch 是 on/off("*") 的便捷别名', () => {
    const signal = new Signal<TestEvents>();
    const wildcard: Watcher<TestEvents> = vi.fn();

    signal.watch(wildcard);
    expect(signal.count('*')).toBe(1);
    signal.unwatch(wildcard);
    expect(signal.count('*')).toBe(0);
  });

  it('emit 顺序：先具体事件 handler,再通配符', () => {
    const signal = new Signal<TestEvents>();
    const order: string[] = [];

    signal.on('ready', () => order.push('specific'));
    signal.watch(() => order.push('wildcard'));
    signal.emit('ready', { ok: true });

    expect(order).toEqual(['specific', 'wildcard']);
  });
});

describe('Signal · once', () => {
  it('只执行一次 once 监听器', () => {
    const signal = new Signal<TestEvents>();
    const handler = vi.fn();

    signal.once('ready', handler);
    signal.emit('ready', { ok: true });
    signal.emit('ready', { ok: false });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ ok: true });
  });

  it('可以通过原始处理函数引用移除 once 监听器', () => {
    const signal = new Signal<TestEvents>();
    const handler = vi.fn();

    signal.once('error', handler);
    signal.off('error', handler);
    signal.emit('error', new Error('boom'));

    expect(handler).not.toHaveBeenCalled();
    expect(signal.has('error')).toBe(false);
  });

  it('once 触发后自动解绑(注册表中不再保留 wrapper)', () => {
    const signal = new Signal<TestEvents>();
    signal.once('ready', () => {});
    expect(signal.count('ready')).toBe(1);

    signal.emit('ready', { ok: true });
    expect(signal.count('ready')).toBe(0);
    expect(signal.has('ready')).toBe(false);
  });

  it('once handler 抛错时仍然完成解绑(不泄漏 wrapper)', () => {
    const signal = new Signal<TestEvents>();
    signal.once('error', () => {
      throw new Error('handler exploded');
    });

    expect(() => signal.emit('error', new Error('boom'))).toThrow('handler exploded');
    // 即便抛错,wrapper 也应该已从注册表中移除
    expect(signal.has('error')).toBe(false);
  });

  it('once("*") 任意事件触发一次后即解绑', () => {
    const signal = new Signal<TestEvents>();
    const wildcard = vi.fn();

    signal.once('*', wildcard);
    signal.emit('ready', { ok: true });
    signal.emit('error', new Error('x'));

    expect(wildcard).toHaveBeenCalledTimes(1);
    expect(signal.has('*')).toBe(false);
  });
});

describe('Signal · AbortSignal 集成', () => {
  it('signal abort 时自动 off', () => {
    const signal = new Signal<TestEvents>();
    const handler = vi.fn();
    const ac = new AbortController();

    signal.on('ready', handler, { signal: ac.signal });
    signal.emit('ready', { ok: true });
    ac.abort();
    signal.emit('ready', { ok: false });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(signal.has('ready')).toBe(false);
  });

  it('signal 在 on() 时已 aborted：直接 no-op 不注册', () => {
    const signal = new Signal<TestEvents>();
    const handler = vi.fn();
    const ac = new AbortController();
    ac.abort();

    const off = signal.on('ready', handler, { signal: ac.signal });
    signal.emit('ready', { ok: true });
    off(); // 不应抛错

    expect(handler).not.toHaveBeenCalled();
    expect(signal.has('ready')).toBe(false);
  });

  it('AbortSignal 与 once 组合：先达哪个就解绑', () => {
    const signal = new Signal<TestEvents>();
    const handler = vi.fn();
    const ac = new AbortController();

    signal.once('ready', handler, { signal: ac.signal });
    ac.abort(); // abort 先发生
    signal.emit('ready', { ok: true });

    expect(handler).not.toHaveBeenCalled();
  });
});

describe('Signal · emit 期间的列表 mutation', () => {
  it('emit 期间 on 新监听器不会影响当次派发', () => {
    const signal = new Signal<TestEvents>();
    const late = vi.fn();
    signal.on('ready', () => {
      signal.on('ready', late);
    });
    signal.emit('ready', { ok: true });

    expect(late).not.toHaveBeenCalled();
    // 但下一次会触发
    signal.emit('ready', { ok: true });
    expect(late).toHaveBeenCalledTimes(1);
  });

  it('emit 期间 off 后续 handler 仍会触发(拷贝语义)', () => {
    const signal = new Signal<TestEvents>();
    const b = vi.fn();
    signal.on('ready', () => {
      signal.off('ready', b);
    });
    signal.on('ready', b);

    signal.emit('ready', { ok: true });
    expect(b).toHaveBeenCalledTimes(1);
    // 第二次 emit 时 b 已被 off
    signal.emit('ready', { ok: true });
    expect(b).toHaveBeenCalledTimes(1);
  });
});

describe('Signal · 异常处理', () => {
  it('默认：handler 抛错中断当次 emit', () => {
    const signal = new Signal<TestEvents>();
    const later = vi.fn();

    signal.on('ready', () => {
      throw new Error('boom');
    });
    signal.on('ready', later);

    expect(() => signal.emit('ready', { ok: true })).toThrow('boom');
    expect(later).not.toHaveBeenCalled();
  });

  it('注入 rescue 时:异常被吞,emit 继续派发', () => {
    const rescue = vi.fn();
    const signal = new Signal<TestEvents>({ rescue });
    const later = vi.fn();

    signal.on('ready', () => {
      throw new Error('boom');
    });
    signal.on('ready', later);
    signal.emit('ready', { ok: true });

    expect(later).toHaveBeenCalledTimes(1);
    expect(rescue).toHaveBeenCalledTimes(1);
    expect(rescue.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect(rescue.mock.calls[0]?.[1]).toBe('ready');
  });

  it('rescue 报告通配符 handler 的异常时 type 字段为 "*"', () => {
    const rescue = vi.fn();
    const signal = new Signal<TestEvents>({ rescue });

    signal.watch(() => {
      throw new Error('w-boom');
    });
    signal.emit('ready', { ok: true });

    expect(rescue).toHaveBeenCalledTimes(1);
    expect(rescue.mock.calls[0]?.[1]).toBe('*');
  });
});

describe('Signal · 反射 API', () => {
  it('count / has / names', () => {
    const signal = new Signal<TestEvents>();

    expect(signal.has()).toBe(false);
    expect(signal.names()).toEqual([]);

    signal.on('ready', () => {});
    signal.on('ready', () => {});
    signal.on('error', () => {});
    signal.watch(() => {});

    expect(signal.has()).toBe(true);
    expect(signal.has('ready')).toBe(true);
    expect(signal.has('done')).toBe(false);
    expect(signal.count('ready')).toBe(2);
    expect(signal.count('error')).toBe(1);
    expect(signal.count('*')).toBe(1);
    expect(signal.count('done')).toBe(0);
    expect(signal.names().sort()).toEqual(['*', 'error', 'ready']);
  });

  it('listeners(type) 返回浅拷贝,外部 push 不影响内部', () => {
    const signal = new Signal<TestEvents>();
    const handler = vi.fn();
    signal.on('ready', handler);

    const snapshot = signal.listeners('ready');
    expect(snapshot).toHaveLength(1);

    snapshot.push(vi.fn() as never);
    expect(signal.count('ready')).toBe(1);
  });
});

describe('Signal · clear / Disposable', () => {
  it('clear() 移除所有事件级和全局监听器', () => {
    const signal = new Signal<TestEvents>();
    const readyHandler = vi.fn();
    const wildcard = vi.fn();

    signal.on('ready', readyHandler);
    signal.on('*', wildcard);

    signal.off('ready');
    signal.emit('ready', { ok: true });

    expect(readyHandler).not.toHaveBeenCalled();
    expect(wildcard).toHaveBeenCalledTimes(1);

    signal.clear();
    signal.emit('done');

    expect(wildcard).toHaveBeenCalledTimes(1);
    expect(signal.has()).toBe(false);
  });

  it('Symbol.dispose 等价于 clear()', () => {
    const signal = new Signal<TestEvents>();
    signal.on('ready', () => {});
    expect(signal.has()).toBe(true);

    signal[Symbol.dispose]();
    expect(signal.has()).toBe(false);
  });
});

describe('Signal · void 事件', () => {
  it('void 事件 emit 时可省略 event 参数', () => {
    const signal = new Signal<TestEvents>();
    const handler = vi.fn();

    signal.on('done', handler);
    signal.emit('done');

    expect(handler).toHaveBeenCalledTimes(1);
  });
});
