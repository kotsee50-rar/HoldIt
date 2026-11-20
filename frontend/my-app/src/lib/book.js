// Turns the bids from GET /book into table rows. Depth bars are relative to the deepest level.

export function toBookRows(bids, limit = 10) {
  const top = (bids ?? []).slice(0, limit);
  const maxTokens = Math.max(0, ...top.map((b) => b.tokens));
  return top.map((b, i) => ({
    level: i + 1,
    price: b.price,
    tokens: b.tokens,
    xrp: b.xrp,
    widthPct: maxTokens > 0 ? (b.tokens / maxTokens) * 100 : 0,
  }));
}

export function totalDepth(bids) {
  return (bids ?? []).reduce((sum, b) => sum + b.tokens, 0);
}
