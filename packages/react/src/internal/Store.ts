export const make = <A>(initial: A, activate: (publish: (value: A) => void) => () => void) => {
  let snapshot = initial;
  let stop: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const publish = (value: A) => {
    snapshot = value;
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => snapshot,
    publish,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (listeners.size === 1) stop = activate(publish);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          stop?.();
          stop = undefined;
          snapshot = initial;
        }
      };
    },
  };
};
