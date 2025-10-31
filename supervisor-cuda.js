const { fork, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

class SupervisorCuda {
  constructor(config) {
    this.config = config;
    this.workers = [];
    this.workerProcesses = [];
    this.runId = config.runId || `run-${Date.now()}`;
    this.saveManifest();
  }

  saveManifest() {
    const runsDir = "runs";
    if (!fs.existsSync(runsDir)) {
      fs.mkdirSync(runsDir, { recursive: true });
    }
    const manifestPath = path.join(runsDir, `${this.runId}.json`);
    fs.writeFileSync(manifestPath, JSON.stringify({
      runId: this.runId,
      algo: this.config.algo,
      startTs: this.config.startTs,
      endTs: this.config.endTs,
      workerCount: this.config.workerCount,
      cudaWorkerCount: this.config.cudaWorkerCount || 0,
      runSeed: this.config.runSeed,
      targetAddresses: this.config.targetAddresses,
      telegramChatId: this.config.telegramChatId,
      telegramSecret: this.config.telegramSecret,
      createdAt: new Date().toISOString(),
      status: "running"
    }, null, 2));
  }

  updateManifestStatus(status) {
    const runsDir = "runs";
    const manifestPath = path.join(runsDir, `${this.runId}.json`);
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      manifest.status = status;
      manifest.updatedAt = new Date().toISOString();
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    }
  }

  start() {
    const cpuWorkers = this.config.workerCount || 0;
    const gpuWorkers = this.config.cudaWorkerCount || 0;
    
    console.log(`Starting run ${this.runId} with ${cpuWorkers} CPU workers and ${gpuWorkers} GPU workers`);
    
    for (let i = 0; i < cpuWorkers; i++) {
      this.startCpuWorker(i);
    }
    
    for (let i = 0; i < gpuWorkers; i++) {
      this.startGpuWorker(cpuWorkers + i);
    }

    process.on("SIGINT", () => {
      console.log("\nReceived SIGINT, shutting down workers...");
      this.shutdown();
    });

    process.on("SIGTERM", () => {
      console.log("\nReceived SIGTERM, shutting down workers...");
      this.shutdown();
    });
  }

  startCpuWorker(workerId) {
    const workerConfig = {
      runId: this.runId,
      workerId,
      algo: this.config.algo,
      startTs: this.config.startTs,
      endTs: this.config.endTs,
      runSeed: this.config.runSeed,
      targetAddresses: this.config.targetAddresses,
      telegramChatId: this.config.telegramChatId,
      telegramSecret: this.config.telegramSecret,
      checkpointIntervalMs: this.config.checkpointIntervalMs || 5000
    };

    const workerProcess = fork("worker.js", [JSON.stringify(workerConfig)]);
    
    workerProcess.on("message", (msg) => {
      if (msg.type === "progress") {
        this.workers[workerId] = { ...msg, type: "cpu" };
      } else if (msg.type === "completed") {
        console.log(`CPU Worker ${workerId} completed`);
        this.workers[workerId] = { ...this.workers[workerId], completed: true };
        this.checkAllCompleted();
      }
    });

    workerProcess.on("exit", (code) => {
      console.log(`CPU Worker ${workerId} exited with code ${code}`);
      if (code !== 0 && !this.shuttingDown) {
        console.log(`Restarting CPU worker ${workerId}...`);
        setTimeout(() => this.startCpuWorker(workerId), 1000);
      }
    });

    this.workerProcesses[workerId] = workerProcess;
    this.workers[workerId] = { workerId, status: "starting", type: "cpu" };
  }

  startGpuWorker(workerId) {
    const workerConfig = {
      runId: this.runId,
      workerId,
      algo: this.config.algo,
      startTs: this.config.startTs,
      endTs: this.config.endTs,
      runSeed: this.config.runSeed,
      targetAddresses: this.config.targetAddresses,
      checkpointIntervalMs: this.config.checkpointIntervalMs || 5000
    };

    const workerProcess = spawn("python3", ["cuda-worker.py", JSON.stringify(workerConfig)]);
    
    workerProcess.stdout.on("data", (data) => {
      console.log(`[GPU Worker ${workerId}] ${data.toString().trim()}`);
    });

    workerProcess.stderr.on("data", (data) => {
      console.error(`[GPU Worker ${workerId} ERROR] ${data.toString().trim()}`);
    });

    workerProcess.on("exit", (code) => {
      console.log(`GPU Worker ${workerId} exited with code ${code}`);
      if (code !== 0 && !this.shuttingDown) {
        console.log(`Restarting GPU worker ${workerId}...`);
        setTimeout(() => this.startGpuWorker(workerId), 1000);
      } else {
        this.workers[workerId] = { ...this.workers[workerId], completed: true };
        this.checkAllCompleted();
      }
    });

    this.workerProcesses[workerId] = workerProcess;
    this.workers[workerId] = { workerId, status: "starting", type: "gpu" };
  }

  checkAllCompleted() {
    const allCompleted = this.workers.every(w => w.completed);
    if (allCompleted) {
      console.log("All workers completed!");
      this.updateManifestStatus("completed");
      process.exit(0);
    }
  }

  shutdown() {
    this.shuttingDown = true;
    this.updateManifestStatus("stopped");
    console.log("Shutting down all workers...");
    this.workerProcesses.forEach((proc, i) => {
      if (proc && !proc.killed) {
        console.log(`Killing worker ${i}`);
        proc.kill("SIGTERM");
      }
    });
    setTimeout(() => {
      console.log("Shutdown complete");
      process.exit(0);
    }, 2000);
  }

  getStatus() {
    return {
      runId: this.runId,
      workers: this.workers,
      totalKeysProcessed: this.workers.reduce((sum, w) => sum + (w.keysProcessed || 0), 0),
      avgKps: this.workers.reduce((sum, w) => sum + (w.kps || 0), 0),
      avgProgress: this.workers.reduce((sum, w) => sum + (w.progress || 0), 0) / this.workers.length
    };
  }
}

function loadConfig(configPath) {
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  }
  throw new Error(`Config file not found: ${configPath}`);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log("Usage: node supervisor-cuda.js <config.json>");
    console.log("   or: node supervisor-cuda.js --resume <runId>");
    process.exit(1);
  }

  let config;
  
  if (args[0] === "--resume") {
    const runId = args[1];
    const manifestPath = path.join("runs", `${runId}.json`);
    config = loadConfig(manifestPath);
    config.runId = runId;
    console.log(`Resuming run ${runId}`);
  } else {
    config = loadConfig(args[0]);
  }

  const supervisor = new SupervisorCuda(config);
  supervisor.start();

  setInterval(() => {
    const status = supervisor.getStatus();
    console.log(`\n=== Status ===`);
    console.log(`Run ID: ${status.runId}`);
    console.log(`Total Keys: ${status.totalKeysProcessed}`);
    console.log(`Total KPS: ${status.avgKps.toFixed(2)}`);
    console.log(`Avg Progress: ${status.avgProgress.toFixed(2)}%`);
    status.workers.forEach(w => {
      if (w.keysProcessed) {
        console.log(`  ${w.type.toUpperCase()} Worker ${w.workerId}: ${w.progress.toFixed(2)}% | ${w.keysProcessed} keys | ${w.kps.toFixed(2)} KPS`);
      }
    });
  }, 30000);
}

module.exports = { SupervisorCuda };
