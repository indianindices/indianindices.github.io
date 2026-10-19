const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "demo.js"), "utf8");

function setup() {
  const handlers = new Map();
  const elements = new Map();
  const makeElement = (id, extra = {}) => ({
    hidden: false,
    value: "",
    dataset: {},
    attributes: {},
    addEventListener(name, handler) { handlers.set(`${id}:${name}`, handler); },
    setAttribute(name, value) { this.attributes[name] = value; },
    focus() { this.focused = true; },
    ...extra,
  });
  const login = makeElement("login");
  const dashboard = makeElement("dashboard", { hidden: true });
  const username = makeElement("username");
  const password = makeElement("password");
  const status = makeElement("status");
  const form = makeElement("form", { reset() { username.value = ""; password.value = ""; } });
  const signOut = makeElement("signOut");
  const tabs = ["holdings", "positions", "orders", "trades"].map((name) => makeElement(`tab:${name}`, { dataset: { demoTab: name } }));
  const panels = ["holdings", "positions", "orders", "trades"].map((name) => makeElement(`panel:${name}`, { dataset: { demoPanel: name } }));
  ["#demoLogin", "#demoDashboard", "#demoLoginForm", "#demoUsername", "#demoPassword", "#demoLoginStatus", "#demoSignOut"].forEach((selector, index) => elements.set(selector, [login, dashboard, form, username, password, status, signOut][index]));
  vm.runInNewContext(source, {
    document: {
      querySelector: (selector) => elements.get(selector) ?? null,
      querySelectorAll: (selector) => selector === "[data-demo-tab]" ? tabs : panels,
    },
  });
  return { handlers, login, dashboard, username, password, status, form, signOut, tabs, panels };
}

test("demo login unlocks only the sample account and incorrect credentials fail", () => {
  const app = setup();
  app.username.value = "wrong@example.test";
  app.password.value = "wrong";
  app.handlers.get("form:submit")({ preventDefault() {} });
  assert.equal(app.login.hidden, false);
  assert.equal(app.dashboard.hidden, true);
  assert.match(app.status.textContent, /did not match/);

  app.username.value = "REVIEWER@INDIANINDICES.TEST";
  app.password.value = "sample-only-2026";
  app.handlers.get("form:submit")({ preventDefault() {} });
  assert.equal(app.login.hidden, true);
  assert.equal(app.dashboard.hidden, false);
  assert.equal(app.username.value, "");
  assert.equal(app.password.value, "");
});

test("demo tabs switch account panels and sign-out clears the visible session", () => {
  const app = setup();
  app.handlers.get("tab:orders:click")();
  assert.equal(app.tabs.find((tab) => tab.dataset.demoTab === "orders").attributes["aria-selected"], "true");
  assert.equal(app.panels.find((panel) => panel.dataset.demoPanel === "orders").hidden, false);
  assert.equal(app.panels.find((panel) => panel.dataset.demoPanel === "holdings").hidden, true);
  let prevented = false;
  app.handlers.get("tab:orders:keydown")({ key: "ArrowRight", preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(app.tabs.find((tab) => tab.dataset.demoTab === "trades").focused, true);
  assert.equal(app.panels.find((panel) => panel.dataset.demoPanel === "trades").hidden, false);
  app.handlers.get("signOut:click")();
  assert.equal(app.dashboard.hidden, true);
  assert.equal(app.login.hidden, false);
  assert.equal(app.username.focused, true);
  assert.match(app.status.textContent, /Signed out/);
});

test("demo page labels fictional data and deployment includes the demo assets", () => {
  const html = fs.readFileSync(path.join(root, "account-demo.html"), "utf8");
  assert.match(html, /Review demo only/);
  assert.match(html, /does not connect to Zerodha/);
  assert.match(html, /fictional placeholders/);
  assert.match(fs.readFileSync(path.join(root, "index.html"), "utf8"), /href="account-demo.html"/);
  for (const file of ["dev.sh", ".github/workflows/update-data.yml"]) {
    assert.match(fs.readFileSync(path.join(root, "..", file), "utf8"), /account-demo\.html demo\.js/);
  }
  assert.doesNotMatch(source, /fetch\(|localStorage|KITE_API_SECRET/);
});