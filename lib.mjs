// Shared code for scan.mjs and sweep.mjs.
//
// What Simply Cash did (from github.com/simplycash/simplycashwallet, src/providers/wallet/wallet.ts):
//   - BIP39 12-word seed, optional passphrase (blank by default)
//   - account key at m/44'/145'/0'
//   - receive addresses at <account>/0/i, change addresses at <account>/1/i, identity key at <account>/2/0
//   - wallets created before app version 0.0.80 used bitcore's buggy "non-compliant" hardened derivation
//     (private key not zero-padded to 32 bytes). For most seeds both methods give identical keys;
//     for roughly 1 seed in 100 they differ, so we try both.
//
// The seed phrase never leaves this computer. Only public addresses are sent to WhatsOnChain.

import readline from 'node:readline'
import { HD, Mnemonic, PrivateKey, BigNumber, Curve, Hash, Utils } from '@bsv/sdk'

export const DEFAULT_PATH = "m/44'/145'/0'"
export const WOC = 'https://api.whatsonchain.com/v1/bsv/main'
export const GAP_LIMIT = Number(process.env.GAP_LIMIT || 30)

// ---------- terminal input ----------

// One shared input stream for the whole run, so pasted text is never lost between prompts.
let rl = null
let muted = false
const lines = []
const waiters = []

function input () {
  if (rl) return
  rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY })
  rl._writeToOutput = s => {
    if (!muted) process.stdout.write(s)
    else if (s === '\r\n' || s === '\n' || s === '\r') process.stdout.write('\n')
    else process.stdout.write(s.length === 1 ? '*' : '') // one * per typed character, hide pastes
  }
  rl.on('line', l => { const w = waiters.shift(); w ? w(l) : lines.push(l) })
  rl.on('close', () => { while (waiters.length) waiters.shift()('') })
}

function nextLine (question, hidden) {
  input()
  muted = false
  process.stdout.write(question)
  muted = hidden
  return new Promise(resolve => {
    const done = l => { muted = false; resolve(l) }
    lines.length ? done(lines.shift()) : waiters.push(done)
  })
}

export const ask = async question => (await nextLine(question, false)).trim()
export const askHidden = question => nextLine(question, true) // does not echo (seed, passphrase)
export const closeInput = () => { if (rl) rl.close() }

export async function askSeed () {
  console.log('Type or paste the 12 words, separated by spaces. Nothing will show as you type (that is on purpose).')
  const raw = await askHidden('Seed phrase: ')
  const words = raw.toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (![12, 15, 18, 21, 24].includes(words.length)) {
    throw new Error(`Expected 12 words, got ${words.length}. Nothing was sent anywhere. Run it again.`)
  }
  const phrase = words.join(' ')
  let valid = true
  try { Mnemonic.fromString(phrase).check() } catch { valid = false }
  if (!valid) {
    throw new Error('That phrase fails the BIP39 checksum. Usually one word is misspelled or two are swapped. ' +
      'Check each word against the original backup and run it again.')
  }
  console.log(`OK: ${words.length} words, checksum valid.`)

  console.log('\nSimply Cash allowed an optional extra passphrase. Most people never set one.')
  const passphrase = await askHidden('Passphrase (just press Enter if none): ')

  const pathIn = await ask(`Derivation path [press Enter for ${DEFAULT_PATH}]: `)
  const path = pathIn || DEFAULT_PATH
  if (!/^m(\/\d+'?)+$/.test(path)) throw new Error(`"${path}" does not look like a derivation path.`)

  return { phrase, passphrase, path }
}

// ---------- key derivation ----------

// One hardened or non-hardened BIP32 step. `padded` = true is correct BIP32;
// `padded` = false reproduces bitcore's deriveNonCompliantChild for hardened steps.
function childStep (parent, index, hardened, padded) {
  if (!hardened) return parent.deriveChild(index)
  const i = (index | 0x80000000) >>> 0
  const k = parent.privKey
  const keyBytes = padded ? k.toArray('be', 32) : k.toArray('be')
  const data = [0, ...keyBytes, (i >>> 24) & 0xff, (i >>> 16) & 0xff, (i >>> 8) & 0xff, i & 0xff]
  const I = Hash.sha512hmac(parent.chainCode, data)
  const il = new BigNumber(I.slice(0, 32))
  const n = new Curve().n
  if (il.gte(n)) throw new Error('Invalid BIP32 child (astronomically unlikely)')
  const childKey = new PrivateKey(il.add(k).mod(n).toArray('be', 32))
  const fp = Hash.hash160(parent.pubKey.encode(true)).slice(0, 4)
  return new HD(0x0488ade4, parent.depth + 1, fp, i, I.slice(32, 64), childKey, childKey.toPublicKey())
}

export function deriveAccount ({ phrase, passphrase, path }, compliant = true) {
  const seed = Mnemonic.fromString(phrase).toSeed(passphrase || '')
  let node = HD.fromSeed(seed)
  for (const part of path.split('/').slice(1)) {
    const hardened = part.endsWith("'")
    node = childStep(node, parseInt(part), hardened, compliant)
  }
  return node
}

// Returns the account keys to scan: one if both methods agree, two if they differ.
export function accountsToScan (seedInfo) {
  const good = deriveAccount(seedInfo, true)
  const legacy = deriveAccount(seedInfo, false)
  const same = good.privKey.toHex() === legacy.privKey.toHex()
  return same
    ? [{ label: 'standard', hd: good }]
    : [{ label: 'standard', hd: good }, { label: 'old-app (pre v0.0.80)', hd: legacy }]
}

export function keyAt (accountHd, chain, index) {
  const priv = accountHd.deriveChild(chain).deriveChild(index).privKey
  return { priv, address: priv.toPublicKey().toAddress() }
}

// ---------- WhatsOnChain ----------

const sleep = ms => new Promise(r => setTimeout(r, ms))
let lastCall = 0

export async function woc (path, body) {
  const headers = { 'content-type': 'application/json' }
  if (process.env.WOC_API_KEY) headers.Authorization = process.env.WOC_API_KEY
  for (let attempt = 1; attempt <= 6; attempt++) {
    const wait = 400 - (Date.now() - lastCall) // free tier is 3 requests/second
    if (wait > 0) await sleep(wait)
    lastCall = Date.now()
    let res
    try {
      res = await fetch(WOC + path, body
        ? { method: 'POST', headers, body: JSON.stringify(body) }
        : { headers })
    } catch (e) {
      if (attempt === 6) throw e
      await sleep(1000 * attempt)
      continue
    }
    if (res.status === 429 || res.status >= 500) { await sleep(1500 * attempt); continue }
    if (!res.ok) throw new Error(`WhatsOnChain ${path} returned ${res.status}: ${await res.text()}`)
    const text = await res.text()
    try { return JSON.parse(text) } catch { return text }
  }
  throw new Error(`WhatsOnChain ${path} kept failing. Wait a minute and try again.`)
}

// Which of these addresses have ever had a transaction? (max 20 per call)
async function usedSet (addresses) {
  const used = new Set()
  for (const kind of ['confirmed', 'unconfirmed']) {
    const rows = await woc(`/addresses/${kind}/history`, { addresses })
    for (const r of rows) if (Array.isArray(r.result) && r.result.length) used.add(r.address)
  }
  return used
}

async function unspentFor (addresses) {
  const out = []
  for (const kind of ['confirmed', 'unconfirmed']) {
    const rows = await woc(`/addresses/${kind}/unspent`, { addresses })
    for (const r of rows) {
      for (const u of r.result || []) {
        if (u.isSpentInMempoolTx) continue
        out.push({ address: r.address, txid: u.tx_hash, vout: u.tx_pos, satoshis: u.value, height: u.height || 0 })
      }
    }
  }
  // the same output can show up in both lists right as it confirms
  const seen = new Set()
  return out.filter(u => { const k = `${u.txid}:${u.vout}`; if (seen.has(k)) return false; seen.add(k); return true })
}

// Walk receive (0) and change (1) chains until GAP_LIMIT unused addresses in a row,
// plus the identity key at 2/0. Returns every used address and its unspent outputs.
export async function scanAccount (accountHd, log = console.log) {
  const found = [] // { chain, index, address, priv }
  for (const chain of [0, 1, 2]) {
    const name = ['receive', 'change', 'identity'][chain]
    let index = 0; let gap = 0
    const limit = chain === 2 ? 1 : GAP_LIMIT
    while (gap < limit) {
      const batch = []
      const size = Math.min(20, chain === 2 ? 1 : 20)
      for (let k = 0; k < size; k++) batch.push({ chain, index: index + k, ...keyAt(accountHd, chain, index + k) })
      const used = await usedSet(batch.map(b => b.address))
      for (const b of batch) {
        if (used.has(b.address)) { found.push(b); gap = 0 } else gap++
        if (gap >= limit) break
      }
      index += size
      if (chain === 2) break
    }
    log(`  ${name.padEnd(8)} chain: checked ${index} addresses, ${found.filter(f => f.chain === chain).length} used`)
  }

  const utxos = []
  for (let i = 0; i < found.length; i += 20) {
    const slice = found.slice(i, i + 20)
    const byAddr = Object.fromEntries(slice.map(f => [f.address, f]))
    for (const u of await unspentFor(slice.map(f => f.address))) {
      const f = byAddr[u.address]
      utxos.push({ ...u, chain: f.chain, index: f.index })
    }
  }
  return { used: found, utxos }
}

// Runs the full scan across both derivation methods. Returns keys in memory only.
export async function fullScan (seedInfo, log = console.log) {
  const accounts = accountsToScan(seedInfo)
  if (accounts.length === 1) {
    log('Derivation check: old-app and standard methods give the same keys for this seed (normal).')
  } else {
    log('Derivation check: this seed is one where the old Simply Cash bug matters. Scanning both ways.')
  }
  const results = []
  for (const acct of accounts) {
    log(`\nScanning ${acct.label} keys at ${seedInfo.path} ...`)
    const r = await scanAccount(acct.hd, log)
    results.push({ ...acct, ...r })
  }
  return results
}

export const sats = n => `${n.toLocaleString('en-US')} sats (${(n / 1e8).toFixed(8)} BSV)`

// Accepts legacy BSV addresses only (start with 1). Rejects cashaddr, testnet, P2SH, paymail.
export function checkAddress (addr) {
  if (!/^1[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(addr)) return false
  try {
    const decoded = Utils.fromBase58Check(addr)
    const prefix = Array.isArray(decoded.prefix) ? decoded.prefix : [decoded.prefix]
    return prefix.length === 1 && prefix[0] === 0 && decoded.data.length === 20
  } catch { return false }
}
