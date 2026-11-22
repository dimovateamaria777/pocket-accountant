import type { Kind, Tx } from "./finance";
import { SPENDING_KINDS, type TxQueryFilter } from "./summary";

export type TransactionSort = "date" | "category" | "amount";
export type SortDirection = "asc" | "desc";

export interface TransactionView {
  hiddenCategories: string[];
  sort: TransactionSort;
  direction: SortDirection;
  expensesOnly: boolean;
  /** Same filters the assistant used for an answer, so the list shows exactly those rows. */
  from?: string | null;
  to?: string | null;
  category?: string | null;
  merchant?: string | null;
  scope?: "spending" | "income" | null;
}

/** A visual-only command from the assistant. Missing fields keep their current value. */
export interface TransactionViewPatch {
  hidden_categories?: string[] | null;
  sort?: TransactionSort | null;
  direction?: SortDirection | null;
  expenses_only?: boolean | null;
  reset?: boolean | null;
  from?: string | null;
  to?: string | null;
  category?: string | null;
  merchant?: string | null;
  scope?: "spending" | "income" | null;
  /** Replace the answer filters (from/to/category/merchant/scope) instead of keeping them. */
  set_filter?: boolean | null;
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
  // An answer list shows exactly the answer's rows: no leftover visual filters.
  if (patch.set_filter) current = { ...DEFAULT_TRANSACTION_VIEW, hiddenCategories: [] };

  const sort = patch.sort ?? current.sort;
  return {
    hiddenCategories:
      patch.hidden_categories == null
        ? current.hiddenCategories
        : [...new Set(patch.hidden_categories.map((category) => category.trim()).filter(Boolean))],
    sort,
    direction: patch.direction ?? (patch.sort ? defaultDirection(sort) : current.direction),
    expensesOnly: patch.expenses_only ?? current.expensesOnly,
    ...(patch.set_filter
      ? { from: patch.from ?? null, to: patch.to ?? null, category: patch.category ?? null, merchant: patch.merchant ?? null, scope: patch.scope ?? null }
      : { from: current.from ?? null, to: current.to ?? null, category: current.category ?? null, merchant: current.merchant ?? null, scope: current.scope ?? null }),
  };
}

export function isDefaultTransactionView(view: TransactionView) {
  return (
    view.hiddenCategories.length === 0 &&
    view.sort === "date" &&
    view.direction === "desc" &&
    !view.expensesOnly &&
    !view.from && !view.to && !view.category && !view.merchant && !view.scope
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

/** The database filter for a view: identical rules for the list header, the list rows and the assistant. */
export function viewToFilter(view: TransactionView, search = ""): TxQueryFilter {
  const kinds: Kind[] | null = view.expensesOnly
    ? ["expense"]
    : view.scope === "spending"
      ? SPENDING_KINDS
      : view.scope === "income"
        ? ["income"]
        : null;
  return {
    from: view.from ?? null,
    to: view.to ?? null,
    category: view.category ?? null,
    merchant: view.merchant ?? null,
    kinds,
    hidden: view.hiddenCategories,
    search: search || null,
  };
}
