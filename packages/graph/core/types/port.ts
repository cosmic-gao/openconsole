import type { Input, Output, Port, Socket, Vertex } from '../classic';

export type Direction = 'input' | 'output';

export type Sockets = { readonly [key: string]: Socket };

export type Inputs<I extends Sockets> = { [K in keyof I]?: Input<I[K]> };

export type Outputs<O extends Sockets> = { [K in keyof O]?: Output<O[K]> };

export type Node<W = unknown> = Vertex<Sockets, Sockets, W>;

export type Ports<P extends Port = Port> = { readonly [key: string]: P | undefined };
