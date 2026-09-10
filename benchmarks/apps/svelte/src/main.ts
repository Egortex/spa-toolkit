import { mount } from "svelte";
import App from "./App.svelte";

const appElem = document.getElementById("app");
if (!appElem) throw new Error("Element with ID 'app' not found.");

mount(App, { target: appElem });
