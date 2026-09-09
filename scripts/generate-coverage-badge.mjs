#!/usr/bin/env node
// Reads <package>/coverage/coverage-summary.json (produced by vitest's "json-summary"
// coverage reporter) and writes <package>/coverage-badge.json in shields.io's "endpoint"
// badge format: https://shields.io/badges/endpoint-badge
//
// The README badge points at this file via raw.githubusercontent.com, so shields.io
// re-fetches it (and re-renders the badge) on every view — no shields.io-side caching
// of the *value*, only of the rendered image for a few minutes. CI re-generates and
// commits this file on every push to main, keeping the number live.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const pkgDir = process.argv[2];
if (!pkgDir) {
	console.error("Usage: node scripts/generate-coverage-badge.mjs <package-dir>");
	process.exit(1);
}

const summaryPath = resolve(pkgDir, "coverage/coverage-summary.json");
const summary = JSON.parse(readFileSync(summaryPath, "utf8"));

const metrics = ["lines", "statements", "functions", "branches"];
const pct = Math.min(...metrics.map((metric) => summary.total[metric].pct));

const color = pct === 100 ? "brightgreen" : pct >= 90 ? "green" : pct >= 75 ? "yellow" : "red";

const badge = {
	schemaVersion: 1,
	label: "coverage",
	message: `${pct}%`,
	color,
};

writeFileSync(resolve(pkgDir, "coverage-badge.json"), `${JSON.stringify(badge, null, "\t")}\n`);
console.log(`Wrote ${resolve(pkgDir, "coverage-badge.json")}: ${badge.message} (${color})`);
