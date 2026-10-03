// Makes a throwaway "Simply Cash" wallet for a practice run: a fresh 12-word seed plus the
// addresses Simply Cash would have shown for it at m/44'/145'/0'.
// Fund one or two of the addresses with a few thousand sats, then run scan/sweep as the guide says.
//
// Run from the project folder:  node dev/make-practice-wallet.mjs

import fs from 'node:fs'
import { Mnemonic } from '@bsv/sdk'
import { deriveAccount, keyAt, DEFAULT_PATH } from '../lib.mjs'

const phrase = Mnemonic.fromRandom().toString()
const acct = deriveAccount({ phrase, passphrase: '', path: DEFAULT_PATH }, true)
const addr = (chain, i) => keyAt(acct, chain, i).address

const out = `PRACTICE WALLET (throwaway, delete this file when done)
Seed:  ${phrase}
Path:  ${DEFAULT_PATH}

Fund these from your real wallet:
  receive #0  ${addr(0, 0)}
  receive #4  ${addr(0, 4)}   (tests that the scan looks past unused addresses)
`
fs.writeFileSync('dev/practice-wallet.txt', out)
console.log(out)
console.log('Saved to dev/practice-wallet.txt so the sats are not lost if this window closes.')
