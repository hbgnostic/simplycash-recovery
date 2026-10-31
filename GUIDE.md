# Getting your BSV out of Simply Cash

A step-by-step guide for Windows. Take it slowly. Nothing here is urgent: your coins are safe on the blockchain and will stay there until you move them.

## What happened to Simply Cash

Simply Cash stopped being developed in August 2020. The last version was 0.0.99. The app needs its own server to load balances and send payments. On 2026-10-02 that server was offline, so the app could not do either. On 2026-10-31 it was accepting connections again. This guide does not use that server, so it works either way.

**Your coins were never inside the app.** They sit at addresses on the BSV blockchain, and your 12 words are the only key to those addresses. The app was only a window onto them. These two small programs do the job the app used to do:

1. **scan** looks up every address your 12 words control and shows what is on them. It moves nothing.
2. **sweep** moves the coins to a new wallet you control today. First a small test, then the rest.

## Safety rules (read these first)

- **Anyone who sees your 12 words can take your coins.** Never type them into a website, an email, a chat, or a form. Never photograph them.
- These programs run only on your computer. They send your **addresses** (public information) to WhatsOnChain, a blockchain lookup site. **Your 12 words never leave your computer** and are never saved to a file.
- Do this on your own computer, at home, with screen sharing and remote-support apps closed.
- **Nobody will ever need your 12 words to help you.** No genuine helper will ask for them: not a friend, not a support person, not the author of these scripts. If you get stuck, share what is on the screen instead. The programs never display your words, so the screen is always safe to share.
- When you type your 12 words, **nothing appears on the screen** (or a row of stars). That is on purpose.

## What the scripts can't do for you

If you follow the steps, you're already covered for most of this. These are the few things only you can control:

- **Make sure the address is really yours.** The scripts catch typos, but not a valid address that belongs to someone else. That's what the small test send is for: if it arrives, the address is right.
- **Send to a BSV wallet you control.** Bitcoin (BTC) addresses also start with "1", and exchange deposit addresses don't always accept BSV. Don't use either.
- **Keep your 12 words to yourself.** No screen shares, photos, chat messages, AI chatbots, or helpers.
- **Use a computer you trust.** Malware already on a computer can see what you type.
- **Get the scripts from the original source:** github.com/hbgnostic/simplycash-recovery.
- **Write down your new wallet's backup** before you sweep.

## What you need

- Your 12 words, written down.
- The derivation path you have written down. For Simply Cash it is almost certainly `m/44'/145'/0'`.
- A **new BSV wallet** that you control, which can show you a **receiving address starting with `1`**. Set it up and **write down its backup words** before you start. HandCash works: look for the legacy address option under Receive.
- About 30 minutes.

## Part 1: One-time setup

### 1. Install Node.js

Node.js is the free program that runs these scripts.

1. Go to **https://nodejs.org**.
2. Download the version marked **LTS** (Windows Installer, `.msi`).
3. Run it and accept all the defaults. If it offers to install "tools for native modules", leave that box **unticked**. You don't need them.

### 2. Unzip the folder

1. Save `simplycash-recovery.zip` to your **Documents** folder.
2. Right-click it, choose **Extract All**, then **Extract**.
3. You now have a folder `Documents\simplycash-recovery` containing `scan.mjs`, `sweep.mjs`, `lib.mjs`, and a few other files.

### 3. Open a command window in that folder

1. Open the `simplycash-recovery` folder in File Explorer (the one that contains `scan.mjs`).
2. Click once in the **address bar** at the top (where it shows the folder path), so the text is highlighted.
3. Type `cmd` and press **Enter**.

A black window opens, already pointing at the folder. Use this window for everything below. (Use this black **Command Prompt** window rather than PowerShell. It avoids a Windows permission error.)

### 4. Check Node.js and install the one library

Type each line and press Enter:

```
node -v
```

You should see a version number like `v22.x.x`. If you see "not recognized", close the window, open it again as in step 3, and retry. If it still fails, restart the computer.

```
npm install
```

This downloads the one library the scripts use (`@bsv/sdk`, the official BSV toolkit). It takes about a minute. Some lines about "funding" or "audit" are normal. You only do this once.

## Part 2: Scan (moves nothing)

In the same window:

```
node scan.mjs
```

It asks three questions:

1. **Seed phrase:** type your 12 words with a single space between each, then press Enter. Nothing (or stars) will show. Check your paper as you go. Capital letters don't matter.
2. **Passphrase:** just press **Enter**, unless you remember setting an extra password when you created the wallet.
3. **Derivation path:** just press **Enter** to accept `m/44'/145'/0'`.
   - If what you wrote down is longer, like `m/44'/145'/0'/0/0`, still just press Enter. The extra `/0/0` refers to a single address, and the scan covers all of them.
   - If what you wrote down is quite different (for example `m/44'/236'/0'`), type it exactly as written.

You'll see `OK: 12 words, checksum valid`, which means the words are a valid set. Then it checks addresses for about 10 to 60 seconds and prints something like:

```
--- standard keys: 6 used addresses, 3 unspent outputs, 1,234,567 sats (0.01234567 BSV)
   1AbC...  (receive #0)  1,000,000 sats (0.01000000 BSV)
   ...
=== TOTAL FOUND: 1,234,567 sats (0.01234567 BSV) ===
```

"sats" (satoshis) are the smallest unit: 100,000,000 sats = 1 BSV.

**Does the total look about right?** If yes, carry on. If not, stop and see Troubleshooting below.

The scan also saves a file called `scan-results.json`. It holds addresses and balances only, no keys. It's safe to share with someone helping you.

> You may see "this seed is one where the old Simply Cash bug matters. Scanning both ways." Early versions of Simply Cash had a key-generation bug that affects about 1 wallet in 100. The scan checks both ways automatically. Nothing to do.

## Part 3: Test send (a small amount first)

Open your **new** wallet and find its receiving address. Have it on screen.

```
node sweep.mjs
```

1. Enter your **12 words, passphrase and path** again, exactly as before. The program re-checks the blockchain fresh every time.
2. **Destination address:** copy the receiving address from your new wallet, paste it (right-click pastes in the black window), and press Enter.
3. **Last 4 characters:** look at the address **in your new wallet app** (not in the black window) and type its last 4 characters. This catches a known kind of malware that swaps addresses on the clipboard. If they don't match, the program stops and nothing is sent.
4. **Amount:** type `10000` (that's 0.0001 BSV, a tiny test amount) and press Enter.

You'll get a review screen like this:

```
================ REVIEW CAREFULLY ================
 Mode:            TEST SEND
 Inputs:          1 output(s), 250,000 sats
 To destination:  10,000 sats
                  1Abc...your new wallet address...
 Change back to:  239,965 sats -> 1MMM7e... (still yours, under the same seed)
 Network fee:     35 sats
 Transaction id:  ...
==================================================
```

Check:

- **Mode** says TEST SEND.
- **To destination** is 10,000 sats.
- **The destination address** matches your new wallet, character for character.
- **The network fee** is small (normally under 100 sats).
- "Change back to" is your own leftover, returning to an address your 12 words control. That's expected.

If it all looks right, type `SEND` in capitals and press Enter. Anything else cancels without sending.

You'll see `Broadcast OK` and a link to track the payment on whatsonchain.com.

**Now wait until the 10,000 sats show up in your new wallet.** Usually that takes seconds to a few minutes. Some wallets only show it after one confirmation, which can take 10 to 30 minutes. **Don't continue until you see it arrive.**

## Part 4: Send everything

Once the test has arrived:

```
node sweep.mjs
```

Same steps as before, but when it asks for the **amount, type `ALL`**. The script checks that you're sending to the same address your test went to. If you aren't, it warns you and stops unless you type `DIFFERENT`.

On the review screen, check that:

- **Mode** says SWEEP ALL.
- **The destination address** is your new wallet again.
- **The amount** is about the total from the scan, minus the test you already sent and a tiny fee.

Type `SEND`.

When the new wallet shows the balance, run the scan one last time:

```
node scan.mjs
```

It should show `TOTAL FOUND: 0 sats`. Done.

## Afterwards

- **Keep the old 12 words** somewhere safe for now. They are no longer needed to hold your coins, but there's no harm in keeping them.
- **Never put new money onto the old Simply Cash words.** Use your new wallet from now on.
- **If you used Simply Cash (or the same 12 words) before November 2018**, the same words may also control some **Bitcoin Cash (BCH)**, a separate coin these programs don't touch. If that might apply to you, you'll need a separate BCH recovery tool.
- The folder contains a `sweep-<date>.txt` file for each send. It's a receipt and contains no keys. You can delete the whole folder when you're finished.

## Troubleshooting

| What you see | What it means / what to do |
|---|---|
| `'node' is not recognized` | Close the black window and open a new one. If that doesn't fix it, restart the computer. |
| `Expected 12 words, got 11` (or 13) | A word was missed or doubled. Run it again. Nothing was sent. |
| `fails the BIP39 checksum` | One word is misspelled or two are in the wrong order. Check each word against your paper, especially look-alikes (`sun` / `sum`, `tired` / `tide`). |
| `No used addresses at all` | The words are valid but no addresses were found. Possible causes: you set a passphrase, the path is different, or these words belong to a different wallet. Check the path you wrote down and run the scan again with it typed in exactly. |
| `everything has already been spent` | The wallet was used, but it's empty now. Click one of the addresses on whatsonchain.com to see where the coins went. |
| `Those do not match. Stopping.` | The last 4 characters you typed didn't match the pasted address. Re-copy the address from your new wallet and try again. If it happens repeatedly, **stop**: something may be changing your clipboard. Run a malware scan before going any further. |
| `WhatsOnChain ... kept failing` | The lookup service is busy. Wait a few minutes and run it again. |
| `The network has not picked up this transaction. Do NOT run sweep again yet.` | The payment may not have gone through. Don't retry. Keep the `sweep-<date>.txt` file it names, wait a few minutes, then search for the transaction id on whatsonchain.com. If it shows up there, the payment went through. |
| Any other error | Nothing is ever sent without you typing `SEND`. Take a screenshot (it never shows your words) and open an issue at https://github.com/hbgnostic/simplycash-recovery/issues. |

## What is in the folder (for the curious)

- `scan.mjs`: finds your addresses and balances. Read-only.
- `sweep.mjs`: builds, shows, signs and sends the payment, only after you type `SEND`.
- `lib.mjs`: shared code: rebuilds Simply Cash's keys from your words and looks up addresses on WhatsOnChain.
- `package.json` and `package-lock.json`: tell `npm install` exactly which version of the BSV library to download.

They're plain text files. You can open them in Notepad to read them.

## About this guide

This guide and the scripts were written with help from Claude (Opus 5.5), an AI assistant made by Anthropic.

**Only use the copy from https://github.com/hbgnostic/simplycash-recovery.** Seed-recovery tools are a favourite target for scammers, who copy them, add a line that steals the seed, and share their version. If you got these files anywhere else, compare them against the originals first.

**Disclaimer.** These scripts are provided as-is, with no warranty of any kind (see LICENSE). You run them at your own risk, and the author is not responsible for any lost funds. To keep the risk low, the process is built to go slowly: you send a small test amount first and confirm it arrives before moving everything, every transaction is shown to you for review before it goes out, and nothing is sent unless you type `SEND`. Please follow those steps and don't skip the test.
