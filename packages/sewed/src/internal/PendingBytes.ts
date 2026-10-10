export const maximumPendingBytes = 128 * 1024 * 1024;

/** Bytes held against a budget. Whoever holds the reservation releases it, once. */
export interface Reservation {
  /** Adds `bytes` and answers this reservation, or `undefined`, changing nothing, if they do not fit. */
  readonly grow: (bytes: number) => Reservation | undefined;
  readonly release: () => void;
}

export const make = (maximum = maximumPendingBytes) => {
  if (!Number.isSafeInteger(maximum) || maximum <= 0)
    throw new TypeError("Pending byte budget must be a positive safe integer");
  let retained = 0;
  return {
    reserve: (bytes: number): Reservation | undefined => {
      if (bytes > maximum - retained) return undefined;
      retained += bytes;
      let held = bytes;
      let released = false;
      const reservation: Reservation = {
        grow: (more) => {
          if (released || more > maximum - retained) return undefined;
          retained += more;
          held += more;
          return reservation;
        },
        release: () => {
          if (released) return;
          released = true;
          retained -= held;
        },
      };
      return reservation;
    },
  };
};
