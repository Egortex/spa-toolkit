import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Table from "./pages/Table";
import Updates1000 from "./pages/Updates1000";
import Components1000 from "./pages/Components1000";
import LargeForm from "./pages/LargeForm";
import LargeTable from "./pages/LargeTable";
import RouteA from "./pages/RouteA";
import RouteB from "./pages/RouteB";

const appElem = document.getElementById("app");
if (!appElem) throw new Error("Element with ID 'app' not found.");

createRoot(appElem).render(
	<StrictMode>
		<BrowserRouter>
			<Routes>
				<Route path="/" element={<Home />} />
				<Route path="/table" element={<Table include100k={false} />} />
				<Route path="/table-100k" element={<Table include100k={true} />} />
				<Route path="/updates-1000" element={<Updates1000 />} />
				<Route path="/components-1000" element={<Components1000 />} />
				<Route path="/large-form" element={<LargeForm />} />
				<Route path="/large-table" element={<LargeTable />} />
				<Route path="/route-a" element={<RouteA />} />
				<Route path="/route-b" element={<RouteB />} />
			</Routes>
		</BrowserRouter>
	</StrictMode>,
);
