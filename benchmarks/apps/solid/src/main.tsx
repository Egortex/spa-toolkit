import { lazy } from "solid-js";
import { render } from "solid-js/web";
import { Router, Route } from "@solidjs/router";

const Home = lazy(() => import("./pages/Home"));
const TablePage = lazy(() => import("./pages/TablePage"));
const Updates1000 = lazy(() => import("./pages/Updates1000"));
const Components1000 = lazy(() => import("./pages/Components1000"));
const LargeForm = lazy(() => import("./pages/LargeForm"));
const LargeTable = lazy(() => import("./pages/LargeTable"));
const RouteA = lazy(() => import("./pages/RouteA"));
const RouteB = lazy(() => import("./pages/RouteB"));

const appElem = document.getElementById("app");
if (!appElem) throw new Error("Element with ID 'app' not found.");

render(
	() => (
		<Router>
			<Route path="/" component={Home} />
			<Route path="/table" component={() => <TablePage include100k={false} />} />
			<Route path="/table-100k" component={() => <TablePage include100k={true} />} />
			<Route path="/updates-1000" component={Updates1000} />
			<Route path="/components-1000" component={Components1000} />
			<Route path="/large-form" component={LargeForm} />
			<Route path="/large-table" component={LargeTable} />
			<Route path="/route-a" component={RouteA} />
			<Route path="/route-b" component={RouteB} />
		</Router>
	),
	appElem,
);
