import { createRouter, createWebHistory } from "vue-router";

const router = createRouter({
	history: createWebHistory(),
	routes: [
		{ path: "/", component: () => import("./pages/Home.vue") },
		{ path: "/table", component: () => import("./pages/TablePage.vue"), props: { include100k: false } },
		{ path: "/table-100k", component: () => import("./pages/TablePage.vue"), props: { include100k: true } },
		{ path: "/updates-1000", component: () => import("./pages/Updates1000.vue") },
		{ path: "/components-1000", component: () => import("./pages/Components1000.vue") },
		{ path: "/large-form", component: () => import("./pages/LargeForm.vue") },
		{ path: "/large-table", component: () => import("./pages/LargeTable.vue") },
		{ path: "/route-a", component: () => import("./pages/RouteA.vue") },
		{ path: "/route-b", component: () => import("./pages/RouteB.vue") },
	],
});

export default router;
