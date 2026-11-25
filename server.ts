import fs from "node:fs";
import path from "node:path";
import express, { NextFunction, Request, Response } from "express";
import multer from "multer";
import { Config, FRONTEND_DIR } from "./src/config.js";
import { getIndiaLocationsDirectory } from "./src/data/indiaLocations.js";
import {
  explainEventReplay,
  generateEventReplayPdf,
  getAirQualityData,
  getForecastData,
  getInsightsData,
  getPollutionEventReplay,
  getProfileBundle,
  getTimeMachineData,
  HttpError,
  simulateWhatIf,
} from "./src/services/airQuality.js";
import {
  addExposureDiaryEntry,
  addPersonalActivity,
  addPersonalLocation,
  createCommunityReport,
  createContactMessage,
  deletePersonalActivity,
  deletePersonalLocation,
  exportAirTwinCsv,
  exportReportsCsv,
  getAirTwinData,
  getAlertsData,
  getAuthSession,
  getCleanRoutes,
  getCommunityContributionSummary,
  getDashboardData,
  getReportsData,
  listCommunityReports,
  loginUser,
  logoutUser,
  registerUser,
  updateCommunityReportStatus,
  updateProfileBundle,
} from "./src/services/features.js";
import {
  claimGreenReward,
  completeGreenTask,
  estimateEnvironmentalImpact,
  getGreenStepsDashboard,
  reviewGreenTaskSubmission,
  startGreenTask,
} from "./src/services/greenSteps.js";
import { COMMUNITY_CATEGORIES, db, REPORT_STATUSES } from "./src/store/memoryDb.js";

const app = express();
app.use(express.json({ limit: "8mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Config.MAX_UPLOAD_BYTES },
});

function parseFloatOpt(val: unknown): number | null {
  if (val === undefined || val === null || val === "") return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function parseIntOpt(val: unknown): number | null {
  if (val === undefined || val === null || val === "") return null;
  const n = parseInt(String(val), 10);
  return Number.isFinite(n) ? n : null;
}

function parseBool(val: unknown): boolean {
  if (val === undefined || val === null) return false;
  return ["1", "true", "yes", "on"].includes(String(val).trim().toLowerCase());
}

function extractAuthToken(req: Request): string {
  const authHdr = req.header("Authorization") || "";
  if (authHdr.toLowerCase().startsWith("bearer ")) {
    return authHdr.slice(7).trim();
  }
  return (req.header("X-Auth-Token") || "").trim();
}

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void> | void
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// =========================================================================
// API ROUTES
// =========================================================================

app.get(
  "/api/dashboard",
  asyncHandler(async (req, res) => {
    const data = await getDashboardData({
      city: req.query.city as string | undefined,
      lat: parseFloatOpt(req.query.lat),
      lon: parseFloatOpt(req.query.lon),
    });
    res.json(data);
  })
);

app.get("/api/locations/india", (_req, res) => {
  res.json(getIndiaLocationsDirectory());
});

app.get(
  "/api/air-quality",
  asyncHandler(async (req, res) => {
    const data = await getAirQualityData({
      city: req.query.city as string | undefined,
      lat: parseFloatOpt(req.query.lat),
      lon: parseFloatOpt(req.query.lon),
    });
    res.json(data);
  })
);

app.get(
  "/api/air-quality/forecast",
  asyncHandler(async (req, res) => {
    const data = await getForecastData({
      city: req.query.city as string | undefined,
      lat: parseFloatOpt(req.query.lat),
      lon: parseFloatOpt(req.query.lon),
    });
    res.json(data);
  })
);

app.get(
  "/api/air-quality/history",
  asyncHandler(async (req, res) => {
    const data = await getReportsData({
      city: req.query.city as string | undefined,
      period: (req.query.period as string) || "daily",
      lat: parseFloatOpt(req.query.lat),
      lon: parseFloatOpt(req.query.lon),
      start_date: req.query.start_date as string | undefined,
      end_date: req.query.end_date as string | undefined,
    });
    res.json(data);
  })
);

app.get(
  "/api/insights",
  asyncHandler(async (req, res) => {
    const data = await getInsightsData({
      city: req.query.city as string | undefined,
      lat: parseFloatOpt(req.query.lat),
      lon: parseFloatOpt(req.query.lon),
    });
    res.json(data);
  })
);

app.get(
  "/api/insights/time-machine",
  asyncHandler(async (req, res) => {
    const data = await getTimeMachineData({
      city: req.query.city as string | undefined,
      lat: parseFloatOpt(req.query.lat),
      lon: parseFloatOpt(req.query.lon),
      target_date: req.query.target_date as string | undefined,
      compare_date: req.query.compare_date as string | undefined,
      start_date: req.query.start_date as string | undefined,
      end_date: req.query.end_date as string | undefined,
      period: req.query.period as string | undefined,
      time_slot: req.query.time_slot as string | undefined,
    });
    res.json(data);
  })
);

app.get(
  "/api/insights/event-replay",
  asyncHandler(async (req, res) => {
    const data = await getPollutionEventReplay({
      city: req.query.city as string | undefined,
      lat: parseFloatOpt(req.query.lat),
      lon: parseFloatOpt(req.query.lon),
      start_date: req.query.start_date as string | undefined,
      end_date: req.query.end_date as string | undefined,
      pollutant: (req.query.pollutant as string) || "pm2_5",
      threshold_pct: parseFloatOpt(req.query.threshold_pct) ?? 35.0,
      baseline_method: (req.query.baseline_method as string) || "median",
      window_hours: parseIntOpt(req.query.window_hours) ?? 12,
      case_id: parseIntOpt(req.query.case_id),
    });
    res.json(data);
  })
);

app.post("/api/insights/event-replay/explain", (req, res) => {
  const explanation = explainEventReplay(req.body || {});
  res.json({ explanation });
});

app.post("/api/insights/event-replay/pdf", (req, res) => {
  const { filename, buffer } = generateEventReplayPdf(req.body || {});
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
});

app.post(
  "/api/insights/simulate",
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const result = await simulateWhatIf({
      city: body.city,
      lat: parseFloatOpt(body.lat),
      lon: parseFloatOpt(body.lon),
      traffic_reduction_pct: Number(body.traffic_reduction_pct ?? 0),
      dust_control_pct: Number(body.dust_control_pct ?? 0),
      greenery_increase_pct: Number(body.greenery_increase_pct ?? 0),
      burning_reduction_pct: Number(body.burning_reduction_pct ?? 0),
      industrial_reduction_pct: Number(body.industrial_reduction_pct ?? 0),
    });
    res.json(result);
  })
);

app.get(
  "/api/routes",
  asyncHandler(async (req, res) => {
    const data = await getCleanRoutes({
      origin: String(req.query.origin || ""),
      destination: String(req.query.destination || ""),
      mode: String(req.query.mode || "walking"),
      escape_mode: parseBool(req.query.escape_mode),
    });
    res.json(data);
  })
);

app.get(
  "/api/alerts",
  asyncHandler(async (req, res) => {
    const data = await getAlertsData({
      city: req.query.city as string | undefined,
      lat: parseFloatOpt(req.query.lat),
      lon: parseFloatOpt(req.query.lon),
    });
    res.json(data);
  })
);

app.get(
  "/api/reports",
  asyncHandler(async (req, res) => {
    const data = await getReportsData({
      city: req.query.city as string | undefined,
      period: (req.query.period as string) || "daily",
      lat: parseFloatOpt(req.query.lat),
      lon: parseFloatOpt(req.query.lon),
      start_date: req.query.start_date as string | undefined,
      end_date: req.query.end_date as string | undefined,
    });
    res.json(data);
  })
);

app.get(
  "/api/reports/export",
  asyncHandler(async (req, res) => {
    const { filename, csvText } = await exportReportsCsv({
      city: req.query.city as string | undefined,
      period: (req.query.period as string) || "daily",
      start_date: req.query.start_date as string | undefined,
      end_date: req.query.end_date as string | undefined,
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csvText);
  })
);

app.get("/api/community/reports", (req, res) => {
  res.json({
    categories: COMMUNITY_CATEGORIES,
    statuses: REPORT_STATUSES,
    contribution_summary: getCommunityContributionSummary(),
    reports: listCommunityReports({
      status: req.query.status as string | undefined,
      category: req.query.category as string | undefined,
      search: req.query.search as string | undefined,
    }),
  });
});

app.post(
  "/api/community/report",
  upload.single("photo"),
  asyncHandler(async (req, res) => {
    const isMultipart = Boolean(req.is("multipart/form-data"));
    const body = req.body || {};
    let fileBytes: Buffer | null = null;
    let origName: string | null = null;

    if (isMultipart && req.file) {
      fileBytes = req.file.buffer;
      origName = req.file.originalname;
    } else if (!isMultipart && body.photo_base64) {
      const b64Str = String(body.photo_base64).split(",").pop() || "";
      fileBytes = Buffer.from(b64Str, "base64");
      origName = body.photo_name || null;
    }

    const created = createCommunityReport({
      title: String(body.title || ""),
      description: String(body.description || ""),
      category: String(body.category || ""),
      location_name: String(body.location_name || ""),
      latitude: parseFloatOpt(body.latitude),
      longitude: parseFloatOpt(body.longitude),
      fileBytes,
      originalFilename: origName,
      authToken: extractAuthToken(req),
    });
    res.status(201).json({ message: "Community report submitted successfully.", report: created });
  })
);

// =========================================================================
// GREENSTEPS ACTION & REWARD API ROUTES
// =========================================================================

app.get("/api/greensteps", (req, res) => {
  res.json(getGreenStepsDashboard(extractAuthToken(req)));
});

app.post("/api/greensteps/tasks/:taskId/start", (req, res) => {
  const taskId = parseInt(req.params.taskId, 10);
  const result = startGreenTask(taskId, extractAuthToken(req));
  res.json(result);
});

app.post(
  "/api/greensteps/tasks/:taskId/complete",
  upload.single("proof"),
  (req, res) => {
    const taskId = parseInt(String(req.params.taskId || ""), 10);
    const isMultipart = Boolean(req.is("multipart/form-data"));
    const body = req.body || {};
    let fileBytes: Buffer | null = null;
    let origName: string | null = null;

    if (isMultipart && req.file) {
      fileBytes = req.file.buffer;
      origName = req.file.originalname;
    } else if (!isMultipart && body.proof_base64) {
      const b64Str = String(body.proof_base64).split(",").pop() || "";
      fileBytes = Buffer.from(b64Str, "base64");
      origName = body.proof_name || null;
    }

    const result = completeGreenTask({
      taskId,
      declaration: String(body.declaration || ""),
      fileBytes,
      originalFilename: origName,
      authToken: extractAuthToken(req),
    });
    res.json(result);
  }
);

app.post("/api/greensteps/rewards/:rewardCode/claim", (req, res) => {
  const result = claimGreenReward(String(req.params.rewardCode || ""), extractAuthToken(req));
  res.json(result);
});

app.post("/api/greensteps/estimate", (req, res) => {
  const result = estimateEnvironmentalImpact({
    activity: String(req.body?.activity || "walking_vs_car"),
    quantity: Number(req.body?.quantity ?? 3),
    frequency: String(req.body?.frequency || "daily"),
  });
  res.json(result);
});

app.post("/api/greensteps/admin/submissions/:submissionId/review", (req, res) => {
  const submissionId = parseInt(req.params.submissionId, 10);
  const result = reviewGreenTaskSubmission({
    submissionId,
    decision: String(req.body?.decision || ""),
    notes: String(req.body?.notes || ""),
    authToken: extractAuthToken(req),
  });
  res.json(result);
});

app.put("/api/community/reports/:reportId/status", (req, res) => {
  const reportId = parseInt(req.params.reportId, 10);
  const updated = updateCommunityReportStatus(reportId, String(req.body?.status || ""));
  res.json({ report: updated });
});

app.patch("/api/community/reports/:reportId/status", (req, res) => {
  const reportId = parseInt(req.params.reportId, 10);
  const updated = updateCommunityReportStatus(reportId, String(req.body?.status || ""));
  res.json({ report: updated });
});

app.post("/api/auth/login", (req, res) => {
  const result = loginUser(req.body?.email || "", req.body?.password || "");
  res.json(result);
});

app.post(
  "/api/auth/register",
  asyncHandler(async (req, res) => {
    const result = await registerUser(
      req.body?.name || "",
      req.body?.email || "",
      req.body?.password || "",
      req.body?.preferred_city || "Mumbai"
    );
    res.status(201).json(result);
  })
);

app.post("/api/auth/logout", (req, res) => {
  res.json(logoutUser(extractAuthToken(req)));
});

app.get("/api/auth/me", (req, res) => {
  res.json(getAuthSession(extractAuthToken(req)));
});

app.get("/api/profile", (req, res) => {
  res.json(getProfileBundle(extractAuthToken(req)));
});

app.put(
  "/api/profile",
  asyncHandler(async (req, res) => {
    const updated = await updateProfileBundle(req.body || {}, extractAuthToken(req));
    res.json({ message: "Settings saved successfully.", ...updated });
  })
);

app.get(
  "/api/air-twin",
  asyncHandler(async (req, res) => {
    const data = await getAirTwinData(true, extractAuthToken(req));
    res.json(data);
  })
);

app.post(
  "/api/air-twin/locations",
  asyncHandler(async (req, res) => {
    const created = await addPersonalLocation(
      req.body?.label || "",
      req.body?.city || "",
      Number(req.body?.hours_per_day || 8.0),
      extractAuthToken(req)
    );
    res.status(201).json({ message: "Frequent location added.", location: created });
  })
);

app.delete("/api/air-twin/locations/:locId", (req, res) => {
  deletePersonalLocation(parseInt(req.params.locId, 10));
  res.json({ message: "Location removed." });
});

app.post("/api/air-twin/activities", (req, res) => {
  const created = addPersonalActivity({
    activity_type: req.body?.activity_type || "",
    location_id: parseIntOpt(req.body?.location_id),
    hours_per_day: Number(req.body?.hours_per_day ?? 1),
    intensity: req.body?.intensity || "Moderate",
    is_outdoor: req.body?.is_outdoor !== undefined ? Boolean(req.body.is_outdoor) : true,
    authToken: extractAuthToken(req),
  });
  res.status(201).json({ message: "Daily activity logged.", activity: created });
});

app.delete("/api/air-twin/activities/:actId", (req, res) => {
  deletePersonalActivity(parseInt(req.params.actId, 10));
  res.json({ message: "Activity removed." });
});

app.post(
  "/api/air-twin/diary",
  asyncHandler(async (req, res) => {
    const entry = await addExposureDiaryEntry(
      req.body?.notes || "",
      req.body?.entry_date,
      extractAuthToken(req)
    );
    res.status(201).json({ message: "Exposure diary snapshot logged.", entry });
  })
);

app.get(
  "/api/air-twin/export",
  asyncHandler(async (_req, res) => {
    const { filename, csvText } = await exportAirTwinCsv();
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csvText);
  })
);

app.post("/api/contact", (req, res) => {
  const saved = createContactMessage({
    name: req.body?.name || "",
    email: req.body?.email || "",
    subject: req.body?.subject || "General Feedback",
    message: req.body?.message || "",
  });
  res.status(201).json({ message: "Thank you for contacting VayuMitra.", ticket: saved });
});

// Uploaded evidence photos (served from in-memory store)
app.get("/uploads/:filename", (req, res) => {
  const item = db.uploads.get(path.basename(req.params.filename));
  if (!item) {
    res.status(404).json({ error: "File not found." });
    return;
  }
  res.setHeader("Content-Type", item.mimeType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(item.data);
});

// Static Frontend Assets & Multi-page HTML serving
app.use(express.static(FRONTEND_DIR, { index: "index.html" }));

app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    next();
    return;
  }
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ error: "Endpoint not found." });
    return;
  }
  const rel = req.path === "/" ? "index.html" : req.path.replace(/^\/+/, "");
  const candidate = path.resolve(FRONTEND_DIR, rel);
  if (candidate.startsWith(path.resolve(FRONTEND_DIR)) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    res.sendFile(candidate);
    return;
  }
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

// Global error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err?.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: "Uploaded photo exceeds the 5 MB size limit." });
    return;
  }
  console.error("[VayuMitra API Error]", err);
  res.status(502).json({ error: err?.message || "Internal server error." });
});

app.listen(Config.PORT, Config.HOST, () => {
  console.log(`VayuMitra Node.js server listening on http://${Config.HOST}:${Config.PORT}`);
});
