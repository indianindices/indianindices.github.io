(() => {
  const demoUsername = "reviewer@indianindices.test";
  const demoPassword = "sample-only-2026";
  const login = document.querySelector("#demoLogin");
  const dashboard = document.querySelector("#demoDashboard");
  const form = document.querySelector("#demoLoginForm");
  const username = document.querySelector("#demoUsername");
  const password = document.querySelector("#demoPassword");
  const status = document.querySelector("#demoLoginStatus");
  const signOut = document.querySelector("#demoSignOut");
  const tabs = [...document.querySelectorAll("[data-demo-tab]")];
  const panels = [...document.querySelectorAll("[data-demo-panel]")];

  if (!login || !dashboard || !form || !username || !password || !status || !signOut) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (username.value.trim().toLowerCase() !== demoUsername || password.value !== demoPassword) {
      status.dataset.error = "true";
      status.textContent = "Credentials did not match. Use the public demo credentials above.";
      return;
    }
    status.textContent = "";
    login.hidden = true;
    dashboard.hidden = false;
    form.reset();
  });

  const selectTab = (tab) => {
    const selected = tab.dataset.demoTab;
    tabs.forEach((item) => {
      const active = item === tab;
      item.setAttribute("aria-selected", String(active));
      item.tabIndex = active ? 0 : -1;
    });
    panels.forEach((panel) => { panel.hidden = panel.dataset.demoPanel !== selected; });
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", (event) => {
      const index = tabs.indexOf(tab);
      const nextIndex = event.key === "ArrowRight" ? (index + 1) % tabs.length
        : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length
          : event.key === "Home" ? 0
            : event.key === "End" ? tabs.length - 1 : -1;
      if (nextIndex < 0) return;
      event.preventDefault();
      tabs[nextIndex].focus();
      selectTab(tabs[nextIndex]);
    });
  });

  signOut.addEventListener("click", () => {
    dashboard.hidden = true;
    login.hidden = false;
    status.dataset.error = "false";
    status.textContent = "Signed out of the sample account.";
    username.focus();
  });
})();