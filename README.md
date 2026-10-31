# simplycash-recovery

Get your BSV out of a **Simply Cash** wallet using your 12-word backup, now that the app no longer works.

- **Windows guide:** [GUIDE.md](GUIDE.md)
- **Mac guide:** [GUIDE-mac.md](GUIDE-mac.md)

Two small Node.js scripts run on your own computer. Your 12 words never leave it and are never saved to disk:

1. `scan.mjs` finds every address your seed controls and shows what is on them. It moves nothing.
2. `sweep.mjs` sends the coins to a wallet you control today: a small test first, then everything. It shows the full transaction and sends nothing unless you type `SEND`.

> **Only use the copy from https://github.com/hbgnostic/simplycash-recovery.** Scammers copy seed-recovery tools, add code that steals the seed, and share their version. The code here is short on purpose (three files, about 450 lines), so you or someone you trust can read all of it before typing in your words.

## What happened to Simply Cash

Simply Cash was a mobile wallet that began as a Bitcoin Cash wallet and became BSV-only in late 2018. Development stopped in August 2020 (last version 0.0.99). The app depends on its own server (`ws.simply.cash:3000`) to load balances and send. On 2026-10-02 that server was not responding, so the app could not do either; that is why this tool was written. On 2026-10-31 the server was accepting connections again. This tool does not use that server, so it works either way. The coins were never inside the app. They are on the BSV blockchain, and the 12 words still control them.

## How Simply Cash derived keys

From the app's source, [simplycash/simplycashwallet](https://github.com/simplycash/simplycashwallet) (`src/providers/wallet/wallet.ts`):

- BIP39 seed with an optional passphrase (blank by default)
- account path `m/44'/145'/0'` (the Bitcoin Cash coin type, kept after the BSV switch)
- receive addresses at `/0/i`, change at `/1/i`, identity key at `/2/0`
- **Wallets created before app v0.0.80 use a non-standard derivation.** The app used bitcore's `deriveNonCompliantChild`, which leaves the private key unpadded in hardened steps. For about 1 seed in 100 this gives different keys, and a standard BIP32 tool will show an empty wallet. `lib.mjs` derives both ways and scans both when they differ.

## Requirements

- Node.js 20 or newer
- `npm install` (installs `@bsv/sdk`, pinned by `package-lock.json`)
- A destination wallet that shows a legacy BSV address starting with `1`

Addresses are looked up on [WhatsOnChain](https://whatsonchain.com). Transactions are broadcast through [GorillaPool ARC](https://arc.gorillapool.io), with WhatsOnChain as a fallback.

## Options (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `GAP_LIMIT` | 30 | Unused addresses in a row before the scan stops |
| `FEE_SATS_PER_KB` | 150 | Fee rate (the network minimum was 100 as of 2026-10) |
| `WOC_API_KEY` | none | WhatsOnChain API key, for higher rate limits |

## How it was tested

- `dev/derivation-vs-bitcore.mjs` compares key derivation against `bsv@1.5.6`, the library the app shipped, on 600 random seeds with both methods, with and without a passphrase. No mismatches.
- `dev/mock-network.mjs` fakes WhatsOnChain and ARC with funds on a seed the old bug affects. Every input signature is checked with the SDK's script interpreter, and both broadcast success and rejection are covered.
- A full live run on mainnet: scan, test send, sweep all, then a rescan showing zero.
- `dev/make-practice-wallet.mjs` creates a throwaway seed so you can do your own practice run with a few cents.

To run the dev checks: `cd dev && npm install && node derivation-vs-bitcore.mjs`.

## Known issue: @bsv/sdk 2.8.11 and ARC

When GorillaPool ARC accepts a transaction, it replies with `"competingTxs": null`. The SDK misreads that as `ERR_INVALID_RESPONSE ... invalid competing transaction identifiers`. `sweep.mjs` doesn't trust that error. It asks ARC and WhatsOnChain whether they have the transaction before reporting success or failure.

## License

MIT. Provided as-is, with no warranty. You run it at your own risk. See [LICENSE](LICENSE).

Written with help from Claude (Opus 5.5) by Anthropic.
