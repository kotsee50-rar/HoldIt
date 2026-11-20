// Unit tests for the pure helpers. No network needed: `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bidFromOffer, ensureConnected, formatIou, parseFill, toDrops, tokenAmount } from "../xrplHelpers.js";
import { TOKEN_CURRENCY } from "../config.js";

test("formatIou never uses exponent notation", () => {
  assert.equal(formatIou(1e-7), "0.0000001");
  assert.equal(formatIou(100000), "100000");
  assert.equal(formatIou(1234.5), "1234.5");
});

test("toDrops floors to whole drops", () => {
  assert.equal(toDrops(1.998), "1998000");
  assert.equal(toDrops(0.0000009), "0");
  assert.equal(toDrops(1.0000019), "1000001");
});

test("tokenAmount builds an IOU amount for the configured currency", () => {
  assert.deepEqual(tokenAmount("rIssuer", 5000), { currency: TOKEN_CURRENCY, issuer: "rIssuer", value: "5000" });
});

test("bidFromOffer computes XRP per token from the amounts, not from quality", () => {
  // quality is tokens per drop here: 0.00101 would be wrong as a price.
  const offer = { Account: "rMM", TakerGets: "4950000", TakerPays: { value: "5000" }, quality: "0.00101010101010101" };
  const bid = bidFromOffer(offer);
  assert.equal(bid.owner, "rMM");
  assert.equal(bid.tokens, 5000);
  assert.equal(bid.xrp, 4.95);
  assert.ok(Math.abs(bid.price - 0.00099) < 1e-12);
});

test("bidFromOffer uses the funded amounts when the owner cannot fully fund the offer", () => {
  const offer = {
    Account: "rMM",
    TakerGets: "5000000",
    TakerPays: { value: "5000" },
    taker_gets_funded: "2000000",
    taker_pays_funded: { value: "2000" },
  };
  const bid = bidFromOffer(offer);
  assert.equal(bid.tokens, 2000);
  assert.equal(bid.xrp, 2);
  assert.ok(Math.abs(bid.price - 0.001) < 1e-12);
});

test("parseFill reports a zero fill for a killed transaction", () => {
  const result = { result: { meta: { TransactionResult: "tecKILLED" }, tx_json: { Fee: "12" } } };
  assert.deepEqual(parseFill(result, "rTreasury"), { code: "tecKILLED", deliveredXRP: 0, deliveredTokens: 0 });
});

// Fixture: one real testnet IOC sell of 1000 TGD, saved from the validated result.
// Checked against the raw AccountRoot balances, not only against parseFill itself.
test("parseFill reads a real fill from validated metadata", () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/fill-1000.json", import.meta.url), "utf8"));
  const fill = parseFill({ result: fixture.result }, fixture.account);
  assert.equal(fill.code, "tesSUCCESS");
  assert.equal(fill.deliveredTokens, 1000);

  const account = fixture.result.meta.AffectedNodes
    .map((node) => Object.values(node)[0])
    .find((body) => body.LedgerEntryType === "AccountRoot" && body.FinalFields.Account === fixture.account);
  const expectedXRP =
    (Number(account.FinalFields.Balance) - Number(account.PreviousFields.Balance) + Number(fixture.result.tx_json.Fee)) / 1e6;
  assert.ok(Math.abs(fill.deliveredXRP - expectedXRP) < 1e-9);
  assert.ok(fill.deliveredXRP > 0);
});

test("ensureConnected reconnects a dropped client and leaves a live one alone", async () => {
  const calls = { connect: 0 };
  const dropped = { isConnected: () => false, connect: async () => { calls.connect += 1; } };
  await ensureConnected(dropped);
  assert.equal(calls.connect, 1, "a dropped client must reconnect");

  const live = { isConnected: () => true, connect: async () => { calls.connect += 1; } };
  await ensureConnected(live);
  assert.equal(calls.connect, 1, "a live client must not reconnect");
});
