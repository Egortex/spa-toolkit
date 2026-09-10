import { createSignal, For } from "solid-js";

interface TaskCardProps {
	index: number;
}

/** A non-trivial component with its own local reactive state (checked flag + a click counter). */
function TaskCard(props: TaskCardProps) {
	const [checked, setChecked] = createSignal(false);
	const [count, setCount] = createSignal(0);

	return (
		<li class="task-card">
			<input type="checkbox" checked={checked()} onChange={(e) => setChecked(e.currentTarget.checked)} />
			<span>{`Task #${props.index}`}</span>
			<button type="button" onClick={() => setCount((n) => n + 1)}>+</button>
			<span>{count()}</span>
		</li>
	);
}

export default function Components1000() {
	const [items, setItems] = createSignal<number[]>([]);

	const mount = () => setItems(Array.from({ length: 1000 }, (_, i) => i));
	const unmount = () => setItems([]);

	return (
		<div id="app-ready">
			<button id="mount-1000" type="button" onClick={mount}>Mount 1000</button>
			<button id="unmount-1000" type="button" onClick={unmount}>Unmount all</button>
			<ul>
				<For each={items()}>{(index) => <TaskCard index={index} />}</For>
			</ul>
		</div>
	);
}
