// Tests for the number format. Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTokens } from "./format.js";

test("numbers below 1,000 have no separator", () => {
  assert.equal(formatTokens(0), "0");
  assert.equal(formatTokens(999), "999");
});

test("from 1,000 upwards the thousands are separated, consistently", () => {
  assert.equal(formatTokens(1000), "1,000");
  assert.equal(formatTokens(9000), "9,000");
  assert.equal(formatTokens(10000), "10,000");
  assert.equal(formatTokens(100000), "100,000");
  assert.equal(formatTokens(1234567), "1,234,567");
});
