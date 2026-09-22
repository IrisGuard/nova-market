// Nova Market — client enhancements (server renders the content for SEO).
// This file only wires interaction: search, footer year, lang placeholder.
(function () {
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  var input = document.getElementById("search-input");
  if (input) {
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        var q = (input.value || "").trim();
        if (q) window.location.href = "/search?q=" + encodeURIComponent(q);
      }
    });
  }

  // Language toggle placeholder — full i18n is wired when the Owner confirms languages.
  var lang = document.querySelector("[data-lang]");
  if (lang) lang.addEventListener("click", function (e) { e.preventDefault(); });

  // Mark the active category in the top hub nav.
  var path = window.location.pathname;
  var links = document.querySelectorAll("#catnav-inner a");
  links.forEach(function (a) {
    if (a.getAttribute("href") === path || (path.startsWith("/category/") && a.getAttribute("href") === path)) {
      a.classList.add("active");
    }
  });
})();
