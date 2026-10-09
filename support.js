(() => {
  const dialog = document.querySelector("#supportDialog");
  if (!dialog) return;

  const openSupport = () => {
    const waitlist = document.querySelector("#waitlistDialog");
    if (waitlist?.open) waitlist.close();
    if (!dialog.open) dialog.showModal();
  };
  const syncSupportLink = () => {
    if (location.hash === "#support") openSupport();
    else if (dialog.open) dialog.close();
  };
  document.querySelector("#openSupport").addEventListener("click", openSupport);
  dialog.addEventListener("close", () => {
    if (location.hash === "#support") history.replaceState(null, "", location.pathname + location.search);
  });
  document.querySelector("#closeSupport").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
      dialog.close();
    }
  });
  window.addEventListener("hashchange", syncSupportLink);
  if (location.hash === "#support") openSupport();
})();