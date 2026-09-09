import { Router, defineRoutes } from "../src/index";
import type { RouteDefinition } from "../src/types";

const named = defineRoutes({ user: "/users/:id", home: "/" });
const router = new Router([] as RouteDefinition[], document.createElement("div"), named);
router.navigate("user", { id: "123" });
router.route("user").href({ id: 123 });
router.navigate("home", {});
// @ts-expect-error user has no courseId parameter
router.navigate("user", { courseId: "123" });
// @ts-expect-error unknown route name
router.route("course");
