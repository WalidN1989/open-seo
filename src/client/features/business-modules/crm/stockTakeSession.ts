/**
 * A stock take that survives the shop floor.
 *
 * Counting happens where the stock is — a back room, a warehouse corner, a
 * phone on one bar of signal — and it is not finished in one sitting. So
 * every scan is counted here first, in the browser, and sent to the server
 * afterwards. Closing the laptop, losing the Wi-Fi or reloading the page
 * loses nothing: the counts are on the device until the server has them.
 *
 * Pure: no storage, no network, no clock. The screen wires those in.
 */

type CountableProduct = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  quantityOnHand: number;
};

export type CountedLine = {
  productId: string;
  name: string;
  sku: string;
  /** What stock said when the session started — the variance is measured from it. */
  systemStock: number;
  counted: number;
  /** Not yet acknowledged by the server. */
  unsent: boolean;
};

export type StockTakeState = {
  auditId: string;
  name: string;
  /** productId → line. Insertion order is scan order, which is how it reads. */
  lines: Record<string, CountedLine>;
  order: string[];
  /** Barcodes scanned that match no product, kept so nothing is silently lost. */
  unknown: string[];
};

export function startSession(auditId: string, name: string): StockTakeState {
  return { auditId, name, lines: {}, order: [], unknown: [] };
}

/** The barcode as scanners send it: trimmed, and with no stray separators. */
function normaliseCode(code: string) {
  return code.trim().replace(/\s+/g, "").toUpperCase();
}

/** Finds the product a scanned code belongs to: its barcode, or failing that its SKU. */
export function matchProduct(
  products: readonly CountableProduct[],
  code: string,
): CountableProduct | null {
  const wanted = normaliseCode(code);
  if (!wanted) return null;
  return (
    products.find(
      (product) => product.barcode && normaliseCode(product.barcode) === wanted,
    ) ??
    products.find((product) => normaliseCode(product.sku) === wanted) ??
    null
  );
}

/**
 * One scan. A product already on the list simply goes up by one — scanning
 * the same book five times means five copies, which is how counting works.
 */
export function scan(
  state: StockTakeState,
  products: readonly CountableProduct[],
  code: string,
): { state: StockTakeState; matched: CountableProduct | null } {
  const product = matchProduct(products, code);
  if (!product) {
    const unknown = normaliseCode(code);
    return {
      state:
        unknown && !state.unknown.includes(unknown)
          ? { ...state, unknown: [...state.unknown, unknown] }
          : state,
      matched: null,
    };
  }
  const existing = state.lines[product.id];
  const line: CountedLine = existing
    ? { ...existing, counted: existing.counted + 1, unsent: true }
    : {
        productId: product.id,
        name: product.name,
        sku: product.sku,
        systemStock: product.quantityOnHand,
        counted: 1,
        unsent: true,
      };
  return {
    state: {
      ...state,
      lines: { ...state.lines, [product.id]: line },
      order: existing ? state.order : [...state.order, product.id],
    },
    matched: product,
  };
}

/** A hand-typed correction: the count becomes exactly this. */
export function setCount(
  state: StockTakeState,
  productId: string,
  counted: number,
): StockTakeState {
  const line = state.lines[productId];
  if (!line) return state;
  return {
    ...state,
    lines: {
      ...state.lines,
      [productId]: { ...line, counted: Math.max(0, counted), unsent: true },
    },
  };
}

export function removeLine(
  state: StockTakeState,
  productId: string,
): StockTakeState {
  const { [productId]: removed, ...rest } = state.lines;
  void removed;
  return {
    ...state,
    lines: rest,
    order: state.order.filter((id) => id !== productId),
  };
}

/** Marks what the server has now stored, so only the rest is retried. */
export function markSent(
  state: StockTakeState,
  sent: readonly { productId: string; counted: number }[],
): StockTakeState {
  const lines = { ...state.lines };
  for (const item of sent) {
    const line = lines[item.productId];
    // Only if it has not been counted again since: a scan during the send
    // must not be marked as saved.
    if (line && line.counted === item.counted) {
      lines[item.productId] = { ...line, unsent: false };
    }
  }
  return { ...state, lines };
}

/** What still has to reach the server. */
export function pending(state: StockTakeState) {
  return state.order
    .map((id) => state.lines[id])
    .filter((line): line is CountedLine => Boolean(line?.unsent))
    .map((line) => ({ productId: line.productId, counted: line.counted }));
}

/** The lines in scan order, with the variance worked out. */
export function countedLines(state: StockTakeState) {
  return state.order.flatMap((id) => {
    const line = state.lines[id];
    return line
      ? [{ ...line, difference: line.counted - line.systemStock }]
      : [];
  });
}

export function summary(state: StockTakeState) {
  const lines = countedLines(state);
  return {
    products: lines.length,
    scanned: lines.reduce((total, line) => total + line.counted, 0),
    discrepancies: lines.filter((line) => line.difference !== 0).length,
    unsent: lines.filter((line) => line.unsent).length,
  };
}
