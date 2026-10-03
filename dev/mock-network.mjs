// Preload: fake WhatsOnChain + ARC. Funds legacy-account receive #3 and standard-account change #0 (gap tests).
import { Transaction, P2PKH, PrivateKey, Spend } from '@bsv/sdk'
import { deriveAccount, keyAt } from '../lib.mjs'
const seed = { phrase: 'scale antique weekend stamp forward deal energy legend bunker object lawn kite', passphrase: '', path: "m/44'/145'/0'" }
const legacyAddr = keyAt(deriveAccount(seed, false), 0, 3).address
const stdAddr = keyAt(deriveAccount(seed, true), 1, 0).address
const funder = PrivateKey.fromRandom()
const mk = (addr, amts) => { const t = new Transaction(); t.addInput({ sourceTXID: '00'.repeat(32), sourceOutputIndex: 0, unlockingScript: new P2PKH().lock(funder.toAddress()) }); amts.forEach(a => t.addOutput({ lockingScript: new P2PKH().lock(addr), satoshis: a })); return t }
const t1 = mk(legacyAddr, [250000, 1]), t2 = mk(stdAddr, [40000])
const txs = { [t1.id('hex')]: t1, [t2.id('hex')]: t2 }
const funded = { [legacyAddr]: [[t1, 0, 250000], [t1, 1, 1]], [stdAddr]: [[t2, 0, 40000]] }
globalThis.__broadcast = null
globalThis.fetch = async (url, opts = {}) => {
  const body = opts.body ? JSON.parse(opts.body) : null
  const json = o => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } })
  if (url.includes('/history')) return json(body.addresses.map(a => ({ address: a, result: url.includes('/confirmed/') && funded[a] ? [{ tx_hash: 'x', height: 1 }] : [] })))
  if (url.includes('/unspent')) return json(body.addresses.map(a => ({ address: a, result: url.includes('/confirmed/') ? (funded[a] || []).map(([t, v, s]) => ({ tx_hash: t.id('hex'), tx_pos: v, value: s, height: 900000 })) : [] })))
  const m = url.match(/\/tx\/([0-9a-f]{64})\/hex/); if (m) return new Response(txs[m[1]].toHex())
  const seen = globalThis.__seen ||= new Set()
  const st = url.match(/arc\.gorillapool\.io\/v1\/tx\/([0-9a-f]{64})$/)
  if (st) return seen.has(st[1]) ? json({ txid: st[1], txStatus: 'SEEN_ON_NETWORK', competingTxs: null }) : new Response('not found', { status: 404 })
  const wh = url.match(/\/tx\/hash\/([0-9a-f]{64})$/)
  if (wh) return seen.has(wh[1]) ? json({ txid: wh[1] }) : new Response('not found', { status: 404 })
  if (url.includes('arc.gorillapool.io')) {
    const tx = Transaction.fromHexEF(body?.rawTx ?? JSON.parse(opts.body).rawTx)
    const ok = tx.inputs.map((inp, i) => { const so = inp.sourceTransaction.outputs[inp.sourceOutputIndex]; try { return new Spend({ sourceTXID: inp.sourceTXID, sourceOutputIndex: inp.sourceOutputIndex, sourceSatoshis: so.satoshis, lockingScript: so.lockingScript, transactionVersion: tx.version, otherInputs: tx.inputs.filter((_, j) => j !== i), outputs: tx.outputs, inputIndex: i, unlockingScript: inp.unlockingScript, inputSequence: inp.sequence, lockTime: tx.lockTime }).validate() } catch (e) { return 'ERR ' + e.message } })
    console.error(`\n[MOCK ARC] got tx ${tx.id('hex')}, ${tx.inputs.length} inputs, outputs=${JSON.stringify(tx.outputs.map(o => o.satoshis))}, script verify=${ok}`)
    if (process.env.MOCK_REJECT) return json({ txid: tx.id('hex'), txStatus: 'REJECTED', extraInfo: 'mock rejection', status: 461, title: 'rejected' })
    seen.add(tx.id('hex'))
    return json({ blockHash: '', blockHeight: 0, competingTxs: null, extraInfo: '', merklePath: '', timestamp: new Date().toISOString(), txStatus: 'SEEN_ON_NETWORK', txid: tx.id('hex') })
  }
  if (url.endsWith('/tx/raw')) { console.error('[MOCK WOC] raw broadcast'); return process.env.MOCK_REJECT ? new Response('mock: bad tx', { status: 400 }) : json('txid') }
  throw new Error('unmocked ' + url)
}
