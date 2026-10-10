export const maximumPendingBytes = 128 * 1024 * 1024;

/** Bytes held against a budget. Whoever holds the reservation releases it, once. */
export interface Reservation {
  readonly release: () => void;
}

export const make = (maximum = maximumPendingBytes) => {
  if (!Number.isSafeInteger(maximum) || maximum <= 0)
    throw new TypeError("Pending byte budget must be a positive safe integer");
  let retained = 0;
  const growers = new WeakMap<Reservation, (bytes: number) => boolean>();
  return {
    /**
     * Reserves `bytes`: as a new reservation, or added to `existing`, which is returned. Answers
     * `undefined`, changing nothing, when the budget cannot hold them.
     */
    reserve: (bytes: number, existing?: Reservation): Reservation | undefined => {
      if (existing !== undefined)
        return growers.get(existing)?.(bytes) === true ? existing : undefined;
      if (bytes > maximum - retained) return undefined;
      retained += bytes;
      let held = bytes;
      let released = false;
      const reservation: Reservation = {
        release: () => {
          if (released) return;
          released = true;
          retained -= held;
        },
      };
      growers.set(reservation, (more) => {
        if (released || more > maximum - retained) return false;
        retained += more;
        held += more;
        return true;
      });
      return reservation;
    },
  };
};
