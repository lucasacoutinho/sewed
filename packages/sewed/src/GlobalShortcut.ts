import { Schema } from "effect";

export const Accelerator = Schema.String.check(Schema.isMinLength(1), Schema.isPattern(/\S/));
export type Accelerator = typeof Accelerator.Type;
