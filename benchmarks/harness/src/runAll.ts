import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HARNESS_DIR = join(__dirname, "..");
const APPS_DIR = join(HARNESS_DIR, "..", "apps");

// Optional first arg: number of passes per framework (forwarded to runner.ts). Defaults to 1.
const passes = process.argv[2] ?? "1";

const frameworks = readdirSync(APPS_DIR, { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map((entry) => entry.name)
	.sort();

function run(command: string, args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { cwd: HARNESS_DIR, stdio: "inherit", shell: true });
		child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`"${command} ${args.join(" ")}" exited with code ${code}`))));
	});
}

async function main(): Promise<void> {
	console.log(`Found ${frameworks.length} app(s): ${frameworks.join(", ")}`);
	console.log(`Running each sequentially, ${passes} pass(es) per app — this can take a while.\n`);

	const failed: string[] = [];
	for (const framework of frameworks) {
		console.log(`\n########## ${framework} ##########`);
		try {
			// A fresh child process per framework (not a shared in-process loop): runner.ts
			// launches its own browser/preview server per invocation, and running each
			// framework in total isolation is what's actually been reliable here — a shared
			// process accumulating state/handles across 5 frameworks is exactly the kind of
			// thing that caused slowdowns/crashes earlier.
			await run("npx", ["tsx", "src/runner.ts", framework, passes]);
		} catch (error) {
			failed.push(framework);
			console.error(`!! ${framework} run failed:`, error instanceof Error ? error.message : error);
		}
	}

	console.log("\nGenerating comparison report...");
	await run("npx", ["tsx", "src/report.ts"]);

	if (failed.length > 0) {
		console.error(`\nDone, but these app(s) failed to produce results: ${failed.join(", ")}. See benchmarks/results/*.json for what did complete.`);
		process.exitCode = 1;
	} else {
		console.log("\nAll frameworks done. See benchmarks/results/REPORT.md.");
	}
}

void main();
