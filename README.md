<div align=center>
  <img src="images/HoldIt!.png" width="128" align="center">
  <h1>HoldIt!</h1>
  <p>Stop burning treasury capital. HoldIt! is XRPL's confidential execution engine. It liquidates massive DAO positions with strict slippage control and zero market signaling via automated order slicing.</p>
</div>

## Index
- <a href="https://github.com/kotsee50-rar/HoldIt#description">Description</a>
- <a href="https://github.com/kotsee50-rar/HoldIt#technical-details">Technical details</a>
- <a href="https://github.com/kotsee50-rar/HoldIt#authors">Authors</a>

## Description

(Qui manca la descrizione completa)

## Technical details

**HoldIt!** (XRPL testnet) compares naive vs guarded token sales.
### Architecture:
Config/helpers; setup creates issuer/treasury/MM wallets, *DefaultRipple*, trustlines, mint; *marketMaker* seeds/refills a 10-level bid ladder; *naiveSell* does one IOC market sell; *executeOrder* sells depth-aware chunks; *Node http/SSE bridge* (/health,/book,/reset,/execute,/replay); doctor, demo, recordings. Tech: *Node ESM*, *xrpl.js*, *dotenv*, built-in http/fs/crypto.
### Challenges:
On-chain slippage floor via *TakerPays*, batched sequence-derived tx submission, validated-metadata fill parsing, *DefaultRipple*-before-trustlines ordering, IOU/drop precision, single-run lock, offline replay.
### Beneath the surface:
Guarded engine reads book, computes `floor=ref(1-slip)`
, waits for in-band liquidity, sends *OfferCreate tfImmediateOrCancel|tfSell* with `TakerPays=chunkfloor`, parses fills, halts on timeout/5 kills. MM refills fixed-price bids; SSE streams events; recordings replay without ledger.

## Authors
__HoldIt!__ is a project realized for the _IXH26 Italian XRPL Hackathon_ event by the __Ghost Buggers__ team, composed by:
- Vincenzo Basile
- Andrea Cozzi
- Flavio Iaconeta
- Marta Vitali Roscini
