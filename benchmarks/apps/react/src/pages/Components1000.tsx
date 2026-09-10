import { useState } from "react";

interface TaskCardProps {
	index: number;
}

/** A non-trivial component with its own local state (checked flag + a click counter). */
function TaskCard({ index }: TaskCardProps) {
	const [checked, setChecked] = useState(false);
	const [count, setCount] = useState(0);

	return (
		<li className="task-card">
			<input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
			<span>{`Task #${index}`}</span>
			<button type="button" onClick={() => setCount((n) => n + 1)}>+</button>
			<span>{count}</span>
		</li>
	);
}

export default function Components1000() {
	const [mounted, setMounted] = useState(false);

	return (
		<div id="app-ready">
			<button id="mount-1000" type="button" onClick={() => setMounted(true)}>Mount 1000</button>
			<button id="unmount-1000" type="button" onClick={() => setMounted(false)}>Unmount all</button>
			<ul>
				{mounted ? Array.from({ length: 1000 }, (_, index) => <TaskCard key={index} index={index} />) : null}
			</ul>
		</div>
	);
}
