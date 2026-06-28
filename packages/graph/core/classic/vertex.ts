import type { Inputs, NodeId, Outputs, PortId, Sockets } from '../types';
import { Input } from './input';
import { Output } from './output';

export class Vertex<I extends Sockets = Sockets, O extends Sockets = Sockets, W = unknown> {
  public readonly inputs: Inputs<I> = {} as Inputs<I>;
  public readonly outputs: Outputs<O> = {} as Outputs<O>;
  public weight: W | undefined;

  public constructor(
    public readonly id: NodeId,
    weight?: W,
  ) {
    this.weight = weight;
  }

  public addInput<K extends string & keyof I>(name: K, socket: I[K], id?: PortId): Input<I[K]> {
    const portId = id ?? (`${String(this.id)}:input:${name}` as PortId);
    const port = new Input<I[K]>(socket, portId);
    this.inputs[name] = port;
    return port;
  }

  public addOutput<K extends string & keyof O>(name: K, socket: O[K], id?: PortId): Output<O[K]> {
    const portId = id ?? (`${String(this.id)}:output:${name}` as PortId);
    const port = new Output<O[K]>(socket, portId);
    this.outputs[name] = port;
    return port;
  }

  public removeInput(name: string & keyof I): boolean {
    if (!(name in this.inputs)) return false;
    delete this.inputs[name];
    return true;
  }

  public removeOutput(name: string & keyof O): boolean {
    if (!(name in this.outputs)) return false;
    delete this.outputs[name];
    return true;
  }

  public hasInput(name: string & keyof I): boolean {
    return name in this.inputs;
  }

  public hasOutput(name: string & keyof O): boolean {
    return name in this.outputs;
  }

  public input<K extends string & keyof I>(name: K): Input<I[K]> | undefined {
    return this.inputs[name] as Input<I[K]> | undefined;
  }

  public output<K extends string & keyof O>(name: K): Output<O[K]> | undefined {
    return this.outputs[name] as Output<O[K]> | undefined;
  }
}
