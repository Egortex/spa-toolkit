import { useState, useCallback } from "react";
import { buildRows, type Row } from "../words";

interface TableProps {
	include100k: boolean;
}

export default function Table({ include100k }: TableProps) {
	const [rows, setRows] = useState<Row[]>([]);
	const [selectedId, setSelectedId] = useState<number | null>(null);

	const run = useCallback(() => {
		setRows(buildRows(1000));
		setSelectedId(null);
	}, []);

	const runLots = useCallback(() => {
		setRows(buildRows(10_000));
		setSelectedId(null);
	}, []);

	const run100k = useCallback(() => {
		setRows(buildRows(100_000));
		setSelectedId(null);
	}, []);

	const add = useCallback(() => {
		setRows((prev) => prev.concat(buildRows(1000)));
	}, []);

	const update = useCallback(() => {
		setRows((prev) => prev.map((row, i) => (i % 10 === 0 ? { ...row, label: row.label + " !!!" } : row)));
	}, []);

	const clear = useCallback(() => {
		setRows([]);
		setSelectedId(null);
	}, []);

	const swapRows = useCallback(() => {
		setRows((prev) => {
			if (prev.length < 999) return prev;
			const next = prev.slice();
			const a = next[1];
			const b = next[998];
			next[1] = b;
			next[998] = a;
			return next;
		});
	}, []);

	const select = useCallback((id: number) => {
		setSelectedId(id);
	}, []);

	const remove = useCallback((id: number) => {
		setRows((prev) => prev.filter((row) => row.id !== id));
	}, []);

	return (
		<>
			<div className="bench-controls">
				<button id="run" type="button" onClick={run}>Create 1,000 rows</button>
				<button id="runlots" type="button" onClick={runLots}>Create 10,000 rows</button>
				{include100k ? (
					<button id="run100k" type="button" onClick={run100k}>Create 100,000 rows</button>
				) : null}
				<button id="add" type="button" onClick={add}>Append 1,000 rows</button>
				<button id="update" type="button" onClick={update}>Update every 10th row</button>
				<button id="clear" type="button" onClick={clear}>Clear</button>
				<button id="swaprows" type="button" onClick={swapRows}>Swap rows</button>
			</div>
			<table id="table">
				<tbody>
					{rows.map((row) => (
						<tr key={row.id} className={row.id === selectedId ? "danger" : undefined}>
							<td className="col-md-1">{row.id}</td>
							<td className="col-md-4">
								<a
									onClick={(event) => {
										event.preventDefault();
										select(row.id);
									}}
								>
									{row.label}
								</a>
							</td>
							<td className="col-md-1">
								<a
									data-action="remove"
									onClick={(event) => {
										event.preventDefault();
										remove(row.id);
									}}
								>
									✖
								</a>
							</td>
							<td className="col-md-6" />
						</tr>
					))}
				</tbody>
			</table>
		</>
	);
}
