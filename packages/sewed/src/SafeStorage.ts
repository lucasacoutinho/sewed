import { Schema } from "effect";
import * as Binary from "./Binary.ts";

export const Availability = Schema.Struct({ available: Schema.Boolean, backend: Schema.String });
export type Availability = typeof Availability.Type;

/** Ciphertext with the backend that produced it, so stored secrets stay attributable across OS changes. */
export const Sealed = Schema.Struct({
  version: Schema.Literal(1),
  backend: Schema.String,
  bytes: Binary.Bytes,
});
export type Sealed = typeof Sealed.Type;
