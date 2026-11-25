/* VayuMitra Page-Specific Feature Controllers */
(function (window, document) {
  "use strict";

  const chartRegistry = {};
  const chartConfigRegistry = {};

  function renderOrReplaceChart(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof window.Chart === "undefined") return null;
    chartConfigRegistry[canvasId] = config;
    if (chartRegistry[canvasId]) {
      chartRegistry[canvasId].destroy();
    }
    const ctx = canvas.getContext("2d");
    chartRegistry[canvasId] = new window.Chart(ctx, config);
    return chartRegistry[canvasId];
  }

  function levelBadgeClass(levelOrCategory) {
    const key = String(levelOrCategory || "").toLowerCase();
    if (key.includes("good")) return "vm-status-good";
    if (key.includes("satisfactory")) return "vm-status-satisfactory";
    if (key.includes("moderate")) return "vm-status-moderate";
    if (key.includes("severe") || key.includes("hazard")) return "vm-status-severe";
    if (key.includes("very poor") || key.includes("worse")) return "vm-status-worse";
    if (key.includes("poor") || key.includes("bad") || key.includes("unhealthy")) return "vm-status-bad";
    return "vm-status-moderate";
  }

  function aqiColorHex(aqi) {
    if (aqi == null || Number.isNaN(Number(aqi))) return "#64748B";
    if (aqi <= 50) return "#16A34A";
    if (aqi <= 100) return "#059669";
    if (aqi <= 200) return "#D97706";
    if (aqi <= 300) return "#EA580C";
    if (aqi <= 400) return "#DC2626";
    return "#7F1D1D";
  }

  function naqiCategoryFromValue(aqi) {
    if (aqi == null || Number.isNaN(Number(aqi))) return "Unavailable";
    if (aqi <= 50) return "Good";
    if (aqi <= 100) return "Satisfactory";
    if (aqi <= 200) return "Moderate";
    if (aqi <= 300) return "Poor";
    if (aqi <= 400) return "Very Poor";
    return "Severe";
  }

  function renderAqiGaugeSvg(containerId, aqiValue, labelSub, categoryText) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const hasNum = aqiValue != null && !Number.isNaN(Number(aqiValue));
    const num = hasNum ? Math.round(Number(aqiValue)) : null;
    const pct = hasNum ? Math.max(0.04, Math.min(1, num / 400)) : 0;
    const arcLen = 251.33;
    const offset = arcLen * (1 - pct);
    const color = hasNum ? aqiColorHex(num) : "#64748B";
    const catLabel = categoryText || (hasNum ? naqiCategoryFromValue(num) : "Unavailable");
    const catCls = levelBadgeClass(catLabel);
    const gradId = `vmGaugeGrad_${String(containerId).replace(/[^a-zA-Z0-9_]/g, "")}`;

    el.innerHTML = `
      <svg class="vm-gauge-svg" viewBox="0 0 200 118" role="img" aria-label="AQI ${num != null ? num : "--"} ${window.VayuMain.escapeHtml(catLabel)}">
        <defs>
          <linearGradient id="${gradId}" x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stop-color="#22C55E"/>
            <stop offset="42%" stop-color="#84CC16"/>
            <stop offset="68%" stop-color="#FACC15"/>
            <stop offset="86%" stop-color="#F97316"/>
            <stop offset="100%" stop-color="#EF4444"/>
          </linearGradient>
        </defs>
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="rgba(16,52,59,0.10)" stroke-width="15" stroke-linecap="round"></path>
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="url(#${gradId})" stroke-width="15" stroke-linecap="round"
          stroke-dasharray="${arcLen}" stroke-dashoffset="${offset.toFixed(1)}" style="transition:stroke-dashoffset 450ms ease;"></path>
      </svg>
      <div class="vm-gauge-center">
        <div class="vm-gauge-num" style="color:${color};">${num != null ? num : "--"}</div>
        <div class="vm-gauge-sub">${window.VayuMain.escapeHtml(labelSub || "AQI")}</div>
        <span class="vm-status-tag ${catCls}" style="margin-top:4px;">${window.VayuMain.escapeHtml(catLabel)}</span>
      </div>
    `;
  }

  function pollutantStatusInfo(id, rawVal) {
    if (rawVal == null || Number.isNaN(Number(rawVal))) {
      return { label: "N/A", color: "#64748B", pct: 0 };
    }
    const v = Number(rawVal);
    const thresholds = {
      pm2_5: [30, 60, 90, 120],
      pm10: [50, 100, 250, 350],
      no2: [40, 80, 180, 280],
      so2: [40, 80, 380, 800],
      co: [1000, 2000, 10000, 17000],
      o3: [50, 100, 168, 208],
    };
    const [t1, t2, t3, t4] = thresholds[id] || [50, 100, 200, 300];
    const pct = Math.min(100, Math.max(7, Math.round((v / (t3 * 1.15)) * 100)));
    if (v <= t1) return { label: "(Good)", color: "#16A34A", pct };
    if (v <= t2) return { label: "(Satisfactory)", color: "#059669", pct };
    if (v <= t3) return { label: "(Moderate)", color: "#D97706", pct };
    if (v <= t4) return { label: "(Poor)", color: "#EA580C", pct };
    return { label: "(Very Poor)", color: "#DC2626", pct };
  }

  function characterAssetsForLevel(level) {
    const key = String(level || "good").toLowerCase();
    if (key === "moderate") {
      return { jpg: "assets/images/aqi-moderate.jpg", svg: "assets/images/aqi-moderate.svg" };
    }
    if (key === "bad") {
      return { jpg: "assets/images/aqi-bad.jpg", svg: "assets/images/aqi-bad.svg" };
    }
    if (key === "worse" || key === "severe") {
      return { jpg: "assets/images/aqi-worse.jpg", svg: "assets/images/aqi-worse.svg" };
    }
    return { jpg: "assets/images/aqi-good.jpg", svg: "assets/images/aqi-good.svg" };
  }

  /* =========================================================
     1. DASHBOARD (index.html)
     ========================================================= */
  async function initDashboardPage() {
    let activeDashboardParams = window.VayuMain.getStoredLocationParams();
    let latestDashboardData = null;
    let activeTrendRange = "today";
    const timeMachineCache = {};

    const greetingEl = document.getElementById("vmTimeGreeting");
    if (greetingEl) {
      const baseGreeting = window.VayuMain.getTimeGreeting();
      const authUser = window.VayuMain.getAuthUser();
      const firstName = authUser && authUser.name ? String(authUser.name).trim().split(/\s+/)[0] : "";
      greetingEl.textContent = firstName ? `${baseGreeting.replace(/!$/, "")}, ${firstName}!` : baseGreeting;
    }

    const dateEl = document.getElementById("vmHeroDate");
    if (dateEl) {
      dateEl.textContent = window.VayuMain.formatFullDate(new Date());
    }

    const geoBtn = document.getElementById("vmUseLocationBtn");

    function renderTrendSeries(labels, values, emptyMsg) {
      const trendEmpty = document.getElementById("vmTrendEmpty");
      if (!labels.length) {
        if (trendEmpty) {
          trendEmpty.textContent = emptyMsg || "No trend data available yet.";
          trendEmpty.classList.remove("vm-hidden");
        }
        return;
      }
      if (trendEmpty) trendEmpty.classList.add("vm-hidden");
      renderOrReplaceChart("vmDashboardTrendChart", {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "AQI",
              data: values,
              borderColor: "#16A34A",
              backgroundColor: (ctx) => {
                const chart = ctx.chart;
                const area = chart.chartArea;
                if (!area) return "rgba(22, 163, 74, 0.16)";
                const grad = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
                grad.addColorStop(0, "rgba(22, 163, 74, 0.28)");
                grad.addColorStop(1, "rgba(22, 163, 74, 0.02)");
                return grad;
              },
              fill: true,
              tension: 0.36,
              borderWidth: 2.5,
              pointRadius: 3.5,
              pointHoverRadius: 5,
              pointBackgroundColor: "#16A34A",
              pointBorderColor: "#ffffff",
              pointBorderWidth: 1.5,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: {
              beginAtZero: true,
              grid: { color: "rgba(16, 52, 59, 0.06)" },
              ticks: { font: { size: 11 } },
            },
            x: {
              grid: { display: false },
              ticks: { maxTicksLimit: 7, font: { size: 11 } },
            },
          },
        },
      });
    }

    async function updateTrendChartForRange(range) {
      activeTrendRange = range;
      if (!latestDashboardData) return;
      if (range === "today") {
        const history = latestDashboardData.hourly_history || [];
        renderTrendSeries(
          history.map((h) => window.VayuMain.formatHourLabel(h.time)),
          history.map((h) => h.aqi),
          "No hourly data available yet."
        );
        return;
      }

      const cityKey = (latestDashboardData.location && latestDashboardData.location.name) || activeDashboardParams.city || "default";
      try {
        let tm = timeMachineCache[cityKey];
        if (!tm) {
          tm = await window.VayuApi.getTimeMachine(activeDashboardParams);
          timeMachineCache[cityKey] = tm;
        }
        const daily = Array.isArray(tm.daily_series) ? tm.daily_series : [];
        const sliceCount = range === "7d" ? 7 : 30;
        const subset = daily.slice(-sliceCount);
        renderTrendSeries(
          subset.map((d) => {
            const parts = String(d.date || "").split("-");
            return parts.length === 3 ? `${parts[2]}/${parts[1]}` : d.date;
          }),
          subset.map((d) => d.avg_aqi),
          `No ${range === "7d" ? "7-day" : "30-day"} historical readings returned yet.`
        );
      } catch (_err) {
        renderTrendSeries([], [], "Unable to load multi-day trend right now.");
      }
    }

    document.querySelectorAll("#vmTrendRangeTabs .vm-trend-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const range = btn.getAttribute("data-range") || "today";
        document.querySelectorAll("#vmTrendRangeTabs .vm-trend-tab").forEach((b) => {
          const isSel = b === btn;
          b.classList.toggle("active", isSel);
          b.setAttribute("aria-selected", String(isSel));
        });
        updateTrendChartForRange(range);
      });
    });

    async function loadDashboard(params, isInitial) {
      activeDashboardParams = params;
      window.VayuMain.showBanner("vmDashboardBanner", "", "info");
      try {
        const data = await window.VayuApi.getDashboard(params);
        latestDashboardData = data;
        window.VayuMain.updateHeaderWeather(data);
        renderDashboardData(data);
        await updateTrendChartForRange(activeTrendRange);
      } catch (err) {
        if (isInitial && (params.city || params.lat != null)) {
          window.VayuMain.clearStoredLocation();
          window.VayuMain.updateCityBackground("Mumbai");
          try {
            const fallback = await window.VayuApi.getDashboard({ city: "Mumbai" });
            activeDashboardParams = { city: "Mumbai" };
            latestDashboardData = fallback;
            window.VayuMain.updateHeaderWeather(fallback);
            renderDashboardData(fallback);
            await updateTrendChartForRange(activeTrendRange);
            window.VayuMain.showBanner("vmDashboardBanner", "VayuMitra supports locations within India only. Reset view to Mumbai.", "info");
            return;
          } catch (_fallbackErr) {}
        }
        window.VayuMain.showBanner("vmDashboardBanner", err.message || "Unable to fetch live air quality data.", "error");
      }
    }

    window.addEventListener("vayumitra:citychange", (ev) => {
      const city = ev.detail && ev.detail.city;
      if (city) loadDashboard({ city }, false);
    });

    if (geoBtn) {
      geoBtn.addEventListener("click", async () => {
        geoBtn.disabled = true;
        geoBtn.textContent = "Detecting...";
        try {
          const coords = await window.VayuMain.requestBrowserLocation();
          await loadDashboard({ lat: coords.lat, lon: coords.lon }, false);
          window.VayuMain.setStoredCoords(coords.lat, coords.lon);
        } catch (err) {
          window.VayuMain.showBanner("vmDashboardBanner", err.message, "error");
        } finally {
          geoBtn.disabled = false;
          geoBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg><span>Use my location</span>`;
        }
      });
    }

    await loadDashboard(activeDashboardParams, true);
  }

  function renderDashboardData(data) {
    const cls = data.classification || {};
    const level = cls.level || "good";
    const loc = data.location || {};
    const cityName = loc.name || "Mumbai";
    const weather = data.weather || {};
    const pollutants = data.pollutants || {};
    const unitMode = data.pollutant_unit_mode || "ugm3";

    const heroLoc = document.getElementById("vmHeroLocation");
    if (heroLoc) {
      const region = [loc.name, loc.admin1, loc.country].filter(Boolean).join(", ");
      heroLoc.textContent = region || cityName;
    }

    setText("vmAqiCardTitle", `${cityName} Air Quality Index`);

    const mainCard = document.getElementById("vmMainAqiCard");
    if (mainCard) {
      mainCard.classList.remove(
        "aqi-level-good",
        "aqi-level-satisfactory",
        "aqi-level-moderate",
        "aqi-level-bad",
        "aqi-level-worse",
        "aqi-level-severe"
      );
      mainCard.classList.add(`aqi-level-${level}`);
    }

    const aqiBadge = document.getElementById("vmAqiBadge");
    if (aqiBadge) {
      aqiBadge.className = `vm-status-tag ${levelBadgeClass(cls.category)}`;
      aqiBadge.textContent = `${cls.category || "Unknown"} Air Quality`;
    }

    setText("vmDataOriginBadge", data.is_live ? "Live Feed" : "Estimated");

    const tempUnit = weather.temp_unit || "°C";
    renderAqiGaugeSvg("vmMainAqiGauge", data.aqi, data.aqi_standard || "NAQI", cls.category);

    setText("vmCardLocation", cityName);
    setText("vmTrendCityLabel", cityName);
    setText("vmCardSource", data.source || "Open-Meteo Air Quality");
    setText("vmAqiMessage", cls.message || "");

    const charImg = document.getElementById("vmAqiCharacterImg");
    const assets = characterAssetsForLevel(level);
    if (charImg) {
      charImg.dataset.fallback = assets.svg;
      charImg.src = cls.illustration || assets.jpg;
      charImg.alt = `Two companions reacting to ${cls.category || "current"} air quality (${level})`;
    }
    setText(
      "vmAqiCharacterCaption",
      `${cls.category || "Good"} · ${cls.recommendation || cls.message || "Fresh air conditions."}`
    );

    setStat("statTempVal", weather.temperature != null ? weather.temperature.toFixed(1) : "N/A", tempUnit);
    setStat("statHumVal", weather.humidity != null ? Math.round(weather.humidity) : "N/A", "%");
    setStat("statWindVal", weather.wind_speed != null ? weather.wind_speed.toFixed(1) : "N/A", "km/h");

    setText("vmPollutantUnitHead", unitMode === "mgm3" ? "µg/m³ (CO mg/m³)" : "µg/m³");

    const pollutantSpecs = [
      { id: "pm2_5", label: "PM2.5", val: pollutants.pm2_5 },
      { id: "pm10", label: "PM10", val: pollutants.pm10 },
      { id: "no2", label: "NO₂", val: pollutants.no2 },
      { id: "co", label: "CO", val: pollutants.co },
      { id: "o3", label: "O₃", val: pollutants.o3 },
      { id: "so2", label: "SO₂", val: pollutants.so2 },
    ];

    const barsEl = document.getElementById("vmHomePollutantBars");
    if (barsEl) {
      barsEl.innerHTML = pollutantSpecs
        .map((p) => {
          const fmt = window.VayuMain.formatPollutant(p.val, p.id, unitMode);
          const info = pollutantStatusInfo(p.id, p.val);
          const valWithUnit = fmt.unit ? `${fmt.text} ${fmt.unit}` : fmt.text;
          return `
            <div class="vm-prow">
              <span class="vm-prow-name">${p.label}</span>
              <div class="vm-prow-track">
                <div class="vm-prow-fill" style="width:${info.pct}%; background:${info.color};"></div>
              </div>
              <span class="vm-prow-val">${window.VayuMain.escapeHtml(valWithUnit)}</span>
            </div>
          `;
        })
        .join("");
    }

    const precList = document.getElementById("vmHomePrecautionsList");
    if (precList) {
      const precs = Array.isArray(cls.precautions) && cls.precautions.length
        ? cls.precautions
        : [cls.message, cls.recommendation].filter(Boolean);
      precList.innerHTML = precs.length
        ? precs
            .slice(0, 4)
            .map(
              (item) => `
              <li>
                <span class="vm-check-ico">&check;</span>
                <span>${window.VayuMain.escapeHtml(item)}</span>
              </li>
            `
            )
            .join("")
        : `<li><span class="vm-check-ico">&check;</span><span>Monitor air quality before outdoor exercise.</span></li>`;
    }

    const alerts = data.active_alerts || [];
    const peak = data.next_24h_peak || null;
    const alertCard = document.getElementById("vmHomeAlertStatusCard");
    const alertBadge = document.getElementById("vmHomeAlertBadge");
    if (alertCard) {
      const hasHighAqi = data.aqi != null && data.aqi > 150;
      const hasForecastRise = peak && data.aqi != null && peak.aqi >= 100 && peak.aqi >= data.aqi + 15;
      const hasAlert = alerts.length > 0 || hasHighAqi;
      alertCard.classList.toggle("is-warning", hasAlert);

      if (alerts.length > 0) {
        const top = alerts[0];
        setText("vmHomeAlertTitle", top.alert_title || "Smart Alert");
        setText("vmHomeAlertDesc", top.description || `AQI in ${cityName} requires precautions.`);
        if (alertBadge) {
          alertBadge.className = `vm-status-tag ${levelBadgeClass(top.alert_level)}`;
          alertBadge.textContent = `${alerts.length} Active`;
        }
      } else if (hasForecastRise) {
        const peakTime = window.VayuMain.formatHourLabel(peak.time);
        setText("vmHomeAlertTitle", "Smart Alert");
        setText(
          "vmHomeAlertDesc",
          `AQI may rise to ${peak.aqi} (${peak.category}) around ${peakTime || "tonight"} in ${cityName}.`
        );
        if (alertBadge) {
          alertBadge.className = `vm-status-tag ${levelBadgeClass(peak.category)}`;
          alertBadge.textContent = `Forecast: ${peak.category}`;
        }
      } else {
        setText("vmHomeAlertTitle", "Smart Alert");
        setText(
          "vmHomeAlertDesc",
          `Air quality is ${String(cls.category || "satisfactory").toLowerCase()} in ${cityName}. No sudden spikes expected.`
        );
        if (alertBadge) {
          alertBadge.className = `vm-status-tag ${levelBadgeClass(cls.category)}`;
          alertBadge.textContent = "OK";
        }
      }
    }
  }

  function setStat(id, value, unit) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = `${window.VayuMain.escapeHtml(String(value))} <span class="vm-stat-unit">${window.VayuMain.escapeHtml(unit || "")}</span>`;
  }

  /* =========================================================
     2. INSIGHTS — 5 STACKED INTELLIGENCE CARDS (insights.html)
     ========================================================= */
  async function initInsightsPage() {
    let currentParams = window.VayuMain.getStoredLocationParams();

    const historyState = {
      period: "daily",
      time_slot: "all",
      start_date: "",
      end_date: "",
      city: "",
      metric: "avg_aqi",
      latestData: null,
    };

    let eventReplayCtrl = null;

    document.querySelectorAll(".vm-jump-tabs a[href^='#']").forEach((link) => {
      link.addEventListener("click", () => {
        document.querySelectorAll(".vm-jump-tabs .vm-jump-pill").forEach((el) => el.classList.remove("active"));
        link.classList.add("active");
      });
    });

    function renderHistoryChartsAndTable(tm) {
      if (!tm) return;
      historyState.latestData = tm;

      const noticeEl = document.getElementById("histDataNotice");
      if (noticeEl) {
        if (tm.is_sample_fallback) {
          noticeEl.className = "vm-banner vm-banner-info";
          noticeEl.textContent = "Sample Data: Live past feed is limited right now, so sample history is shown.";
        } else {
          noticeEl.className = "vm-banner vm-hidden";
          noticeEl.textContent = "";
        }
      }

      const cityInput = document.getElementById("histCityInput");
      if (cityInput && tm.location && !cityInput.value.trim()) {
        cityInput.value = tm.location.name;
      }

      const startEl = document.getElementById("histStartDate");
      const endEl = document.getElementById("histEndDate");
      const allDates = tm.all_dates || tm.available_dates || [];
      if (startEl && allDates.length) {
        startEl.min = allDates[0];
        startEl.max = allDates[allDates.length - 1];
        if (!startEl.value) startEl.value = tm.start_date || allDates[0];
      }
      if (endEl && allDates.length) {
        endEl.min = allDates[0];
        endEl.max = allDates[allDates.length - 1];
        if (!endEl.value) endEl.value = tm.end_date || allDates[allDates.length - 1];
      }

      const spikesEl = document.getElementById("histSpikesStrip");
      if (spikesEl) {
        const spikes = tm.significant_spikes || [];
        spikesEl.innerHTML = spikes.length
          ? spikes
              .map((sp) => {
                const tagCls = sp.tone === "good" ? "vm-status-good" : sp.tone === "bad" ? "vm-status-bad" : "vm-status-moderate";
                const timeFormatted = String(sp.time || "").replace("T", " ");
                return `
                  <div class="vm-replay-kpi">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
                      <span class="vm-stat-label">${window.VayuMain.escapeHtml(sp.kind)}</span>
                      <span class="vm-status-tag ${tagCls}">AQI ${sp.aqi}</span>
                    </div>
                    <strong class="font-mono" style="font-size:0.84rem;">${window.VayuMain.escapeHtml(timeFormatted)}</strong>
                    <span class="vm-meta-line">${window.VayuMain.escapeHtml(sp.note || sp.category || "")}</span>
                  </div>
                `;
              })
              .join("")
          : `<div class="vm-replay-kpi"><span class="vm-meta-line">No major spikes in this date range.</span></div>`;
      }

      renderHistoryTrendChart(tm);

      const records = tm.records || [];
      setText("histRecordsCountBadge", `${records.length} record${records.length === 1 ? "" : "s"}`);
      const recBody = document.getElementById("histRecordsBody");
      if (recBody) {
        recBody.innerHTML = records.length
          ? records
              .slice(0, 40)
              .map(
                (r) => `
                <tr>
                  <td class="font-mono">${window.VayuMain.escapeHtml(`${r.date || ""} ${r.hour || ""}`)}</td>
                  <td class="tabular-nums"><strong>${r.aqi}</strong></td>
                  <td><span class="vm-status-tag ${levelBadgeClass(r.category)}">${window.VayuMain.escapeHtml(r.category || "--")}</span></td>
                  <td class="tabular-nums">${r.pm2_5 != null ? `${r.pm2_5}` : "--"}</td>
                  <td class="tabular-nums">${r.pm10 != null ? `${r.pm10}` : "--"}</td>
                  <td class="tabular-nums">${r.no2 != null ? `${r.no2}` : "--"}</td>
                  <td class="tabular-nums">${r.so2 != null ? `${r.so2}` : "--"}</td>
                  <td class="tabular-nums">${r.o3 != null ? `${r.o3}` : "--"}</td>
                </tr>
              `
              )
              .join("")
          : `<tr><td colspan="8">No records found for this filter.</td></tr>`;
      }
    }

    function renderHistoryTrendChart(tm) {
      const trendSeries = tm.active_trend_series || [];
      if (!trendSeries.length) return;
      const metric = historyState.metric || "avg_aqi";
      const metricLabels = {
        avg_aqi: { label: "AQI", unit: "AQI" },
        pm2_5: { label: "PM2.5", unit: "µg/m³" },
        pm10: { label: "PM10", unit: "µg/m³" },
        no2: { label: "NO₂", unit: "µg/m³" },
        so2: { label: "SO₂", unit: "µg/m³" },
        o3: { label: "O₃", unit: "µg/m³" },
      };
      const meta = metricLabels[metric] || metricLabels.avg_aqi;
      const periodLabel = tm.period === "weekly" ? "Weekly" : tm.period === "monthly" ? "Monthly" : "Daily";

      renderOrReplaceChart("vmTimeMachineBarChart", {
        type: "bar",
        data: {
          labels: trendSeries.map((pt) => pt.label || pt.date || ""),
          datasets: [
            {
              label: `${periodLabel} Avg ${meta.label}`,
              data: trendSeries.map((pt) => pt[metric] ?? pt.avg_aqi ?? 0),
              backgroundColor: trendSeries.map((pt) => (pt.is_spike ? "#dc2626" : aqiColorHex(pt.avg_aqi))),
              borderRadius: 6,
              barPercentage: 0.72,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                afterLabel(ctx) {
                  const pt = trendSeries[ctx.dataIndex];
                  if (!pt) return [];
                  return [
                    `Avg AQI: ${pt.avg_aqi} (Peak: ${pt.max_aqi})`,
                    pt.is_spike ? "High Pollution Spike" : "Normal Range",
                  ];
                },
              },
            },
          },
          scales: {
            y: { beginAtZero: true, title: { display: true, text: meta.unit } },
            x: { ticks: { maxTicksLimit: 12 } },
          },
        },
      });
    }

    async function loadHistory(params) {
      if (!document.getElementById("ins-history")) return;
      const noticeEl = document.getElementById("histDataNotice");
      if (historyState.start_date && historyState.end_date && historyState.start_date > historyState.end_date) {
        if (noticeEl) {
          noticeEl.className = "vm-banner vm-banner-error";
          noticeEl.textContent = "Start date must be before or equal to end date.";
        }
        return;
      }

      const reqParams = Object.assign({}, params || currentParams, {
        period: historyState.period,
        time_slot: historyState.time_slot,
      });
      if (historyState.city) reqParams.city = historyState.city;
      if (historyState.start_date) reqParams.start_date = historyState.start_date;
      if (historyState.end_date) reqParams.end_date = historyState.end_date;

      try {
        const tm = await window.VayuApi.getTimeMachine(reqParams);
        renderHistoryChartsAndTable(tm);
      } catch (tmErr) {
        if (noticeEl) {
          noticeEl.className = "vm-banner vm-banner-error";
          noticeEl.textContent = (tmErr && tmErr.message) || "Unable to load past air quality records.";
        }
      }
    }

    async function runSimulation(params) {
      const tVal = Number((document.getElementById("simTrafficSlider") || {}).value || 0);
      const dVal = Number((document.getElementById("simDustSlider") || {}).value || 0);
      const iVal = Number((document.getElementById("simIndustrialSlider") || {}).value || 0);
      const gVal = Number((document.getElementById("simGreenerySlider") || {}).value || 0);
      const bVal = Number((document.getElementById("simBurningSlider") || {}).value || 0);

      try {
        const payload = Object.assign({}, params || currentParams, {
          traffic_reduction_pct: tVal,
          dust_control_pct: dVal,
          industrial_reduction_pct: iVal,
          greenery_increase_pct: gVal,
          burning_reduction_pct: bVal,
        });
        const sim = await window.VayuApi.simulateWhatIf(payload);
        setText("simBaseAqi", `${sim.baseline.aqi} (${sim.baseline.category})`);
        setText("simOutAqi", `${sim.simulated.aqi} (${sim.simulated.category})`);
        setText("simOutPm25", `PM2.5: ${sim.baseline.pm2_5} → ${sim.simulated.pm2_5} µg/m³ · NO₂: ${sim.simulated.no2}`);
        setText(
          "simResultSummary",
          `Estimated Delta: ${sim.simulated.aqi_delta >= 0 ? "+" : ""}${sim.simulated.aqi_delta} AQI (${sim.simulated.pct_change}%)`
        );
        setText("simImpactExplanation", sim.impact_explanation || "");
      } catch (_err) {}
    }

    async function loadInsights(params, isInitial) {
      currentParams = params;
      window.VayuMain.showBanner("vmInsightsBanner", "", "info");
      try {
        const data = await window.VayuApi.getInsights(params);
        window.VayuMain.updateHeaderWeather(data.current);
        renderInsights(data);
        if (data.current && data.current.location) {
          historyState.city = data.current.location.name;
          const hc = document.getElementById("histCityInput");
          if (hc) hc.value = data.current.location.name;
        }
        await Promise.all([runSimulation(params), loadHistory(params)]);
      } catch (err) {
        if (isInitial && (params.city || params.lat != null)) {
          window.VayuMain.clearStoredLocation();
          window.VayuMain.updateCityBackground("Mumbai");
          try {
            const fallback = await window.VayuApi.getInsights({ city: "Mumbai" });
            currentParams = { city: "Mumbai" };
            window.VayuMain.updateHeaderWeather(fallback.current);
            renderInsights(fallback);
            await Promise.all([runSimulation(currentParams), loadHistory(currentParams)]);
            window.VayuMain.showBanner("vmInsightsBanner", "VayuMitra supports locations within India only. Showing Mumbai.", "info");
            return;
          } catch (_e) {}
        }
        window.VayuMain.showBanner("vmInsightsBanner", err.message || "Forecast data unavailable.", "error");
      }
    }

    document.querySelectorAll("[data-hist-period]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const period = btn.getAttribute("data-hist-period") || "daily";
        historyState.period = period;
        document.querySelectorAll("[data-hist-period]").forEach((b) => b.classList.toggle("active", b === btn));
        loadHistory(historyState.city ? { city: historyState.city } : currentParams);
      });
    });

    const histForm = document.getElementById("histFilterForm");
    if (histForm) {
      histForm.addEventListener("submit", (e) => {
        e.preventDefault();
        historyState.city = ((document.getElementById("histCityInput") || {}).value || "").trim();
        historyState.start_date = (document.getElementById("histStartDate") || {}).value || "";
        historyState.end_date = (document.getElementById("histEndDate") || {}).value || "";
        historyState.time_slot = (document.getElementById("histTimeFilter") || {}).value || "all";
        loadHistory(historyState.city ? { city: historyState.city } : currentParams);
      });
    }

    const histTimeSel = document.getElementById("histTimeFilter");
    if (histTimeSel) {
      histTimeSel.addEventListener("change", () => {
        historyState.time_slot = histTimeSel.value || "all";
        loadHistory(historyState.city ? { city: historyState.city } : currentParams);
      });
    }

    const histMetricSel = document.getElementById("histPollutantMetric");
    if (histMetricSel) {
      histMetricSel.addEventListener("change", () => {
        historyState.metric = histMetricSel.value || "avg_aqi";
        if (historyState.latestData) renderHistoryTrendChart(historyState.latestData);
      });
    }

    [
      ["simTrafficSlider", "simTrafficVal", "Control"],
      ["simDustSlider", "simDustVal", "Control"],
      ["simIndustrialSlider", "simIndustrialVal", "Control"],
      ["simGreenerySlider", "simGreeneryVal", "Boost"],
      ["simBurningSlider", "simBurningVal", "Control"],
    ].forEach(([sId, vId, verb]) => {
      const sl = document.getElementById(sId);
      if (sl) {
        setText(vId, `${verb} ${sl.value}%`);
        sl.addEventListener("input", () => {
          setText(vId, `${verb} ${sl.value}%`);
        });
        sl.addEventListener("change", () => {
          runSimulation(currentParams);
        });
      }
    });

    const simRunBtn = document.getElementById("simRunBtn");
    if (simRunBtn) {
      simRunBtn.addEventListener("click", () => runSimulation(currentParams));
    }
    const simResetBtn = document.getElementById("simResetBtn");
    if (simResetBtn) {
      simResetBtn.addEventListener("click", () => {
        ["simTrafficSlider", "simDustSlider", "simIndustrialSlider", "simGreenerySlider", "simBurningSlider"].forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.value = "0";
        });
        setText("simTrafficVal", "Control 0%");
        setText("simDustVal", "Control 0%");
        setText("simIndustrialVal", "Control 0%");
        setText("simGreeneryVal", "Boost 0%");
        setText("simBurningVal", "Control 0%");
        runSimulation(currentParams);
      });
    }

    eventReplayCtrl = initEventReplay(currentParams);

    window.addEventListener("vayumitra:citychange", (ev) => {
      const city = ev.detail && ev.detail.city;
      if (city) {
        historyState.city = city;
        historyState.start_date = "";
        historyState.end_date = "";
        const hs = document.getElementById("histStartDate");
        const he = document.getElementById("histEndDate");
        if (hs) hs.value = "";
        if (he) he.value = "";
        loadInsights({ city }, false);
        if (eventReplayCtrl && typeof eventReplayCtrl.setCityAndDetect === "function") {
          eventReplayCtrl.setCityAndDetect(city);
        }
      }
    });

    await loadInsights(currentParams, true);
    if (eventReplayCtrl && typeof eventReplayCtrl.bootstrap === "function") {
      const resolvedLabel = (document.getElementById("insLocationName") || {}).textContent;
      eventReplayCtrl.bootstrap(resolvedLabel && resolvedLabel !== "--" && resolvedLabel !== "—" ? resolvedLabel : null);
    }
  }

  function renderInsights(data) {
    const cur = data.current || {};
    const fcObj = data.forecast || {};
    const fc = fcObj.forecast_24h || [];
    const hist = fcObj.recent_history || [];
    const rate = data.rate_analysis || {};
    const pat = data.pattern_analysis || {};
    setText("insLocationName", cur.location ? cur.location.name : "—");

    const dq = fcObj.data_quality || {};
    setText("insRateStatus", rate.status || "Unavailable");
    setText("insRateSummary", rate.summary || "");
    setText("insForecastQuality", dq.quality_badge ? `${dq.quality_badge} (${dq.completeness_pct}% coverage)` : "Live Data");
    setText("insForecastPeriod", fcObj.forecast_period || "Next 24 Hours Forecast & 3-Day Outlook");

    const expPt = pat.peak_forecast || (fc.length ? fc[0] : null);
    setText("insExpectedAqiVal", expPt && expPt.aqi != null ? String(expPt.aqi) : "--");
    const expBadge = document.getElementById("insExpectedAqiBadge");
    if (expBadge) {
      const cat = (expPt && expPt.category) || naqiCategoryFromValue(expPt ? expPt.aqi : null);
      expBadge.className = `vm-status-tag ${levelBadgeClass(cat)}`;
      expBadge.textContent = cat;
    }

    if (!fcObj.available || fc.length === 0) {
      window.VayuMain.showBanner("vmInsightsBanner", "24-hour forecast data is unavailable right now.", "info");
      return;
    }

    const recentSlice = hist.slice(-12);
    const labels = [
      ...recentSlice.map((p) => `${window.VayuMain.formatHourLabel(p.time)}`),
      ...fc.map((p) => `${window.VayuMain.formatHourLabel(p.time)} (Pred)`),
    ];
    const histSeries = [...recentSlice.map((p) => p.aqi), ...fc.map(() => null)];
    const fcSeries = [...recentSlice.map((_, i) => (i === recentSlice.length - 1 ? pAqi(recentSlice[i]) : null)), ...fc.map((p) => p.aqi)];
    const upperBand = [...recentSlice.map((_, i) => (i === recentSlice.length - 1 ? pAqi(recentSlice[i]) : null)), ...fc.map((p) => p.confidence_high)];
    const lowerBand = [...recentSlice.map((_, i) => (i === recentSlice.length - 1 ? pAqi(recentSlice[i]) : null)), ...fc.map((p) => p.confidence_low)];

    function pAqi(pt) {
      return pt ? pt.aqi : null;
    }

    renderOrReplaceChart("vmInsightsForecastChart", {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Recent Measured Hourly AQI",
            data: histSeries,
            borderColor: "#10343b",
            backgroundColor: "rgba(16, 52, 59, 0.1)",
            tension: 0.3,
            pointRadius: 3,
          },
          {
            label: "Upper Uncertainty Bound",
            data: upperBand,
            borderColor: "rgba(14, 165, 233, 0.3)",
            borderDash: [2, 4],
            pointRadius: 0,
            fill: false,
          },
          {
            label: "24h Predicted AQI",
            data: fcSeries,
            borderColor: "#0ea5e9",
            borderDash: [6, 5],
            backgroundColor: "rgba(14, 165, 233, 0.16)",
            fill: "-1",
            tension: 0.3,
            pointRadius: 3,
          },
          {
            label: "Lower Uncertainty Bound",
            data: lowerBand,
            borderColor: "rgba(14, 165, 233, 0.3)",
            borderDash: [2, 4],
            backgroundColor: "rgba(14, 165, 233, 0.10)",
            fill: "-1",
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, title: { display: true, text: "AQI" } } },
      },
    });
  }

  /* =========================================================
     2B. POLLUTION EVENT REPLAY (Community Cases + Simple Explanation, No Map)
     ========================================================= */
  function initEventReplay(initialParams) {
    const section = document.getElementById("ins-event-replay");
    if (!section) return null;

    const form = document.getElementById("erFilterForm");
    const cityInput = document.getElementById("erCityInput");
    const datalist = document.getElementById("erCityDatalist");
    const startInput = document.getElementById("erStartDate");
    const endInput = document.getElementById("erEndDate");
    const pollutantSel = document.getElementById("erPollutantSelect");
    const detectBtn = document.getElementById("erDetectBtn");
    const detectedWrap = document.getElementById("erDetectedWrap");
    const caseSelectEl = document.getElementById("erCaseSelect");
    const workspaceEl = document.getElementById("erReplayWorkspace");
    const prevStepBtn = document.getElementById("erStepPrevBtn");
    const playPauseBtn = document.getElementById("erPlayPauseBtn");
    const nextStepBtn = document.getElementById("erStepNextBtn");
    const replayScrubber = document.getElementById("erReplayScrubber");
    const stepStateBadge = document.getElementById("erStepStateBadge");
    const statusBadge = document.getElementById("erStatusBadge");

    let replayTimer = null;
    let pendingTargetEventId = null;
    let pendingTargetCaseId = null;
    let replayState = {
      dataset: null,
      selectedEvent: null,
      activeStepIdx: 0,
    };

    function stopPlayback() {
      if (replayTimer) {
        clearInterval(replayTimer);
        replayTimer = null;
      }
      if (playPauseBtn) playPauseBtn.textContent = "Play";
    }

    function toYmdLocal(d) {
      const yr = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, "0");
      const da = String(d.getDate()).padStart(2, "0");
      return `${yr}-${mo}-${da}`;
    }

    function formatShortTime(isoStr) {
      if (!isoStr) return "--";
      const normalized = isoStr.length === 16 ? `${isoStr}:00` : isoStr;
      const dt = new Date(normalized);
      if (Number.isNaN(dt.getTime())) return isoStr.replace("T", " ");
      return dt.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    const today = new Date();
    const weekAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
    const todayStr = toYmdLocal(today);
    const weekAgoStr = toYmdLocal(weekAgo);
    if (startInput) {
      startInput.value = weekAgoStr;
      startInput.max = todayStr;
    }
    if (endInput) {
      endInput.value = todayStr;
      endInput.max = todayStr;
    }
    if (cityInput && initialParams && initialParams.city) {
      cityInput.value = initialParams.city;
    }

    async function populateIndiaCities() {
      if (!datalist) return;
      try {
        const dir = await window.VayuApi.getIndiaLocations();
        const names = [];
        (dir.states || []).forEach((st) => {
          (st.cities || []).forEach((c) => {
            if (c && c.name) names.push(c.name);
          });
        });
        datalist.innerHTML = Array.from(new Set(names))
          .sort()
          .map((n) => `<option value="${window.VayuMain.escapeHtml(n)}"></option>`)
          .join("");
      } catch (_err) {}
    }

    function simpleStateWord(state) {
      if (state === "Peak") return "Highest Level";
      if (state === "Increasing") return "Going Up";
      if (state === "Decreasing") return "Going Down";
      return "Steady";
    }

    function updatePointInspector(pt, dataset) {
      const box = document.getElementById("erPointInspector");
      if (!box || !pt || !dataset) return;
      const stateWord = simpleStateWord(pt.progression_state);
      const wx = pt.weather || {};
      const windPart = wx.available && wx.wind_speed != null ? ` · Wind: ${wx.wind_speed} km/h` : "";
      const aligned = Array.isArray(pt.aligned_reports) ? pt.aligned_reports : [];
      const repPart = aligned.length ? ` · Citizen report logged (${aligned[0].category})` : "";
      box.innerHTML =
        `<strong>${window.VayuMain.escapeHtml(formatShortTime(pt.time))}</strong> &middot; ` +
        `${window.VayuMain.escapeHtml(dataset.pollutant_label)}: <strong>${pt.value} ${window.VayuMain.escapeHtml(dataset.unit)}</strong> ` +
        `(${window.VayuMain.escapeHtml(stateWord)})${window.VayuMain.escapeHtml(windPart)}` +
        (repPart ? `<span style="color:#0f766e; font-weight:700;">${window.VayuMain.escapeHtml(repPart)}</span>` : "");
    }

    function applyReplayStep(idx) {
      const ev = replayState.selectedEvent;
      const ds = replayState.dataset;
      if (!ev || !ds || !Array.isArray(ev.timeline) || !ev.timeline.length) return;
      const clamped = Math.max(0, Math.min(ev.timeline.length - 1, idx));
      replayState.activeStepIdx = clamped;
      const pt = ev.timeline[clamped];

      if (replayScrubber) {
        replayScrubber.max = String(ev.timeline.length - 1);
        replayScrubber.value = String(clamped);
      }
      if (stepStateBadge) {
        const st = pt.progression_state || "Steady";
        const cls = st === "Peak" ? "vm-status-bad" : st === "Increasing" ? "vm-status-moderate" : st === "Decreasing" ? "vm-status-good" : "vm-status-satisfactory";
        stepStateBadge.className = `vm-status-tag ${cls}`;
        stepStateBadge.textContent = `${simpleStateWord(st)}`;
      }
      updatePointInspector(pt, ds);

      const chart = chartRegistry.vmEventReplayChart;
      if (chart && chart.data && chart.data.datasets && chart.data.datasets[0]) {
        const mainDs = chart.data.datasets[0];
        mainDs.pointRadius = ev.timeline.map((p, i) => (i === clamped ? 8.5 : p.is_peak ? 6 : 3.5));
        mainDs.pointBorderColor = ev.timeline.map((_, i) => (i === clamped ? "#10343b" : "#ffffff"));
        mainDs.pointBorderWidth = ev.timeline.map((_, i) => (i === clamped ? 3 : 1.5));
        chart.update("none");
      }
    }

    function renderEventTimelineChart(ev, dataset) {
      const timeline = ev.timeline || [];
      const labels = timeline.map((pt) => formatShortTime(pt.time));
      const values = timeline.map((pt) => pt.value);
      const baselineArr = timeline.map(() => ev.baseline_value);
      const reportOverlayArr = timeline.map((pt) =>
        Array.isArray(pt.aligned_reports) && pt.aligned_reports.length ? pt.value : null
      );

      const datasets = [
        {
          label: `${dataset.pollutant_label} (${dataset.unit})`,
          data: values,
          borderColor: "#0f766e",
          backgroundColor: "rgba(15, 118, 110, 0.12)",
          fill: true,
          tension: 0.28,
          pointBackgroundColor: timeline.map((pt) => (pt.is_peak ? "#dc2626" : pt.phase === "during" ? "#ea580c" : "#0f766e")),
          pointBorderColor: "#ffffff",
          pointBorderWidth: 1.5,
          pointRadius: timeline.map((pt) => (pt.is_peak ? 6 : 3.5)),
        },
        {
          label: `Normal Level (${ev.baseline_value} ${dataset.unit})`,
          data: baselineArr,
          borderColor: "#16a34a",
          borderDash: [4, 4],
          pointRadius: 0,
          borderWidth: 1.5,
          fill: false,
        },
      ];

      if (reportOverlayArr.some((v) => v !== null)) {
        datasets.push({
          label: "Community Case Marker",
          data: reportOverlayArr,
          borderColor: "#7c3aed",
          backgroundColor: "#7c3aed",
          pointStyle: "rectRot",
          pointRadius: 8,
          showLine: false,
        });
      }

      renderOrReplaceChart("vmEventReplayChart", {
        type: "line",
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          onClick(_evt, elements) {
            if (elements && elements.length > 0) {
              stopPlayback();
              applyReplayStep(elements[0].index);
            }
          },
          scales: {
            x: { ticks: { maxTicksLimit: 7 } },
            y: { beginAtZero: true, title: { display: true, text: dataset.unit } },
          },
        },
      });

      const peakIdx = timeline.findIndex((pt) => pt.is_peak);
      applyReplayStep(peakIdx >= 0 ? peakIdx : 0);
    }

    function renderSelectedCaseAndExplanation(ev, dataset) {
      const reports = ev.community_reports || [];
      const primaryCase = ev.case_report || reports[0] || null;
      const caseBox = document.getElementById("erSelectedCaseCard");
      if (caseBox) {
        if (primaryCase) {
          const isSample = Boolean(primaryCase.photo_url && String(primaryCase.photo_url).includes("/uploads/sample-"));
          const photoHtml = primaryCase.photo_url
            ? `<img src="${window.VayuMain.escapeHtml(primaryCase.photo_url)}" alt="${window.VayuMain.escapeHtml(primaryCase.title)}" class="vm-er-case-photo" />`
            : "";
          caseBox.classList.remove("vm-hidden");
          caseBox.innerHTML = `
            ${photoHtml}
            <div style="min-width:0; flex:1;">
              <div style="display:flex; justify-content:space-between; gap:8px; align-items:center; flex-wrap:wrap;">
                <strong style="font-size:0.95rem; color:var(--vm-teal-deep);">${window.VayuMain.escapeHtml(primaryCase.title)}</strong>
                <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                  <span class="vm-status-tag vm-status-moderate">${window.VayuMain.escapeHtml(primaryCase.category)}</span>
                  <span class="vm-status-tag ${levelBadgeClass(primaryCase.status)}">${window.VayuMain.escapeHtml(primaryCase.status)}</span>
                </div>
              </div>
              <div class="vm-meta-line" style="margin-top:4px;">
                ${window.VayuMain.escapeHtml(primaryCase.location_name)} &middot; ${window.VayuMain.escapeHtml(window.VayuMain.formatDateTime(primaryCase.created_at))}${isSample ? " &middot; Sample photo" : ""}
              </div>
              <p style="margin:6px 0 0; font-size:0.85rem; color:var(--vm-teal-mid); line-height:1.42;">${window.VayuMain.escapeHtml(primaryCase.description)}</p>
            </div>
          `;
        } else {
          caseBox.classList.add("vm-hidden");
          caseBox.innerHTML = "";
        }
      }

      const summaryEl = document.getElementById("erSimpleSummary");
      if (summaryEl) {
        if (ev.simple_explanation) {
          summaryEl.textContent = ev.simple_explanation;
        } else {
          const ws = ev.weather_summary || {};
          const windText =
            ws.available && ws.wind_speed_avg != null
              ? ws.wind_speed_avg < 8
                ? `Low wind (${ws.wind_speed_avg} km/h) kept polluted air trapped close to the ground.`
                : `Wind averaged ${ws.wind_speed_avg} km/h, helping slowly disperse the plume.`
              : "";
          const caseText = primaryCase
            ? `Linked Community Report: "${primaryCase.title}" (${primaryCase.category}) at ${primaryCase.location_name}.`
            : "";
          summaryEl.textContent =
            `In ${dataset.location.name}, ${dataset.pollutant_label} reached ${ev.peak_value} ${dataset.unit} around ${formatShortTime(ev.peak_time)} ` +
            `(+${ev.pct_above_baseline}% above normal ${ev.baseline_value} ${dataset.unit}, lasting ${ev.duration_hours} hrs). ${windText} ${caseText}`.trim();
        }
      }

      const extraReports = primaryCase ? reports.filter((r) => r.id !== primaryCase.id) : reports;
      const listEl = document.getElementById("erReportsList");
      if (listEl) {
        if (!extraReports.length) {
          listEl.innerHTML = "";
        } else {
          listEl.innerHTML = extraReports
            .slice(0, 2)
            .map((r) => {
              const photoHtml = r.photo_url
                ? `<img src="${window.VayuMain.escapeHtml(r.photo_url)}" alt="${window.VayuMain.escapeHtml(r.title)}" class="vm-er-report-photo" />`
                : "";
              return `
                <article class="vm-er-report-card">
                  ${photoHtml}
                  <div style="min-width:0; flex:1;">
                    <strong style="font-size:0.86rem; color:var(--vm-teal-deep);">${window.VayuMain.escapeHtml(r.title)}</strong>
                    <div class="vm-meta-line" style="margin-top:2px;">
                      ${window.VayuMain.escapeHtml(r.location_name)} &middot; ${window.VayuMain.escapeHtml(r.status)}
                    </div>
                    <p style="margin:4px 0 0; font-size:0.8rem; color:var(--vm-teal-mid);">${window.VayuMain.escapeHtml(r.description)}</p>
                  </div>
                </article>
              `;
            })
            .join("");
        }
      }
    }

    function selectEvent(ev, dataset) {
      stopPlayback();
      replayState.selectedEvent = ev;
      if (workspaceEl) workspaceEl.classList.remove("vm-hidden");

      if (statusBadge) {
        statusBadge.className = "vm-badge-data vm-badge-verified";
        statusBadge.textContent = ev.is_community_case ? "Community Case Replay" : "Spike Replay";
      }

      if (caseSelectEl && ev && ev.event_id) {
        caseSelectEl.value = ev.event_id;
      }

      renderEventTimelineChart(ev, dataset);
      renderSelectedCaseAndExplanation(ev, dataset);
    }

    function renderCaseAndSpikeButtons(data) {
      if (!caseSelectEl) return;
      const caseEvents = data.case_events || [];
      const spikeEvents = data.events || [];
      const communityCases = data.community_cases || [];
      const otherCityCases = communityCases.filter((c) => !c.is_local);

      const optionGroups = [];

      if (caseEvents.length) {
        const opts = caseEvents
          .map((ev) => {
            const rep = ev.case_report || {};
            const label = `${rep.title || "Community Case"} — ${rep.location_name || data.location.name}`;
            return `<option value="${window.VayuMain.escapeHtml(ev.event_id)}" data-kind="local">${window.VayuMain.escapeHtml(label)}</option>`;
          })
          .join("");
        optionGroups.push(`<optgroup label="${window.VayuMain.escapeHtml(data.location.name)} Community Cases">${opts}</optgroup>`);
      }

      if (otherCityCases.length) {
        const opts = otherCityCases
          .map((c) => {
            const label = `${c.title} — ${c.location_name}`;
            return `<option value="CASE-${window.VayuMain.escapeHtml(c.id)}" data-switch-city="${window.VayuMain.escapeHtml(c.city_hint)}" data-case-id="${window.VayuMain.escapeHtml(c.id)}">${window.VayuMain.escapeHtml(label)}</option>`;
          })
          .join("");
        optionGroups.push(`<optgroup label="Other Cities (Community Reports)">${opts}</optgroup>`);
      }

      if (spikeEvents.length) {
        const opts = spikeEvents
          .slice(0, 4)
          .map((ev) => {
            const label = `Spike ${ev.event_date} (${ev.peak_value} ${data.unit})`;
            return `<option value="${window.VayuMain.escapeHtml(ev.event_id)}" data-kind="local">${window.VayuMain.escapeHtml(label)}</option>`;
          })
          .join("");
        optionGroups.push(`<optgroup label="Detected Pollution Spikes">${opts}</optgroup>`);
      }

      setText("erReportsCountTag", `${communityCases.length} community case${communityCases.length === 1 ? "" : "s"} available`);
      if (!optionGroups.length) {
        caseSelectEl.innerHTML = `<option value="">No community cases available</option>`;
        return;
      }
      caseSelectEl.innerHTML = optionGroups.join("");
    }

    if (caseSelectEl) {
      caseSelectEl.addEventListener("change", () => {
        const selectedOpt = caseSelectEl.options[caseSelectEl.selectedIndex];
        const data = replayState.dataset;
        if (!selectedOpt || !data) return;

        const nextCity = selectedOpt.getAttribute("data-switch-city");
        const caseId = selectedOpt.getAttribute("data-case-id");
        if (nextCity) {
          if (statusBadge) {
            statusBadge.textContent = "Loading case...";
          }
          if (cityInput) {
            cityInput.value = nextCity;
          }
          pendingTargetEventId = selectedOpt.value || null;
          pendingTargetCaseId = caseId ? Number(caseId) : null;
          runDetection();
          return;
        }

        const eid = selectedOpt.value;
        const allLocalPlayable = [...(data.case_events || []), ...(data.events || [])];
        const found = allLocalPlayable.find((e) => e.event_id === eid);
        if (found) {
          selectEvent(found, data);
        }
      });
    }

    async function runDetection() {
      stopPlayback();
      const city = (cityInput ? cityInput.value : "").trim();
      const startDate = startInput ? startInput.value : "";
      const endDate = endInput ? endInput.value : "";
      const pollutant = pollutantSel ? pollutantSel.value : "pm2_5";

      if (!city) {
        window.VayuMain.showBanner("erMessageBanner", "Please enter an Indian city.", "error");
        return;
      }

      window.VayuMain.showBanner("erMessageBanner", "", "info");
      if (detectBtn) {
        detectBtn.disabled = true;
        detectBtn.textContent = "Loading...";
      }

      try {
        const reqParams = {
          city,
          start_date: startDate,
          end_date: endDate,
          pollutant,
          baseline_method: "median",
          threshold_pct: 35,
          window_hours: 12,
        };
        if (pendingTargetCaseId != null) {
          reqParams.case_id = pendingTargetCaseId;
        }
        const data = await window.VayuApi.getEventReplay(reqParams);
        replayState.dataset = data;
        replayState.selectedEvent = null;

        const caseEvents = data.case_events || [];
        const spikeEvents = data.events || [];
        const allPlayable = [...caseEvents, ...spikeEvents];

        if (detectedWrap) detectedWrap.classList.remove("vm-hidden");
        renderCaseAndSpikeButtons(data);

        if (!allPlayable.length) {
          // If the entered city has zero local reports & zero spikes, auto-load the first Community Report city case so it never shows nothing
          const firstGlobalCase = (data.community_cases || [])[0];
          if (firstGlobalCase && firstGlobalCase.city_hint && firstGlobalCase.city_hint.toLowerCase() !== city.toLowerCase()) {
            if (cityInput) cityInput.value = firstGlobalCase.city_hint;
            pendingTargetEventId = `CASE-${firstGlobalCase.id}`;
            pendingTargetCaseId = firstGlobalCase.id;
            if (detectBtn) {
              detectBtn.disabled = false;
              detectBtn.textContent = "Load Cases";
            }
            return runDetection();
          }
          if (workspaceEl) workspaceEl.classList.add("vm-hidden");
          window.VayuMain.showBanner("erMessageBanner", "Click any Community Report case above to replay and view its explanation.", "info");
          return;
        }

        const preferred = pendingTargetEventId
          ? allPlayable.find((e) => e.event_id === pendingTargetEventId) || allPlayable[0]
          : allPlayable[0];
        pendingTargetEventId = null;
        pendingTargetCaseId = null;
        selectEvent(preferred, data);
      } catch (err) {
        pendingTargetCaseId = null;
        if (workspaceEl) workspaceEl.classList.add("vm-hidden");
        window.VayuMain.showBanner("erMessageBanner", err.message || "Could not load community report cases.", "error");
      } finally {
        if (detectBtn) {
          detectBtn.disabled = false;
          detectBtn.textContent = "Load Cases";
        }
      }
    }

    if (prevStepBtn) {
      prevStepBtn.addEventListener("click", () => {
        stopPlayback();
        applyReplayStep(replayState.activeStepIdx - 1);
      });
    }
    if (nextStepBtn) {
      nextStepBtn.addEventListener("click", () => {
        stopPlayback();
        applyReplayStep(replayState.activeStepIdx + 1);
      });
    }
    if (replayScrubber) {
      replayScrubber.addEventListener("input", () => {
        stopPlayback();
        applyReplayStep(Number(replayScrubber.value || 0));
      });
    }
    if (playPauseBtn) {
      playPauseBtn.addEventListener("click", () => {
        const ev = replayState.selectedEvent;
        if (!ev || !Array.isArray(ev.timeline) || !ev.timeline.length) return;
        if (replayTimer) {
          stopPlayback();
          return;
        }
        playPauseBtn.textContent = "Pause";
        if (replayState.activeStepIdx >= ev.timeline.length - 1) {
          applyReplayStep(0);
        }
        replayTimer = setInterval(() => {
          const curEv = replayState.selectedEvent;
          if (!curEv || !curEv.timeline || !curEv.timeline.length) {
            stopPlayback();
            return;
          }
          const nextIdx = replayState.activeStepIdx + 1;
          if (nextIdx >= curEv.timeline.length) {
            stopPlayback();
          } else {
            applyReplayStep(nextIdx);
          }
        }, 850);
      });
    }

    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        runDetection();
      });
    }

    populateIndiaCities();

    return {
      bootstrap(resolvedCity) {
        if (cityInput && !cityInput.value.trim()) {
          cityInput.value = resolvedCity || "Mumbai";
        }
        if (cityInput && cityInput.value.trim()) {
          runDetection();
        }
      },
      setCityAndDetect(city) {
        if (cityInput && city) {
          cityInput.value = city;
          runDetection();
        }
      },
    };
  }

  /* =========================================================
     3. SMART CLEAN-AIR NAVIGATION (routes.html)
     ========================================================= */
  let routeMap = null;
  let routeLayerGroup = null;

  function formatDurationHrMin(minutes) {
    const mins = Math.max(1, Math.round(Number(minutes) || 0));
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    if (hrs > 0 && rem > 0) return `${hrs} hr ${rem} min`;
    if (hrs > 0) return `${hrs} hr`;
    return `${rem} min`;
  }

  async function initRoutesPage() {
    const mapEl = document.getElementById("vmRouteMap");
    if (mapEl && typeof window.L !== "undefined") {
      routeMap = window.L.map("vmRouteMap", {
        minZoom: 4,
        maxBounds: [
          [5.5, 67.0],
          [38.5, 98.5],
        ],
        maxBoundsViscosity: 0.8,
      }).setView([19.076, 72.8777], 12);
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 18,
      }).addTo(routeMap);
      routeLayerGroup = window.L.layerGroup().addTo(routeMap);
    }

    let selectedMode = "walking";
    const originInput = document.getElementById("vmRouteOrigin");
    const destInput = document.getElementById("vmRouteDest");
    const swapBtn = document.getElementById("vmSwapRouteBtn");

    const modeButtons = document.querySelectorAll(".vm-mode-btn");
    modeButtons.forEach((btn) => {
      btn.addEventListener("click", async () => {
        modeButtons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        selectedMode = btn.getAttribute("data-mode") || "walking";
        const oVal = (originInput ? originInput.value : "").trim();
        const dVal = (destInput ? destInput.value : "").trim();
        if (oVal && dVal) {
          await searchRoutes(oVal, dVal, selectedMode);
        }
      });
    });

    if (swapBtn && originInput && destInput) {
      swapBtn.addEventListener("click", async () => {
        const tmp = originInput.value;
        originInput.value = destInput.value;
        destInput.value = tmp;
        const oVal = originInput.value.trim();
        const dVal = destInput.value.trim();
        if (oVal && dVal) {
          await searchRoutes(oVal, dVal, selectedMode);
        }
      });
    }

    const form = document.getElementById("vmRouteSearchForm");
    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const origin = (originInput ? originInput.value : "").trim();
        const destination = (destInput ? destInput.value : "").trim();
        if (!origin || !destination) {
          window.VayuMain.showBanner("vmRoutesBanner", "Please enter both a starting location and destination.", "error");
          return;
        }
        await searchRoutes(origin, destination, selectedMode);
      });
    }

    await searchRoutes("Bandra, Mumbai", "Colaba, Mumbai", selectedMode);
  }

  async function searchRoutes(origin, destination, mode) {
    const submitBtn = document.getElementById("vmRouteSubmitBtn");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Finding Routes...";
    }
    window.VayuMain.showBanner("vmRoutesBanner", "", "info");
    try {
      const data = await window.VayuApi.getRoutes({ origin, destination, mode });
      renderRoutesResult(data);
    } catch (err) {
      window.VayuMain.showBanner("vmRoutesBanner", err.message || "Unable to compute routes.", "error");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Find Cleaner Route";
      }
    }
  }

  function updateSelectedRouteMetrics(routeObj, data) {
    const avgAqi = routeObj ? routeObj.avg_aqi : null;
    const cat = naqiCategoryFromValue(avgAqi);
    const pointerEl = document.getElementById("vmRouteSpectrumPointer");
    if (pointerEl) {
      const pct = avgAqi != null ? Math.min(96, Math.max(4, Math.round((avgAqi / 400) * 100))) : 25;
      pointerEl.style.left = `${pct}%`;
    }

    const catEl = document.getElementById("vmRouteSelectedCategory");
    if (catEl) {
      catEl.className = `vm-status-tag ${levelBadgeClass(cat)}`;
      catEl.textContent = cat;
    }

    setText("vmRouteSelectedAvgAqi", avgAqi != null ? `Avg AQI ${avgAqi}` : "Avg AQI N/A");
    const durLabel = routeObj ? routeObj.duration_formatted || formatDurationHrMin(routeObj.duration_min) : "";
    setText(
      "vmMapStatusBadge",
      routeObj ? `${routeObj.label}: ${avgAqi != null ? `AQI ${avgAqi} · ${durLabel}` : durLabel}` : "Live AQI Checkpoints"
    );

    const tipsEl = document.getElementById("vmRouteTipsList");
    if (tipsEl && routeObj) {
      const tips = [];
      if (avgAqi != null && avgAqi > 150) {
        tips.push("Wear an N95 mask along this corridor due to elevated AQI.");
      } else {
        tips.push(`Air quality along ${routeObj.label} is ${cat.toLowerCase()} for ${data.mode || "travel"}.`);
      }
      if ((routeObj.incident_hits || 0) > 0) {
        tips.push(`Route passes near ${routeObj.incident_hits} reported pollution incident(s) — stay alert.`);
      } else {
        tips.push("Safe corridor stays clear of active red pollution hotspot circles.");
      }
      if (data.best_travel_time) {
        tips.push(`Best upcoming clean window: ${window.VayuMain.formatHourLabel(data.best_travel_time.time)} (AQI ${data.best_travel_time.aqi}).`);
      }
      tipsEl.innerHTML = tips
        .map((t) => `<li><span class="vm-check-ico">&check;</span><span>${window.VayuMain.escapeHtml(t)}</span></li>`)
        .join("");
    }
  }

  function renderRoutesResult(data) {
    setText("vmRouteSummaryNote", data.recommendation_note || "");

    const bestWinEl = document.getElementById("vmRouteBestTime");
    if (bestWinEl) {
      if (data.best_travel_time) {
        bestWinEl.textContent = `${window.VayuMain.formatHourLabel(data.best_travel_time.time)} · AQI ${data.best_travel_time.aqi} (${data.best_travel_time.category})`;
      } else {
        bestWinEl.textContent = "Forecast travel window unavailable.";
      }
    }

    const destAir = data.destination_air || null;
    setText("vmDestAqiValue", destAir && destAir.aqi != null ? String(destAir.aqi) : "--");
    const destBadge = document.getElementById("vmDestAqiBadge");
    if (destBadge) {
      const dCat = destAir && destAir.category ? destAir.category : "Unavailable";
      destBadge.className = `vm-status-tag ${levelBadgeClass(dCat)}`;
      destBadge.textContent = dCat;
    }
    setText(
      "vmDestTempVal",
      destAir && destAir.temperature != null ? `${Number(destAir.temperature).toFixed(1)}${destAir.temp_unit || "°C"}` : "--"
    );
    setText("vmDestWeatherCond", destAir && destAir.condition ? destAir.condition : "--");

    const winGrid = document.getElementById("vmCleanWindowsGrid");
    if (winGrid) {
      const windows = data.clean_air_windows || [];
      if (!windows.length) {
        winGrid.innerHTML = `<article class="vm-card">24-hour forecast windows unavailable right now.</article>`;
      } else {
        winGrid.innerHTML = windows
          .map((w) => {
            const stCls = w.status === "Avoid" ? "vm-status-worse" : w.status === "Caution" ? "vm-status-moderate" : "vm-status-good";
            return `
              <article class="vm-card">
                <div class="vm-aqi-header-row" style="margin-bottom:6px;">
                  <span class="vm-stat-label">${window.VayuMain.escapeHtml(w.label)}</span>
                  <span class="vm-status-tag ${stCls}">${window.VayuMain.escapeHtml(w.status)}</span>
                </div>
                <div class="vm-stat-value tabular-nums" style="font-size:1.3rem;">${window.VayuMain.formatHourLabel(w.time)} · AQI ${w.aqi}</div>
                <p class="vm-section-subtitle" style="margin-top:6px;">${window.VayuMain.escapeHtml(w.guidance)}</p>
              </article>
            `;
          })
          .join("");
      }
    }

    const cardsEl = document.getElementById("vmRouteCards");
    const routes = data.routes || [];
    const defaultSelectedIdx = Math.max(0, routes.findIndex((r) => r.route_type === "safe_air" || r.is_recommended));
    if (cardsEl) {
      cardsEl.innerHTML = routes
        .map((r, idx) => {
          const isSafe = r.route_type === "safe_air";
          const isSel = idx === defaultSelectedIdx;
          const durText = r.duration_formatted || formatDurationHrMin(r.duration_min);
          const badgeHtml = isSafe
            ? `<span class="vm-status-tag vm-status-good">Safe Air</span>`
            : `<span class="vm-status-tag vm-status-moderate">Standard</span>`;
          const routeIcon = isSafe
            ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"></path><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"></path></svg>`
            : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"></path><circle cx="7" cy="17" r="2"></circle><path d="M9 17h6"></path><circle cx="17" cy="17" r="2"></circle></svg>`;
          return `
            <div class="vm-route-option ${isSafe ? "safe-air" : ""} ${r.is_recommended ? "recommended" : ""} ${isSel ? "selected" : ""}" data-route-idx="${idx}">
              <div class="vm-aqi-header-row" style="margin-bottom:6px;">
                <span class="vm-title-with-ico" style="gap:8px;">
                  ${routeIcon}
                  <strong>${window.VayuMain.escapeHtml(r.label)}</strong>
                </span>
                ${badgeHtml}
              </div>
              <div class="vm-meta-line" style="margin-bottom:6px;">
                <strong class="tabular-nums" style="color:var(--vm-ink-primary);">${window.VayuMain.escapeHtml(durText)}</strong>
                <span>·</span>
                <span class="tabular-nums">${r.distance_km} km (${window.VayuMain.escapeHtml(data.mode)})</span>
                <span>·</span>
                <span class="tabular-nums">AQI: ${r.avg_aqi != null ? r.avg_aqi : "N/A"}</span>
                <span>·</span>
                <span class="tabular-nums">Hotspots: ${r.incident_hits ?? 0}</span>
              </div>
              <p class="vm-section-subtitle">${window.VayuMain.escapeHtml(r.recommendation_reason || "")}</p>
            </div>
          `;
        })
        .join("");

      cardsEl.querySelectorAll(".vm-route-option").forEach((card) => {
        card.addEventListener("click", () => {
          cardsEl.querySelectorAll(".vm-route-option").forEach((c) => c.classList.remove("selected"));
          card.classList.add("selected");
          const idx = Number(card.getAttribute("data-route-idx"));
          drawRoutesOnMap(data, idx);
          updateSelectedRouteMetrics(routes[idx], data);
        });
      });
    }

    updateSelectedRouteMetrics(routes[defaultSelectedIdx], data);

    const hotspots = data.hotspot_zones || [];
    setText("vmRouteHotspotCount", `${hotspots.length} Active`);
    const hotspotsEl = document.getElementById("vmRoutesHotspotsList");
    if (hotspotsEl) {
      hotspotsEl.innerHTML = hotspots.length
        ? hotspots
            .slice(0, 8)
            .map(
              (h) => `
              <li>
                <div class="vm-aqi-header-row" style="margin-bottom:4px;">
                  <strong>${window.VayuMain.escapeHtml(h.title || h.hotspot_type || "Hotspot")}</strong>
                  <span class="vm-status-tag ${h.is_verified ? "vm-status-bad" : "vm-status-moderate"}">${window.VayuMain.escapeHtml(h.hotspot_type || "Hotspot")}</span>
                </div>
                <div class="vm-meta-line">
                  ${h.aqi != null ? `<span>AQI ${h.aqi} (${window.VayuMain.escapeHtml(h.category || "")})</span>` : ""}
                  ${h.location_name ? `<span>${window.VayuMain.escapeHtml(h.location_name)}</span>` : ""}
                </div>
              </li>
            `
            )
            .join("")
        : `<li>No high-AQI hotspots along this corridor.</li>`;
    }

    const incListEl = document.getElementById("vmRoutesIncidentsList");
    const incUpdates = data.incident_updates || [];
    if (incListEl) {
      incListEl.innerHTML = incUpdates.length
        ? incUpdates
            .map(
              (inc) => `
              <li>
                <div class="vm-aqi-header-row" style="margin-bottom:4px;">
                  <strong>${window.VayuMain.escapeHtml(inc.title)}</strong>
                  <span class="vm-badge-data ${inc.is_verified ? "vm-badge-verified" : "vm-badge-unverified"}">${window.VayuMain.escapeHtml(inc.status)}</span>
                </div>
                <div class="vm-meta-line">
                  <span class="font-mono">${window.VayuMain.escapeHtml(inc.report_code)}</span>
                  <span>·</span>
                  <span>${window.VayuMain.escapeHtml(inc.category)}</span>
                  <span>·</span>
                  <span>${window.VayuMain.escapeHtml(inc.location_name)}</span>
                </div>
              </li>
            `
            )
            .join("")
        : `<li>No active community incident updates reported yet.</li>`;
    }

    drawRoutesOnMap(data, defaultSelectedIdx);
  }

  function drawRoutesOnMap(data, selectedIdx) {
    if (!routeMap || !routeLayerGroup || typeof window.L === "undefined") return;
    routeLayerGroup.clearLayers();
    const bounds = [];

    (data.routes || []).forEach((r, idx) => {
      const coords = (r.geometry && r.geometry.coordinates ? r.geometry.coordinates : []).map((c) => [c[1], c[0]]);
      if (!coords.length) return;
      const isSelected = idx === selectedIdx;
      const isSafe = r.route_type === "safe_air";
      const color = isSafe ? "#16A34A" : "#475569";
      const line = window.L.polyline(coords, {
        color,
        weight: isSelected ? 6 : 4,
        opacity: isSelected ? 0.94 : 0.62,
        dashArray: isSafe ? null : "6, 8",
      }).addTo(routeLayerGroup);
      line.bindPopup(`<strong>${window.VayuMain.escapeHtml(r.label)}</strong><br>${window.VayuMain.escapeHtml(r.duration_formatted || formatDurationHrMin(r.duration_min))} · ${r.distance_km} km<br>Avg AQI: ${r.avg_aqi ?? "N/A"}`);
      coords.forEach((pt) => bounds.push(pt));

      if (isSelected) {
        (r.waypoints || []).forEach((w, wIdx) => {
          const markerColor = aqiColorHex(w.aqi);
          const circle = window.L.circleMarker([w.lat, w.lon], {
            radius: w.aqi > 100 ? 9 : 7,
            color: "#ffffff",
            weight: 2,
            fillColor: markerColor,
            fillOpacity: 0.95,
          }).addTo(routeLayerGroup);
          circle.bindPopup(
            `<strong>Checkpoint ${wIdx + 1}</strong><br>AQI: ${w.aqi} (${w.category})<br>PM2.5: ${w.pm2_5 ?? "N/A"} µg/m³`
          );
        });
      }
    });

    (data.hotspot_zones || []).forEach((hz) => {
      if (hz.lat == null || hz.lon == null) return;
      const isVerified = Boolean(hz.is_verified);
      window.L.circle([hz.lat, hz.lon], {
        radius: 1200,
        color: isVerified ? "#DC2626" : "#D97706",
        fillColor: isVerified ? "#EF4444" : "#F59E0B",
        fillOpacity: 0.22,
        weight: 2,
      })
        .addTo(routeLayerGroup)
        .bindPopup(`<strong>${window.VayuMain.escapeHtml(hz.hotspot_type)}</strong><br>${window.VayuMain.escapeHtml(hz.title || "")}`);
      bounds.push([hz.lat, hz.lon]);
    });

    if (data.origin) {
      window.L.marker([data.origin.latitude, data.origin.longitude])
        .addTo(routeLayerGroup)
        .bindPopup(`<strong>Start:</strong> ${window.VayuMain.escapeHtml(data.origin.name)}`);
    }
    if (data.destination) {
      window.L.marker([data.destination.latitude, data.destination.longitude])
        .addTo(routeLayerGroup)
        .bindPopup(`<strong>Destination:</strong> ${window.VayuMain.escapeHtml(data.destination.name)}`);
    }

    if (bounds.length) {
      routeMap.fitBounds(bounds, { padding: [36, 36] });
    }
  }

  /* =========================================================
     4. AIR GUARDIAN NETWORK / COMMUNITY (community.html)
     ========================================================= */
  let communityMap = null;
  let communityLayerGroup = null;
  let cachedCommunityReports = [];
  let activeCommunityMapCategory = "";

  const CITY_COORDS_FALLBACK = {
    mumbai: [19.076, 72.8777],
    delhi: [28.6139, 77.209],
    bengaluru: [12.9716, 77.5946],
    bangalore: [12.9716, 77.5946],
    pune: [18.5204, 73.8567],
    chennai: [13.0827, 80.2707],
    kolkata: [22.5726, 88.3639],
    hyderabad: [17.385, 78.4867],
    ahmedabad: [23.0225, 72.5714],
    jaipur: [26.9124, 75.7873],
    lucknow: [26.8467, 80.9462],
    indore: [22.7196, 75.8577],
    surat: [21.1702, 72.8311],
    nagpur: [21.1458, 79.0882],
    patna: [25.5941, 85.1376],
    bhopal: [23.2599, 77.4126],
  };

  function resolveReportCoords(report) {
    if (report.latitude != null && report.longitude != null) {
      return [Number(report.latitude), Number(report.longitude)];
    }
    const locStr = String(report.location_name || "").toLowerCase();
    for (const [key, coords] of Object.entries(CITY_COORDS_FALLBACK)) {
      if (locStr.includes(key)) {
        // deterministic tiny jitter so multiple city reports don't overlap identically
        const jitter = ((Number(report.id || 1) % 7) - 3) * 0.008;
        return [coords[0] + jitter, coords[1] - jitter];
      }
    }
    return null;
  }

  function communityCategoryColor(cat) {
    const c = String(cat || "").toLowerCase();
    if (c.includes("smoke") || c.includes("garbage")) return "#EA580C";
    if (c.includes("dust") || c.includes("construction")) return "#D97706";
    if (c.includes("industrial") || c.includes("vehicle")) return "#7C3AED";
    return "#16A34A";
  }

  function drawCommunityMap(reports) {
    if (!communityMap || !communityLayerGroup || typeof window.L === "undefined") return;
    communityLayerGroup.clearLayers();

    const filtered = activeCommunityMapCategory
      ? reports.filter((r) => String(r.category || "").toLowerCase() === activeCommunityMapCategory.toLowerCase())
      : reports;

    const bounds = [];
    filtered.forEach((r) => {
      const pt = resolveReportCoords(r);
      if (!pt) return;
      bounds.push(pt);
      const color = communityCategoryColor(r.category);
      const marker = window.L.circleMarker(pt, {
        radius: 9,
        color: "#ffffff",
        weight: 2.5,
        fillColor: color,
        fillOpacity: 0.94,
      }).addTo(communityLayerGroup);

      marker.bindPopup(`
        <strong>${window.VayuMain.escapeHtml(r.title)}</strong><br>
        <span>${window.VayuMain.escapeHtml(r.category)} &middot; ${window.VayuMain.escapeHtml(r.status)}</span><br>
        <small>${window.VayuMain.escapeHtml(r.location_name)}</small>
      `);
    });

    if (bounds.length > 1) {
      communityMap.fitBounds(bounds, { padding: [36, 36], maxZoom: 13 });
    } else if (bounds.length === 1) {
      communityMap.setView(bounds[0], 12);
    } else {
      communityMap.setView([20.5937, 78.9629], 5);
    }
  }

  async function initCommunityPage() {
    const mapEl = document.getElementById("vmCommunityMap");
    if (mapEl && typeof window.L !== "undefined") {
      communityMap = window.L.map("vmCommunityMap", {
        minZoom: 4,
        maxBounds: [
          [5.5, 67.0],
          [38.5, 98.5],
        ],
        maxBoundsViscosity: 0.8,
      }).setView([20.5937, 78.9629], 5);
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 18,
      }).addTo(communityMap);
      communityLayerGroup = window.L.layerGroup().addTo(communityMap);
    }

    const form = document.getElementById("vmCommunityForm");
    const photoInput = document.getElementById("vmReportPhoto");
    const previewImg = document.getElementById("vmPhotoPreview");
    const useLocBtn = document.getElementById("vmReportUseLocBtn");
    const locInput = document.getElementById("vmReportLocation");
    const latInput = document.getElementById("vmReportLat");
    const lonInput = document.getElementById("vmReportLon");

    const searchInput = document.getElementById("vmCommSearchInput");
    const statusFilter = document.getElementById("vmCommStatusFilter");
    const catFilter = document.getElementById("vmCommCategoryFilter");

    document.querySelectorAll("#vmCommMapPills .vm-map-pill").forEach((pill) => {
      pill.addEventListener("click", () => {
        document.querySelectorAll("#vmCommMapPills .vm-map-pill").forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
        activeCommunityMapCategory = pill.getAttribute("data-cat") || "";
        drawCommunityMap(cachedCommunityReports);
      });
    });

    function getFilterParams() {
      return {
        search: searchInput ? searchInput.value.trim() : "",
        status: statusFilter ? statusFilter.value : "",
        category: catFilter ? catFilter.value : "",
      };
    }

    if (searchInput) searchInput.addEventListener("input", () => loadCommunityReports(getFilterParams()));
    if (statusFilter) statusFilter.addEventListener("change", () => loadCommunityReports(getFilterParams()));
    if (catFilter) catFilter.addEventListener("change", () => loadCommunityReports(getFilterParams()));

    if (photoInput && previewImg) {
      photoInput.addEventListener("change", () => {
        const file = photoInput.files && photoInput.files[0];
        if (!file) {
          previewImg.classList.add("vm-hidden");
          previewImg.removeAttribute("src");
          return;
        }
        const allowed = ["image/png", "image/jpeg", "image/webp"];
        if (!allowed.includes(file.type)) {
          window.VayuMain.showBanner("vmCommunityBanner", "Only PNG, JPG, JPEG, or WEBP photos are allowed.", "error");
          photoInput.value = "";
          previewImg.classList.add("vm-hidden");
          return;
        }
        if (file.size > 5 * 1024 * 1024) {
          window.VayuMain.showBanner("vmCommunityBanner", "Photo file size must be 5 MB or smaller.", "error");
          photoInput.value = "";
          previewImg.classList.add("vm-hidden");
          return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
          previewImg.src = ev.target.result;
          previewImg.classList.remove("vm-hidden");
        };
        reader.readAsDataURL(file);
      });
    }

    if (useLocBtn && locInput) {
      useLocBtn.addEventListener("click", async () => {
        useLocBtn.disabled = true;
        try {
          const coords = await window.VayuMain.requestBrowserLocation();
          if (latInput) latInput.value = String(coords.lat);
          if (lonInput) lonInput.value = String(coords.lon);
          const aq = await window.VayuApi.getAirQuality({ lat: coords.lat, lon: coords.lon });
          locInput.value = aq.location ? aq.location.name : `${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}`;
        } catch (err) {
          window.VayuMain.showBanner("vmCommunityBanner", err.message, "error");
        } finally {
          useLocBtn.disabled = false;
        }
      });
    }

    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        window.VayuMain.showBanner("vmCommunityBanner", "", "info");
        const title = document.getElementById("vmReportTitle").value.trim();
        const category = document.getElementById("vmReportCategory").value;
        const locationName = locInput.value.trim();
        const description = document.getElementById("vmReportDesc").value.trim();

        if (title.length < 4 || description.length < 10 || locationName.length < 2) {
          window.VayuMain.showBanner(
            "vmCommunityBanner",
            "Please fill in a descriptive title (min 4 chars), location, and details (min 10 chars).",
            "error"
          );
          return;
        }

        const fd = new FormData();
        fd.append("title", title);
        fd.append("category", category);
        fd.append("location_name", locationName);
        fd.append("description", description);
        if (latInput && latInput.value) fd.append("latitude", latInput.value);
        if (lonInput && lonInput.value) fd.append("longitude", lonInput.value);
        if (photoInput && photoInput.files && photoInput.files[0]) {
          fd.append("photo", photoInput.files[0]);
        }

        const submitBtn = document.getElementById("vmReportSubmitBtn");
        if (submitBtn) submitBtn.disabled = true;
        try {
          const res = await window.VayuApi.submitCommunityReport(fd);
          window.VayuMain.showBanner("vmCommunityBanner", `Report ${res.report.report_code} submitted.`, "success");
          form.reset();
          if (previewImg) previewImg.classList.add("vm-hidden");
          await loadCommunityReports(getFilterParams());
        } catch (err) {
          window.VayuMain.showBanner("vmCommunityBanner", err.message || "Failed to submit report.", "error");
        } finally {
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }

    await loadCommunityReports(getFilterParams());
  }

  function communityCategoryClass(cat) {
    const c = String(cat || "").toLowerCase();
    if (c.includes("smoke")) return "cat-smoke";
    if (c.includes("dust") || c.includes("construction")) return "cat-dust";
    if (c.includes("industrial")) return "cat-industrial";
    if (c.includes("garbage") || c.includes("waste")) return "cat-garbage";
    if (c.includes("vehicle") || c.includes("traffic")) return "cat-vehicle";
    return "cat-other";
  }

  async function loadCommunityReports(filters) {
    const feedEl = document.getElementById("vmCommunityFeed");
    const previewEl = document.getElementById("vmCommunityRecentPreview");
    if (!feedEl) return;
    try {
      const data = await window.VayuApi.getCommunityReports(filters || {});
      const reports = data.reports || [];
      cachedCommunityReports = reports;
      const contrib = data.contribution_summary || {};

      setText("commTotalCount", String(contrib.total_reports ?? reports.length));
      setText("commGuardianTier", contrib.guardian_tier || "Bronze Air Guardian");
      setText("commGuardianPoints", `${contrib.guardian_points ?? 0} pts`);
      setText("commVerifiedCount", `${(contrib.verified_count || 0) + (contrib.resolved_count || 0)}`);
      setText("commPendingCount", `${contrib.pending_count ?? 0}`);
      setText("vmReportsCount", `${reports.length} report${reports.length === 1 ? "" : "s"}`);

      drawCommunityMap(reports);

      if (previewEl) {
        previewEl.innerHTML = reports.length
          ? reports
              .slice(0, 3)
              .map((r) => {
                const stCls =
                  r.status === "Resolved" || r.status === "Verified"
                    ? "vm-status-good"
                    : r.status === "Under Review"
                    ? "vm-status-moderate"
                    : "vm-status-bad";
                return `
                  <div class="vm-twin-item-row" style="padding:10px 12px;">
                    <div style="min-width:0;">
                      <strong style="display:block; font-size:0.9rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${window.VayuMain.escapeHtml(r.title)}</strong>
                      <div class="vm-meta-line">${window.VayuMain.escapeHtml(r.location_name)} &middot; ${window.VayuMain.formatDateTime(r.created_at)}</div>
                    </div>
                    <span class="vm-status-tag ${stCls}">${window.VayuMain.escapeHtml(r.status)}</span>
                  </div>
                `;
              })
              .join("")
          : `<span class="vm-meta-line">No citizen reports logged yet.</span>`;
      }

      if (reports.length === 0) {
        feedEl.innerHTML = `
          <div class="vm-card">
            <strong>No reports found yet.</strong>
            <p class="vm-section-subtitle">Use the form to report a local pollution incident or clear active filters.</p>
          </div>
        `;
        return;
      }

      feedEl.innerHTML = reports
        .map((r) => {
          const statusCls =
            r.status === "Resolved" || r.status === "Verified"
              ? "vm-status-good"
              : r.status === "Under Review"
              ? "vm-status-moderate"
              : r.status === "Rejected"
              ? "vm-status-worse"
              : "vm-status-bad";
          const catCls = communityCategoryClass(r.category);
          return `
          <article class="vm-report-item ${catCls}">
            <div>
              <div class="vm-aqi-header-row" style="margin-bottom:4px;">
                <strong style="font-size:0.95rem;">${window.VayuMain.escapeHtml(r.title)}</strong>
                <div style="display:flex; gap:5px; flex-wrap:wrap;">
                  <span class="vm-cat-chip">${window.VayuMain.escapeHtml(r.category)}</span>
                  <span class="vm-status-tag ${statusCls}">${window.VayuMain.escapeHtml(r.status)}</span>
                </div>
              </div>
              <div class="vm-meta-line" style="margin-bottom:4px; font-size:0.78rem;">
                <span>${window.VayuMain.escapeHtml(r.location_name)}</span>
                <span>·</span>
                <span>${window.VayuMain.formatDateTime(r.created_at)}</span>
                <span>·</span>
                <label for="status-${r.id}" style="font-weight:600;">Update:</label>
                <select id="status-${r.id}" class="vm-select vm-report-status-select" data-id="${r.id}" style="width:auto; padding:2px 8px; font-size:0.78rem;">
                  <option value="Submitted" ${r.status === "Submitted" ? "selected" : ""}>Submitted</option>
                  <option value="Under Review" ${r.status === "Under Review" ? "selected" : ""}>Under Review</option>
                  <option value="Verified" ${r.status === "Verified" ? "selected" : ""}>Verified</option>
                  <option value="Resolved" ${r.status === "Resolved" ? "selected" : ""}>Resolved</option>
                  <option value="Rejected" ${r.status === "Rejected" ? "selected" : ""}>Rejected</option>
                </select>
              </div>
              <p class="vm-report-desc-compact">${window.VayuMain.escapeHtml(r.description)}</p>
            </div>
            ${
              r.photo_url
                ? `<img src="${window.VayuMain.escapeHtml(r.photo_url)}" alt="Photo for ${window.VayuMain.escapeHtml(r.title)}" class="vm-report-thumb" />`
                : ""
            }
          </article>
        `;
        })
        .join("");

      feedEl.querySelectorAll(".vm-report-status-select").forEach((sel) => {
        sel.addEventListener("change", async () => {
          const rid = Number(sel.getAttribute("data-id"));
          try {
            await window.VayuApi.updateReportStatus(rid, sel.value);
            await loadCommunityReports(filters);
          } catch (err) {
            window.VayuMain.showBanner("vmCommunityBanner", err.message, "error");
          }
        });
      });
    } catch (err) {
      feedEl.innerHTML = `<div class="vm-banner vm-banner-error">${window.VayuMain.escapeHtml(err.message)}</div>`;
    }
  }

  /* =========================================================
     5. POLLUTION EMERGENCY SYSTEM (alerts.html)
     ========================================================= */
  let alertMap = null;
  let alertLayerGroup = null;

  function renderAlertMapVisuals(data) {
    if (!alertMap || !alertLayerGroup || typeof window.L === "undefined") return;
    const loc = data.location || {};
    if (loc.latitude == null || loc.longitude == null) return;

    alertLayerGroup.clearLayers();

    const center = [loc.latitude, loc.longitude];
    const aqi = data.current_aqi;
    const cls = data.classification || {};
    const zoneColor = aqiColorHex(aqi);

    window.L.circle(center, {
      radius: 6000,
      color: zoneColor,
      fillColor: zoneColor,
      fillOpacity: 0.16,
      weight: 1.5,
    }).addTo(alertLayerGroup);

    window.L.circle(center, {
      radius: 2600,
      color: zoneColor,
      fillColor: zoneColor,
      fillOpacity: 0.28,
      weight: 2,
    })
      .addTo(alertLayerGroup)
      .bindPopup(`<strong>${window.VayuMain.escapeHtml(loc.name)}</strong><br>AQI: ${aqi ?? "--"} (${window.VayuMain.escapeHtml(cls.category || "")})`);

    window.L.marker(center).addTo(alertLayerGroup).bindPopup(`<strong>${window.VayuMain.escapeHtml(loc.name)}</strong><br>AQI ${aqi ?? "--"}`);

    (data.hotspot_updates || []).forEach((h) => {
      const pt = resolveReportCoords(h);
      if (!pt) return;
      window.L.circleMarker(pt, {
        radius: 7,
        color: "#ffffff",
        weight: 2,
        fillColor: h.is_verified ? "#DC2626" : "#D97706",
        fillOpacity: 0.9,
      })
        .addTo(alertLayerGroup)
        .bindPopup(`<strong>${window.VayuMain.escapeHtml(h.title)}</strong><br>${window.VayuMain.escapeHtml(h.location_name)}`);
    });
  }

  async function initAlertsPage() {
    const mapEl = document.getElementById("vmAlertMap");
    if (mapEl && typeof window.L !== "undefined") {
      alertMap = window.L.map("vmAlertMap", {
        minZoom: 4,
        maxBounds: [
          [5.5, 67.0],
          [38.5, 98.5],
        ],
        maxBoundsViscosity: 0.8,
      }).setView([19.076, 72.8777], 11);
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 18,
      }).addTo(alertMap);
      alertLayerGroup = window.L.layerGroup().addTo(alertMap);
    }

    const precautionsBtn = document.getElementById("vmAlertTakePrecautionsBtn");
    const precautionsPanel = document.getElementById("vmPrecautionsDetailPanel");
    const closePrecautionsBtn = document.getElementById("vmClosePrecautionsBtn");

    if (precautionsBtn && precautionsPanel) {
      precautionsBtn.addEventListener("click", () => {
        const isHidden = precautionsPanel.classList.contains("vm-hidden");
        precautionsPanel.classList.toggle("vm-hidden", !isHidden);
        precautionsBtn.setAttribute("aria-expanded", String(isHidden));
        if (isHidden) {
          precautionsPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      });
    }

    if (closePrecautionsBtn && precautionsPanel && precautionsBtn) {
      closePrecautionsBtn.addEventListener("click", () => {
        precautionsPanel.classList.add("vm-hidden");
        precautionsBtn.setAttribute("aria-expanded", "false");
      });
    }

    async function loadAlerts(isInitial) {
      const params = window.VayuMain.getStoredLocationParams();
      try {
        const data = await window.VayuApi.getAlerts(params);
        window.VayuMain.updateHeaderWeather(data);
        renderAlertsPage(data);
      } catch (err) {
        if (isInitial && (params.city || params.lat != null)) {
          window.VayuMain.clearStoredLocation();
          window.VayuMain.updateCityBackground("Mumbai");
          try {
            const fallback = await window.VayuApi.getAlerts({ city: "Mumbai" });
            window.VayuMain.updateHeaderWeather(fallback);
            renderAlertsPage(fallback);
            window.VayuMain.showBanner("vmAlertsBanner", "VayuMitra supports locations within India only. Showing Mumbai.", "info");
            return;
          } catch (_e) {}
        }
        window.VayuMain.showBanner("vmAlertsBanner", err.message || "Unable to load alerts.", "error");
      }
    }

    window.addEventListener("vayumitra:citychange", () => loadAlerts(false));
    await loadAlerts(true);
  }

  function renderAlertsPage(data) {
    const cls = data.classification || {};
    const loc = data.location || {};
    const liveAlerts = data.live_alerts || [];
    const aqi = data.current_aqi;

    setText("alertsLocation", loc.name || "—");
    setText("alertsCurrentAqi", `${aqi ?? "--"} (${cls.category || "Unavailable"})`);

    const heroStrip = document.getElementById("vmAlertHeroStrip");
    const isElevated = liveAlerts.length > 0 || (aqi != null && aqi > 150);
    if (heroStrip) {
      heroStrip.classList.toggle("is-ok", !isElevated);
    }
    const precPanel = document.getElementById("vmPrecautionsDetailPanel");
    if (precPanel) {
      precPanel.classList.toggle("is-ok", !isElevated);
    }
    setText("vmAlertTakePrecautionsLabel", "Take Precautions");
    setText(
      "vmAlertHeroTitle",
      liveAlerts.length > 0
        ? liveAlerts[0].alert_title || "High Pollution Alert!"
        : `Air Quality Status: ${cls.category || "Good"} in ${loc.name || "Your Area"}`
    );
    setText(
      "vmAlertHeroDesc",
      liveAlerts.length > 0
        ? liveAlerts[0].description
        : `AQI in ${loc.name || "your area"} is ${aqi ?? "--"} (${cls.category || "Good"}).`
    );

    const riskScore = data.risk_score;
    const riskLevel = data.risk_level || "Low Risk";
    setText("vmAlertRiskScorePill", riskScore != null ? `Risk Score: ${riskScore}/100` : "Risk Score: --");
    setText("vmAlertCardRiskScore", riskScore != null ? `${riskScore}/100 · ${riskLevel}` : riskLevel);
    setText(
      "vmAlertCardTriggers",
      `${liveAlerts.length} Alert(s) · ${(data.hotspot_updates || []).length} Hotspot(s)`
    );
    setText(
      "vmAlertCardSensitive",
      aqi != null && aqi > 200
        ? "Avoid outdoor exertion"
        : aqi != null && aqi > 100
        ? "Limit prolonged outdoor stay"
        : "Normal activity safe"
    );
    setText(
      "vmAlertCardOutdoor",
      aqi != null && aqi > 200
        ? "N95 mask & indoor air purifier"
        : aqi != null && aqi > 100
        ? "Carry mask near heavy traffic"
        : "Good time for walks & commute"
    );
    const riskExplainEl = document.getElementById("vmAlertRiskExplain");
    if (riskExplainEl) {
      riskExplainEl.innerHTML = `<strong>Risk Score (${riskScore != null ? `${riskScore}/100` : "--"} &middot; ${window.VayuMain.escapeHtml(riskLevel)}):</strong> ${window.VayuMain.escapeHtml(
        data.risk_explanation || "Computed from live AQI, PM2.5 levels, and nearby citizen reports."
      )}`;
    }

    const measuresGrid = document.getElementById("vmPrecautionsMeasuresGrid");
    if (measuresGrid) {
      setText(
        "vmPrecautionsPanelIntro",
        `Safety precautions & protective measures for ${loc.name || "your area"} (AQI ${aqi ?? "--"} · ${cls.category || "Current"}):`
      );
      const isSevere = aqi != null && aqi > 200;
      const isMod = aqi != null && aqi > 100;
      const precs = Array.isArray(cls.precautions) ? cls.precautions : [];
      const tiles = [
        {
          title: "Respiratory Mask",
          text: isSevere
            ? "Wear a well-fitted N95/N99 mask whenever stepping outside."
            : isMod
            ? "Carry an N95 mask for busy traffic corridors and dusty roads."
            : precs[2] || "No mask needed for healthy adults; sensitive groups keep one handy.",
          icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#15803d" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`,
        },
        {
          title: "Outdoor Activity",
          text: isSevere
            ? "Avoid outdoor exercise, jogging, and prolonged exposure for children & elderly."
            : isMod
            ? "Reduce intense outdoor exertion during peak traffic hours."
            : precs[0] || "Safe for walking, jogging, and routine outdoor activities.",
          icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line></svg>`,
        },
        {
          title: "Indoor Protection",
          text: isSevere
            ? "Keep windows shut, run HEPA air purifiers indoors, and avoid incense/smoke."
            : isMod
            ? "Ventilate indoors only during midday clean-air windows and keep dust settled."
            : precs[1] || "Cross-ventilate rooms to maintain fresh indoor airflow.",
          icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`,
        },
        {
          title: "Commute & Health",
          text: isMod
            ? "Pick Safe Air routes, use car AC recirculation, and stay well hydrated."
            : precs[3] || "Choose green corridors or public transit and stay hydrated.",
          icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"></path><circle cx="7" cy="17" r="2"></circle><circle cx="17" cy="17" r="2"></circle></svg>`,
        },
      ];
      measuresGrid.innerHTML = tiles
        .map(
          (t) => `
          <div class="vm-measure-tile">
            <div class="vm-title-with-ico" style="gap:8px;">
              ${t.icon}
              <strong>${t.title}</strong>
            </div>
            <p>${window.VayuMain.escapeHtml(t.text)}</p>
          </div>
        `
        )
        .join("");
    }

    renderAqiGaugeSvg("vmAlertAqiGauge", aqi, "Current AQI", cls.category);
    const maskStrip = document.getElementById("vmAlertMaskStrip");
    if (maskStrip) {
      maskStrip.classList.toggle("is-ok", !isElevated);
    }
    setText("vmAlertMaskNote", cls.recommendation || cls.message || "Monitor local air quality.");

    setText("alertDetailTime", window.VayuMain.formatDateTime(data.recorded_at));
    setText("alertDetailLocation", [loc.name, loc.admin1].filter(Boolean).join(", ") || loc.name || "—");
    setText(
      "alertDetailReason",
      data.alert_reason || (liveAlerts.length > 0 ? liveAlerts[0].description : "Regional emissions and weather conditions")
    );

    const riskBadge = document.getElementById("vmAlertsRiskBadge");
    if (riskBadge) {
      const riskText = aqi > 200 ? "Nearby Areas High Risk" : aqi > 100 ? "Nearby Areas Moderate Risk" : "Nearby Areas Low Risk";
      riskBadge.className = `vm-status-tag ${aqi > 200 ? "vm-status-worse" : aqi > 100 ? "vm-status-moderate" : "vm-status-good"}`;
      riskBadge.textContent = riskText;
    }

    if (alertMap && loc.latitude != null && loc.longitude != null) {
      renderAlertMapVisuals(data);
      alertMap.setView([loc.latitude, loc.longitude], 11);
    }

    const precEl = document.getElementById("vmAlertPrecautions");
    if (precEl) {
      const precs = cls.precautions || [];
      precEl.innerHTML = precs.length
        ? precs
            .map(
              (p) => `
              <li>
                <span class="vm-check-ico">&check;</span>
                <span>${window.VayuMain.escapeHtml(p)}</span>
              </li>
            `
            )
            .join("")
        : `<li><span class="vm-check-ico">&check;</span><span>Follow routine air-quality precautions.</span></li>`;
    }

    const liveEl = document.getElementById("vmLiveAlertsList");
    if (liveEl) {
      if (!liveAlerts.length) {
        liveEl.innerHTML = `<li><strong>All clear in ${window.VayuMain.escapeHtml(loc.name || "this area")}</strong><p class="vm-section-subtitle">No active warnings exceed current rules or your configured threshold.</p></li>`;
      } else {
        liveEl.innerHTML = liveAlerts
          .map(
            (a) => `
            <li>
              <div class="vm-aqi-header-row" style="margin-bottom:4px;">
                <strong>${window.VayuMain.escapeHtml(a.alert_title)}</strong>
                <span class="vm-status-tag ${levelBadgeClass(a.alert_level)}">${window.VayuMain.escapeHtml(a.alert_level)}</span>
              </div>
              <p class="vm-section-subtitle">${window.VayuMain.escapeHtml(a.description)}</p>
            </li>
          `
          )
          .join("");
      }
    }

    const hotspotEl = document.getElementById("vmAlertsHotspotsList");
    const hotspots = data.hotspot_updates || [];
    if (hotspotEl) {
      if (!hotspots.length) {
        hotspotEl.innerHTML = `<li>No active community hotspot reports logged yet.</li>`;
      } else {
        hotspotEl.innerHTML = hotspots
          .map(
            (h) => `
            <li>
              <div class="vm-aqi-header-row" style="margin-bottom:4px;">
                <strong>${window.VayuMain.escapeHtml(h.title)}</strong>
                <span class="vm-badge-data ${h.is_verified ? "vm-badge-verified" : "vm-badge-unverified"}">${window.VayuMain.escapeHtml(h.verification_label)}</span>
              </div>
              <div class="vm-meta-line">
                <span class="font-mono">${window.VayuMain.escapeHtml(h.report_code)}</span>
                <span>·</span>
                <span>${window.VayuMain.escapeHtml(h.category)}</span>
                <span>·</span>
                <span>${window.VayuMain.escapeHtml(h.location_name)}</span>
                <span>·</span>
                <span>${window.VayuMain.formatDateTime(h.created_at)}</span>
              </div>
            </li>
          `
          )
          .join("");
      }
    }

    const np = data.notification_preferences || {};
    setCheck("alertPrefEnabled", np.enabled);
    setCheck("alertPrefWarnings", np.aqi_warnings);
    setCheck("alertPrefLocation", np.location_alerts);
    setCheck("alertPrefBrowser", np.browser_notifications);
    setInputVal("alertPrefThreshold", np.aqi_threshold);
    setInputVal("alertPrefPm25", np.pm25_threshold);

    if (
      np.enabled &&
      np.browser_notifications &&
      liveAlerts.length > 0 &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      const topAlert = liveAlerts[0];
      const notifiedKey = `vm_notified_${topAlert.city}_${topAlert.metric}_${topAlert.created_at}`;
      if (!sessionStorage.getItem(notifiedKey)) {
        new Notification(`VayuMitra Alert: ${topAlert.alert_title}`, {
          body: topAlert.description,
        });
        sessionStorage.setItem(notifiedKey, "1");
      }
    }

    const histBody = document.getElementById("vmAlertHistoryBody");
    const history = data.alert_history || [];
    if (histBody) {
      if (!history.length) {
        histBody.innerHTML = `<tr><td colspan="5">No historical threshold alerts recorded yet.</td></tr>`;
      } else {
        histBody.innerHTML = history
          .map(
            (h) => `
            <tr>
              <td><strong>${window.VayuMain.escapeHtml(h.alert_title)}</strong></td>
              <td class="tabular-nums">${window.VayuMain.formatDateTime(h.created_at)}</td>
              <td>${window.VayuMain.escapeHtml(h.city)}</td>
              <td><span class="vm-status-tag ${levelBadgeClass(h.alert_level)}">${window.VayuMain.escapeHtml(h.alert_level)}</span></td>
              <td>${window.VayuMain.escapeHtml(h.description)}</td>
            </tr>
          `
          )
          .join("");
      }
    }
  }

  /* =========================================================
     6. ENVIRONMENTAL INTELLIGENCE REPORTS (reports.html)
     ========================================================= */
  async function initReportsPage() {
    let activePeriod = "daily";
    const segBtns = document.querySelectorAll(".vm-seg-btn");

    async function loadReports(period, extraParams, isInitial) {
      activePeriod = period;
      window.VayuMain.showBanner("vmReportsBanner", "", "info");
      const baseParams = window.VayuMain.getStoredLocationParams();
      try {
        const params = Object.assign({}, baseParams, extraParams || {}, { period });
        const data = await window.VayuApi.getReports(params);
        window.VayuMain.updateHeaderWeather(data);
        renderReportsData(data);
      } catch (err) {
        if (isInitial && (baseParams.city || baseParams.lat != null)) {
          window.VayuMain.clearStoredLocation();
          window.VayuMain.updateCityBackground("Mumbai");
          try {
            const fallback = await window.VayuApi.getReports({ city: "Mumbai", period });
            window.VayuMain.updateHeaderWeather(fallback);
            renderReportsData(fallback);
            window.VayuMain.showBanner("vmReportsBanner", "VayuMitra supports locations within India only. Showing Mumbai.", "info");
            return;
          } catch (_e) {}
        }
        window.VayuMain.showBanner("vmReportsBanner", err.message || "Unable to load environmental report.", "error");
      }
    }

    segBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        segBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const p = btn.getAttribute("data-period") || "daily";
        loadReports(p, null, false);
      });
    });

    window.addEventListener("vayumitra:citychange", (ev) => {
      const city = ev.detail && ev.detail.city;
      if (city) {
        window.VayuMain.updateCityBackground(city);
        loadReports(activePeriod, { city }, false);
      }
    });

    await loadReports(activePeriod, null, true);
  }

  function renderReportsData(data) {
    setText("repLocation", data.location ? data.location.name : "—");

    if (!data.sufficient_data || !data.summary) {
      window.VayuMain.showBanner("vmReportsBanner", data.message || "Insufficient historical data to generate report.", "info");
      return;
    }

    const s = data.summary;
    setText("repAvgAqi", `${s.average_aqi} (${s.average_category})`);
    setText("repHighAqi", `${s.highest_aqi}`);
    setText("repLowAqi", `${s.lowest_aqi}`);
    setText("repNetChange", `${s.net_change >= 0 ? "+" : ""}${s.net_change}`);
    setText(
      "repDominantPollutant",
      s.dominant_pollutant ? `${s.dominant_pollutant.key} (${s.dominant_pollutant.value} ${s.dominant_pollutant.unit})` : "—"
    );
    setText(
      "repHoursSplit",
      `${s.clean_hours ?? "--"} clean · ${s.elevated_hours ?? "--"} elevated hrs`
    );
    setText("repRiskScore", s.risk_score != null ? `${s.risk_score}/100 (${s.risk_level || "--"})` : "--");

    const repRiskBadge = document.getElementById("repRiskBadge");
    if (repRiskBadge) {
      const rLevel = String(s.risk_level || "Moderate Risk");
      const rCls = rLevel.includes("Low")
        ? "vm-status-good"
        : rLevel.includes("Moderate")
        ? "vm-status-moderate"
        : rLevel.includes("Very High")
        ? "vm-status-worse"
        : "vm-status-bad";
      repRiskBadge.className = `vm-status-tag ${rCls}`;
      repRiskBadge.textContent = rLevel;
    }

    const repRiskExplain = document.getElementById("repRiskExplainBox");
    if (repRiskExplain) {
      repRiskExplain.innerHTML = `<strong>Air Risk Score (${s.risk_score ?? "--"}/100 &middot; ${window.VayuMain.escapeHtml(
        s.risk_level || "Evaluating"
      )}):</strong> ${window.VayuMain.escapeHtml(
        s.risk_explanation || "Calculated from average AQI, peak pollution spikes, and hours above AQI 100."
      )}`;
    }

    const obsEl = document.getElementById("repObservationsList");
    if (obsEl) {
      const obs = Array.isArray(s.observations) ? s.observations : [];
      obsEl.innerHTML = obs.length
        ? obs.map((o) => `<li>${window.VayuMain.escapeHtml(o)}</li>`).join("")
        : `<li>Air quality observations updated for the active period.</li>`;
    }

    renderAqiGaugeSvg("vmReportsAvgGauge", s.average_aqi, "AQI (Avg)", s.average_category);

    const renderCityRankRows = (cities, emptyText) =>
      cities && cities.length
        ? cities
            .slice(0, 5)
            .map(
              (c, idx) => `
              <div class="vm-rank-item">
                <div style="display:flex; align-items:center; gap:10px; min-width:0;">
                  <span class="vm-rank-num">${idx + 1}</span>
                  <div style="min-width:0;">
                    <strong style="font-size:0.9rem; display:block;">${window.VayuMain.escapeHtml(c.city)} <span style="font-weight:500; color:var(--vm-text-muted); font-size:0.8rem;">&middot; ${window.VayuMain.escapeHtml(c.state)}</span></strong>
                    <span class="vm-meta-line tabular-nums">PM2.5: ${c.pm2_5 ?? "N/A"} &middot; PM10: ${c.pm10 ?? "N/A"} &micro;g/m&sup3;</span>
                  </div>
                </div>
                <span class="vm-status-tag ${levelBadgeClass(c.category)}">AQI ${c.aqi} &middot; ${window.VayuMain.escapeHtml(c.category)}</span>
              </div>
            `
            )
            .join("")
        : `<span class="vm-meta-line">${emptyText}</span>`;

    const topCitiesEl = document.getElementById("repTopCitiesList");
    if (topCitiesEl) {
      topCitiesEl.innerHTML = renderCityRankRows(data.top_polluted_cities || [], "Live city rankings temporarily unavailable.");
    }

    const cleanCitiesEl = document.getElementById("repCleanestCitiesList");
    if (cleanCitiesEl) {
      cleanCitiesEl.innerHTML = renderCityRankRows(data.cleanest_cities || [], "Cleanest city rankings temporarily unavailable.");
    }

    const hsEl = document.getElementById("repHotspotsList");
    if (hsEl) {
      const hs = data.hotspot_analysis || [];
      hsEl.innerHTML = hs.length
        ? hs
            .map(
              (h, idx) => `
              <div class="vm-rank-item">
                <div style="display:flex; align-items:center; gap:10px; min-width:0;">
                  <span class="vm-rank-num">${idx + 1}</span>
                  <div style="min-width:0;">
                    <strong class="font-mono" style="font-size:0.86rem; display:block;">${window.VayuMain.escapeHtml(h.time.replace("T", " "))}</strong>
                    <span class="vm-meta-line">PM2.5: ${h.pm2_5 ?? "N/A"} · PM10: ${h.pm10 ?? "N/A"} µg/m³</span>
                  </div>
                </div>
                <span class="vm-status-tag ${levelBadgeClass(h.aqi > 200 ? "worse" : h.aqi > 100 ? "bad" : h.aqi > 50 ? "moderate" : "good")}">AQI ${h.aqi}</span>
              </div>
            `
            )
            .join("")
        : `<span class="vm-meta-line">No peak intervals identified.</span>`;
    }

    const series = data.series || [];
    const trendDatasets = [
      {
        label: `${data.location ? data.location.name : "Primary"} (${data.period.toUpperCase()} AQI)`,
        data: series.map((r) => r.aqi),
        borderColor: "#1b8a4b",
        backgroundColor: "rgba(27, 138, 75, 0.14)",
        fill: true,
        tension: 0.3,
      },
    ];
    renderOrReplaceChart("vmReportsTrendChart", {
      type: "line",
      data: {
        labels: series.map((r) => (data.period === "daily" && !data.start_date ? window.VayuMain.formatHourLabel(r.time) : r.date)),
        datasets: trendDatasets,
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } },
    });

    const pAvg = s.pollutant_averages || {};
    renderOrReplaceChart("vmReportsPollutantChart", {
      type: "bar",
      data: {
        labels: ["PM2.5", "PM10", "NO2", "SO2", "O3", "CO (x0.1)"],
        datasets: [
          {
            label: "Average Concentration (µg/m³)",
            data: [
              pAvg.pm2_5 || 0,
              pAvg.pm10 || 0,
              pAvg.no2 || 0,
              pAvg.so2 || 0,
              pAvg.o3 || 0,
              pAvg.co ? Number((pAvg.co * 0.1).toFixed(2)) : 0,
            ],
            backgroundColor: ["#16a34a", "#0ea5e9", "#d97706", "#ea580c", "#2563eb", "#64748b"],
            borderRadius: 8,
          },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } },
    });
  }

  /* =========================================================
     7. MY PERSONAL AIR TWIN & SETTINGS (profile.html)
     ========================================================= */
  let lastProfileBundle = null;

  async function initProfilePage() {
    try {
      const [bundle, twin, authState] = await Promise.all([
        window.VayuApi.getProfile(),
        window.VayuApi.getAirTwin(),
        window.VayuApi.getAuthMe().catch(() => ({ authenticated: false, user: null })),
      ]);
      populateProfileForm(bundle);
      renderAirTwin(twin);
      updateProfileSessionUI(authState, bundle);
    } catch (err) {
      window.VayuMain.showBanner("vmProfileBanner", err.message, "error");
    }

    async function refreshAirTwin() {
      try {
        const twin = await window.VayuApi.getAirTwin();
        renderAirTwin(twin);
      } catch (err) {
        window.VayuMain.showBanner("vmProfileBanner", err.message, "error");
      }
    }

    const locForm = document.getElementById("vmTwinLocationForm");
    if (locForm) {
      locForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        try {
          await window.VayuApi.addTwinLocation({
            label: document.getElementById("twinLocLabel").value.trim(),
            city: document.getElementById("twinLocCity").value.trim(),
            hours_per_day: Number((document.getElementById("twinLocHours") || {}).value || 8),
          });
          locForm.reset();
          if (document.getElementById("twinLocHours")) document.getElementById("twinLocHours").value = "8";
          await refreshAirTwin();
          window.VayuMain.showBanner("vmProfileBanner", "Place added to Personal Air Twin.", "success");
        } catch (err) {
          window.VayuMain.showBanner("vmProfileBanner", err.message, "error");
        }
      });
    }

    const actForm = document.getElementById("vmTwinActivityForm");
    if (actForm) {
      actForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const locSel = document.getElementById("twinActLocation");
        try {
          await window.VayuApi.addTwinActivity({
            activity_type: document.getElementById("twinActType").value,
            location_id: locSel && locSel.value ? Number(locSel.value) : null,
            hours_per_day: Number(document.getElementById("twinActHours").value || 1),
            intensity: document.getElementById("twinActIntensity").value,
            is_outdoor: document.getElementById("twinActOutdoor").checked,
          });
          await refreshAirTwin();
          window.VayuMain.showBanner("vmProfileBanner", "Daily activity added.", "success");
        } catch (err) {
          window.VayuMain.showBanner("vmProfileBanner", err.message, "error");
        }
      });
    }

    const diaryForm = document.getElementById("vmTwinDiaryForm");
    if (diaryForm) {
      diaryForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        try {
          await window.VayuApi.addTwinDiary({
            notes: document.getElementById("twinDiaryNotes").value.trim(),
          });
          document.getElementById("twinDiaryNotes").value = "";
          await refreshAirTwin();
          window.VayuMain.showBanner("vmProfileBanner", "Exposure diary saved.", "success");
        } catch (err) {
          window.VayuMain.showBanner("vmProfileBanner", err.message, "error");
        }
      });
    }

    const exportBtn = document.getElementById("vmAirTwinExportBtn");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        window.location.href = window.VayuApi.getAirTwinExportUrl();
      });
    }

    const form = document.getElementById("vmProfileSettingsForm");
    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        window.VayuMain.showBanner("vmProfileBanner", "", "info");

        const prevProf = (lastProfileBundle && lastProfileBundle.profile) || {};
        const prevPref = (lastProfileBundle && lastProfileBundle.preferences) || {};
        const bioEl = document.getElementById("profBio");
        const polUnitEl = document.getElementById("profPollutantUnit");
        const aqiWarnEl = document.getElementById("profAqiWarnings");
        const locAlertEl = document.getElementById("profLocAlerts");
        const notifEnabled = document.getElementById("profNotifEnabled").checked;

        const defaultCity = document.getElementById("profDefaultCity").value.trim() || "Mumbai";
        const payload = {
          profile: {
            name: document.getElementById("profName").value.trim(),
            email: document.getElementById("profEmail").value.trim(),
            bio: bioEl ? bioEl.value.trim() : prevProf.bio || "",
            preferred_city: defaultCity,
          },
          preferences: {
            default_city: defaultCity,
            auto_detect_location: document.getElementById("profAutoDetect").checked,
            temp_unit: document.getElementById("profTempUnit").value,
            pollutant_unit: polUnitEl ? polUnitEl.value : prevPref.pollutant_unit || "ugm3",
            aqi_standard: document.getElementById("profAqiStandard").value,
            share_location: document.getElementById("profShareLocation").checked,
            anonymous_reports: document.getElementById("profAnonReports").checked,
          },
          notifications: {
            enabled: notifEnabled,
            aqi_warnings: aqiWarnEl ? aqiWarnEl.checked : notifEnabled,
            location_alerts: locAlertEl ? locAlertEl.checked : notifEnabled,
            aqi_threshold: Number(document.getElementById("profAqiThreshold").value || 100),
          },
          security: {
            current_password: document.getElementById("profCurrPw").value,
            new_password: document.getElementById("profNewPw").value,
          },
        };

        try {
          const updated = await window.VayuApi.updateProfile(payload);
          window.VayuMain.setStoredCity(updated.preferences.default_city);
          populateProfileForm(updated);
          setInputVal("profCurrPw", "");
          setInputVal("profNewPw", "");
          window.VayuMain.showBanner("vmProfileBanner", "Settings saved.", "success");
          const aq = await window.VayuApi.getAirQuality({ city: updated.preferences.default_city });
          window.VayuMain.updateHeaderWeather(aq);
          await refreshAirTwin();
        } catch (err) {
          window.VayuMain.showBanner("vmProfileBanner", err.message, "error");
        }
      });
    }
  }

  function renderAirTwin(twin) {
    if (!twin) return;
    const sum = twin.daily_summary || {};
    setText(
      "twinWeightedAqi",
      sum.weighted_exposure_aqi != null ? `${sum.weighted_exposure_aqi} (${sum.exposure_category})` : "N/A"
    );
    setText("twinWeightedAqiHero", sum.weighted_exposure_aqi != null ? String(sum.weighted_exposure_aqi) : "N/A");
    setText("twinRiskLabel", sum.exposure_category || "Unavailable");
    setText(
      "twinEstimatedPm25",
      sum.estimated_pm25_exposure != null ? `${sum.estimated_pm25_exposure} µg/m³` : "N/A"
    );
    setText("twinTotalHours", `${sum.total_logged_hours ?? 0} hrs/day`);

    renderAqiGaugeSvg("vmTwinExposureGauge", sum.weighted_exposure_aqi, "AQI Exposure", sum.exposure_category);

    const locSel = document.getElementById("twinActLocation");
    const locs = twin.locations || [];
    if (locSel) {
      locSel.innerHTML =
        `<option value="">Default (${window.VayuMain.escapeHtml(twin.preferred_city)})</option>` +
        locs.map((l) => `<option value="${l.id}">${window.VayuMain.escapeHtml(l.label)} (${window.VayuMain.escapeHtml(l.city)})</option>`).join("");
    }

    const locsEl = document.getElementById("vmTwinLocationsList");
    if (locsEl) {
      if (!locs.length) {
        locsEl.innerHTML = `<div class="vm-twin-item-row"><span>No custom places added yet (${window.VayuMain.escapeHtml(twin.preferred_city)}).</span></div>`;
      } else {
        locsEl.innerHTML = locs
          .map(
            (l) => `
            <div class="vm-twin-item-row">
              <div>
                <strong>${window.VayuMain.escapeHtml(l.label)}</strong> · ${window.VayuMain.escapeHtml(l.city)} (${l.hours_per_day ?? 8}h/day)
                <div class="vm-meta-line tabular-nums">Live AQI: ${l.live_aqi ?? "N/A"} (${window.VayuMain.escapeHtml(l.category)}) · PM2.5: ${l.live_pm25 ?? "N/A"} µg/m³</div>
              </div>
              <button type="button" class="vm-btn vm-btn-outline vm-btn-sm vm-del-loc-btn" data-id="${l.id}">Remove</button>
            </div>
          `
          )
          .join("");
        locsEl.querySelectorAll(".vm-del-loc-btn").forEach((btn) => {
          btn.addEventListener("click", async () => {
            await window.VayuApi.deleteTwinLocation(Number(btn.getAttribute("data-id")));
            const fresh = await window.VayuApi.getAirTwin();
            renderAirTwin(fresh);
          });
        });
      }
    }

    const actsEl = document.getElementById("vmTwinActivitiesList");
    const acts = twin.activities || [];
    if (actsEl) {
      if (!acts.length) {
        actsEl.innerHTML = `<div class="vm-twin-item-row"><span>No daily activities logged yet.</span></div>`;
      } else {
        actsEl.innerHTML = acts
          .map(
            (a) => `
            <div class="vm-twin-item-row">
              <div>
                <strong>${window.VayuMain.escapeHtml(a.activity_type)}</strong> · ${a.hours_per_day}h/day · ${a.is_outdoor ? "Outdoor" : "Indoor"} (${window.VayuMain.escapeHtml(a.intensity)})
                <div class="vm-meta-line tabular-nums">Place: ${window.VayuMain.escapeHtml(a.location_label)} · Exposure AQI: <strong>${a.calculated_exposure_aqi ?? "N/A"}</strong></div>
              </div>
              <button type="button" class="vm-btn vm-btn-outline vm-btn-sm vm-del-act-btn" data-id="${a.id}">Remove</button>
            </div>
          `
          )
          .join("");
        actsEl.querySelectorAll(".vm-del-act-btn").forEach((btn) => {
          btn.addEventListener("click", async () => {
            await window.VayuApi.deleteTwinActivity(Number(btn.getAttribute("data-id")));
            const fresh = await window.VayuApi.getAirTwin();
            renderAirTwin(fresh);
          });
        });
      }
    }

    const diaryEl = document.getElementById("vmTwinDiaryList");
    const diary = twin.diary || [];
    if (diaryEl) {
      diaryEl.innerHTML = diary.length
        ? diary
            .slice(0, 8)
            .map(
              (d) => `
              <li>
                <div class="vm-aqi-header-row" style="margin-bottom:4px;">
                  <strong class="font-mono">${window.VayuMain.escapeHtml(d.entry_date)} · ${window.VayuMain.escapeHtml(d.city)}</strong>
                  <span class="vm-status-tag ${levelBadgeClass(d.estimated_aqi > 200 ? "worse" : d.estimated_aqi > 100 ? "bad" : d.estimated_aqi > 50 ? "moderate" : "good")}">Est. AQI ${d.estimated_aqi}</span>
                </div>
                <p class="vm-section-subtitle">${window.VayuMain.escapeHtml(d.activity_summary)}${d.notes ? ` · "${window.VayuMain.escapeHtml(d.notes)}"` : ""}</p>
              </li>
            `
            )
            .join("")
        : "<li>No diary entries yet.</li>";
    }

    const weeklyTrend = twin.weekly_exposure_trend || [];
    const chartEntries = diary.slice().reverse();
    renderOrReplaceChart("vmTwinExposureChart", {
      type: "line",
      data: {
        labels: weeklyTrend.length
          ? weeklyTrend.map((w) => w.date)
          : chartEntries.length
          ? chartEntries.map((d) => d.entry_date)
          : ["Today"],
        datasets: [
          {
            label: `Weekly Exposure (${twin.aqi_standard || "NAQI"})`,
            data: weeklyTrend.length
              ? weeklyTrend.map((w) => w.exposure_aqi)
              : chartEntries.length
              ? chartEntries.map((d) => d.estimated_aqi)
              : [sum.weighted_exposure_aqi || 0],
            borderColor: "#1b8a4b",
            backgroundColor: "rgba(27, 138, 75, 0.16)",
            fill: true,
            tension: 0.32,
          },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } },
    });

    const locCmp = twin.location_comparison || [];
    renderOrReplaceChart("vmTwinLocCompareChart", {
      type: "bar",
      data: {
        labels: locCmp.length ? locCmp.map((l) => l.label) : [twin.preferred_city || "Default"],
        datasets: [
          {
            label: `Ambient AQI (${twin.aqi_standard || "NAQI"})`,
            data: locCmp.length ? locCmp.map((l) => l.live_aqi || 0) : [0],
            backgroundColor: locCmp.map((l) => aqiColorHex(l.live_aqi || 0)),
            borderRadius: 8,
          },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } },
    });
  }

  function populateProfileForm(bundle) {
    lastProfileBundle = bundle;
    const p = bundle.profile || {};
    const pr = bundle.preferences || {};
    const n = bundle.notifications || {};

    const displayName = (p.name || "VayuMitra User").trim();
    setText("profAvatarBadge", (displayName.charAt(0) || "V").toUpperCase());
    setText("profHeroName", displayName);
    setText("profHeroCityPill", `Default City: ${pr.default_city || p.preferred_city || "Mumbai"}`);
    setText("profGoalThreshold", String(n.aqi_threshold || 100));
    setText("profGoalNotifs", n.enabled ? "Enabled" : "Disabled");
    setText("profGoalStd", pr.aqi_standard || "NAQI");

    setInputVal("profName", p.name);
    setInputVal("profEmail", p.email);
    setInputVal("profDefaultCity", pr.default_city || p.preferred_city);
    setCheck("profAutoDetect", pr.auto_detect_location);
    setInputVal("profTempUnit", pr.temp_unit || "C");
    setInputVal("profAqiStandard", pr.aqi_standard || "NAQI");
    setCheck("profShareLocation", pr.share_location);
    setCheck("profAnonReports", pr.anonymous_reports);
    setCheck("profNotifEnabled", n.enabled);
    setInputVal("profAqiThreshold", n.aqi_threshold || 100);
    setText("profSecurityStatus", p.has_password ? "Password protection is active." : "No password set.");
  }

  function updateProfileSessionUI(authState, bundle) {
    const statusEl = document.getElementById("profSessionStatus");
    const switchBtn = document.getElementById("vmSettingsSwitchAccountBtn");
    const logoutBtn = document.getElementById("vmSettingsLogoutLink");
    const isAuth = Boolean(authState && authState.authenticated && authState.user);
    if (isAuth) {
      const u = authState.user;
      window.VayuMain.setAuthSession(window.VayuMain.getAuthToken(), u);
      if (statusEl) {
        statusEl.textContent = `Signed in as ${u.name || "Citizen"} (${u.email || ""})`;
      }
      if (switchBtn) switchBtn.textContent = "Switch Account";
      if (logoutBtn) logoutBtn.classList.remove("vm-hidden");
    } else {
      window.VayuMain.clearAuthSession();
      const profName = (bundle && bundle.profile && bundle.profile.name) || "Guest";
      if (statusEl) {
        statusEl.textContent = `Signed out (viewing ${profName} defaults). Sign in to sync your personal account or visit the Logout page.`;
      }
      if (switchBtn) switchBtn.textContent = "Sign In";
    }
  }

  /* =========================================================
     8. LOGIN & LOGOUT PAGES (login.html & logout.html)
     ========================================================= */
  function initLoginPage() {
    const tabLogin = document.getElementById("vmTabLoginBtn");
    const tabReg = document.getElementById("vmTabRegisterBtn");
    const loginForm = document.getElementById("vmLoginForm");
    const regForm = document.getElementById("vmRegisterForm");
    const fillDemoBtn = document.getElementById("vmFillDemoBtn");
    const rawNext = new URLSearchParams(window.location.search).get("next") || "";
    const nextUrl = /^[a-z0-9_-]+\.html$/i.test(rawNext) ? rawNext : "index.html";

    function switchTab(mode) {
      const isLogin = mode === "login";
      if (tabLogin) {
        tabLogin.classList.toggle("active", isLogin);
        tabLogin.setAttribute("aria-selected", String(isLogin));
      }
      if (tabReg) {
        tabReg.classList.toggle("active", !isLogin);
        tabReg.setAttribute("aria-selected", String(!isLogin));
      }
      if (loginForm) loginForm.classList.toggle("vm-hidden", !isLogin);
      if (regForm) regForm.classList.toggle("vm-hidden", isLogin);
      window.VayuMain.showBanner("vmLoginBanner", "", "info");
    }

    if (tabLogin) tabLogin.addEventListener("click", () => switchTab("login"));
    if (tabReg) tabReg.addEventListener("click", () => switchTab("register"));

    [
      ["loginTogglePw", "loginPassword"],
      ["regTogglePw", "regPassword"],
    ].forEach(([btnId, inputId]) => {
      const btn = document.getElementById(btnId);
      const inp = document.getElementById(inputId);
      if (btn && inp) {
        btn.addEventListener("click", () => {
          const isPw = inp.getAttribute("type") === "password";
          inp.setAttribute("type", isPw ? "text" : "password");
          btn.setAttribute("aria-label", isPw ? "Hide password" : "Show password");
        });
      }
    });

    if (fillDemoBtn) {
      fillDemoBtn.addEventListener("click", () => {
        setInputVal("loginEmail", "aarav@vayumitra.in");
        setInputVal("loginPassword", "vayumitra123");
      });
    }

    if (loginForm) {
      loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const btn = document.getElementById("vmLoginSubmitBtn");
        if (btn) btn.disabled = true;
        window.VayuMain.showBanner("vmLoginBanner", "", "info");
        try {
          const res = await window.VayuApi.login({
            email: (document.getElementById("loginEmail") || {}).value || "",
            password: (document.getElementById("loginPassword") || {}).value || "",
          });
          window.VayuMain.setAuthSession(res.token, res.user);
          if (res.user && res.user.preferred_city) {
            window.VayuMain.setStoredCity(res.user.preferred_city);
          }
          window.VayuMain.showBanner("vmLoginBanner", res.message || "Signed in! Redirecting...", "success");
          setTimeout(() => {
            window.location.href = nextUrl;
          }, 550);
        } catch (err) {
          window.VayuMain.showBanner("vmLoginBanner", err.message || "Login failed.", "error");
        } finally {
          if (btn) btn.disabled = false;
        }
      });
    }

    if (regForm) {
      regForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const btn = document.getElementById("vmRegisterSubmitBtn");
        if (btn) btn.disabled = true;
        window.VayuMain.showBanner("vmLoginBanner", "", "info");
        try {
          const res = await window.VayuApi.register({
            name: (document.getElementById("regName") || {}).value || "",
            email: (document.getElementById("regEmail") || {}).value || "",
            preferred_city: (document.getElementById("regPreferredCity") || {}).value || "Mumbai",
            password: (document.getElementById("regPassword") || {}).value || "",
          });
          window.VayuMain.setAuthSession(res.token, res.user);
          if (res.user && res.user.preferred_city) {
            window.VayuMain.setStoredCity(res.user.preferred_city);
          }
          window.VayuMain.showBanner("vmLoginBanner", res.message || "Account created! Redirecting...", "success");
          setTimeout(() => {
            window.location.href = nextUrl;
          }, 550);
        } catch (err) {
          window.VayuMain.showBanner("vmLoginBanner", err.message || "Registration failed.", "error");
        } finally {
          if (btn) btn.disabled = false;
        }
      });
    }
  }

  async function initLogoutPage() {
    const prevUser = window.VayuMain.getAuthUser();
    const hadToken = Boolean(window.VayuMain.getAuthToken());
    try {
      await window.VayuApi.logout();
    } catch (_e) {}
    window.VayuMain.clearAuthSession();

    const navAuthBtn = document.getElementById("vmNavAuthBtn");
    if (navAuthBtn) {
      navAuthBtn.href = "login.html";
      navAuthBtn.className = "vm-nav-auth-chip";
      navAuthBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg><span>Login</span>`;
    }

    setText("vmLogoutTitle", hadToken ? "You have been logged out" : "Logged out cleanly");
    setText(
      "vmLogoutDesc",
      hadToken
        ? "Your VayuMitra session has been ended safely on this device."
        : "No active session remains on this device. You can sign in below anytime."
    );

    const infoBox = document.getElementById("vmLogoutAccountInfo");
    if (infoBox && prevUser && prevUser.name) {
      infoBox.classList.remove("vm-hidden");
      infoBox.innerHTML = `<strong>Signed out from:</strong> ${window.VayuMain.escapeHtml(prevUser.name)}${
        prevUser.email ? ` (${window.VayuMain.escapeHtml(prevUser.email)})` : ""
      }`;
    }
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text == null ? "" : String(text);
  }
  function setInputVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val == null ? "" : String(val);
  }
  function setCheck(id, val) {
    const el = document.getElementById(id);
    if (el) el.checked = Boolean(val);
  }

  document.addEventListener("DOMContentLoaded", () => {
    const page = document.body.getAttribute("data-page");
    if (page === "dashboard") initDashboardPage();
    else if (page === "insights") initInsightsPage();
    else if (page === "routes") initRoutesPage();
    else if (page === "community") initCommunityPage();
    else if (page === "alerts") initAlertsPage();
    else if (page === "reports") initReportsPage();
    else if (page === "profile") initProfilePage();
    else if (page === "login") initLoginPage();
    else if (page === "logout") initLogoutPage();
    else if (page === "greensteps") initGreenStepsPage();
  });

  /* =========================================================
     9. GREEN STEPS – SUSTAINABLE ACTION TRACKER (greensteps.html)
     ========================================================= */
  async function initGreenStepsPage() {
    const esc = (v) => window.VayuMain.escapeHtml(v == null ? "" : String(v));
    let gsData = null;

    const roleBadgeEl = document.getElementById("vmGsRoleBadge");
    const gridEl = document.getElementById("vmGsChallengesGrid");
    const catFilterEl = document.getElementById("vmGsCategoryFilter");
    const diffFilterEl = document.getElementById("vmGsDifficultyFilter");

    function showGsBanner(msg, type) {
      window.VayuMain.showBanner("vmGsBanner", msg, type || "info");
    }

    function renderSparkline(weeklyProgress) {
      const wrap = document.getElementById("vmGsSparklineWrap");
      if (!wrap) return;
      const days = Array.isArray(weeklyProgress) && weeklyProgress.length ? weeklyProgress : [];
      const vals = days.length
        ? days.map((d, idx) => Math.max(8, Number(d.points_earned || 0) + (idx + 1) * 4))
        : [10, 18, 24, 20, 32, 42];
      const w = 220;
      const h = 40;
      const pad = 6;
      const minV = Math.min(...vals, 0);
      const maxV = Math.max(...vals, 10);
      const span = Math.max(1, maxV - minV);
      const pts = vals.map((v, i) => {
        const x = pad + (i * (w - pad * 2)) / Math.max(1, vals.length - 1);
        const y = h - pad - ((v - minV) / span) * (h - pad * 2);
        return [Number(x.toFixed(1)), Number(y.toFixed(1))];
      });
      const linePath = pts.map((p, idx) => `${idx === 0 ? "M" : "L"}${p[0]} ${p[1]}`).join(" ");
      const areaPath = `${linePath} L${pts[pts.length - 1][0]} ${h} L${pts[0][0]} ${h} Z`;
      const dotsHtml = pts
        .map((p, idx) => `<circle cx="${p[0]}" cy="${p[1]}" r="${idx === pts.length - 1 ? 3.5 : 2.5}" fill="${idx === pts.length - 1 ? "#15803d" : "#22a542"}" stroke="#ffffff" stroke-width="1"/>`)
        .join("");

      wrap.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="vmGsSparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#22c55e" stop-opacity="0.32"/>
            <stop offset="100%" stop-color="#22c55e" stop-opacity="0.02"/>
          </linearGradient>
        </defs>
        <path d="${areaPath}" fill="url(#vmGsSparkGrad)"/>
        <path d="${linePath}" fill="none" stroke="#22a542" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        ${dotsHtml}
      </svg>`;
    }

    function renderChallengesGrid() {
      if (!gridEl || !gsData) return;
      const catVal = catFilterEl ? catFilterEl.value : "";
      const diffVal = diffFilterEl ? diffFilterEl.value : "";
      const tasks = (gsData.tasks || []).filter((t) => {
        if (catVal && t.category !== catVal) return false;
        if (diffVal && t.difficulty !== diffVal) return false;
        return true;
      });

      if (!tasks.length) {
        gridEl.innerHTML = `<article class="vm-card"><strong>No challenges match this filter.</strong><p class="vm-section-subtitle">Reset category or difficulty filters to view all daily tasks.</p></article>`;
        return;
      }

      gridEl.innerHTML = tasks
        .map((t, idx) => {
          const isDone = t.status === "approved";
          const proofHtml = isDone
            ? `
              <div class="vm-gs-logged-note">
                <strong>Logged Note:</strong>
                <span>${esc(t.declaration || "Verified eco-action logged.")}</span>
                ${t.proof_url ? `<a href="${esc(t.proof_url)}" target="_blank" rel="noopener" class="vm-gs-proof-link">View Proof Photo</a>` : ""}
              </div>
              <div class="vm-gs-task-footer">
                <span class="vm-gs-done-pill">COMPLETED (+${t.points} PTS &middot; ${t.co2_saved_kg} KG CO<sub>2</sub>)</span>
              </div>
            `
            : `
              <form class="vm-gs-proof-box" data-gs-form="${t.id}">
                <label class="vm-gs-proof-label" for="gs-note-${t.id}">Write a short note if you want (optional):</label>
                <textarea id="gs-note-${t.id}" rows="2" class="vm-input vm-gs-proof-textarea" name="declaration" placeholder="${esc(t.proof_hint || "Share what you did today (optional)...")}"></textarea>
                <div class="vm-gs-proof-row">
                  <label class="vm-gs-upload-pill" title="Attach optional photo">
                    <input type="file" name="proof" accept="image/png,image/jpeg,image/webp" class="vm-gs-file-hidden" data-gs-file="${t.id}" />
                    <span data-gs-file-label="${t.id}">Photo (optional)</span>
                  </label>
                  <button type="submit" class="vm-btn vm-btn-primary vm-btn-sm">Complete Task</button>
                </div>
              </form>
            `;

          return `
            <article class="vm-card vm-gs-task-card-compact ${isDone ? "is-done" : ""}">
              <div class="vm-gs-task-pills-row">
                <div class="vm-gs-task-pills-left">
                  <span class="vm-gs-pill-neutral">${esc(t.category)}</span>
                  <span class="vm-gs-pill-neutral">${esc(t.difficulty)}</span>
                  <span class="vm-gs-pill-co2">~${t.co2_saved_kg} KG CO<sub>2</sub> AVOIDED</span>
                </div>
                <span class="vm-gs-pill-pts">+${t.points} pts</span>
              </div>

              <div class="vm-gs-task-title-row">
                <h3>${idx + 1}. ${esc(t.title)}</h3>
                <span class="vm-gs-status-badge ${isDone ? "is-done" : "is-active"}">${isDone ? "COMPLETED" : "ACTIVE"}</span>
              </div>

              <p class="vm-gs-task-short-desc">${esc(t.description)}</p>

              <div class="vm-gs-howto-box">
                <strong>How to complete:</strong> ${esc(t.instructions || t.description)}
              </div>

              ${proofHtml}
            </article>
          `;
        })
        .join("");

      gridEl.querySelectorAll("[data-gs-file]").forEach((fileInput) => {
        fileInput.addEventListener("change", () => {
          const tid = fileInput.getAttribute("data-gs-file");
          const lbl = gridEl.querySelector(`[data-gs-file-label="${tid}"]`);
          if (lbl) {
            lbl.textContent = fileInput.files && fileInput.files[0] ? "Photo Attached" : "Photo (optional)";
          }
        });
      });

      gridEl.querySelectorAll("[data-gs-form]").forEach((formEl) => {
        formEl.addEventListener("submit", async (e) => {
          e.preventDefault();
          const tid = Number(formEl.getAttribute("data-gs-form"));
          const noteInput = formEl.querySelector('textarea[name="declaration"], input[name="declaration"]');
          const fileInput = formEl.querySelector('input[name="proof"]');
          const submitBtn = formEl.querySelector('button[type="submit"]');
          const noteVal = (noteInput ? noteInput.value : "").trim();
          const hasFile = Boolean(fileInput && fileInput.files && fileInput.files[0]);

          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = "Completing...";
          }
          try {
            const fd = new FormData();
            if (noteVal) fd.append("declaration", noteVal);
            if (hasFile) fd.append("proof", fileInput.files[0]);
            const res = await window.VayuApi.completeGreenTask(tid, fd);
            showGsBanner(res.message || "Challenge completed!", "success");
            await loadGreenSteps();
          } catch (err) {
            showGsBanner(err.message || "Could not complete challenge.", "error");
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = "Complete Task";
            }
          }
        });
      });
    }

    function renderLeaderboard() {
      const lbEl = document.getElementById("vmGsLeaderboardList");
      const hintEl = document.getElementById("vmGsNextLevelHint");
      const s = (gsData && gsData.summary) || {};
      if (hintEl) {
        hintEl.textContent = s.next_level_hint || "Keep earning points";
      }
      if (!lbEl) return;
      const rows = (gsData && gsData.leaderboard) || [];
      if (!rows.length) {
        lbEl.innerHTML = `<span class="vm-meta-line">Leaderboard unavailable.</span>`;
        return;
      }
      lbEl.innerHTML = rows
        .slice(0, 4)
        .map(
          (r) => `
          <div class="vm-gs-leaderboard-row ${r.is_current_user ? "is-me" : ""}">
            <div class="vm-gs-lb-left">
              <span class="vm-gs-lb-rank">#${r.rank}</span>
              <div class="vm-gs-lb-meta">
                <strong>${esc(r.name)}${r.is_current_user ? ' <span class="vm-gs-you-tag">You</span>' : ""}</strong>
                <span>${esc(r.city)} &middot; ${r.completed_count} done &middot; ${r.streak_days}d streak</span>
              </div>
            </div>
            <span class="vm-gs-lb-pts tabular-nums">${r.total_points} pts</span>
          </div>
        `
        )
        .join("");
    }

    function renderImpactExplanation() {
      const formulaEl = document.getElementById("gsImpactFormulaText");
      const breakdownEl = document.getElementById("gsImpactBreakdownList");
      if (formulaEl) {
        formulaEl.textContent =
          (gsData && gsData.impact_formula) ||
          "Each green step lowers local tailpipe smoke, power-plant pollution, and open-waste fumes for cleaner neighbourhood air.";
      }
      if (!breakdownEl) return;
      const items = (gsData && gsData.impact_breakdown) || [];
      if (!items.length) {
        breakdownEl.innerHTML = `<span class="vm-meta-line">Complete a challenge to see how it helps your local air quality and community.</span>`;
        return;
      }
      breakdownEl.innerHTML = items
        .map(
          (item) => `
          <div class="vm-gs-impact-item ${item.completed ? "is-done" : ""}">
            <div class="vm-gs-impact-item-head">
              <strong>${esc(item.title)}</strong>
              <span class="tabular-nums">${item.completed ? `${item.co2_saved_kg} kg saved` : `Potential: ${item.co2_saved_kg} kg`}</span>
            </div>
            <p>${esc(item.explanation)}</p>
          </div>
        `
        )
        .join("");
    }

    function medalIconSvg(medal, earned) {
      const palette =
        medal === "gold"
          ? { rim: "#ca8a04", fill: "#facc15", ribbon: "#dc2626", text: "#713f12" }
          : medal === "silver"
          ? { rim: "#64748b", fill: "#e2e8f0", ribbon: "#0284c7", text: "#1e293b" }
          : { rim: "#b45309", fill: "#f59e0b", ribbon: "#15803d", text: "#78350f" };
      const c = earned
        ? palette
        : { rim: "#cbd5e1", fill: "#f1f5f9", ribbon: "#94a3b8", text: "#64748b" };
      return `
        <svg width="30" height="34" viewBox="0 0 32 36" fill="none" aria-hidden="true">
          <path d="M9 2H15L17 12H11L9 2Z" fill="${c.ribbon}"/>
          <path d="M23 2H17L15 12H21L23 2Z" fill="${c.ribbon}" opacity="0.82"/>
          <circle cx="16" cy="22" r="10.5" fill="${c.fill}" stroke="${c.rim}" stroke-width="2"/>
          <path d="M16 16.5L17.6 19.8L21.2 20.3L18.6 22.8L19.2 26.4L16 24.7L12.8 26.4L13.4 22.8L10.8 20.3L14.4 19.8L16 16.5Z" fill="${c.text}"/>
        </svg>
      `;
    }

    function renderMedalsAndRewards() {
      const medalsGrid = document.getElementById("vmGsMedalsGrid");
      const medalsSummary = document.getElementById("vmGsMedalsSummary");
      const rewardsList = document.getElementById("vmGsRewardsList");
      const badges = (gsData && gsData.badges) || [];
      const rewards = (gsData && gsData.rewards) || [];

      if (medalsSummary) {
        const earnedCount = badges.filter((b) => b.earned).length;
        medalsSummary.textContent = `${earnedCount} / ${badges.length} earned`;
      }

      if (medalsGrid) {
        if (!badges.length) {
          medalsGrid.innerHTML = `<span class="vm-meta-line">No medals configured.</span>`;
        } else {
          medalsGrid.innerHTML = badges
            .map((b) => {
              const tier = (b.medal || "bronze").toLowerCase();
              return `
                <div class="vm-gs-medal-card is-${tier} ${b.earned ? "is-earned" : "is-locked"}" title="${esc(b.description)}">
                  <div class="vm-gs-medal-icon">${medalIconSvg(tier, b.earned)}</div>
                  <div class="vm-gs-medal-meta">
                    <strong>${esc(b.title)}</strong>
                    <span>${b.earned ? `${esc(b.tier || "Medal")} Earned` : esc(b.description)}</span>
                  </div>
                </div>
              `;
            })
            .join("");
        }
      }

      if (rewardsList) {
        if (!rewards.length) {
          rewardsList.innerHTML = `<span class="vm-meta-line">No rewards available.</span>`;
        } else {
          rewardsList.innerHTML = rewards
            .map((rw) => {
              const btnHtml = rw.claimed
                ? `<span class="vm-gs-reward-state is-claimed">Claimed</span>`
                : rw.unlocked
                ? `<button type="button" class="vm-btn vm-btn-primary vm-btn-sm" data-claim-reward="${esc(rw.code)}">Claim</button>`
                : `<span class="vm-gs-reward-state is-locked">${rw.required_points} pts</span>`;
              return `
                <div class="vm-gs-reward-chip ${rw.claimed ? "is-claimed" : rw.unlocked ? "is-unlocked" : ""}">
                  <div class="vm-gs-reward-meta">
                    <strong>${esc(rw.title)}</strong>
                    <span>${esc(rw.description)}</span>
                  </div>
                  ${btnHtml}
                </div>
              `;
            })
            .join("");

          rewardsList.querySelectorAll("[data-claim-reward]").forEach((btn) => {
            btn.addEventListener("click", async () => {
              const code = btn.getAttribute("data-claim-reward");
              if (!code) return;
              btn.disabled = true;
              btn.textContent = "Claiming...";
              try {
                const res = await window.VayuApi.claimGreenReward(code);
                showGsBanner(res.message || "Reward claimed!", "success");
                await loadGreenSteps();
              } catch (err) {
                showGsBanner(err.message || "Unable to claim reward.", "error");
                btn.disabled = false;
                btn.textContent = "Claim";
              }
            });
          });
        }
      }
    }

    function renderAll() {
      if (!gsData) return;
      const s = gsData.summary || {};

      if (roleBadgeEl) {
        roleBadgeEl.textContent = gsData.user ? `${gsData.user.name} · ${s.badge_title || "Eco Starter"}` : "Active Tracker";
      }

      setText("gsTotalPoints", `${s.total_points ?? 0} pts`);
      setText("gsBadgeTitle", s.badge_title || "Eco Warrior");

      const pct = Math.max(0, Math.min(100, Number(s.progress_pct || 0)));
      setText("gsProgressPct", `${pct}%`);
      const arc = document.getElementById("gsProgressRingArc");
      if (arc) {
        const circumference = 2 * Math.PI * 46;
        const offset = circumference * (1 - pct / 100);
        arc.setAttribute("stroke-dasharray", circumference.toFixed(2));
        arc.setAttribute("stroke-dashoffset", offset.toFixed(2));
      }

      setText("gsChallengesRatio", `${s.completed_count ?? 0} / ${s.total_tasks ?? 8}`);
      setText("gsStreakDays", `${s.streak_days ?? 0}`);
      setText("gsProgressPoints", `${s.total_points ?? 0}`);

      const co2 = Number(s.total_co2_saved_kg ?? 0);
      setText("gsTotalCo2Saved", `~ ${co2} kg`);
      const trees = Math.max(0, Math.round(co2 / 1.75));
      setText(
        "gsTreeEquivText",
        trees === 1
          ? "1.75 kg CO2 ≈ 1 young sapling's monthly absorption."
          : `Equivalent to ~${trees} young saplings absorbing CO2 for a month.`
      );

      renderSparkline(gsData.weekly_progress);
      renderMedalsAndRewards();
      renderChallengesGrid();
      renderLeaderboard();
      renderImpactExplanation();
    }

    async function loadGreenSteps() {
      try {
        gsData = await window.VayuApi.getGreenSteps();
        renderAll();
      } catch (err) {
        showGsBanner(err.message || "Failed to load Green Steps tracker.", "error");
      }
    }

    if (catFilterEl) catFilterEl.addEventListener("change", renderChallengesGrid);
    if (diffFilterEl) diffFilterEl.addEventListener("change", renderChallengesGrid);

    await loadGreenSteps();
  }
})(window, document);

