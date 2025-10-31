import numpy as np
from numba import cuda, uint64, uint32, uint8
import math

# --- GPU Device Functions for secp256k1 Arithmetic ---
# Field prime for secp256k1
P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F
# Curve order
N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
# Base point (generator)
Gx = 55066263022277343669578718895168534326250603453777594175500187360389116729240
Gy = 32670510020758816978083085130507043184471273380659243275938904335757337482424

@cuda.jit(device=True)
def mod_add(a, b):
    res = a + b
    if res >= P:
        res -= P
    return res

@cuda.jit(device=True)
def mod_sub(a, b):
    res = a - b
    if res < 0:
        res += P
    return res

@cuda.jit(device=True)
def mod_mul(a, b):
    # 128-bit intermediate to avoid overflow
    return (a * b) % P

@cuda.jit(device=True)
def mod_inv(a):
    # Extended Euclidean Algorithm
    lm, hm = 1, 0
    low, high = a % P, P
    while low > 1:
        r = high // low
        nm = hm - lm * r
        new = high - low * r
        hm, lm = lm, nm
        high, low = low, new
    return lm % P

@cuda.jit(device=True)
def point_add(x1, y1, x2, y2):
    if x1 == x2 and y1 == ((-y2) % P):
        # Point at infinity
        return 0, 0
    if x1 == x2 and y1 == y2:
        # Use point doubling
        return point_double(x1, y1)
    # lambda = (y2 - y1) * inv(x2 - x1)
    lam = mod_mul(mod_sub(y2, y1), mod_inv(mod_sub(x2, x1)))
    x3 = mod_sub(mod_sub(mod_mul(lam, lam), x1), x2)
    y3 = mod_sub(mod_mul(lam, mod_sub(x1, x3)), y1)
    return x3, y3

@cuda.jit(device=True)
def point_double(x1, y1):
    # lambda = (3*x1^2) * inv(2*y1)
    lam = mod_mul(mod_mul(3, mod_mul(x1, x1)), mod_inv(mod_mul(2, y1)))
    x3 = mod_sub(mod_mul(lam, lam), mod_mul(2, x1))
    y3 = mod_sub(mod_mul(lam, mod_sub(x1, x3)), y1)
    return x3, y3

@cuda.jit(device=True)
def scalar_mul(k, x, y):
    # Double-and-add algorithm
    rx, ry = 0, 0  # Infinity
    bx, by = x, y
    while k > 0:
        if k & 1:
            if rx == 0 and ry == 0:
                rx, ry = bx, by
            else:
                rx, ry = point_add(rx, ry, bx, by)
        bx, by = point_double(bx, by)
        k >>= 1
    return rx, ry

# CUDA kernel
@cuda.jit

def brute_force_kernel(start_ts, end_ts, target_hashes, found_flags, seeds_out):
    idx = cuda.grid(1)
    total = end_ts - start_ts
    if idx >= total:
        return

    # Unique seed per thread
    ts = start_ts + idx
    # Simplified PRNG: replace with your algorithm
    seed = (ts ^ 0x5DEECE66D) & ((1 << 64) - 1)

    # Scalar multiply with generator G
    px, py = scalar_mul(seed, Gx, Gy)

    # Simple address hash: take first 8 bytes of x-coordinate
    addr_hash = uint64(px & 0xFFFFFFFFFFFFFFFF)

    # Compare against target list
    for i in range(target_hashes.shape[0]):
        if addr_hash == target_hashes[i]:
            found_flags[i] = 1
            seeds_out[i] = seed

# Host interface
def main():
    # Example parameters (replace accordingly)
    START_TS = np.int64(1609459200)  # Jan 1, 2021
    END_TS = np.int64(START_TS + 1000000)
    target_hash_list = [0x1234567890ABCDEF, 0xFEDCBA0987654321]

    # Prepare device buffers
    t_hashes = np.array(target_hash_list, dtype=np.uint64)
    found = np.zeros_like(t_hashes, dtype=np.uint8)
    seeds = np.zeros_like(t_hashes, dtype=np.uint64)

    d_hashes = cuda.to_device(t_hashes)
    d_found = cuda.to_device(found)
    d_seeds = cuda.to_device(seeds)

    total = int(END_TS - START_TS)
    threads_per_block = 256
    blocks = math.ceil(total / threads_per_block)

    # Launch GPU search
    brute_force_kernel[blocks, threads_per_block](START_TS, END_TS, d_hashes, d_found, d_seeds)

    # Retrieve results
    found_host = d_found.copy_to_host()
    seeds_host = d_seeds.copy_to_host()

    for i, f in enumerate(found_host):
        if f:
            print(f"Match for target {i}: seed={seeds_host[i]}")

if __name__ == "__main__":
    main()
