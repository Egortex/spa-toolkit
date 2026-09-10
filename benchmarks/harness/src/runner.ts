import { execFile, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";
import { scenarios } from "./scenarios";
import { measureHeapUsedMb, median } from "./metrics";
import { measureBundleSize } from "./bundleSize";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");
const APPS_DIR = join(REPO_ROOT, "benchmarks", "apps");
const RESULTS_DIR = join(REPO_ROOT, "benchmarks", "results");
// Overridable so multiple frameworks can be benchmarked concurrently (separate processes,
// separate ports) instead of only ever sequentially on the one hardcoded port.
const PORT = Number(process.env.BENCH_PORT ?? "4173");
const BASE_URL = `http://localhost:${PORT}`;

const framework = process.argv[2];
const passes = Number(process.argv[3] ?? "1") || 1;
if (!framework) {
	console.error("Usage: pnpm --filter @bench/harness run bench -- <framework> [passes]");
	process.exit(1);
}

const appDir = join(APPS_DIR, framework);
if (!existsSync(appDir)) {
	console.error(`No app at ${appDir}`);
	process.exit(1);
}

/**
 * Refuses to proceed if `port` is already serving *anything*. This is not paranoia:
 * a stale/orphaned preview server from a previous (e.g. hung) run left port 4173 occupied
 * by a DIFFERENT framework's app once — `--strictPort` failed silently (an npm/pnpm arg-
 * forwarding quirk swallowed the flag), `vite preview` fell back to 4174 for the new app,
 * but `waitForServer` below happily found something responding on the OLD port 4173 and
 * declared the (wrong) server ready. The harness would have silently measured the stale
 * app under the new framework's name. Checking first turns that into a loud, immediate
 * failure instead of corrupted results.
 */
async function assertPortFree(port: number): Promise<void> {
	const occupied = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1000) })
		.then(() => true)
		.catch(() => false);
	if (occupied) {
		throw new Error(
			`Port ${port} is already serving something. Refusing to start: a stale server here ` +
			`would make this run silently measure the WRONG app. Free it first, e.g.:\n` +
			`  netstat -ano | findstr :${port}\n  taskkill /F /PID <that pid>`,
		);
	}
}

function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	return new Promise((resolve, reject) => {
		const tryOnce = () => {
			fetch(url)
				.then(() => resolve())
				.catch(() => {
					if (Date.now() > deadline) reject(new Error(`Server at ${url} did not start in time`));
					else setTimeout(tryOnce, 300);
				});
		};
		tryOnce();
	});
}

/**
 * `child.kill()` alone only signals the immediate process. Since `startPreviewServer`
 * spawns with `shell: true` (Windows: cmd.exe -> pnpm -> vite preview), that only kills
 * cmd.exe — the actual `vite preview` node process survives as an orphan, its inherited
 * stdout/stderr pipes still open and referenced by this process, which is exactly why
 * the runner never returned control to the terminal on its own after printing "Done...".
 * `taskkill /T` kills the whole process tree rooted at that PID; POSIX doesn't have this
 * problem the same way, so a plain `.kill()` is enough there.
 *
 * This MUST be awaited by the caller. `execFile` is itself async, and `main()` calls
 * `process.exit()` right after settling — firing `taskkill` and not waiting for it let
 * the harness's own process exit before `taskkill` finished enumerating/killing the tree,
 * leaving `vite preview` orphaned on the port for the *next* run to trip over
 * (`assertPortFree` refusing to start, or worse if that guard weren't there).
 */
function killTree(child: ChildProcess): Promise<void> {
	if (!child.pid) return Promise.resolve();
	if (process.platform === "win32") {
		return new Promise((resolve) => {
			execFile("taskkill", ["/PID", String(child.pid), "/T", "/F"], () => resolve());
		});
	}
	child.kill();
	return Promise.resolve();
}

function startPreviewServer(): ChildProcess {
	const child = spawn(
		"pnpm",
		["--filter", `@bench/${framework}`, "run", "preview", "--", "--port", String(PORT), "--strictPort"],
		{ cwd: REPO_ROOT, stdio: ["ignore", "pipe", "pipe"], shell: true },
	);
	child.stdout?.on("data", (chunk) => process.stdout.write(`[${framework} preview] ${chunk}`));
	child.stderr?.on("data", (chunk) => process.stderr.write(`[${framework} preview] ${chunk}`));
	return child;
}

async function main(): Promise<void> {
	console.log(`Building ${framework}...`);
	await new Promise<void>((resolve, reject) => {
		const build = spawn("pnpm", ["--filter", `@bench/${framework}`, "run", "build"], {
			cwd: REPO_ROOT,
			stdio: "inherit",
			shell: true,
		});
		build.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`build failed with code ${code}`))));
	});

	await assertPortFree(PORT);

	console.log(`Starting preview server for ${framework} on port ${PORT}...`);
	const server = startPreviewServer();
	try {
		await waitForServer(BASE_URL);

		const launchBrowser = () => chromium.launch({ headless: true, args: ["--js-flags=--expose-gc"] });
		let browser = await launchBrowser();

		// A fresh page per scenario, not one shared page for the whole run: some scenarios
		// (100k rows = 400k+ DOM nodes with listeners) can crash the renderer process — and
		// on this harness that has, in practice, taken the whole browser process down with
		// it, not just the one tab. If every scenario shared one page/browser, a single crash
		// would cascade and fail everything downstream in the same run — a harness robustness
		// bug, not a real per-scenario result. So: fresh page per scenario, and if even
		// `newPage()` fails (browser itself died), relaunch the browser and keep going —
		// a scenario that legitimately crashes the browser is still a valid (bad) result for
		// that one scenario, it just shouldn't take the rest of the run down with it.
		const getPage = async (): Promise<import("playwright").Page> => {
			try {
				return await browser.newPage();
			} catch {
				console.warn("  (browser process appears to have crashed — relaunching)");
				await browser.close().catch(() => undefined);
				browser = await launchBrowser();
				return browser.newPage();
			}
		};

		// `passes` full repeats of the whole suite, samples pooled per scenario across all
		// passes before taking the final median — smooths out cross-run noise (browser
		// startup jitter, background system load) that a single run's internal warm-up
		// discard doesn't catch.
		const allSamples: Record<string, number[]> = {};
		const memorySamples: { afterFirstCycle: number[]; afterFiveCycles: number[] } = { afterFirstCycle: [], afterFiveCycles: [] };
		let anyScenarioFailed = false;

		for (let pass = 1; pass <= passes; pass++) {
			if (passes > 1) console.log(`\n=== Pass ${pass}/${passes} ===`);

			for (const scenario of scenarios) {
				console.log(`Running scenario: ${scenario.label}`);
				const page = await getPage();
				try {
					const result = await scenario.run({ page, baseUrl: BASE_URL });
					(allSamples[scenario.id] ??= []).push(...result.samples);
					console.log(`  -> ${result.medianMs.toFixed(2)}ms (pass median)`);
				} catch (error) {
					anyScenarioFailed = true;
					console.error(`  !! scenario "${scenario.id}" failed:`, error instanceof Error ? error.message : error);
				} finally {
					await page.close().catch(() => undefined);
				}
			}

			console.log("Measuring memory (5x create/clear 10k rows)...");
			const page = await getPage();
			try {
				await page.goto(`${BASE_URL}/table`, { waitUntil: "load" });
				// state: "attached" (not the default "visible") — an empty <table> with no
				// rows yet can compute to a zero-size box, which Playwright treats as "hidden".
				await page.waitForSelector("#table", { state: "attached" });
				let afterFirstCycle: number | undefined;
				for (let i = 0; i < 5; i++) {
					await page.click("#runlots");
					await page.waitForTimeout(200);
					await page.click("#clear");
					await page.waitForTimeout(200);
					if (i === 0) afterFirstCycle = await measureHeapUsedMb(page);
				}
				const afterFiveCycles = await measureHeapUsedMb(page);
				if (afterFirstCycle !== undefined) {
					memorySamples.afterFirstCycle.push(afterFirstCycle);
					memorySamples.afterFiveCycles.push(afterFiveCycles);
				}
			} catch (error) {
				console.error("  !! memory measurement failed:", error instanceof Error ? error.message : error);
			} finally {
				await page.close().catch(() => undefined);
			}
		}

		await browser.close();

		const results: Record<string, { medianMs: number; samples: number[] }> = {};
		for (const [id, samples] of Object.entries(allSamples)) {
			results[id] = { medianMs: median(samples), samples };
		}

		const memoryMb = memorySamples.afterFirstCycle.length > 0
			? { afterFirstCycle: median(memorySamples.afterFirstCycle), afterFiveCycles: median(memorySamples.afterFiveCycles) }
			: undefined;

		const bundle = measureBundleSize(join(appDir, "dist"));

		mkdirSync(RESULTS_DIR, { recursive: true });
		const output = {
			framework,
			measuredAt: new Date().toISOString(),
			passes,
			scenarios: results,
			memoryMb,
			bundle: {
				rawKb: bundle.rawBytes / 1024,
				gzipKb: bundle.gzipBytes / 1024,
				fileCount: bundle.fileCount,
			},
		};
		writeFileSync(join(RESULTS_DIR, `${framework}.json`), JSON.stringify(output, null, "\t"));
		console.log(`\nDone (${passes} pass${passes === 1 ? "" : "es"}, ${Object.keys(results).length}/${scenarios.length} scenarios have data${anyScenarioFailed ? " — some pass(es) had failures, see log above" : ""}). Results written to benchmarks/results/${framework}.json`);
	} finally {
		await killTree(server);
	}
}

// A plain `void main()` left the process hanging after "Done..." on Windows (see
// `killTree`'s comment) — even with that fixed, force an exit once main() genuinely
// settles rather than trusting every last handle (Playwright's own process, npm/pnpm's
// wrapper scripts, etc.) to release cleanly on its own.
main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
