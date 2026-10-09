const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "waitlist.js"), "utf8");
const visitorId = "10000000-0000-4000-8000-000000000001";

function setup({ config = { url: "https://example.supabase.co", publishableKey: "sb_publishable_test" }, storage = new Map(), fail = false, storageBlocked = false } = {}) {
  const requests = [];
  const elements = new Map();
  const timers = new Map();
  const handlers = new Map();
  const dialog = {
    open: false,
    showCount: 0,
    showModal() { this.open = true; this.showCount++; },
    close() { this.open = false; },
    addEventListener(name, handler) { handlers.set(`dialog:${name}`, handler); },
    getBoundingClientRect: () => ({ left: 100, right: 500, top: 100, bottom: 500 }),
  };
  elements.set("#waitlistDialog", dialog);
  elements.set("#openWaitlist", { addEventListener(name, handler) { handlers.set(`open:${name}`, handler); } });
  elements.set("#closeWaitlist", { addEventListener(name, handler) { handlers.set(`close:${name}`, handler); } });
  let submit;
  const form = {
    addEventListener(name, handler) { submit = handler; },
    reportValidity: () => true,
    setAttribute() {}, removeAttribute() {},
    reset() { elements.get("#waitlistEmail").value = ""; },
  };
  elements.set("#waitlistForm", form);
  elements.set("#waitlistEmail", { value: " Investor@Example.com " });
  elements.set("#waitlistSubmit", { disabled: false, textContent: "Join Waitlist" });
  elements.set("#waitlistStatus", { textContent: "" });
  vm.runInNewContext(source, {
    window: { SUPABASE_CONFIG: config },
    document: { querySelector: (selector) => elements.get(selector) },
    localStorage: {
      getItem(key) { if (storageBlocked) throw new Error(); return storage.get(key); },
      setItem(key, value) { if (storageBlocked) throw new Error(); storage.set(key, value); },
    },
    crypto: { randomUUID: () => visitorId },
    AbortSignal,
    setTimeout(callback, delay) { timers.set(delay, callback); return delay; },
    clearTimeout(timer) { timers.delete(timer); },
    fetch: async (url, options) => { requests.push({ url, ...options }); return { ok: !fail }; },
  });
  return { requests, elements, form, dialog, handlers, timers, submit: () => submit({ preventDefault() {} }) };
}

test("popup opens on arrival, at five minutes, and at ten minutes only", () => {
  const app = setup();
  assert.equal(app.dialog.showCount, 1);
  assert.deepEqual([...app.timers.keys()], [300000, 600000]);
  app.handlers.get("close:click")();
  assert.equal(app.dialog.open, false);
  app.timers.get(300000)();
  assert.equal(app.dialog.showCount, 2);
  app.dialog.close();
  app.timers.get(600000)();
  assert.equal(app.dialog.showCount, 3);
});

test("manual reopening works and reminders never stack an already open popup", () => {
  const app = setup();
  app.timers.get(300000)();
  assert.equal(app.dialog.showCount, 1);
  app.dialog.close();
  app.handlers.get("open:click")();
  assert.equal(app.dialog.open, true);
  assert.equal(app.dialog.showCount, 2);
});

test("backdrop clicks dismiss while dialog padding clicks do not", () => {
  const app = setup();
  const click = app.handlers.get("dialog:click");
  click({ target: app.dialog, clientX: 150, clientY: 150 });
  assert.equal(app.dialog.open, true);
  click({ target: app.dialog, clientX: 0, clientY: 0 });
  assert.equal(app.dialog.open, false);
});

test("successful signup cancels automatic reminders but allows manual reopening", async () => {
  const app = setup();
  await app.submit();
  assert.equal(app.timers.size, 0);
  app.dialog.close();
  app.handlers.get("open:click")();
  assert.equal(app.dialog.open, true);
});

test("failed signup keeps both reminders scheduled", async () => {
  const app = setup({ fail: true });
  await app.submit();
  assert.equal(app.timers.size, 2);
});

test("waitlist reminders do not open over the support dialog", () => {
  const app = setup();
  app.dialog.close();
  app.elements.set("#supportDialog", { open: true });
  app.timers.get(300000)();
  assert.equal(app.dialog.open, false);
  app.elements.get("#supportDialog").open = false;
  app.timers.get(600000)();
  assert.equal(app.dialog.open, true);
});

function setupSupport(hash = "") {
  const app = setup();
  const handlers = new Map();
  const location = { hash, pathname: "/index.html", search: "" };
  const replacements = [];
  let hashChange;
  const dialog = {
    open: false,
    showModal() { this.open = true; },
    close() { this.open = false; handlers.get("dialog:close")?.(); },
    addEventListener(name, handler) { handlers.set(`dialog:${name}`, handler); },
    getBoundingClientRect: () => ({ left: 100, right: 500, top: 100, bottom: 500 }),
  };
  app.elements.set("#supportDialog", dialog);
  app.elements.set("#openSupport", { addEventListener(name, handler) { handlers.set("open", handler); } });
  app.elements.set("#closeSupport", { addEventListener(name, handler) { handlers.set("close", handler); } });
  vm.runInNewContext(fs.readFileSync(path.join(root, "support.js"), "utf8"), {
    document: { querySelector: (selector) => app.elements.get(selector) },
    location,
    history: { replaceState(state, title, url) { replacements.push(url); location.hash = ""; } },
    window: { addEventListener(name, handler) { hashChange = handler; } },
  });
  return { ...app, support: dialog, supportHandlers: handlers, supportLocation: location, replacements,
    changeHash(value) { location.hash = value; hashChange(); },
  };
}

test("support deep link opens immediately and closing clears the support hash", () => {
  const app = setupSupport("#support");
  assert.equal(app.support.open, true);
  assert.equal(app.dialog.open, false);
  app.supportHandlers.get("close")();
  assert.equal(app.support.open, false);
  assert.equal(app.supportLocation.hash, "");
  assert.deepEqual(app.replacements, ["/index.html"]);
});

test("support links respond to hash changes and close when navigating away", () => {
  const app = setupSupport("#summary");
  assert.equal(app.support.open, false);
  app.changeHash("#support");
  assert.equal(app.support.open, true);
  app.changeHash("#compare");
  assert.equal(app.support.open, false);
  assert.equal(app.supportLocation.hash, "#compare");
  assert.equal(app.replacements.length, 0);
});

test("support is opt-in, opens from the header, and closes without stacking dialogs", () => {
  const app = setupSupport();
  assert.equal(app.support.open, false);
  app.supportHandlers.get("open")();
  assert.equal(app.support.open, true);
  assert.equal(app.dialog.open, false);
  app.supportHandlers.get("close")();
  assert.equal(app.support.open, false);
});

test("support backdrop closes the dialog without closing on content clicks", () => {
  const app = setupSupport();
  app.supportHandlers.get("open")();
  const click = app.supportHandlers.get("dialog:click");
  click({ target: app.support, clientX: 150, clientY: 150 });
  assert.equal(app.support.open, true);
  click({ target: app.support, clientX: 0, clientY: 0 });
  assert.equal(app.support.open, false);
});

test("support markup contains payment links, QR assets, and correct header order", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.ok(html.indexOf('id="openSupport"') < html.indexOf('id="openWaitlist"'));
  assert.ok(html.includes('src="docs/heart.svg"'));
  assert.ok(html.includes('href="upi://pay?pa=kavincsbi%40ybl"'));
  assert.ok(html.includes('href="https://www.paypal.me/kavinchandra"'));
  assert.ok(html.includes("Google Pay &bull; PhonePe &bull; Paytm"));
  for (const file of ["docs/phonepe_gpay.jpeg", "docs/paypal.jpeg"]) {
    assert.ok(html.includes(`src="${file}"`));
    assert.ok(fs.existsSync(path.join(root, file)));
    for (const staging of ["dev.sh", ".github/workflows/update-data.yml"]) {
      assert.ok(fs.readFileSync(path.join(root, staging), "utf8").includes(file));
    }
  }
});

test("missing Supabase config disables signup without making requests", () => {
  const app = setup({ config: {} });
  assert.equal(app.requests.length, 0);
  assert.equal(app.elements.get("#waitlistSubmit").disabled, true);
  assert.match(app.elements.get("#waitlistStatus").textContent, /opens soon/);
});

test("visitors reuse an anonymous ID across reloads and never send email with visits", () => {
  const storage = new Map();
  const first = setup({ storage });
  const second = setup({ storage });
  assert.deepEqual(JSON.parse(first.requests[0].body), { p_visitor_id: visitorId });
  assert.equal(first.requests[0].body, second.requests[0].body);
  assert.equal(first.requests[0].credentials, "omit");
  assert.equal(first.requests[0].referrerPolicy, "no-referrer");
  assert.equal(first.requests[0].headers.apikey, "sb_publishable_test");
});

test("signup normalizes email and only clears it after a successful response", async () => {
  const app = setup();
  await app.submit();
  assert.match(app.requests[1].url, /\/rpc\/join_waitlist$/);
  assert.deepEqual(JSON.parse(app.requests[1].body), { p_email: "investor@example.com", p_visitor_id: visitorId });
  assert.equal(app.elements.get("#waitlistEmail").value, "");
  assert.match(app.elements.get("#waitlistStatus").textContent, /You're on the waitlist/);
  assert.equal(app.elements.get("#waitlistSubmit").disabled, false);
});

test("failed signup preserves email and allows retry", async () => {
  const app = setup({ fail: true });
  await app.submit();
  assert.equal(app.elements.get("#waitlistEmail").value, " Investor@Example.com ");
  assert.match(app.elements.get("#waitlistStatus").textContent, /try again/);
  assert.equal(app.elements.get("#waitlistSubmit").disabled, false);
});

test("blocked storage does not prevent visits or signup", async () => {
  const app = setup({ storageBlocked: true });
  await app.submit();
  assert.equal(app.requests.length, 2);
  assert.match(app.elements.get("#waitlistStatus").textContent, /You're on the waitlist/);
});

test("invalid input and in-flight double submits do not create requests", async () => {
  const app = setup();
  app.form.reportValidity = () => false;
  await app.submit();
  assert.equal(app.requests.length, 1);
  app.form.reportValidity = () => true;
  const pending = app.submit();
  await app.submit();
  await pending;
  assert.equal(app.requests.length, 2);
});

test("config generation accepts only browser-safe keys and handles missing config", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "waitlist-config-"));
  const output = path.join(directory, "supabase-config.js");
  const generate = (url, key) => spawnSync(process.execPath, [path.join(root, "scripts/generate-config.mjs"), output], {
    cwd: directory,
    env: { ...process.env, SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key },
    encoding: "utf8",
  });
  const legacy = (role) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;
  try {
    assert.equal(generate("", "").status, 0);
    assert.equal(fs.readFileSync(output, "utf8"), "window.SUPABASE_CONFIG = {};\n");
    assert.equal(generate("https://example.supabase.co/", "sb_publishable_test").status, 0);
    assert.match(fs.readFileSync(output, "utf8"), /https:\/\/example.supabase.co/);
    assert.equal(generate("https://example.supabase.co", legacy("anon")).status, 0);
    for (const key of ["sb_secret_test", legacy("service_role"), "invalid", ""]) {
      assert.notEqual(generate("https://example.supabase.co", key).status, 0);
    }
    assert.notEqual(generate("http://example.supabase.co", "sb_publishable_test").status, 0);
    assert.notEqual(generate("https://example.supabase.co/?secret=test", "sb_publishable_test").status, 0);
    assert.notEqual(generate("", "sb_publishable_test").status, 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});