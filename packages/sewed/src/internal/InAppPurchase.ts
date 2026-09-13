import { inAppPurchase } from "electron";
import { Effect, Schema } from "effect";
import type { Stream } from "effect";
import * as InAppPurchase from "../InAppPurchase.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as Observation from "./Observation.ts";

export { Product, Quantity, Transaction, TransactionState } from "../InAppPurchase.ts";

const protocolError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });
const nativeError = (message: string, cause: unknown) =>
  new SewedError({ code: "Native", message, cause });
const store = () => {
  if (process.platform !== "darwin")
    throw nativeError("In-app purchase is unavailable on this platform", undefined);
  return inAppPurchase;
};
const operation = <A>(message: string, run: () => A): Effect.Effect<A, SewedError, MainContext> =>
  Effect.andThen(
    MainContext,
    Effect.try({
      try: run,
      catch: (cause) => (cause instanceof SewedError ? cause : nativeError(message, cause)),
    }),
  );
const asynchronous = <A>(
  message: string,
  run: () => Promise<A>,
): Effect.Effect<A, SewedError, MainContext> =>
  Effect.andThen(
    MainContext,
    Effect.tryPromise({
      try: run,
      catch: (cause) => (cause instanceof SewedError ? cause : nativeError(message, cause)),
    }),
  );
const decodeIds = Schema.decodeUnknownSync(
  Schema.NonEmptyArray(Schema.String.check(Schema.isMinLength(1))),
);
const decodeId = Schema.decodeUnknownSync(Schema.String.check(Schema.isMinLength(1)));
const decodeQuantity = Schema.decodeUnknownSync(InAppPurchase.Quantity);
const decoded = <A>(message: string, run: () => A): Effect.Effect<A, SewedError> =>
  Effect.try({
    try: run,
    catch: (cause) => (cause instanceof SewedError ? cause : protocolError(message, cause)),
  });

const project = (transaction: Electron.Transaction): InAppPurchase.Transaction => ({
  transactionIdentifier: transaction.transactionIdentifier,
  originalTransactionIdentifier: transaction.originalTransactionIdentifier,
  transactionDate: transaction.transactionDate,
  transactionState: transaction.transactionState,
  errorCode: transaction.errorCode,
  errorMessage: transaction.errorMessage,
  productIdentifier: transaction.payment.productIdentifier,
  quantity: transaction.payment.quantity,
});

export const canMakePayments: Effect.Effect<boolean, SewedError, MainContext> = operation(
  "Could not query payment availability",
  () => store().canMakePayments(),
);

export const products = (
  ids: readonly string[],
): Effect.Effect<readonly InAppPurchase.Product[], SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid product identifiers", () => decodeIds(ids)),
    (value) =>
      asynchronous("Could not load products", async () =>
        (await store().getProducts([...value])).map((product) => ({
          productIdentifier: product.productIdentifier,
          localizedTitle: product.localizedTitle,
          localizedDescription: product.localizedDescription,
          price: product.price,
          formattedPrice: product.formattedPrice,
          currencyCode: product.currencyCode,
          isDownloadable: product.isDownloadable,
        })),
      ),
  );

export const purchase = (
  id: string,
  quantity = 1,
): Effect.Effect<boolean, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid purchase", () => [decodeId(id), decodeQuantity(quantity)] as const),
    ([product, count]) =>
      asynchronous("Could not purchase product", () =>
        store().purchaseProduct(product, { quantity: count }),
      ),
  );

export const finishAll: Effect.Effect<void, SewedError, MainContext> = operation(
  "Could not finish transactions",
  () => {
    store().finishAllTransactions();
  },
);
export const finish = (date: string): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid transaction date", () => decodeId(date)),
    (value) =>
      operation("Could not finish transaction", () => {
        store().finishTransactionByDate(value);
      }),
  );
export const restore: Effect.Effect<void, SewedError, MainContext> = operation(
  "Could not restore transactions",
  () => {
    store().restoreCompletedTransactions();
  },
);
export const receiptUrl: Effect.Effect<string, SewedError, MainContext> = operation(
  "Could not read the receipt URL",
  () => store().getReceiptURL(),
);

export const transactions: Stream.Stream<
  readonly InAppPurchase.Transaction[],
  SewedError,
  MainContext
> = Observation.fromEmitter("Transaction", store, [
  [
    "transactions-updated",
    (_event: unknown, updated: Electron.Transaction[]) => updated.map(project),
  ],
]);
