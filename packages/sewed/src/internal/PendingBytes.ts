export const maximumPendingBytes = 128 * 1024 * 1024;

/** Bytes held against a budget. Whoever holds the reservation releases it, once. */
export interface Reservation {
  /** Adds `bytes` and answers this reservation, or `undefined`, changing nothing, if they do not fit. */
  readonly grow: (this: Reservation, bytes: number) => Reservation | undefined;
  readonly release: (this: Reservation) => void;
}

class ByteReservation implements Reservation {
  private released = false;

  constructor(
    private readonly budget: { readonly maximum: number; retained: number },
    private held: number,
  ) {}

  grow(bytes: number): Reservation | undefined {
    const budget = this.budget;
    if (this.released || bytes > budget.maximum - budget.retained) return undefined;
    budget.retained += bytes;
    this.held += bytes;
    return this;
  }

  release(): void {
    if (this.released) return;
    this.released = true;
    this.budget.retained -= this.held;
  }
}

export const make = (maximum = maximumPendingBytes) => {
  if (!Number.isSafeInteger(maximum) || maximum <= 0)
    throw new TypeError("Pending byte budget must be a positive safe integer");
  const budget = { maximum, retained: 0 };
  return {
    reserve: (bytes: number): Reservation | undefined => {
      if (bytes > budget.maximum - budget.retained) return undefined;
      budget.retained += bytes;
      return new ByteReservation(budget, bytes);
    },
  };
};
