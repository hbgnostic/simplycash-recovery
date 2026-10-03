// Step 1: SCAN. Read-only. Finds every address the Simply Cash seed used and what is still on them.
// Sends nothing, signs nothing. Writes scan-results.json (public addresses and balances only, no keys).
//
// Run:  node scan.mjs

import fs from 'node:fs'
import { askSeed, fullScan, sats, GAP_LIMIT, closeInput } from './lib.mjs'

console.log('\n=== Simply Cash recovery: SCAN (read-only, moves no money) ===\n')

try {
  const seedInfo = await askSeed()
  console.log(`\nLooking up addresses on WhatsOnChain (stops after ${GAP_LIMIT} unused in a row). This can take a minute...`)
  const results = await fullScan(seedInfo)

  let grand = 0
  const report = { scannedAt: new Date().toISOString(), path: seedInfo.path, accounts: [] }
  for (const r of results) {
    const total = r.utxos.reduce((s, u) => s + u.satoshis, 0)
    grand += total
    console.log(`\n--- ${r.label} keys: ${r.used.length} used addresses, ${r.utxos.length} unspent outputs, ${sats(total)}`)
    const byAddr = {}
    for (const u of r.utxos) {
      const k = `${u.address}  (${['receive', 'change', 'identity'][u.chain]} #${u.index})`
      byAddr[k] = (byAddr[k] || 0) + u.satoshis
    }
    for (const [k, v] of Object.entries(byAddr)) console.log(`   ${k}  ${sats(v)}`)
    const ones = r.utxos.filter(u => u.satoshis === 1).length
    if (ones) console.log(`   Note: ${ones} output(s) of exactly 1 sat. These may be tokens/ordinals; sweep.mjs leaves them alone.`)
    report.accounts.push({
      label: r.label,
      totalSatoshis: total,
      usedAddresses: r.used.map(u => ({ address: u.address, chain: u.chain, index: u.index })),
      utxos: r.utxos
    })
  }

  report.grandTotalSatoshis = grand
  fs.writeFileSync('scan-results.json', JSON.stringify(report, null, 2))

  console.log(`\n=== TOTAL FOUND: ${sats(grand)} ===`)
  if (results.every(r => r.used.length === 0)) {
    console.log('\nNo used addresses at all. Most likely causes: a passphrase was set, a word is wrong but still')
    console.log('passes the checksum (rare), or this seed belongs to a different wallet. Do not run sweep.')
  } else if (grand === 0) {
    console.log('\nThe wallet was used, but everything has already been spent. Click an address on')
    console.log('https://whatsonchain.com to see where the coins went.')
  } else {
    console.log('\nNext step: node sweep.mjs  (do a small test send first, see the guide)')
  }
  console.log('Saved scan-results.json (addresses and balances only, no keys).\n')
} catch (e) {
  console.error(`\nStopped: ${e.message}\n`)
  process.exitCode = 1
} finally {
  closeInput()
}
