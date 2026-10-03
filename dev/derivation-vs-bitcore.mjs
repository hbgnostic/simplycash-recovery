import bsv from 'bsv'
import Mn from 'bsv/mnemonic/index.js'
import { deriveAccount, keyAt } from '../lib.mjs'
const path = "m/44'/145'/0'"
let same = 0, diff = 0, bad = 0, shown = false
for (let t = 0; t < 600; t++) {
  const m = new Mn()                      // random 12 words, like the app
  const pass = t % 5 === 0 ? 'hunter2' : ''
  for (const compliant of [true, false]) {
    const root = m.toHDPrivateKey(pass)
    const acct = compliant ? root.deriveChild(path) : root.deriveNonCompliantChild(path)
    const refAddrs = [[0,0],[0,7],[1,3],[2,0]].map(([c,i]) => acct.deriveChild(c).deriveChild(i).privateKey.toAddress().toString())
    const mine = deriveAccount({ phrase: m.phrase, passphrase: pass, path }, compliant)
    const myAddrs = [[0,0],[0,7],[1,3],[2,0]].map(([c,i]) => keyAt(mine, c, i).address)
    if (JSON.stringify(refAddrs) !== JSON.stringify(myAddrs)) { bad++; console.log('MISMATCH', compliant, m.phrase) }
  }
  const a = m.toHDPrivateKey(pass).deriveChild(path).privateKey.toString()
  const b = m.toHDPrivateKey(pass).deriveNonCompliantChild(path).privateKey.toString()
  if (a === b) same++; else { diff++; if (!shown) { shown = true; console.log('example seed where bug matters:', JSON.stringify(m.phrase), JSON.stringify(pass)) } }
}
console.log({ seedsTested: 600, bothMethodsAgree: same, bugChangesKeys: diff, mismatchesVsBitcore: bad })
