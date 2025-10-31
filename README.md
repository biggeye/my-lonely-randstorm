# Mimic BitcoinJSLib Randstorm

**Version:** 2.0.0

**Description:** This tool exploits a weakness in early Bitcoin wallets, specifically those created between 2011 and 2014, which may have used weak or predictable random number generators. Some of these wallets might be vulnerable to key prediction if the random seed was known or guessed, but this is not guaranteed. The tool is for educational purposes only and should **never** be used on real, production wallets. Always use secure cryptographic methods for key generation.

---

## 🚀 New Features in v2.0

- **Progress Tracking & Persistence:** Automatic checkpointing allows runs to be paused and resumed without losing progress
- **Deterministic Execution:** Reproducible key generation for reliable resume capability
- **Multi-Worker Architecture:** Supervisor process manages multiple CPU and GPU workers
- **GPU Acceleration:** CUDA-based workers for faster key generation (requires CUDA-capable GPU)
- **Web Dashboard:** Real-time monitoring of runs, workers, and results via web interface
- **NDJSON Results:** Structured, line-delimited JSON output for easy parsing
- **Atomic Checkpoints:** Corruption-proof progress saves using atomic file operations

---

## Features

- **Bitcoin Key Generation:** Generates Bitcoin private keys, public keys, and addresses based on random number generation
- **Custom Randomness Algorithms:** Simulate different random number generation techniques (e.g., `Math.random()`, custom PRNGs)
- **Brute Force Search:** Searches for matching Bitcoin addresses from a predefined list of target addresses
- **Telegram Notifications:** Alerts you when a matching address is found, with detailed private key information
- **Multi-Process Execution:** Supports running multiple CPU and GPU processes in parallel for faster brute-forcing
- **Progress Tracking:** Automatic checkpointing every 5 seconds (configurable)
- **Resume Capability:** Resume interrupted runs from the last checkpoint
- **Web Dashboard:** Monitor all runs, workers, and results in real-time

---

## Table of Contents

1. [Installation](#installation)
2. [Usage](#usage)
   - [Quick Start](#quick-start)
   - [Configuration](#configuration)
   - [Running with CPU Workers](#running-with-cpu-workers)
   - [Running with GPU Workers](#running-with-gpu-workers)
   - [Resuming a Run](#resuming-a-run)
   - [Web Dashboard](#web-dashboard)
3. [Architecture](#architecture)
4. [Key Generation Logic](#key-generation-logic)
5. [Important Notes](#important-notes)
6. [Security Considerations](#security-considerations)
7. [License](#license)
8. [Disclaimer](#disclaimer)

---

## Installation

To get started, follow these steps:

1. **Clone the repository:**

   ```bash
   git clone https://github.com/yourusername/mimic-bitcoinjslib-randstorm.git
   cd mimic-bitcoinjslib-randstorm
   ```

2. **Install dependencies:**

   Make sure you have [Node.js](https://nodejs.org/) installed. Then, run:
   `npm install`

## Usage

### Quick Start

1. **Create a configuration file** (or use the provided examples):
   ```bash
   cp config.example.json my-config.json
   ```

2. **Edit the configuration** to set your parameters:
   - `algo`: Algorithm choice (0, 1, or 2)
   - `startTs`: Start timestamp in milliseconds
   - `endTs`: End timestamp in milliseconds
   - `workerCount`: Number of CPU workers
   - `cudaWorkerCount`: Number of GPU workers (optional)
   - `targetAddresses`: Bitcoin addresses to search for

3. **Start the run:**
   ```bash
   npm start
   ```

4. **Start the web dashboard** (in a separate terminal):
   ```bash
   npm run dashboard
   ```
   Then open http://localhost:3000/dashboard.html in your browser.

### Configuration

Configuration files are JSON format with the following structure:

```json
{
  "runId": "my-run-1",
  "algo": 0,
  "startTs": 1733259991530,
  "endTs": 1733269991529,
  "workerCount": 2,
  "cudaWorkerCount": 0,
  "runSeed": 12345,
  "targetAddresses": {
    "183RJpEcTPtr4kCRLeAfLNTnFLxjRFa29J": true,
    "1HhZ9gUMD7qcdkQXZWUdwfajCZ92t8eh9W": true
  },
  "telegramChatId": "",
  "telegramSecret": "",
  "checkpointIntervalMs": 5000
}
```

**Parameters:**
- `runId`: Unique identifier for this run
- `algo`: Random algorithm (0 = randomv8, 1 = randomFF, 2 = randomFF2)
- `startTs`/`endTs`: Timestamp range to search (milliseconds)
- `workerCount`: Number of CPU worker processes
- `cudaWorkerCount`: Number of GPU worker processes (requires CUDA)
- `runSeed`: Seed for deterministic random number generation
- `targetAddresses`: Object with Bitcoin addresses as keys
- `telegramChatId`/`telegramSecret`: Optional Telegram bot credentials
- `checkpointIntervalMs`: How often to save progress (default: 5000ms)

### Running with CPU Workers

Run with CPU workers only:

```bash
node supervisor.js my-config.json
```

Or use the npm script:
```bash
npm start
```

### Running with GPU Workers

Run with both CPU and GPU workers:

```bash
node supervisor-cuda.js config-gpu.example.json
```

Or use the npm script:
```bash
npm run start:gpu
```

**Requirements for GPU workers:**
- CUDA-capable GPU
- CUDA toolkit installed
- Python 3 with numpy, numba, and pysecp256k1

### Resuming a Run

If a run is interrupted, you can resume it from the last checkpoint:

```bash
node supervisor.js --resume <runId>
```

Or for GPU runs:
```bash
node supervisor-cuda.js --resume <runId>
```

The run will continue from where it left off, using the saved checkpoint files in the `state/` directory.

### Web Dashboard

Start the web dashboard server:

```bash
npm run dashboard
```

Then open your browser to:
```
http://localhost:3000/dashboard.html
```

The dashboard provides:
- Real-time metrics (total runs, active runs, keys processed, KPS)
- List of all runs with status and progress
- Per-worker statistics
- Found keys display
- Auto-refresh every 5 seconds

---

## Architecture

The new architecture consists of several components:

### Components

1. **Supervisor (`supervisor.js` / `supervisor-cuda.js`)**
   - Manages worker processes
   - Handles checkpointing and resume
   - Aggregates metrics
   - Responds to SIGINT/SIGTERM for graceful shutdown

2. **Worker (`worker.js`)**
   - CPU-based key generation
   - Deterministic cursor-based iteration
   - Periodic progress reporting via IPC
   - Atomic checkpoint saves

3. **CUDA Worker (`cuda-worker.py`)**
   - GPU-accelerated key generation
   - Compatible with supervisor architecture
   - Same checkpoint/resume protocol as CPU workers

4. **Dashboard Server (`dashboard-server.js`)**
   - Express-based REST API
   - Serves metrics, run status, and results
   - Static file serving for web UI

5. **Web Dashboard (`public/dashboard.html`)**
   - Real-time monitoring interface
   - Progress visualization
   - Worker statistics
   - Results display

### Directory Structure

```
my-lonely-randstorm/
├── runs/              # Run manifests (configuration snapshots)
├── state/             # Worker checkpoint files
├── results/           # Found keys (NDJSON format)
├── public/            # Web dashboard static files
├── worker.js          # CPU worker implementation
├── cuda-worker.py     # GPU worker implementation
├── supervisor.js      # CPU supervisor
├── supervisor-cuda.js # CPU+GPU supervisor
├── dashboard-server.js # Web API server
└── config.example.json # Example configuration
```

---

## Key Generation Logic

The script follows these steps to generate Bitcoin keys:

1.  **Generate a Private Key:** A random 32-byte value is generated as the private key.
2.  **Generate the Public Key:** The public key is derived from the private key using secp256k1 elliptic curve cryptography.
3.  **Generate Bitcoin Address:** The public key is hashed using SHA-256 and RIPEMD-160 to generate the Bitcoin address (either compressed or uncompressed).
4.  **Brute Force Search:** The generated addresses are compared against a list of target addresses (`keysToFind.json`). If a match is found, the private key and address details are saved to a file and sent via Telegram (if configured).

---

## Important Notes

- **Educational Purposes Only:** This tool is for educational use only. It should not be used to attempt unauthorized access to Bitcoin wallets or addresses.
- **Target Addresses:** The script requires a list of Bitcoin addresses to check against. This list should be provided in the `keysToFind.json` file.
- **Security Warning:** This tool is to brute force vulnerabilities in weak random number generation which was then used to generate some early bitcoin wallets. Do not use this tool for generating real Bitcoin keys in production. Always use secure cryptographic libraries and randomness sources in production.
- **No Guarantee of Success:** There is **no guarantee** that you will successfully find matching Bitcoin private keys or addresses using this tool. The process depends on many factors, including randomness and the specific address you're searching for, time, `Math.random` Algorithm was used, and assuming there wasn't any additional entropy added then adding timestamp two time (in first 8 bytes)

---

## Security Considerations

- **Move Funds:** If you suspect that your Bitcoin wallet was generated using insecure randomness (e.g., weak PRNG), **move your funds** to a new wallet immediately.
- **Use Secure Randomness:** For secure key generation in real-world applications, avoid using weak random number generators like `Math.random()` and instead rely on well-established libraries that provide secure randomness.
- **Ethical Use:** This tool is designed for **ethical and educational purposes only**. Any misuse could have legal consequences.

---

## License

This project is licensed under the MIT License - see the LICENSE file for details.

---

## Disclaimer

This tool is for **educational purposes only**. By using this software, you acknowledge that you are using it responsibly and ethically. Unauthorized or malicious use may result in legal consequences, and the author(s) will not be held responsible for any damages arising from its use.

## Legacy Mode

The original `index.js` implementation is still available for backward compatibility:

```bash
npm run legacy
```

This runs the old multi-process approach using `concurrently`. However, it lacks progress tracking, checkpointing, and resume capability.

---

## Changelog

### v2.0.0
- Added progress tracking and checkpointing
- Implemented deterministic cursor-based iteration
- Added supervisor/worker architecture
- Integrated CUDA GPU acceleration
- Built web dashboard for monitoring
- Fixed bugs in original implementation (Math.random, uninitialized variables, file writes)
- Added resume capability
- Converted results to NDJSON format
- Added atomic checkpoint saves

### v1.0.0
- Initial release
- Basic brute force functionality
- Multi-process execution with concurrently

---

## Support

If you found this tool helpful and would like to support, please consider donating to the following Bitcoin address to encourage further development:

- **Bitcoin Address:** bc1qmd56dyaudv4mzvjmxdgugklpntc3t07527vls3
