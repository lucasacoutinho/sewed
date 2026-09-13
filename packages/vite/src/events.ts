export type SewedViteEvent =
  | {
      readonly type: "building";
      readonly generation: number;
    }
  | {
      readonly type: "build-failed";
      readonly generation: number;
      readonly error: string;
    }
  | {
      readonly type: "started";
      readonly generation: number;
      readonly pid: number;
    }
  | {
      readonly type: "stopped";
      readonly generation: number;
      readonly pid: number;
      readonly code: number | null;
      readonly signal: NodeJS.Signals | null;
    };
