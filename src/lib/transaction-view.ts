import type { Tx } from "./finance";

export type TransactionSort = "date" | "category" | "amount";
export type SortDirection = "asc" | "desc";

export interface TransactionView {
  hiddenCategories: string[];
  sort: TransactionSort;
  direction: SortDirection;
  expensesOnly: boolean;
}

/** A visual-only command from the assistant. Missing fields keep their current value. */
export interface TransactionViewPatch {
  hidden_categories?: string[] | null;
  sort?: TransactionSort | null;
  direction?: SortDirection | null;
  expenses_only?: boolean | null;
  reset?: boolean | null;
}

export const DEFAULT_TRANSACTION_VIEW: TransactionView = {
  hiddenCategories: [],
  sort: "date",
  direction: "desc",
  expensesOnly: false,
};

export function defaultDirection(sort: TransactionSort): SortDirection {
  return sort === "category" ? "asc" : "desc";
}

export function applyTransactionViewPatch(
  current: TransactionView,
  patch: TransactionViewPatch,
): TransactionView {
  if (patch.reset) return { ...DEFAULT_TRANSACTION_VIEW, hiddenCategories: [] };

  const sort = patch.sort ?? current.sort;
  return {
    hiddenCategories:
      patch.hidden_categories == null
        ? current.hiddenCategories
        : [...new Set(patch.hidden_categories.map((category) => category.trim()).filter(Boolean))],
    sort,
    direction: patch.direction ?? (patch.sort ? defaultDirection(sort) : current.direction),
    expensesOnly: patch.expenses_only ?? current.expensesOnly,
  };
}

export function isDefaultTransactionView(view: TransactionView) {
  return (
    view.hiddenCategories.length === 0 &&
    view.sort === "date" &&
    view.direction === "desc" &&
    !view.expensesOnly
  );
}

/** Filters and sorts a copy: changing the view never changes or reorders the stored records. */
export function visibleTransactions(txs: Tx[], view: TransactionView): Tx[] {
  const hidden = new Set(view.hiddenCategories.map((category) => category.toLocaleLowerCase("bg")));
  const direction = view.direction === "asc" ? 1 : -1;

  return txs
    .filter(
      (tx) =>
        !hidden.has(tx.category.toLocaleLowerCase("bg")) && (!view.expensesOnly || tx.kind === "expense"),
    )
    .sort((a, b) => {
      let comparison = 0;
      if (view.sort === "category") comparison = a.category.localeCompare(b.category, "bg");
      if (view.sort === "amount") comparison = Math.abs(a.amount) - Math.abs(b.amount);
      if (view.sort === "date") comparison = a.tx_date.localeCompare(b.tx_date);
      if (comparison !== 0) return comparison * direction;

      // Newest first within the same category or amount; ID keeps the order stable.
      return b.tx_date.localeCompare(a.tx_date) || a.id.localeCompare(b.id);
    });
}
