import * as Decidables from "../Decidables.ts";
import type * as Registry from "./DecisionRegistry.ts";

/**
 * Whether the BROWSER WINDOW's own `page-title-updated` should hold Electron's native title bar
 * rather than let the page's title through: `Decidables.WebContents.TitleUpdate`, resolved
 * against the same contents registry a consumer's own `decide` installs on. Electron documents
 * `preventDefault` as holding the title only on this window-level event; the CONTENTS' own event
 * of the same name (`internal/WebContentsCore.ts`) is a separate emission whose `preventDefault`
 * does nothing.
 *
 * Isolated into its own Electron-free module for the same reason `WindowClose.ts` is: the rest of
 * `internal/Window.ts` transitively imports the real `electron` module for a value
 * (`internal/View.ts`'s `new NativeView()`), which fails outside a real Electron process, so
 * nothing that touches that file at all can run under `node --import tsx --test`. A fake window's
 * own `page-title-updated` can drive this function directly, in Node, with a plain
 * `DecisionRegistry`.
 */
export const holdsTitle = (registry: Registry.Registry<"contents">, title: string): boolean =>
  registry.resolveSync(Decidables.WebContents.TitleUpdate, { title }) === "keep";
