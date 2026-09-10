<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{ index: number }>();

const checked = ref(false);
const count = ref(0);

function increment(): void {
	count.value += 1;
}
</script>

<template>
	<li class="task-card">
		<input type="checkbox" v-model="checked" />
		<span>Task #{{ props.index }}</span>
		<button type="button" @click="increment">+</button>
		<span>{{ count }}</span>
	</li>
</template>
