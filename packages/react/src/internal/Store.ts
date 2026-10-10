/**
 * A listener set for an external store. Subscribing a listener already present does nothing, and
 * each unsubscribe works once, so `first` and `last` bracket the span the set is non-empty.
 */
export const subscribers = (
  lifecycle: { readonly first?: () => void; readonly last?: () => void } = {},
) => {
  const listeners = new Set<() => void>();
  return {
    notify: (): void => {
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void): (() => void) => {
      if (listeners.has(listener)) return () => {};
      let subscribed = true;
      listeners.add(listener);
      if (listeners.size === 1) lifecycle.first?.();
      return () => {
        if (!subscribed) return;
        subscribed = false;
        listeners.delete(listener);
        if (listeners.size === 0) lifecycle.last?.();
      };
    },
  };
};

export const make = <A>(initial: A, activate: (publish: (value: A) => void) => () => void) => {
  let snapshot = initial;
  let stop: (() => void) | undefined;
  const publish = (value: A) => {
    snapshot = value;
    listeners.notify();
  };
  const listeners = subscribers({
    first: () => {
      stop = activate(publish);
    },
    last: () => {
      stop?.();
      stop = undefined;
      snapshot = initial;
    },
  });
  return { getSnapshot: () => snapshot, publish, subscribe: listeners.subscribe };
};
