export const taggedFunction = <Tag extends object, Fn extends (...args: never[]) => unknown>(
  tag: Tag,
  fn: Fn,
): Tag & Fn =>
  // Alchemy's callable service pattern: the proxy forwards the Context protocol.
  new Proxy(fn, {
    get: (target, property, receiver) =>
      Reflect.has(target, property)
        ? Reflect.get(target, property, receiver)
        : Reflect.get(tag, property, tag),
    has: (target, property) => Reflect.has(target, property) || Reflect.has(tag, property),
  }) as Tag & Fn;
