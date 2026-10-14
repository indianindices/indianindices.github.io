(() => {
  const form = document.querySelector("#waitlistForm");
  const email = document.querySelector("#waitlistEmail");
  const button = document.querySelector("#waitlistSubmit");
  const status = document.querySelector("#waitlistStatus");
  const config = window.SUPABASE_CONFIG;
  if (!form) return;

  const dialog = document.querySelector("#waitlistDialog");
  const openButton = document.querySelector("#openWaitlist");
  const closeButton = document.querySelector("#closeWaitlist");
  let signedUp = false;
  const openDialog = () => {
    if (!dialog.open && !document.querySelector("#supportDialog")?.open) dialog.showModal();
  };
  openButton.addEventListener("click", openDialog);
  closeButton.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
      dialog.close();
    }
  });
  openDialog();
  const reminders = [5 * 60 * 1000, 10 * 60 * 1000].map((delay) => setTimeout(() => {
    if (!signedUp) openDialog();
  }, delay));

  if (!config?.url || !config?.publishableKey) {
    button.disabled = true;
    status.textContent = "The waitlist opens soon. Please check back.";
    return;
  }

  let visitorId;
  let visitRecorded = false;
  try {
    visitorId = localStorage.getItem("indiansectors.visitor");
  } catch {}
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(visitorId || "")) {
    visitorId = crypto.randomUUID();
    try { localStorage.setItem("indiansectors.visitor", visitorId); } catch {}
  }

  async function rpc(name, body) {
    const response = await fetch(`${config.url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { apikey: config.publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) throw new Error("Request failed");
  }

  async function recordVisit() {
    if (visitRecorded) return;
    await rpc("record_visit", { p_visitor_id: visitorId });
    visitRecorded = true;
  }

  recordVisit().catch(() => {});
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (button.disabled || !form.reportValidity()) return;
    button.disabled = true;
    button.textContent = "Joining...";
    form.setAttribute("aria-busy", "true");
    status.textContent = "";
    try {
      await rpc("join_waitlist", { p_email: email.value.trim().toLowerCase(), p_visitor_id: visitorId });
      signedUp = true;
      reminders.forEach(clearTimeout);
      status.textContent = "You're on the waitlist. We'll email you when premium launches.";
      form.reset();
    } catch {
      status.textContent = "Could not join right now. Please try again.";
    } finally {
      button.disabled = false;
      button.textContent = "Join Waitlist";
      form.removeAttribute("aria-busy");
    }
  });
})();