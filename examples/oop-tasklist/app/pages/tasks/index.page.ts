import "./index.scss";
import templateHTML from "./index.html?raw";
import { component } from "@chepchik/dom-template";
import { preloader, toaster } from "../../../main";
import { SearchPanel } from "../../components/searchPanel/searchPanel";
import { TaskManager } from "../../components/task/TaskManager";
import { jsonPlaceholderApi as api } from "../../services/container";
import type { PageModule } from "@chepchik/spa-router";

// Страница-оболочка на component(): вставляет разметку и хостит внутри неё
// OOP-виджеты (TaskManager/SearchPanel — экземпляры Component с собственным
// событийным API, см. app/components/component.ts). Сама разметка и
// destroy() страницы управляются component()'ом; TaskManager/SearchPanel
// внутри намеренно оставлены как есть — у них богатый публичный API
// (getTasks/searchTasks/triggerEvent/...), которым пользуется SearchPanel,
// и переписывать эту связку под контракт component() ({nodes, update, destroy})
// в рамках этого прохода не стали (см. examples/oop-tasklist/README.md).
const TasksShellView = component({
	template: templateHTML,
	setup() {
		const taskManager = new TaskManager("task", {
			data: { api, dataTest: "тестирование" },
			events: {
				toast: () => toaster.showToast("Задача успешно добавлена!", 5000),
				onLoader: () => preloader.visiblePreloader(),
				offLoader: () => preloader.notVisiblePreloader(),
			},
		});

		new SearchPanel("searchPanel", {
			data: { taskManager },
		});
	},
});

const tasksPage: PageModule = {
	render(container) {
		const instance = TasksShellView(container, {});
		return () => instance.destroy();
	},
};

export default tasksPage;
