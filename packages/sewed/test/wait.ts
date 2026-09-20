/**
 * Waits for a positive condition instead of sleeping a fixed time and hoping. A gate's `request()`
 * forks its resolution, so a test that sleeps before asserting that something *did* happen is
 * asserting on a duration it derived from nothing: it passes in isolation and fails under machine
 * load, which is the shape both of this suite's recorded flakes took. The wait is bounded, so a
 * condition that never becomes true reads as a named failure here rather than a run that never ends.
 *
 * A decider's own push and the gate's approve check run in one uninterrupted fiber turn with no
 * async boundary between them, so once a condition the decider sets is observable from outside, the
 * approve decision has already been made.
 *
 * Negative assertions — that something did *not* happen — are the one case this cannot serve: there
 * is no positive condition to wait for, and a wait would only postpone the same guess. Those keep a
 * bounded sleep, which can pass falsely but cannot fail falsely.
 */
export const waitUntil = (condition: () => boolean, label: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000;
    const poll = (): void => {
      if (condition()) return resolve();
      if (Date.now() > deadline) return reject(new Error(`Timed out waiting for ${label}`));
      setTimeout(poll, 2);
    };
    poll();
  });
