/* VayuMitra Shared UI, Navigation, Location & Formatting Helpers */
(function (window, document) {
  "use strict";

  const STORAGE_CITY_KEY = "vayumitra_selected_city";
  const STORAGE_COORDS_KEY = "vayumitra_selected_coords";

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDateTime(isoString) {
    if (!isoString) return "Unavailable";
    const parsed = new Date(isoString);
    if (Number.isNaN(parsed.getTime())) return isoString;
    return parsed.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatFullDate(dateObj) {
    return dateObj.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  function formatHourLabel(isoString) {
    if (!isoString) return "";
    if (isoString.length >= 16 && isoString.includes("T")) {
      return isoString.slice(11, 16);
    }
    return isoString;
  }

  function formatPollutant(value, key, unitMode) {
    if (value == null || Number.isNaN(Number(value))) {
      return { text: "N/A", unit: "" };
    }
    const num = Number(value);
    if (key === "co" && unitMode === "mgm3") {
      return { text: (num / 1000).toFixed(2), unit: "mg/m³" };
    }
    return { text: num.toFixed(1), unit: "µg/m³" };
  }

  function getStoredLocationParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const cityParam = urlParams.get("city");
    if (cityParam) {
      localStorage.setItem(STORAGE_CITY_KEY, cityParam);
      localStorage.removeItem(STORAGE_COORDS_KEY);
      return { city: cityParam };
    }
    const coordsRaw = localStorage.getItem(STORAGE_COORDS_KEY);
    if (coordsRaw) {
      try {
        const parsed = JSON.parse(coordsRaw);
        if (parsed && typeof parsed.lat === "number" && typeof parsed.lon === "number") {
          return { lat: parsed.lat, lon: parsed.lon, city: parsed.city || "" };
        }
      } catch (_err) {
        localStorage.removeItem(STORAGE_COORDS_KEY);
      }
    }
    const city = localStorage.getItem(STORAGE_CITY_KEY);
    return city ? { city } : {};
  }

  function setStoredCity(city) {
    if (!city) return;
    localStorage.setItem(STORAGE_CITY_KEY, city.trim());
    localStorage.removeItem(STORAGE_COORDS_KEY);
  }

  function setStoredCoords(lat, lon, city) {
    localStorage.setItem(STORAGE_COORDS_KEY, JSON.stringify({ lat, lon, city: city || "" }));
    if (city) {
      localStorage.setItem(STORAGE_CITY_KEY, city);
    }
  }

  function clearStoredLocation() {
    localStorage.removeItem(STORAGE_CITY_KEY);
    localStorage.removeItem(STORAGE_COORDS_KEY);
  }

  function requestBrowserLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported by your browser."));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        (err) => {
          const msg =
            err.code === 1
              ? "Location permission denied. You can search for your city manually."
              : "Unable to detect your current location.";
          reject(new Error(msg));
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 }
      );
    });
  }

  function setupNavigation() {
    const currentFile = window.location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".vm-nav-link").forEach((link) => {
      const href = link.getAttribute("href");
      if (href === currentFile || (currentFile === "" && href === "index.html")) {
        link.classList.add("active");
        link.setAttribute("aria-current", "page");
      } else {
        link.classList.remove("active");
        link.removeAttribute("aria-current");
      }
    });

    const toggleBtn = document.getElementById("vmMobileToggle");
    const mobileMenu = document.getElementById("vmMobileMenu");
    if (toggleBtn && mobileMenu) {
      toggleBtn.addEventListener("click", () => {
        const isOpen = mobileMenu.classList.toggle("open");
        toggleBtn.setAttribute("aria-expanded", String(isOpen));
      });
      mobileMenu.querySelectorAll("a").forEach((a) => {
        a.addEventListener("click", () => {
          mobileMenu.classList.remove("open");
          toggleBtn.setAttribute("aria-expanded", "false");
        });
      });
    }
  }

  function getTimeGreeting() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "Good morning!";
    if (hour >= 12 && hour < 17) return "Good afternoon!";
    if (hour >= 17 && hour < 21) return "Good evening!";
    return "Good night!";
  }

  function resolveCityBackground(cityName) {
    const c = String(cityName || "").trim().toLowerCase();
    if (!c || c.includes("mumbai") || c.includes("bombay") || c.includes("thane") || c.includes("maharashtra") || c.includes("pune") || c.includes("nagpur")) {
      return "assets/backgrounds/hero-bg.jpg";
    }
    if (c.includes("delhi") || c.includes("noida") || c.includes("gurgaon") || c.includes("gurugram") || c.includes("haryana")) {
      return "assets/backgrounds/bg-delhi.jpg";
    }
    if (c.includes("bengaluru") || c.includes("bangalore") || c.includes("mysuru") || c.includes("mysore") || c.includes("karnataka")) {
      return "assets/backgrounds/bg-bengaluru.jpg";
    }
    if (c.includes("kolkata") || c.includes("calcutta") || c.includes("howrah") || c.includes("west bengal") || c.includes("darjeeling")) {
      return "assets/backgrounds/bg-kolkata.jpg";
    }
    if (c.includes("chennai") || c.includes("madras") || c.includes("puducherry") || c.includes("pondicherry") || c.includes("tamil nadu") || c.includes("coimbatore") || c.includes("madurai")) {
      return "assets/backgrounds/bg-chennai.jpg";
    }
    return "assets/backgrounds/bg-default.jpg";
  }

  function updateCityBackground(cityName) {
    const bgEl = document.querySelector(".vm-bg-image");
    if (!bgEl) return;
    const bgPath = resolveCityBackground(cityName);
    bgEl.style.backgroundImage = `url("${bgPath}")`;
  }

  function setupNavSearch() {
    const navForm = document.getElementById("vmNavSearchForm");
    const navInput = document.getElementById("vmNavSearchInput");
    if (!navForm || !navInput) return;

    const stored = getStoredLocationParams();
    if (stored.city) {
      navInput.value = stored.city;
    }

    navForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const city = navInput.value.trim();
      if (!city) return;
      setStoredCity(city);
      updateCityBackground(city);
      const page = document.body.getAttribute("data-page");
      if (page === "dashboard" || page === "insights" || page === "alerts" || page === "reports") {
        window.dispatchEvent(new CustomEvent("vayumitra:citychange", { detail: { city } }));
      } else {
        window.location.href = `index.html?city=${encodeURIComponent(city)}`;
      }
    });
  }

  async function setupIndiaLocationDatalist() {
    if (!window.VayuApi || typeof window.VayuApi.getIndiaLocations !== "function") return;
    const inputIds = [
      "vmNavSearchInput",
      "repCompareCityInput",
      "profDefaultCity",
      "twinLocCity",
      "vmRouteOrigin",
      "vmRouteDest",
    ];
    const inputs = inputIds.map((id) => document.getElementById(id)).filter(Boolean);
    if (!inputs.length) return;

    try {
      const data = await window.VayuApi.getIndiaLocations();
      const options = data && Array.isArray(data.options) ? data.options : [];
      if (!options.length) return;

      let dl = document.getElementById("vmIndiaLocationsList");
      if (!dl) {
        dl = document.createElement("datalist");
        dl.id = "vmIndiaLocationsList";
        document.body.appendChild(dl);
      }
      dl.innerHTML = options
        .map((opt) => `<option value="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</option>`)
        .join("");

      inputs.forEach((el) => {
        el.setAttribute("list", "vmIndiaLocationsList");
      });
    } catch (_err) {}
  }

  function updateHeaderWeather(data) {
    if (data && data.location && data.location.name) {
      updateCityBackground(data.location.name);
      const navInput = document.getElementById("vmNavSearchInput");
      if (navInput && document.activeElement !== navInput && !navInput.value) {
        navInput.placeholder = "Search Indian city...";
      }
    }
  }

  function showBanner(elementId, message, type) {
    const el = document.getElementById(elementId);
    if (!el) return;
    if (!message) {
      el.className = "vm-banner vm-hidden";
      el.textContent = "";
      return;
    }
    el.className = `vm-banner vm-banner-${type || "info"}`;
    el.textContent = message;
  }

  document.addEventListener("DOMContentLoaded", () => {
    setupNavigation();
    setupNavSearch();
    setupIndiaLocationDatalist();
    const stored = getStoredLocationParams();
    updateCityBackground(stored.city || "Mumbai");
  });

  window.VayuMain = {
    escapeHtml,
    formatDateTime,
    formatFullDate,
    formatHourLabel,
    formatPollutant,
    getTimeGreeting,
    updateCityBackground,
    getStoredLocationParams,
    setStoredCity,
    setStoredCoords,
    clearStoredLocation,
    requestBrowserLocation,
    updateHeaderWeather,
    showBanner,
  };
})(window, document);
