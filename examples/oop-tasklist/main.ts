import "./app/assets/style/tailwind.css";
import "./app/assets/style/style.scss";
import { Preloader } from "./app/components/preloader/preloader";
import { Toaster } from "./app/components/toaster/toaster";
import { Router } from "@chepchik/spa-router";
import { routes, namedRoutes } from "./app/pages/routes";

const appElem = document.getElementById("app");
if (!appElem) throw new Error("Element with ID 'app' not found.");

export const preloader = new Preloader("preloaderContainer");
export const toaster = new Toaster();

// Третий аргумент — карта именованных маршрутов (см. app/pages/routes.ts) —
// включает типобезопасные `router.navigate('tasks', {})`/`router.route(name).href(params)`.
export const router = new Router(routes, appElem, namedRoutes);

router.onStatusChange((status) => {
	if (status === "loading") {
		preloader.visiblePreloader();
	} else {
		preloader.notVisiblePreloader();
	}

	document.body.dataset.navStatus = status;
});

// onPhaseChange даёт более гранулярные события навигационного цикла
// (resolve/guard/load/commit/transition/dispose/cancel/error), чем
// onStatusChange (loading/success/error) — здесь просто логируем их в dev.
router.onPhaseChange((event) => {
	if (import.meta.env.DEV) console.debug("[router phase]", event.phase, event.navigation.to.pathname);
});

router.start();
