import { Effect } from "effect";
import { SewedError } from "../SewedError.ts";

const inspect = (keys: readonly string[]) => {
  const unique = new Set<string>();
  const duplicates = new Set<string>();
  for (const key of keys) {
    if (unique.has(key)) duplicates.add(key);
    unique.add(key);
  }
  return { unique, duplicates: [...duplicates].sort() };
};

export const validate = (
  expected: readonly string[],
  actual: readonly string[],
  message: string,
): Effect.Effect<void, SewedError> =>
  Effect.suspend(() => {
    const declared = inspect(expected);
    const supplied = inspect(actual);
    const differences = [
      ["Missing bindings", [...declared.unique].filter((key) => !supplied.unique.has(key)).sort()],
      [
        "Unexpected bindings",
        [...supplied.unique].filter((key) => !declared.unique.has(key)).sort(),
      ],
      ["Duplicate declarations", declared.duplicates],
      ["Duplicate bindings", supplied.duplicates],
    ] as const;
    const details = differences
      .filter(([, keys]) => keys.length > 0)
      .map(([label, keys]) => `${label}: ${keys.join(", ")}`);
    return details.length === 0
      ? Effect.void
      : Effect.fail(
          new SewedError({ code: "Protocol", message: `${message}. ${details.join(". ")}` }),
        );
  });
