/**
 * 端口数据类型：以名称标识，通过 {@link Socket.matches} 判定端口间的连接兼容性。
 *
 * @typeParam T - 类型名称的字面量类型
 */
export class Socket<T extends string = string> {
  /** 类型名称（如 `'number'`、`'*'` 表示通配）。 */
  public readonly name: T;
  /** 额外视为兼容的类型列表。 */
  public readonly compatible: ReadonlyArray<Socket> | undefined;

  public constructor(name: T, compatible?: ReadonlyArray<Socket>) {
    this.name = name;
    this.compatible = compatible;
  }

  /**
   * 判断本类型是否可连接到 `other`：名称相同、任一为通配 `*`、或在兼容列表内。
   */
  public matches(other: Socket): boolean {
    if (this.name === "*" || other.name === "*") return true;
    if (this.name === other.name) return true;
    return (
      this.compatible?.some((socket) => socket.name === other.name) ?? false
    );
  }

  private static frozen<T extends string>(name: T): Socket<T> {
    return Object.freeze(new Socket(name)) as Socket<T>;
  }

  /** 预定义只读类型：数字。 */
  public static readonly number: Socket<"number"> = Socket.frozen("number");
  /** 预定义只读类型：字符串。 */
  public static readonly string: Socket<"string"> = Socket.frozen("string");
  /** 预定义只读类型：布尔。 */
  public static readonly boolean: Socket<"boolean"> = Socket.frozen("boolean");
  /** 预定义只读类型：对象。 */
  public static readonly object: Socket<"object"> = Socket.frozen("object");
  /** 预定义只读类型：数组。 */
  public static readonly array: Socket<"array"> = Socket.frozen("array");
  /** 预定义只读类型：执行流。 */
  public static readonly exec: Socket<"exec"> = Socket.frozen("exec");
  /** 预定义只读通配类型，与任意类型兼容。 */
  public static readonly any: Socket<"*"> = Socket.frozen("*");
}
