#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const path = require("node:path");

const reset = "\x1b[0m";
const cyan = "\x1b[36m";
const green = "\x1b[32m";
const yellow = "\x1b[33m";
const dim = "\x1b[2m";

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});

process.stdin.on("end", () => {
  let data = {};
  try {
    data = JSON.parse(input || "{}");
  } catch {
    data = {};
  }

  const model = data.model?.display_name || "Claude";
  const currentDir = data.workspace?.current_dir || data.cwd || process.cwd();
  const dirname = path.basename(currentDir) || currentDir;
  const branch = getBranch(data, currentDir);
  const pct = clamp(Math.floor(Number(data.context_window?.used_percentage ?? 0)), 0, 100);
  const cost = Number(data.cost?.total_cost_usd ?? 0);
  const durationMs = Number(data.cost?.total_duration_ms ?? 0);
  const duration = formatDuration(durationMs);
  const bar = progressBar(pct, 12);

  const branchPart = branch ? ` | 🌿 ${branch}` : "";
  console.log(`✦ ${cyan}[${model}]${reset} 📁 ${dirname}${branchPart} | ${green}${bar}${reset} ${pct}% | ${yellow}$${cost.toFixed(2)}${reset} | ⏱️ ${duration}`);
});

function getBranch(data, cwd) {
  if (data.worktree?.branch) return data.worktree.branch;

  try {
    return execFileSync("git", ["branch", "--show-current"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 100,
    }).trim();
  } catch {
    return "";
  }
}

function progressBar(pct, width) {
  const filled = Math.round((pct / 100) * width);
  return "█".repeat(filled) + `${dim}${"░".repeat(width - filled)}`;
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
