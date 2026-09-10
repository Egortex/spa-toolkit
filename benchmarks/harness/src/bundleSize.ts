import { readdirSync, readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

/** Sums the raw + gzip size (bytes) of every .js/.css file under `distDir` (recursively). */
export function measureBundleSize(distDir: string): { rawBytes: number; gzipBytes: number; fileCount: number } {
	let rawBytes = 0;
	let gzipBytes = 0;
	let fileCount = 0;

	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir)) {
			const full = join(dir, entry);
			const stat = statSync(full);
			if (stat.isDirectory()) {
				walk(full);
				continue;
			}
			if (!/\.(js|mjs|css)$/.test(entry)) continue;
			const content = readFileSync(full);
			rawBytes += content.byteLength;
			gzipBytes += gzipSync(content).byteLength;
			fileCount++;
		}
	};

	walk(distDir);
	return { rawBytes, gzipBytes, fileCount };
}
