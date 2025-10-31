#!/usr/bin/env python3
import sys
import json
import os
import time
import hashlib
from pathlib import Path

try:
    import numpy as np
    from numba import cuda
    import secp256k1
except ImportError as e:
    print(f"Error: Missing required package: {e}", file=sys.stderr)
    print("Install with: pip install numpy numba pysecp256k1", file=sys.stderr)
    sys.exit(1)

def hash160(data):
    sha256_hash = hashlib.sha256(data).digest()
    ripemd160_hash = hashlib.new('ripemd160', sha256_hash).digest()
    return ripemd160_hash

def base58check_encode(payload):
    alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
    checksum = hashlib.sha256(hashlib.sha256(payload).digest()).digest()[:4]
    num = int.from_bytes(payload + checksum, 'big')
    encoded = ''
    while num > 0:
        num, remainder = divmod(num, 58)
        encoded = alphabet[remainder] + encoded
    for byte in payload:
        if byte == 0:
            encoded = '1' + encoded
        else:
            break
    return encoded

def generate_bitcoin_address(public_key_bytes):
    version = b'\x00'
    pubkey_hash = hash160(public_key_bytes)
    return base58check_encode(version + pubkey_hash)

def load_checkpoint(run_id, worker_id):
    checkpoint_path = Path("state") / f"run-{run_id}-worker-{worker_id}.json"
    if checkpoint_path.exists():
        with open(checkpoint_path, 'r') as f:
            return json.load(f)
    return None

def save_checkpoint(run_id, worker_id, checkpoint):
    state_dir = Path("state")
    state_dir.mkdir(exist_ok=True)
    checkpoint_path = state_dir / f"run-{run_id}-worker-{worker_id}.json"
    temp_path = checkpoint_path.with_suffix('.json.tmp')
    with open(temp_path, 'w') as f:
        json.dump(checkpoint, f, indent=2)
    temp_path.rename(checkpoint_path)

def append_result(run_id, result):
    results_dir = Path("results")
    results_dir.mkdir(exist_ok=True)
    results_path = results_dir / f"run-{run_id}.ndjson"
    with open(results_path, 'a') as f:
        f.write(json.dumps(result) + '\n')

class SimplePRNG:
    def __init__(self, seed):
        self.seed = seed & 0xFFFFFFFF
        self.a = 1664525
        self.c = 1013904223
        self.m = 0x100000000
        
    def next(self):
        self.seed = (self.a * self.seed + self.c) % self.m
        return self.seed
    
    def next_float(self):
        return self.next() / self.m

def generate_private_key_bytes(cursor, run_seed, algo):
    prng = SimplePRNG(run_seed + cursor)
    
    byte_array = []
    for _ in range(32):
        byte_array.append(prng.next() & 0xFF)
    
    return bytes(byte_array)

def run_cuda_worker(config):
    run_id = config['runId']
    worker_id = config['workerId']
    algo = config['algo']
    start_ts = config['startTs']
    end_ts = config['endTs']
    run_seed = config['runSeed']
    target_addresses = set(config['targetAddresses'].keys())
    checkpoint_interval_ms = config.get('checkpointIntervalMs', 5000)
    
    checkpoint = load_checkpoint(run_id, worker_id)
    cursor = checkpoint['cursor'] if checkpoint else 0
    keys_processed = checkpoint['keysProcessed'] if checkpoint else 0
    
    total_ts = end_ts - start_ts
    j_max = 30000
    i_max = 11
    total_cursors = total_ts * j_max * i_max
    
    start_time = time.time()
    last_checkpoint_time = start_time
    last_progress_time = start_time
    
    print(f"[CUDA Worker {worker_id}] Starting from cursor {cursor}/{total_cursors}")
    
    batch_size = 10000
    
    while cursor < total_cursors:
        batch_end = min(cursor + batch_size, total_cursors)
        
        for c in range(cursor, batch_end):
            try:
                private_key_bytes = generate_private_key_bytes(c, run_seed, algo)
                
                privkey = secp256k1.PrivateKey(private_key_bytes)
                pubkey_uncompressed = privkey.pubkey.serialize(compressed=False)
                pubkey_compressed = privkey.pubkey.serialize(compressed=True)
                
                addr_uncompressed = generate_bitcoin_address(pubkey_uncompressed)
                addr_compressed = generate_bitcoin_address(pubkey_compressed)
                
                if addr_compressed in target_addresses or addr_uncompressed in target_addresses:
                    result = {
                        'address': addr_compressed,
                        'privateKey': private_key_bytes.hex(),
                        'cursor': c,
                        'workerId': worker_id,
                        'foundAt': time.strftime('%Y-%m-%dT%H:%M:%S')
                    }
                    append_result(run_id, result)
                    print(f"[CUDA Worker {worker_id}] Match found: {addr_compressed}")
                
                keys_processed += 2
                
            except Exception as e:
                pass
        
        cursor = batch_end
        
        now = time.time()
        
        if now - last_progress_time > 10:
            elapsed = now - start_time
            kps = keys_processed / elapsed if elapsed > 0 else 0
            progress = (cursor / total_cursors) * 100
            print(f"[CUDA Worker {worker_id}] Progress: {progress:.2f}% | Keys: {keys_processed} | KPS: {kps:.2f}")
            last_progress_time = now
        
        if now - last_checkpoint_time > (checkpoint_interval_ms / 1000):
            elapsed = now - start_time
            kps = keys_processed / elapsed if elapsed > 0 else 0
            save_checkpoint(run_id, worker_id, {
                'cursor': cursor,
                'keysProcessed': keys_processed,
                'kps': kps,
                'lastUpdate': time.strftime('%Y-%m-%dT%H:%M:%S'),
                'algo': algo,
                'progress': (cursor / total_cursors) * 100
            })
            last_checkpoint_time = now
    
    elapsed = time.time() - start_time
    kps = keys_processed / elapsed if elapsed > 0 else 0
    save_checkpoint(run_id, worker_id, {
        'cursor': cursor,
        'keysProcessed': keys_processed,
        'kps': kps,
        'lastUpdate': time.strftime('%Y-%m-%dT%H:%M:%S'),
        'algo': algo,
        'progress': 100,
        'completed': True
    })
    
    print(f"[CUDA Worker {worker_id}] Completed. Total keys: {keys_processed}, KPS: {kps:.2f}")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python cuda-worker.py '<config_json>'", file=sys.stderr)
        sys.exit(1)
    
    config = json.loads(sys.argv[1])
    run_cuda_worker(config)
