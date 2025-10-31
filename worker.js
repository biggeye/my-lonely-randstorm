const crypto = require("crypto");
const secp256k1 = require("secp256k1");
const bs58check = require("bs58check");
const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");

class SimplePRNG {
  constructor(seed) {
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
    var r0 = (Math.imul(18273, this.rngstate[0] & 0xffff) + (this.rngstate[0] >>> 16)) | 0;
    this.rngstate[0] = r0;
    var r1 = (Math.imul(36969, this.rngstate[1] & 0xffff) + (this.rngstate[1] >>> 16)) | 0;
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
    this.randomCall = false;
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

  seedIntRandom(seededRng) {
    this.rngPool[this.rngPptr++] = seededRng.range(0, 256);
    this.rngPool[this.rngPptr++] = seededRng.range(0, 256);
    this.rngPool[this.rngPptr++] = this.rngPool[2];
    this.rngPool[this.rngPptr++] = this.rngPool[3];
  }

  seedTime(isRandom, times, seededRng) {
    if (isRandom) {
      this.seedIntRandom(seededRng);
    } else {
      this.seedInt(times);
    }
  }

  initPool(randomEngine, currentSeed, randomSeedTime, seededRng) {
    if (this.rngPool === null) {
      this.rngPool = new Array();
      this.Prng = new SimplePRNG([currentSeed, currentSeed + 60000 * 10]);
      
      if (this.randomCall) {
        const random1 = randomEngine === 0 ? this.Prng.randomv8() : randomEngine === 1 ? this.Prng.randomFF() : this.Prng.randomFF2();
      }
      
      while (this.rngPptr < this.rngPsize) {
        const random = randomEngine === 0 ? this.Prng.randomv8() : randomEngine === 1 ? this.Prng.randomFF() : this.Prng.randomFF2();
        const t = Math.floor(65536 * random);
        this.rngPool[this.rngPptr++] = t >>> 8;
        this.rngPool[this.rngPptr++] = t & 255;
      }
      this.rngPptr = 0;
      this.seedTime(false, randomSeedTime, seededRng);
    }
  }

  getByte(randomEngine, currentSeed, randomSeedTime, randomSeedTime2, seededRng) {
    this.initPool(randomEngine, currentSeed, randomSeedTime, seededRng);
    if (this.rngState === null) {
      this.seedTime(false, randomSeedTime2, seededRng);
      this.rngState = new ArcFour();
      this.rngState.init(this.rngPool);
      this.rngPool.fill(0);
      this.rngPptr = 0;
    }
    return this.rngState.next();
  }

  getBytes(byteArray, randomCall, randomEngine, currentSeed, randomSeedTime, randomSeedTime2, seededRng) {
    this.randomCall = randomCall;
    if (randomCall) {
      this.resetPool();
    }
    this.getByte(randomEngine, currentSeed, randomSeedTime, randomSeedTime2, seededRng);
    for (let i = 0; i < byteArray.length; ++i) {
      byteArray[i] = this.getByte(randomEngine, currentSeed, randomSeedTime, randomSeedTime2, seededRng);
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
    let i, j = 0, t;
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

function generateBitcoinAddress(publicKey) {
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

  const uncompressedAddress = generateBitcoinAddress(uncompressedPublicKey);
  const compressedAddress = generateBitcoinAddress(compressedPublicKey);

  return {
    privateKey: privateKey.toString("hex"),
    uncompressedPublicKey: uncompressedPublicKey.toString("hex"),
    compressedPublicKey: compressedPublicKey.toString("hex"),
    uncompressedAddress,
    compressedAddress,
  };
}

function loadCheckpoint(runId, workerId) {
  const checkpointPath = path.join("state", `run-${runId}-worker-${workerId}.json`);
  if (fs.existsSync(checkpointPath)) {
    return JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
  }
  return null;
}

function saveCheckpoint(runId, workerId, checkpoint) {
  const stateDir = "state";
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }
  const checkpointPath = path.join(stateDir, `run-${runId}-worker-${workerId}.json`);
  const tempPath = checkpointPath + ".tmp";
  fs.writeFileSync(tempPath, JSON.stringify(checkpoint, null, 2));
  fs.renameSync(tempPath, checkpointPath);
}

function appendResult(runId, result) {
  const resultsDir = "results";
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  const resultsPath = path.join(resultsDir, `run-${runId}.ndjson`);
  fs.appendFileSync(resultsPath, JSON.stringify(result) + "\n");
}

function runWorker(config) {
  const { runId, workerId, algo, startTs, endTs, runSeed, targetAddresses, telegramChatId, telegramSecret, checkpointIntervalMs = 5000 } = config;

  const targetSet = new Set(Object.keys(targetAddresses));
  
  const checkpoint = loadCheckpoint(runId, workerId);
  let cursor = checkpoint ? checkpoint.cursor : 0;
  let keysProcessed = checkpoint ? checkpoint.keysProcessed : 0;

  const totalTs = endTs - startTs;
  const jMax = 30000;
  const iMax = 11;
  const totalCursors = totalTs * jMax * iMax;

  const startTime = performance.now();
  let lastCheckpointTime = startTime;
  let lastProgressTime = startTime;

  const seededRng = new SeededRandom(runSeed + workerId);

  while (cursor < totalCursors) {
    const tsIdx = Math.floor(cursor / (jMax * iMax));
    const remainder = cursor % (jMax * iMax);
    const jIdx = Math.floor(remainder / iMax);
    const iIdx = remainder % iMax;

    if (tsIdx >= totalTs) break;

    const timestamp = startTs + tsIdx;
    const currentSeed = seededRng.range(startTs, endTs);
    const randomSeedTime = timestamp;
    let randomSeedTime2 = timestamp + jIdx;

    const rng = new RNG();

    const byteArray = new Array(32);
    rng.getBytes(byteArray, (iIdx + 1) % 5 === 0, algo, currentSeed, randomSeedTime, randomSeedTime2, seededRng);

    const byteArray2 = [...byteArray];
    byteArray2[31] = byteArray2[31] + 1;

    try {
      const { privateKey, compressedAddress, uncompressedAddress } = generateBitcoinKeys(byteArray);
      
      if (targetSet.has(compressedAddress) || targetSet.has(uncompressedAddress)) {
        const result = {
          address: compressedAddress,
          privateKey,
          timestamp: currentSeed,
          cursor,
          workerId,
          foundAt: new Date().toISOString()
        };
        appendResult(runId, result);
        console.log(`[Worker ${workerId}] Match found: ${compressedAddress}`);

        if (telegramChatId && telegramSecret) {
          const axios = require("axios");
          axios.get(`https://api.telegram.org/bot${telegramChatId}:${telegramSecret}/sendMessage?chat_id=${telegramChatId}&text=${JSON.stringify(result)}`).catch(console.error);
        }
      }

      const { privateKey: privateKey2, compressedAddress: compressedAddress2, uncompressedAddress: uncompressedAddress2 } = generateBitcoinKeys(byteArray2);
      
      if (targetSet.has(compressedAddress2) || targetSet.has(uncompressedAddress2)) {
        const result = {
          address: compressedAddress2,
          privateKey: privateKey2,
          timestamp: currentSeed,
          cursor,
          workerId,
          foundAt: new Date().toISOString()
        };
        appendResult(runId, result);
        console.log(`[Worker ${workerId}] Match found: ${compressedAddress2}`);

        if (telegramChatId && telegramSecret) {
          const axios = require("axios");
          axios.get(`https://api.telegram.org/bot${telegramChatId}:${telegramSecret}/sendMessage?chat_id=${telegramChatId}&text=${JSON.stringify(result)}`).catch(console.error);
        }
      }
    } catch (err) {
    }

    cursor++;
    keysProcessed += 2;

    const now = performance.now();
    
    if (now - lastProgressTime > 10000) {
      const elapsed = (now - startTime) / 1000;
      const kps = keysProcessed / elapsed;
      const progress = (cursor / totalCursors) * 100;
      console.log(`[Worker ${workerId}] Progress: ${progress.toFixed(2)}% | Keys: ${keysProcessed} | KPS: ${kps.toFixed(2)}`);
      lastProgressTime = now;
    }

    if (now - lastCheckpointTime > checkpointIntervalMs) {
      const elapsed = (now - startTime) / 1000;
      const kps = keysProcessed / elapsed;
      saveCheckpoint(runId, workerId, {
        cursor,
        keysProcessed,
        kps,
        lastUpdate: new Date().toISOString(),
        currentTs: timestamp,
        algo,
        progress: (cursor / totalCursors) * 100
      });
      lastCheckpointTime = now;
      
      if (process.send) {
        process.send({
          type: "progress",
          workerId,
          cursor,
          keysProcessed,
          kps,
          progress: (cursor / totalCursors) * 100
        });
      }
    }
  }

  const elapsed = (performance.now() - startTime) / 1000;
  const kps = keysProcessed / elapsed;
  saveCheckpoint(runId, workerId, {
    cursor,
    keysProcessed,
    kps,
    lastUpdate: new Date().toISOString(),
    currentTs: endTs,
    algo,
    progress: 100,
    completed: true
  });

  console.log(`[Worker ${workerId}] Completed. Total keys: ${keysProcessed}, KPS: ${kps.toFixed(2)}`);
  
  if (process.send) {
    process.send({
      type: "completed",
      workerId,
      keysProcessed,
      kps
    });
  }
}

if (require.main === module) {
  const config = JSON.parse(process.argv[2]);
  runWorker(config);
}

module.exports = { runWorker };
