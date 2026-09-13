import { Schema } from "effect";

export const Kind = Schema.Literals(["prevent-app-suspension", "prevent-display-sleep"]);
export type Kind = typeof Kind.Type;
