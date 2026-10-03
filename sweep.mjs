// Step 2: SWEEP. Moves coins from the Simply Cash seed to an address in a wallet you control today.
// Run it twice: first a small TEST amount, then ALL once the test has arrived.
// Shows the full transaction and asks you to type SEND before anything leaves this computer.
//
// Run:  node sweep.mjs

import fs from 'node:fs'
import { Transaction, P2PKH, SatoshisPerKilobyte, ARC } from '@bsv/sdk'
import { ask, askSeed, fullScan, keyAt, sats, checkAddress, woc, closeInput } from './lib.mjs'

const FEE_SATS_PER_KB = Number(process.env.FEE_SATS_PER_KB || 150) // network minimum is 100 as of 2026-10
const ARC_URL = 'https://arc.gorillapool.io'
const TEST_RECORD = 'test-send.json' // where the last successful test send went (address + txid, no keys)

// True once ARC or WhatsOnChain reports knowing this txid. Retries for ~15s while it propagates.
async function onNetwork (txid) {
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(`${ARC_URL}/v1/tx/${txid}`)
      if (r.ok) {
        const s = String((await r.json()).txStatus || '').toUpperCase()
        if (/SEEN|MINED|ACCEPTED|STORED|ANNOUNCED|SENT_TO_NETWORK/.test(s) && !/REJECTED|DOUBLE_SPEND|ORPHAN/.test(s)) return true
      }
    } catch {}
    try { await woc(`/tx/hash/${txid}`); return true } catch {}
    await new Promise(r => setTimeout(r, 3000))
  }
  return false
}

console.log('\n=== Simply Cash recovery: SWEEP ===\n')

try {
  // 1. Seed, then a fresh scan (never trust an old scan for spending).
  const seedInfo = await askSeed()
  console.log('\nRe-scanning so we spend only what is there right now...')
  const results = await fullScan(seedInfo)

  const utxos = []
  for (const r of results) {
    for (const u of r.utxos) {
      if (u.satoshis <= 1) continue // possible token/ordinal, leave it
      utxos.push({ ...u, priv: keyAt(r.hd, u.chain, u.index).priv })
    }
  }
  const available = utxos.reduce((s, u) => s + u.satoshis, 0)
  if (!utxos.length) throw new Error('Nothing spendable found. Run scan.mjs to see why.')
  console.log(`\nSpendable: ${sats(available)} in ${utxos.length} output(s).`)

  // 2. Destination.
  console.log('\nPaste the RECEIVING address from the new wallet. It must be a BSV address starting with "1".')
  const dest = await ask('Destination address: ')
  if (!checkAddress(dest)) {
    throw new Error(`"${dest}" is not a valid BSV mainnet address starting with 1. (BCH "bitcoincash:" or "q..." addresses and paymails are not accepted here.)`)
  }
  console.log(`\nYou entered: ${dest}`)
  console.log('Clipboard malware can swap addresses when you paste. Look at the address shown IN THE NEW WALLET APP, not here.')
  const last4 = await ask('Type the LAST 4 characters of the address as the new wallet shows it: ')
  if (last4 !== dest.slice(-4)) throw new Error('Those do not match. Stopping. Nothing was sent.')

  // 3. Amount.
  console.log('\nHow much? Type a number of satoshis for a TEST send (e.g. 10000), or type ALL to sweep everything.')
  const amountIn = (await ask('Amount: ')).toUpperCase().replace(/[, _]/g, '')
  const sweepAll = amountIn === 'ALL'
  let amount = 0
  if (!sweepAll) {
    amount = Number(amountIn)
    if (!Number.isInteger(amount) || amount < 1) throw new Error(`"${amountIn}" is not a whole number of satoshis.`)
    if (amount > available - 1000) throw new Error(`That is more than is available after fees. For everything, type ALL.`)
  }

  // 3b. Sweeping everything: it should go where a test send already proved it works.
  if (sweepAll) {
    let prev = null
    try { prev = JSON.parse(fs.readFileSync(TEST_RECORD, 'utf8')) } catch {}
    if (!prev) {
      console.log('\nThere is no test send from this folder yet. The guide strongly recommends a small test first.')
      const a = await ask('Type SKIP TEST to send everything without a test, or anything else to stop: ')
      if (a.toUpperCase() !== 'SKIP TEST') throw new Error('Nothing was sent. Do a small test send first (see the guide), then come back for ALL.')
    } else if (prev.address !== dest) {
      console.log('\nWARNING: this is NOT the address your test send went to.')
      console.log(`  Test send went to:   ${prev.address}`)
      console.log(`  This sweep would go: ${dest}`)
      const a = await ask('Type DIFFERENT to send everything to the new address anyway, or anything else to stop: ')
      if (a.toUpperCase() !== 'DIFFERENT') throw new Error('Nothing was sent. Work out which address is right, then run sweep again.')
    } else {
      console.log(`\nSame address your test send went to (transaction ${prev.txid.slice(0, 12)}...). Good.`)
    }
  }

  // 4. Choose inputs. Test: biggest outputs first, just enough. All: every spendable output.
  let chosen
  if (sweepAll) {
    chosen = utxos
  } else {
    chosen = []
    let sum = 0
    for (const u of [...utxos].sort((a, b) => b.satoshis - a.satoshis)) {
      chosen.push(u); sum += u.satoshis
      if (sum >= amount + 1000) break
    }
  }

  // 5. Build. Pull each source transaction and check it matches what we expect before signing.
  console.log(`\nFetching ${new Set(chosen.map(u => u.txid)).size} source transaction(s)...`)
  const sourceCache = {}
  const tx = new Transaction()
  for (const u of chosen) {
    if (!sourceCache[u.txid]) sourceCache[u.txid] = Transaction.fromHex(await woc(`/tx/${u.txid}/hex`))
    const src = sourceCache[u.txid]
    const out = src.outputs[u.vout]
    const expectedScript = new P2PKH().lock(u.address).toHex()
    if (!out || out.satoshis !== u.satoshis || out.lockingScript.toHex() !== expectedScript) {
      throw new Error(`Output ${u.txid}:${u.vout} does not match what the scan reported. Stopping.`)
    }
    tx.addInput({
      sourceTransaction: src,
      sourceOutputIndex: u.vout,
      unlockingScriptTemplate: new P2PKH().unlock(u.priv)
    })
  }

  const changeAddress = chosen[0].address // test sends: leftover goes back to one of his own Simply Cash addresses
  if (sweepAll) {
    tx.addOutput({ lockingScript: new P2PKH().lock(dest), change: true })
  } else {
    tx.addOutput({ lockingScript: new P2PKH().lock(dest), satoshis: amount })
    tx.addOutput({ lockingScript: new P2PKH().lock(changeAddress), change: true })
  }
  await tx.fee(new SatoshisPerKilobyte(FEE_SATS_PER_KB))
  await tx.sign()

  // 6. Show everything and confirm.
  const inTotal = chosen.reduce((s, u) => s + u.satoshis, 0)
  const toDest = tx.outputs[0].satoshis
  const change = sweepAll ? 0 : tx.outputs[1].satoshis
  const fee = inTotal - tx.outputs.reduce((s, o) => s + o.satoshis, 0)
  const txid = tx.id('hex')

  console.log('\n================ REVIEW CAREFULLY ================')
  console.log(` Mode:            ${sweepAll ? 'SWEEP ALL' : 'TEST SEND'}`)
  console.log(` Inputs:          ${chosen.length} output(s), ${sats(inTotal)}`)
  console.log(` To destination:  ${sats(toDest)}`)
  console.log(`                  ${dest}`)
  if (!sweepAll) console.log(` Change back to:  ${sats(change)} -> ${changeAddress} (still yours, under the same seed)`)
  console.log(` Network fee:     ${sats(fee)}   (${tx.toHex().length / 2} bytes)`)
  console.log(` Transaction id:  ${txid}`)
  console.log('==================================================')
  if (fee > 100000) throw new Error('Fee is above 100,000 sats, which is unexpected. Stopping. Nothing was sent.')

  const go = await ask('\nType SEND (capitals) to broadcast, anything else to cancel: ')
  if (go !== 'SEND') throw new Error('Cancelled at your request. Nothing was sent.')

  // 7. Broadcast. Keep a copy of the signed transaction in case we need to resend it.
  const record = `sweep-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`
  fs.writeFileSync(record, `txid ${txid}\nto ${dest}\namount ${toDest}\nfee ${fee}\n\n${tx.toHex()}\n`)

  // A broadcaster's reply is not the last word: @bsv/sdk 2.8.11 reports some ARC successes as
  // ERR_INVALID_RESPONSE, and WhatsOnChain refuses a tx it already has. So after any error,
  // ask the network directly whether it has the transaction before saying anything.
  const res = await tx.broadcast(new ARC(ARC_URL)).catch(e => ({ status: 'error', description: e.message }))
  if (res.status !== 'success') {
    const why = `${res.code || ''} ${res.description || ''}`.trim()
    if (!(await onNetwork(txid))) {
      console.log(`(ARC reply: ${why}. Trying WhatsOnChain as well...)`)
      let wocErr = ''
      try { await woc('/tx/raw', { txhex: tx.toHex() }) } catch (e) { wocErr = e.message }
      if (!(await onNetwork(txid))) {
        throw new Error('The network has not picked up this transaction. Do NOT run sweep again yet. ' +
          `Keep the file ${record}, wait a few minutes, then search for ${txid} on whatsonchain.com. ARC: ${why}. WhatsOnChain: ${wocErr || 'no error'}`)
      }
    }
  }

  if (!sweepAll) {
    fs.writeFileSync(TEST_RECORD, JSON.stringify({ address: dest, txid, satoshis: toDest, at: new Date().toISOString() }, null, 2))
  }

  console.log('\nBroadcast OK (confirmed the network has it).')
  console.log(`Track it: https://whatsonchain.com/tx/${txid}`)
  console.log(`A copy of the signed transaction is in ${record}.`)
  console.log(sweepAll
    ? 'Check the new wallet shows the balance. Then run scan.mjs once more: it should show 0.\n'
    : 'Wait until the new wallet shows the test amount, THEN run sweep.mjs again and type ALL.\n')
} catch (e) {
  console.error(`\nStopped: ${e.message}\n`)
  process.exitCode = 1
} finally {
  closeInput()
}
