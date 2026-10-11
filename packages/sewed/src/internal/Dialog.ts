import { dialog } from "electron";
import type { BrowserWindow, OpenDialogOptions, SaveDialogOptions } from "electron";
import { Deferred, Effect, Schema } from "effect";
import * as Dialog from "../Dialog.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";

const decodeMessageOptions = Schema.decodeUnknownSync(Dialog.MessageOptions);
const decodeOpenOptions = Schema.decodeUnknownSync(Dialog.OpenOptions);
const decodeSaveOptions = Schema.decodeUnknownSync(Dialog.SaveOptions);
const decodeOpenResult = Schema.decodeUnknownSync(Dialog.OpenResult);
const decodeSaveResult = Schema.decodeUnknownSync(Dialog.SaveResult);
const closedError = () => new SewedError({ code: "Closed", message: "Dialog parent is closed" });
let pending = false;

const filters = (values: readonly Dialog.FileFilter[] | undefined) =>
  values?.map((value) => ({ name: value.name, extensions: [...value.extensions] })) ?? [];

export const dialogs = (parent: BrowserWindow, closed: Deferred.Deferred<void>) => {
  const present = <O, A>(
    options: O,
    decode: (input: unknown) => O,
    show: (options: O, signal: AbortSignal) => Promise<A>,
  ): Effect.Effect<A, SewedError, MainContext> =>
    Effect.gen(function* () {
      yield* MainContext;
      if (parent.isDestroyed()) return yield* closedError();
      // Decoding is the caller's own mistake, not the native dialog's: an unknown or mode flag
      // among `properties` fails `Protocol`, naming the bad payload, before Electron ever runs —
      // never reported as `Native`, the code below reserves for the native call itself failing.
      const settings = yield* Effect.try({
        try: () => decode(options),
        catch: (cause) =>
          new SewedError({ code: "Protocol", message: "Could not show native dialog", cause }),
      });
      const result = yield* Effect.tryPromise({
        try: (signal) => {
          if (parent.isDestroyed()) throw closedError();
          if (pending) {
            throw new SewedError({ code: "Limit", message: "Another native dialog is pending" });
          }
          pending = true;
          try {
            return show(settings, signal).finally(() => {
              pending = false;
            });
          } catch (cause) {
            pending = false;
            throw cause;
          }
        },
        catch: (cause) =>
          cause instanceof SewedError
            ? cause
            : new SewedError({ code: "Native", message: "Could not show native dialog", cause }),
      }).pipe(
        Effect.raceFirst(Effect.andThen(Deferred.await(closed), Effect.failSync(closedError))),
      );
      if (parent.isDestroyed()) return yield* closedError();
      return result;
    });

  /**
   * The blocking forms: nothing else in the main process runs until the user answers, timers and
   * every other window's requests included. They exist for the rare flow that must not continue,
   * such as a confirmation inside a synchronous Electron callback; prefer the forms above.
   */
  const blocking = <O, A>(
    options: O,
    decode: (input: unknown) => O,
    show: (options: O) => A,
  ): Effect.Effect<A, SewedError, MainContext> =>
    Effect.andThen(
      MainContext,
      Effect.try({
        try: () => {
          if (parent.isDestroyed()) throw closedError();
          // The same slot the asynchronous forms hold: a blocking dialog opened while another is
          // still on screen, or still closing, was seen to leave that one's promise unsettled and
          // the window refusing every later dialog.
          if (pending)
            throw new SewedError({ code: "Limit", message: "Another native dialog is pending" });
          let settings: O;
          try {
            settings = decode(options);
          } catch (cause) {
            throw new SewedError({
              code: "Protocol",
              message: "Could not show native dialog",
              cause,
            });
          }
          return show(settings);
        },
        catch: (cause) =>
          cause instanceof SewedError
            ? cause
            : new SewedError({ code: "Native", message: "Could not show native dialog", cause }),
      }),
    );

  return {
    /** `message`, blocking the main process until answered; it answers the button's index. */
    messageBlocking: (
      options: Dialog.MessageOptions,
    ): Effect.Effect<number, SewedError, MainContext> =>
      blocking(options, decodeMessageOptions, ({ buttons, checkbox: _checkbox, ...settings }) =>
        dialog.showMessageBoxSync(parent, { ...settings, buttons: [...buttons] }),
      ),
    /** `open`, blocking the main process until answered. */
    openBlocking: (
      options: Dialog.OpenOptions,
    ): Effect.Effect<Dialog.OpenResult, SewedError, MainContext> =>
      blocking(options, decodeOpenOptions, (settings) => {
        const { mode, multiple, properties: given, ...rest } = settings;
        const properties: OpenDialogOptions["properties"] = [
          mode === "file" ? "openFile" : "openDirectory",
        ];
        if (multiple) properties.push("multiSelections");
        if (given !== undefined) properties.push(...given);
        const paths = dialog.showOpenDialogSync(parent, {
          ...rest,
          filters: filters(settings.mode === "file" ? settings.filters : undefined),
          properties,
        });
        return decodeOpenResult(
          paths === undefined ? { kind: "canceled" } : { kind: "selected", paths },
        );
      }),
    /** `save`, blocking the main process until answered. */
    saveBlocking: (
      options: Dialog.SaveOptions,
    ): Effect.Effect<Dialog.SaveResult, SewedError, MainContext> =>
      blocking(options, decodeSaveOptions, (settings) => {
        const properties: NonNullable<SaveDialogOptions["properties"]> = [
          ...new Set<NonNullable<SaveDialogOptions["properties"]>[number]>([
            "showOverwriteConfirmation",
            ...(settings.properties ?? []),
          ]),
        ];
        const path = dialog.showSaveDialogSync(parent, {
          ...settings,
          filters: filters(settings.filters),
          properties,
        });
        return decodeSaveResult(
          path === undefined || path === "" ? { kind: "canceled" } : { kind: "selected", path },
        );
      }),
    message: (
      options: Dialog.MessageOptions,
    ): Effect.Effect<Dialog.MessageResult, SewedError, MainContext> =>
      present(options, decodeMessageOptions, ({ buttons, checkbox, ...settings }, signal) =>
        dialog.showMessageBox(parent, {
          ...settings,
          buttons: [...buttons],
          ...(checkbox === undefined
            ? {}
            : { checkboxLabel: checkbox.label, checkboxChecked: checkbox.checked ?? false }),
          signal,
        }),
      ).pipe(
        Effect.map((result) => ({
          response: result.response,
          checkboxChecked: result.checkboxChecked,
        })),
      ),
    open: (
      options: Dialog.OpenOptions,
    ): Effect.Effect<Dialog.OpenResult, SewedError, MainContext> =>
      present(options, decodeOpenOptions, (settings) => {
        const { mode, multiple, properties: given, ...options } = settings;
        const properties: OpenDialogOptions["properties"] = [
          mode === "file" ? "openFile" : "openDirectory",
        ];
        if (multiple) properties.push("multiSelections");
        if (given !== undefined) properties.push(...given);
        return dialog
          .showOpenDialog(parent, {
            ...options,
            filters: filters(settings.mode === "file" ? settings.filters : undefined),
            properties,
          })
          .then((result) =>
            decodeOpenResult(
              result.canceled
                ? { kind: "canceled" }
                : { kind: "selected", paths: result.filePaths },
            ),
          );
      }),
    save: (
      options: Dialog.SaveOptions,
    ): Effect.Effect<Dialog.SaveResult, SewedError, MainContext> =>
      present(options, decodeSaveOptions, (settings) => {
        // The overwrite prompt is always kept, not only when `properties` is absent: a caller has
        // no door to turn it off, and naming other flags must not accidentally open one.
        const properties: NonNullable<SaveDialogOptions["properties"]> = [
          ...new Set<NonNullable<SaveDialogOptions["properties"]>[number]>([
            "showOverwriteConfirmation",
            ...(settings.properties ?? []),
          ]),
        ];
        return dialog
          .showSaveDialog(parent, { ...settings, filters: filters(settings.filters), properties })
          .then((result) =>
            decodeSaveResult(
              result.canceled ? { kind: "canceled" } : { kind: "selected", path: result.filePath },
            ),
          );
      }),
  };
};
