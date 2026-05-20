/**
 * Socket 类型：声明端口承载的数据形态，用于校验边连接的兼容性。
 */

/**
 * Socket 描述端口承载的数据类型，用于校验边连接的兼容性。
 *
 * @remarks
 * 内置类型可通过静态字段获取：{@link Socket.number}、{@link Socket.string}、{@link Socket.any} 等。
 *
 * @template T Socket 的字面量名称
 */
export class Socket<T extends string = string> {
  /** Socket 类型名（例如 `'number'`、`'string'`）。 */
  public readonly name: T;

  /** 兼容 Socket 列表；当前 Socket 可与列表中任意一个互连。 */
  public readonly compatible: ReadonlyArray<Socket> | undefined;

  /**
   * @param name Socket 名称
   * @param compatible 可与之互连的兼容 Socket 列表
   */
  public constructor(name: T, compatible?: ReadonlyArray<Socket>) {
    this.name = name;
    this.compatible = compatible;
  }

  /**
   * 判断当前 Socket 是否与另一个 Socket 兼容。
   *
   * @remarks
   * 兼容规则：
   * 1. 任一方为 `'*'` (any) 时兼容；
   * 2. 名称相同时兼容；
   * 3. 名称在 {@link compatible} 列表中时兼容。
   *
   * @param other 要比较的 Socket
   * @returns 是否兼容
   */
  public matches(other: Socket): boolean {
    if (this.name === '*' || other.name === '*') return true;
    if (this.name === other.name) return true;
    return this.compatible?.some(socket => socket.name === other.name) ?? false;
  }

  /**
   * 内置 Socket 工厂：构造并冻结一个 Socket 实例。
   *
   * @internal
   */
  private static frozen<T extends string>(name: T): Socket<T> {
    return Object.freeze(new Socket(name)) as Socket<T>;
  }

  /** 内置 `number` 类型 Socket。 */
  public static readonly number: Socket<'number'> = Socket.frozen('number');
  /** 内置 `string` 类型 Socket。 */
  public static readonly string: Socket<'string'> = Socket.frozen('string');
  /** 内置 `boolean` 类型 Socket。 */
  public static readonly boolean: Socket<'boolean'> = Socket.frozen('boolean');
  /** 内置 `object` 类型 Socket。 */
  public static readonly object: Socket<'object'> = Socket.frozen('object');
  /** 内置 `array` 类型 Socket。 */
  public static readonly array: Socket<'array'> = Socket.frozen('array');
  /** 内置 `exec` 类型 Socket，用于纯执行流连接，不传递数据。 */
  public static readonly exec: Socket<'exec'> = Socket.frozen('exec');
  /** 通配 Socket，与任意类型兼容。 */
  public static readonly any: Socket<'*'> = Socket.frozen('*');
}
