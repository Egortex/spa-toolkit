<script setup lang="ts">
import { ref } from "vue";
import TaskCard from "../components/TaskCard.vue";

const indices = ref<number[]>([]);

function mount(): void {
	indices.value = Array.from({ length: 1000 }, (_, i) => i);
}

function unmount(): void {
	indices.value = [];
}
</script>

<template>
	<div id="app-ready">
		<button id="mount-1000" type="button" @click="mount">Mount 1000</button>
		<button id="unmount-1000" type="button" @click="unmount">Unmount all</button>
		<ul>
			<TaskCard v-for="index in indices" :key="index" :index="index" />
		</ul>
	</div>
</template>
