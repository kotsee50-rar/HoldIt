// Tests for the order-book helpers. Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { toBookRows, totalDepth } from "./book.js";

const bids = [
  { tokens: 10000, xrp: 1, price: 0.0001 },
  { tokens: 5000, xrp: 0.4975, price: 0.0000995 },
  { tokens: 2500, xrp: 0.2425, price: 0.000097 },
];

test("rows are numbered from the best bid and keep their values", () => {
  const rows = toBookRows(bids);
  assert.deepEqual(rows.map((r) => r.level), [1, 2, 3]);
  assert.equal(rows[0].price, 0.0001);
  assert.equal(rows[1].tokens, 5000);
});

test("depth bars are relative to the deepest level", () => {
  const rows = toBookRows(bids);
  assert.equal(rows[0].widthPct, 100);
  assert.equal(rows[1].widthPct, 50);
  assert.equal(rows[2].widthPct, 25);
});

test("the table shows at most the given number of levels", () => {
  assert.equal(toBookRows(bids, 2).length, 2);
  assert.equal(toBookRows(bids).length, 3);
});

test("an empty or missing book gives no rows and no depth", () => {
  assert.deepEqual(toBookRows([]), []);
  assert.deepEqual(toBookRows(undefined), []);
  assert.equal(totalDepth(undefined), 0);
});

test("total depth sums all levels", () => {
  assert.equal(totalDepth(bids), 17500);
});
