import { Router } from "@chepchik/spa-router";
import type { RouteDefinition } from "@chepchik/spa-router";
import { createTablePage } from "./pages/table";

const appElem = document.getElementById("app");
if (!appElem) throw new Error("Element with ID 'app' not found.");

const routes: RouteDefinition[] = [
	{ path: "/", load: () => import("./pages/home") },
	{ path: "/table", load: async () => ({ default: createTablePage(false) }) },
	{ path: "/table-100k", load: async () => ({ default: createTablePage(true) }) },
	{ path: "/updates-1000", load: () => import("./pages/updates1000") },
	{ path: "/components-1000", load: () => import("./pages/components1000") },
	{ path: "/large-form", load: () => import("./pages/largeForm") },
	{ path: "/large-table", load: () => import("./pages/largeTable") },
	{ path: "/route-a", load: () => import("./pages/routeA") },
	{ path: "/route-b", load: () => import("./pages/routeB") },
];

const router = new Router(routes, appElem);
router.start();
