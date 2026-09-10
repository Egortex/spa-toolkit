import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { scenarios } from "./scenarios";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, "..", "..", "results");

interface FrameworkResult {
	framework: string;
	measuredAt: string;
	scenarios: Record<string, { medianMs: number }>;
	memoryMb?: { afterFirstCycle: number; afterFiveCycles: number };
	bundle: { rawKb: number; gzipKb: number; fileCount: number };
}

if (!existsSync(RESULTS_DIR)) {
	console.error(`No results directory at ${RESULTS_DIR} — run "pnpm --filter @bench/harness run bench -- <framework>" first.`);
	process.exit(1);
}

const files = readdirSync(RESULTS_DIR).filter((f) => f.endsWith(".json"));
if (files.length === 0) {
	console.error("No result files found.");
	process.exit(1);
}

const results: FrameworkResult[] = files.map((f) => JSON.parse(readFileSync(join(RESULTS_DIR, f), "utf-8")));
results.sort((a, b) => a.framework.localeCompare(b.framework));

const lines: string[] = [];
lines.push("# Benchmark results\n");
lines.push(`Generated ${new Date().toISOString()}. Median of repeated runs (first run discarded as warm-up); see [SPEC.md](../SPEC.md) for exact scenario definitions and [harness](../harness) for methodology.\n`);

lines.push(`| Scenario | ${results.map((r) => r.framework).join(" | ")} |`);
lines.push(`|---|${results.map(() => "---").join("|")}|`);
for (const scenario of scenarios) {
	const row = results.map((r) => {
		const value = r.scenarios[scenario.id];
		return value ? `${value.medianMs.toFixed(1)} ms` : "—";
	});
	lines.push(`| ${scenario.label} | ${row.join(" | ")} |`);
}

lines.push("");
lines.push(`| Metric | ${results.map((r) => r.framework).join(" | ")} |`);
lines.push(`|---|${results.map(() => "---").join("|")}|`);
lines.push(`| Bundle size (gzip) | ${results.map((r) => `${r.bundle.gzipKb.toFixed(1)} KB`).join(" | ")} |`);
lines.push(`| Bundle size (raw) | ${results.map((r) => `${r.bundle.rawKb.toFixed(1)} KB`).join(" | ")} |`);
lines.push(`| Heap after 1 create/clear cycle | ${results.map((r) => (r.memoryMb ? `${r.memoryMb.afterFirstCycle.toFixed(1)} MB` : "—")).join(" | ")} |`);
lines.push(`| Heap after 5 create/clear cycles | ${results.map((r) => (r.memoryMb ? `${r.memoryMb.afterFiveCycles.toFixed(1)} MB` : "—")).join(" | ")} |`);
lines.push(`| Heap growth (5 vs 1 cycle) — leak signal | ${results.map((r) => (r.memoryMb ? `${(r.memoryMb.afterFiveCycles - r.memoryMb.afterFirstCycle).toFixed(1)} MB` : "—")).join(" | ")} |`);

const output = lines.join("\n") + "\n";
writeFileSync(join(RESULTS_DIR, "REPORT.md"), output);
console.log(output);
