import { Schema } from "effect";

export const Product = Schema.Struct({
  productIdentifier: Schema.String,
  localizedTitle: Schema.String,
  localizedDescription: Schema.String,
  price: Schema.Finite,
  formattedPrice: Schema.String,
  currencyCode: Schema.String,
  isDownloadable: Schema.Boolean,
});
export type Product = typeof Product.Type;

export const TransactionState = Schema.Literals([
  "purchasing",
  "purchased",
  "failed",
  "restored",
  "deferred",
]);
export type TransactionState = typeof TransactionState.Type;

export const Transaction = Schema.Struct({
  transactionIdentifier: Schema.String,
  originalTransactionIdentifier: Schema.String,
  transactionDate: Schema.String,
  transactionState: TransactionState,
  errorCode: Schema.Finite,
  errorMessage: Schema.String,
  productIdentifier: Schema.String,
  quantity: Schema.Finite,
});
export type Transaction = typeof Transaction.Type;

export const Quantity = Schema.Int.check(Schema.isGreaterThan(0));
