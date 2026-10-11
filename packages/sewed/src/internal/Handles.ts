import type { WebContents } from "electron";
import type { Handle as BaseWindowHandle } from "../BaseWindow.ts";
import type { Handle as BrowserWindowHandle } from "../BrowserWindow.ts";
import type { Handle as WebContentsViewHandle } from "./WebContentsView.ts";
import type { Core } from "./WebContentsCore.ts";

/**
 * The live handles of this process by Sewed id, for the lookups `App.window` and
 * `App.webContents` answer. A lookup hands back the handle its owner already holds: no second
 * owner is made, and the entry leaves with the resource.
 */
interface Entry<A> {
  readonly handle: A;
  readonly isClosed: () => boolean;
}

const table = <A>() => {
  const entries = new Map<string, Entry<A>>();
  return {
    publish: (id: string, handle: A, isClosed: () => boolean): (() => void) => {
      const entry = { handle, isClosed };
      entries.set(id, entry);
      return () => {
        if (entries.get(id) === entry) entries.delete(id);
      };
    },
    find: (id: string): A | undefined => {
      const entry = entries.get(id);
      return entry === undefined || entry.isClosed() ? undefined : entry.handle;
    },
  };
};

/** Browser windows and base windows; only a browser window has `webContents`. */
export const windows = table<BrowserWindowHandle | BaseWindowHandle>();
/** Web contents by the id of the window, view or webview that owns them. */
export const contents = table<Core>();

const viewContents = new WeakMap<WebContentsViewHandle, WebContents>();
/** Records the native web contents behind a `WebContentsView` handle, for DevTools hosting. */
export const registerView = (handle: WebContentsViewHandle, native: WebContents): void => {
  viewContents.set(handle, native);
};
export const contentsOfView = (handle: WebContentsViewHandle): WebContents | undefined =>
  viewContents.get(handle);
