export interface Runtime {
  markDynamic(): void | Promise<void>;
  upstreamHeaders(): Headers | null | Promise<Headers | null>;
  revalidate(tag: string): void | Promise<void>;
}

export const NO_OP_RUNTIME: Runtime = Object.freeze({
  markDynamic(): void {},
  upstreamHeaders(): Headers | null {
    return null;
  },
  revalidate(): void {},
});
