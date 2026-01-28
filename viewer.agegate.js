// viewer.agegate.js
(function () {
  const KEY = "ageVerified";
  const gate = document.getElementById("age-gate");
  if (!gate) return;

  // Affiche uniquement si pas encore validé
  if (!localStorage.getItem(KEY)) {
    gate.style.display = "flex";
    document.body.style.overflow = "hidden";
  }

  document.getElementById("age-yes")?.addEventListener("click", () => {
    localStorage.setItem(KEY, "true");
    gate.remove();
    document.body.style.overflow = "";
  });

  document.getElementById("age-no")?.addEventListener("click", () => {
    window.location.href = "https://www.google.com";
  });
})();
