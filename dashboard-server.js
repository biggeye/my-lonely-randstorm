const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

function getAllRuns() {
  const runsDir = "runs";
  if (!fs.existsSync(runsDir)) {
    return [];
  }
  
  const files = fs.readdirSync(runsDir).filter(f => f.endsWith(".json"));
  return files.map(f => {
    const content = fs.readFileSync(path.join(runsDir, f), "utf8");
    return JSON.parse(content);
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getRunStatus(runId) {
  const stateDir = "state";
  if (!fs.existsSync(stateDir)) {
    return { workers: [], totalKeysProcessed: 0, avgKps: 0, avgProgress: 0 };
  }
  
  const files = fs.readdirSync(stateDir).filter(f => f.startsWith(`run-${runId}-worker-`) && f.endsWith(".json"));
  const workers = files.map(f => {
    const content = fs.readFileSync(path.join(stateDir, f), "utf8");
    return JSON.parse(content);
  });
  
  const totalKeysProcessed = workers.reduce((sum, w) => sum + (w.keysProcessed || 0), 0);
  const avgKps = workers.reduce((sum, w) => sum + (w.kps || 0), 0);
  const avgProgress = workers.length > 0 ? workers.reduce((sum, w) => sum + (w.progress || 0), 0) / workers.length : 0;
  
  return {
    workers,
    totalKeysProcessed,
    avgKps,
    avgProgress
  };
}

function getRunResults(runId) {
  const resultsPath = path.join("results", `run-${runId}.ndjson`);
  if (!fs.existsSync(resultsPath)) {
    return [];
  }
  
  const content = fs.readFileSync(resultsPath, "utf8");
  return content.trim().split("\n").filter(line => line).map(line => JSON.parse(line));
}

app.get("/api/runs", (req, res) => {
  try {
    const runs = getAllRuns();
    res.json(runs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/runs/:runId", (req, res) => {
  try {
    const { runId } = req.params;
    const manifestPath = path.join("runs", `${runId}.json`);
    
    if (!fs.existsSync(manifestPath)) {
      return res.status(404).json({ error: "Run not found" });
    }
    
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const status = getRunStatus(runId);
    const results = getRunResults(runId);
    
    res.json({
      ...manifest,
      ...status,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/runs/:runId/status", (req, res) => {
  try {
    const { runId } = req.params;
    const status = getRunStatus(runId);
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/runs/:runId/results", (req, res) => {
  try {
    const { runId } = req.params;
    const results = getRunResults(runId);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/metrics", (req, res) => {
  try {
    const runs = getAllRuns();
    const activeRuns = runs.filter(r => r.status === "running");
    
    let totalKeysProcessed = 0;
    let totalKps = 0;
    
    activeRuns.forEach(run => {
      const status = getRunStatus(run.runId);
      totalKeysProcessed += status.totalKeysProcessed;
      totalKps += status.avgKps;
    });
    
    res.json({
      totalRuns: runs.length,
      activeRuns: activeRuns.length,
      completedRuns: runs.filter(r => r.status === "completed").length,
      stoppedRuns: runs.filter(r => r.status === "stopped").length,
      totalKeysProcessed,
      totalKps
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Dashboard server running on http://localhost:${PORT}`);
  console.log(`View dashboard at http://localhost:${PORT}/dashboard.html`);
});
