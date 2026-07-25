/**
 * 端口的数据类型。名称相同、任一为通配 `*`、或列在 `compatible` 中即可连接。
 */
export class Socket<T extends string = string> {
  public constructor(
    public readonly name: T,
    public readonly compatible: ReadonlyArray<Socket> = [],
  ) {}

  public accepts(other: Socket): boolean {
    return (
      this.name === "*" ||
      other.name === "*" ||
      this.name === other.name ||
      this.compatible.some((socket) => socket.name === other.name)
    );
  }

  public static readonly number = new Socket("number");
  public static readonly string = new Socket("string");
  public static readonly boolean = new Socket("boolean");
  public static readonly object = new Socket("object");
  public static readonly array = new Socket("array");
  public static readonly exec = new Socket("exec");
  public static readonly any = new Socket("*");
}

export type Sockets = { readonly [name: string]: Socket };

/** 按名称索引的内置类型，供反序列化解析。 */
export const builtins: ReadonlyMap<string, Socket> = new Map(
  [
    Socket.number,
    Socket.string,
    Socket.boolean,
    Socket.object,
    Socket.array,
    Socket.exec,
    Socket.any,
  ].map((socket) => [socket.name, socket]),
);
