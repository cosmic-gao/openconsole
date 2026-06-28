export class Socket<T extends string = string> {
  public readonly name: T;
  public readonly compatible: ReadonlyArray<Socket> | undefined;

  public constructor(name: T, compatible?: ReadonlyArray<Socket>) {
    this.name = name;
    this.compatible = compatible;
  }

  public matches(other: Socket): boolean {
    if (this.name === '*' || other.name === '*') return true;
    if (this.name === other.name) return true;
    return this.compatible?.some((socket) => socket.name === other.name) ?? false;
  }

  private static frozen<T extends string>(name: T): Socket<T> {
    return Object.freeze(new Socket(name)) as Socket<T>;
  }

  public static readonly number: Socket<'number'> = Socket.frozen('number');
  public static readonly string: Socket<'string'> = Socket.frozen('string');
  public static readonly boolean: Socket<'boolean'> = Socket.frozen('boolean');
  public static readonly object: Socket<'object'> = Socket.frozen('object');
  public static readonly array: Socket<'array'> = Socket.frozen('array');
  public static readonly exec: Socket<'exec'> = Socket.frozen('exec');
  public static readonly any: Socket<'*'> = Socket.frozen('*');
}
