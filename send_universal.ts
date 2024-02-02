import { Address, Cell, TupleReader, internal, parseTuple, toNano } from '@ton/core'
import { KeyPair, getSecureRandomBytes, keyPairFromSeed, mnemonicToWalletKey } from '@ton/crypto'
import axios from 'axios'
// import { LiteClient, LiteRoundRobinEngine, LiteSingleEngine } from 'ton-lite-client'
import { TonClient4 } from '@ton/ton';
import { execSync } from 'child_process';
import fs from 'fs'
import { WalletContractV4 } from '@ton/ton';
import dotenv from 'dotenv'
import { givers10000, givers100, givers1000 } from './givers'
import arg from 'arg'
import { LiteClient, LiteSingleEngine, LiteRoundRobinEngine } from 'ton-lite-client';
import { getLiteClient, getTon4Client, getTon4ClientOrbs } from './client';
import { HighloadWalletV2 } from '@scaleton/highload-wallet';
import { OpenedContract } from '@ton/core';

dotenv.config({ path: 'config.txt.txt' })
dotenv.config({ path: '.env.txt' })
dotenv.config()
dotenv.config({ path: 'config.txt' })

const args = arg({
    '--givers': Number, // 100 1000 10000
    '--api': String, // lite, tonhub
    '--bin': String, // cuda, opencl or path to miner
    '--gpu': Number, // gpu id, default 0
    '--timeout': Number, // Timeout for mining in seconds
    // '--wallet': String, // v4r2 or highload
})


let givers = givers10000
if (args['--givers']) {
    const val = args['--givers']
    const allowed = [100, 1000, 10000]
    if (!allowed.includes(val)) {
        throw new Error('Invalid --givers argument')
    }

    switch (val) {
        case 100:
            givers = givers100
            console.log('Using givers 100')
            break
        case 1000:
            givers = givers1000
            console.log('Using givers 1 000')
            break
        case 10000:
            givers = givers10000
            console.log('Using givers 10 000')
            break
    }
} else {
    console.log('Using givers 10 000')
}

let bin = '.\\pow-miner-cuda.exe'
if (args['--bin']) {
    const argBin = args['--bin']
    if (argBin === 'cuda') {
        bin = '.\\pow-miner-cuda.exe'
    } else if (argBin === 'opencl' || argBin === 'amd') {
        bin = '.\\pow-miner-opencl.exe'
    } else {
        bin = argBin
    }
}
console.log('Using bin', bin)

const gpu = args['--gpu'] ?? 0
const timeout = args['--timeout'] ?? 5

console.log('Using GPU', gpu)
console.log('Using timeout', timeout)

const mySeed = process.env.SEED as string
const totalDiff = BigInt('115792089237277217110272752943501742914102634520085823245724998868298727686144')



let bestGiver: { address: string, coins: number } = { address: '', coins: 0 }
async function updateBestGivers(liteClient: TonClient4 | LiteClient) {
    if (liteClient instanceof TonClient4) {
        const lastInfo = await CallForSuccess(() => liteClient.getLastBlock())

        let newBestGiber: { address: string, coins: number } = { address: '', coins: 0 }
        await Promise.all(givers.map(async (giver) => {
            const stack = await CallForSuccess(() => liteClient.runMethod(lastInfo.last.seqno, Address.parse(giver.address), 'get_pow_params', []))
            // const powStack = Cell.fromBase64(powInfo.result as string)
            // const stack = parseTuple(powStack)


            const reader = new TupleReader(stack.result)
            const seed = reader.readBigNumber()
            const complexity = reader.readBigNumber()
            const iterations = reader.readBigNumber()

            const hashes = totalDiff / complexity
            const coinsPerHash = giver.reward / Number(hashes)
            if (coinsPerHash > newBestGiber.coins) {
                newBestGiber = { address: giver.address, coins: coinsPerHash }
            }
        }))
        bestGiver = newBestGiber
    } else if (liteClient instanceof LiteClient) {
        const lastInfo = await liteClient.getMasterchainInfo()

        let newBestGiber: { address: string, coins: number } = { address: '', coins: 0 }
        await Promise.all(givers.map(async (giver) => {
            const powInfo = await liteClient.runMethod(Address.parse(giver.address), 'get_pow_params', Buffer.from([]), lastInfo.last)
            const powStack = Cell.fromBase64(powInfo.result as string)
            const stack = parseTuple(powStack)


            const reader = new TupleReader(stack)
            const seed = reader.readBigNumber()
            const complexity = reader.readBigNumber()
            const iterations = reader.readBigNumber()

            const hashes = totalDiff / complexity
            const coinsPerHash = giver.reward / Number(hashes)
            if (coinsPerHash > newBestGiber.coins) {
                newBestGiber = { address: giver.address, coins: coinsPerHash }
            }
        }))
        bestGiver = newBestGiber
    }
}

async function getPowInfo(liteClient: TonClient4 | LiteClient, address: Address): Promise<[bigint, bigint, bigint]> {
    if (liteClient instanceof TonClient4) {
        const lastInfo = await CallForSuccess(() => liteClient.getLastBlock())
        const powInfo = await CallForSuccess(() => liteClient.runMethod(lastInfo.last.seqno, address, 'get_pow_params', []))

        const reader = new TupleReader(powInfo.result)
        const seed = reader.readBigNumber()
        const complexity = reader.readBigNumber()
        const iterations = reader.readBigNumber()

        return [seed, complexity, iterations]
    } else if (liteClient instanceof LiteClient) {
        const lastInfo = await liteClient.getMasterchainInfo()
        const powInfo = await liteClient.runMethod(address, 'get_pow_params', Buffer.from([]), lastInfo.last)
        const powStack = Cell.fromBase64(powInfo.result as string)
        const stack = parseTuple(powStack)

        const reader = new TupleReader(stack)
        const seed = reader.readBigNumber()
        const complexity = reader.readBigNumber()
        const iterations = reader.readBigNumber()

        return [seed, complexity, iterations]
    }

    throw new Error('invalid client')
}

let go = true
let i = 0
async function main() {
    let liteClient: TonClient4 | LiteClient
    if (!args['--api']) {
        console.log('Using TonHub API')
        liteClient = await getTon4Client()
    } else {
        if (args['--api'] === 'lite') {
            console.log('Using LiteServer API')
            liteClient = await getLiteClient('https://ton-blockchain.github.io/global.config.json')
        } else {
            console.log('Using TonHub API')
            liteClient = await getTon4Client()
        }

    }

    const liteServerClient = await getLiteClient('https://ton-blockchain.github.io/global.config.json')
    const ton4Client = await getTon4Client()
    const tonOrbsClient = await getTon4ClientOrbs()

    const keyPair = await mnemonicToWalletKey(mySeed.split(' '))
    const wallet = WalletContractV4.create({
        workchain: 0,
        publicKey: keyPair.publicKey
    })
    if (args['--wallet'] === 'highload') {
        console.log('Using highload wallet', wallet.address.toString({ bounceable: false, urlSafe: true }))
    } else {
        console.log('Using v4r2 wallet', wallet.address.toString({ bounceable: false, urlSafe: true }))
    }
    const opened = liteClient.open(wallet)

    await updateBestGivers(liteClient)

    setInterval(() => {
        updateBestGivers(liteClient)
    }, 1000)

    while (go) {
        const giverAddress = bestGiver.address
        const [seed, complexity, iterations] = await getPowInfo(liteClient, Address.parse(giverAddress))

        const randomName = (await getSecureRandomBytes(8)).toString('hex') + '.boc'
        const path = `bocs/${randomName}`
        const command = `${bin} -g ${gpu} -F 128 -t ${timeout} ${wallet.address.toString({ urlSafe: true, bounceable: true })} ${seed} ${complexity} ${iterations} ${giverAddress} ${path}`
        try {
            const output = execSync(command, { encoding: 'utf-8', stdio: "pipe" });  // the default is 'buffer'
        } catch (e) {
        }
        let mined: Buffer | undefined = undefined
        try {
            mined = fs.readFileSync(path)
            fs.rmSync(path)
        } catch (e) {
            //
        }
        if (!mined) {
            console.log(`${new Date()}: not mined`, seed, i++)
        }
        if (mined) {
            const [newSeed] = await getPowInfo(liteClient, Address.parse(giverAddress))
            if (newSeed !== seed) {
                console.log('Mined already too late seed')
                continue
            }

            console.log(`${new Date()}:     mined`, seed, i++)


            let w = opened as OpenedContract<WalletContractV4>
            let seqno = 0
            try {
                seqno = await CallForSuccess(() => w.getSeqno())
            } catch (e) {
                //
            }
            sendMinedBoc(wallet, seqno, keyPair, giverAddress, Cell.fromBoc(mined as Buffer)[0].asSlice().loadRef())
            // for (let j = 0; j < 5; j++) {
            //     try {
            //         await CallForSuccess(() => {

            //             return w.sendTransfer({
            //                 seqno,
            //                 secretKey: keyPair.secretKey,
            //                 messages: [internal({
            //                     to: giverAddress,
            //                     value: toNano('0.05'),
            //                     bounce: true,
            //                     body: Cell.fromBoc(mined as Buffer)[0].asSlice().loadRef(),
            //                 })],
            //                 sendMode: 3 as any,
            //             })
            //         })
            //         break
            //     } catch (e) {
            //         if (j === 4) {
            //             throw e
            //         }
            //         //
            //     }
            // }
        }
    }
}
main()

async function sendMinedBoc(
    wallet: WalletContractV4,
    seqno: number,
    keyPair: KeyPair,
    giverAddress: string,
    boc: Cell
) {
    const liteServerClient = await getLiteClient('https://ton-blockchain.github.io/global.config.json')
    const ton4Client = await getTon4Client()
    const tonOrbsClient = await getTon4ClientOrbs()

    const w1 = liteServerClient.open(wallet)
    const w2 = ton4Client.open(wallet)
    const w3 = tonOrbsClient.open(wallet)

    const wallets = [w1, w2, w3]

    for (let i = 0; i < 3; i++) {
        for (const w of wallets) {
            w.sendTransfer({
                seqno,
                secretKey: keyPair.secretKey,
                messages: [internal({
                    to: giverAddress,
                    value: toNano('0.05'),
                    bounce: true,
                    body: boc,
                })],
                sendMode: 3 as any,
            }).catch(e => {
                //
            })
        }
    }
}


// Function to call ton api untill we get response.
// Because testnet is pretty unstable we need to make sure response is final
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function CallForSuccess<T extends (...args: any[]) => any>(
    toCall: T,
    attempts = 20,
    delayMs = 100
): Promise<ReturnType<T>> {
    if (typeof toCall !== 'function') {
        throw new Error('unknown input')
    }

    let i = 0
    let lastError: unknown

    while (i < attempts) {
        try {
            const res = await toCall()
            return res
        } catch (err) {
            lastError = err
            i++
            await delay(delayMs)
        }
    }

    console.log('error after attempts', i)
    throw lastError
}

export function delay(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}
