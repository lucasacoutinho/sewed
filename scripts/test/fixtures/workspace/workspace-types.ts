import type { Effect, Scope } from "effect";
import type { RpcGroup } from "effect/rpc";
import { Binding, MainContext, Renderer, RendererContext, SewedError, WindowControls } from "sewed";
import { BrowserWindow } from "sewed/main";
import { runWorkspaceWindow } from "../src/main/workspace-window.ts";
import { workspaceApplication } from "../src/main/workspace.ts";
import { Workspace, workspaceBindings } from "../src/shared/workspace.ts";
import type { WorkspaceProtocol } from "../src/shared/workspace.ts";

// The feature needs protocol ownership, not a worker-specific handle or lifecycle.
declare const owner: Binding.Owner<RpcGroup.Rpcs<typeof WorkspaceProtocol>>;
const rendererUrl = new URL("../dist/renderer/index.html", import.meta.url);
const window = runWorkspaceWindow(owner, rendererUrl, "Workspace");
const main: Effect.Effect<void, SewedError, MainContext> = window;
void main;
// @ts-expect-error A native window program cannot run in a renderer.
const renderer: Effect.Effect<void, SewedError, RendererContext> = window;
void renderer;

const application: Effect.Effect<void, SewedError, MainContext | Scope.Scope> =
  workspaceApplication;
void application;
// @ts-expect-error Window-local scopes do not erase the shared worker's application scope.
const unscopedApplication: Effect.Effect<void, SewedError, MainContext> = workspaceApplication;
void unscopedApplication;

declare const controls: Binding.Owner<RpcGroup.Rpcs<typeof WindowControls.protocol>>;
// @ts-expect-error A native controls owner cannot substitute for the workspace protocol.
runWorkspaceWindow(controls, rendererUrl, "Wrong owner");

declare const nativeWindow: BrowserWindow.Handle;
const entry = Renderer.entry(rendererUrl, { bindings: workspaceBindings });
nativeWindow.webContents.load(entry, {
  bindings: [Binding.to(Workspace, owner), Binding.to(WindowControls.capability.slot, controls)],
});
// @ts-expect-error Both declared bindings must receive explicit owners.
nativeWindow.webContents.load(entry, { bindings: [Binding.to(Workspace, owner)] });
