// Same word lists as js-framework-benchmark, so labels look/behave the same way.
const adjectives = ["pretty", "large", "big", "small", "tall", "short", "long", "handsome", "plain", "quaint", "clean", "elegant", "easy", "angry", "crazy", "helpful", "mushy", "odd", "unsightly", "adorable", "important", "inexpensive", "cheap", "expensive", "fancy"];
const colours = ["red", "yellow", "blue", "green", "pink", "brown", "purple", "brown", "white", "black", "orange"];
const nouns = ["table", "chair", "house", "bbq", "desk", "car", "pony", "cookie", "sandwich", "burger", "pizza", "mouse", "keyboard"];

let idCounter = 1;

export interface Row {
	id: number;
	label: string;
}

function random(max: number): number {
	return Math.round(Math.random() * 1000) % max;
}

export function buildRow(): Row {
	return {
		id: idCounter++,
		label: `${adjectives[random(adjectives.length)]} ${colours[random(colours.length)]} ${nouns[random(nouns.length)]}`,
	};
}

export function buildRows(count: number): Row[] {
	return Array.from({ length: count }, buildRow);
}
