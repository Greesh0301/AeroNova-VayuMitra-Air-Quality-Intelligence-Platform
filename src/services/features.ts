import crypto from "node:crypto";
import { Config } from "../config.js";
import { LocationInfo } from "../data/indiaLocations.js";
import {
  ACTIVITY_TYPES,
  COMMUNITY_CATEGORIES,
  db,
  hashPassword,
  LEGACY_CATEGORY_MAP,
  REPORT_STATUSES,
  utcNowIso,
  verifyPassword,
} from "../store/memoryDb.js";
import {
  buildCleanAirWindows,
  classifyAqi,
  computeIndianNaqi,
  fetchAirQualityBundle,
  getAirQualityData,
  getForecastData,
  getProfileBundle,
  haversineKm,
  httpGetJson,
  HttpError,
  PollutantMap,
  resolveLocation,
} from "./airQuality.js";

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: Array<Array<unknown>>): string {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\r\n") + "\r\n";
}

function createSessionToken(profileId: number): string {
  const token = crypto.randomBytes(24).toString("base64url");
  const now = new Date();
  const expires = new Date(now.getTime() + 14 * 86_400_000);
  db.sessions.set(token, {
    token,
    profile_id: profileId,
    created_at: now.toISOString().replace(/\.\d{3}Z$/, "+00:00"),
    expires_at: expires.toISOString().replace(/\.\d{3}Z$/, "+00:00"),
  });
  return token;
}

export async function registerUser(
  nameIn: string,
  emailIn: string,
  passwordIn: string,
  preferredCityIn = "Mumbai"
) {
  const name = (nameIn || "").trim();
  const email = (emailIn || "").trim().toLowerCase();
  const pw = String(passwordIn || "");
  const cityIn = (preferredCityIn || Config.DEFAULT_CITY).trim() || Config.DEFAULT_CITY;

  if (name.length < 2) {
    throw new HttpError(400, "Please enter your full name (at least 2 characters).");
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new HttpError(400, "Please enter a valid email address.");
  }
  if (pw.length < 6) {
    throw new HttpError(400, "Password must be at least 6 characters long.");
  }

  const geo = await resolveLocation({ city: cityIn });
  if (!geo) {
    throw new HttpError(
      400,
      "Preferred city must be located within India (e.g., Mumbai, Delhi, Bengaluru)."
    );
  }

  if (db.profiles.some((p) => p.email.toLowerCase() === email)) {
    throw new HttpError(400, "An account with this email already exists. Please sign in instead.");
  }

  const now = utcNowIso();
  const { saltHex, hashHex } = hashPassword(pw);
  const pid = db.nextId("profile");
  db.profiles.push({
    id: pid,
    name,
    email,
    role: "citizen",
    bio: "VayuMitra environmental citizen tracking air quality.",
    preferred_city: geo.name,
    preferred_lat: geo.latitude,
    preferred_lon: geo.longitude,
    password_hash: hashHex,
    password_salt: saltHex,
    created_at: now,
    updated_at: now,
  });
  db.preferences.set(pid, {
    profile_id: pid,
    default_city: geo.name,
    auto_detect_location: false,
    temp_unit: "C",
    pollutant_unit: "ugm3",
    aqi_standard: "NAQI",
    share_location: true,
    anonymous_reports: false,
    updated_at: now,
  });
  db.notifications.set(pid, {
    profile_id: pid,
    enabled: true,
    aqi_warnings: true,
    location_alerts: true,
    aqi_threshold: 100,
    pm25_threshold: 35.0,
    browser_notifications: false,
    updated_at: now,
  });

  const token = createSessionToken(pid);
  const bundle = getProfileBundle(token);
  return {
    token,
    authenticated: true,
    user: bundle.profile,
    bundle,
    message: `Welcome to VayuMitra, ${bundle.profile.name}!`,
  };
}

export function loginUser(emailIn: string, passwordIn: string) {
  const emailNorm = (emailIn || "").trim().toLowerCase();
  const pw = String(passwordIn || "");
  if (!emailNorm || !pw) {
    throw new HttpError(401, "Please enter both email and password.");
  }
  const profile = db.profiles.find((p) => p.email.toLowerCase() === emailNorm);
  if (!profile || !verifyPassword(pw, profile.password_hash, profile.password_salt)) {
    throw new HttpError(401, "Invalid email or password.");
  }
  const token = createSessionToken(profile.id);
  const bundle = getProfileBundle(token);
  return {
    token,
    authenticated: true,
    user: bundle.profile,
    bundle,
    message: `Signed in as ${bundle.profile.name}.`,
  };
}

export function logoutUser(authToken?: string | null) {
  if (authToken) db.sessions.delete(authToken.trim());
  return { authenticated: false, message: "You have been logged out of VayuMitra." };
}

export function getAuthSession(authToken?: string | null) {
  if (!authToken || !authToken.trim()) return { authenticated: false, user: null };
  const sess = db.sessions.get(authToken.trim());
  if (!sess || sess.expires_at <= utcNowIso()) {
    return { authenticated: false, user: null };
  }
  const p = db.profiles.find((u) => u.id === sess.profile_id);
  if (!p) return { authenticated: false, user: null };
  return {
    authenticated: true,
    user: {
      id: p.id,
      name: p.name,
      email: p.email,
      role: p.role,
      preferred_city: p.preferred_city,
    },
  };
}

export async function updateProfileBundle(
  payload: Record<string, any>,
  authToken?: string | null
) {
  const profile = db.resolveProfile(authToken);
  const pid = profile.id;
  const now = utcNowIso();

  const profIn = payload.profile || {};
  const prefsIn = payload.preferences || {};
  const notifIn = payload.notifications || {};
  const secIn = payload.security || {};

  const preferredCity =
    String(
      profIn.preferred_city || prefsIn.default_city || profile.preferred_city
    ).trim() || "Mumbai";
  const geo = await resolveLocation({ city: preferredCity });
  if (!geo) {
    throw new HttpError(
      400,
      "Default city must be located within India (e.g., Mumbai, Delhi, Bengaluru, Pune)."
    );
  }

  const name = String(profIn.name ?? profile.name).trim() || profile.name;
  const email = String(profIn.email ?? profile.email).trim();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new HttpError(400, "Please provide a valid email address.");
  }
  const bio = String(profIn.bio ?? profile.bio).trim().slice(0, 400);

  profile.name = name;
  profile.email = email;
  profile.bio = bio;
  profile.preferred_city = geo.name;
  profile.preferred_lat = geo.latitude;
  profile.preferred_lon = geo.longitude;
  profile.updated_at = now;

  const newPw = secIn.new_password;
  if (newPw !== undefined && newPw !== null && String(newPw).trim() !== "") {
    const pw = String(newPw);
    if (pw.length < 8) {
      throw new HttpError(400, "Password must be at least 8 characters long.");
    }
    if (profile.password_hash) {
      const currentPw = String(secIn.current_password || "");
      if (!verifyPassword(currentPw, profile.password_hash, profile.password_salt)) {
        throw new HttpError(400, "Current password does not match.");
      }
    }
    const { saltHex, hashHex } = hashPassword(pw);
    profile.password_hash = hashHex;
    profile.password_salt = saltHex;
  }

  const curPrefs = db.preferences.get(pid)!;
  let tempUnit = String(prefsIn.temp_unit ?? curPrefs.temp_unit).toUpperCase();
  if (tempUnit !== "C" && tempUnit !== "F") tempUnit = "C";
  let polUnit = String(prefsIn.pollutant_unit ?? curPrefs.pollutant_unit).toLowerCase();
  if (polUnit !== "ugm3" && polUnit !== "mgm3") polUnit = "ugm3";
  let aqiStd = String(prefsIn.aqi_standard ?? curPrefs.aqi_standard).toUpperCase();
  if (!["NAQI", "US", "EU"].includes(aqiStd)) aqiStd = "NAQI";

  db.preferences.set(pid, {
    profile_id: pid,
    default_city: geo.name,
    auto_detect_location: Boolean(prefsIn.auto_detect_location ?? curPrefs.auto_detect_location),
    temp_unit: tempUnit as "C" | "F",
    pollutant_unit: polUnit as "ugm3" | "mgm3",
    aqi_standard: aqiStd as "NAQI" | "US" | "EU",
    share_location: Boolean(prefsIn.share_location ?? curPrefs.share_location),
    anonymous_reports: Boolean(prefsIn.anonymous_reports ?? curPrefs.anonymous_reports),
    updated_at: now,
  });

  const curNotif = db.notifications.get(pid)!;
  const aqiThresh = Math.max(25, Math.min(400, parseInt(String(notifIn.aqi_threshold ?? curNotif.aqi_threshold), 10) || 100));
  const pm25Thresh = Math.max(5, Math.min(250, Number(notifIn.pm25_threshold ?? curNotif.pm25_threshold) || 35));

  db.notifications.set(pid, {
    profile_id: pid,
    enabled: Boolean(notifIn.enabled ?? curNotif.enabled),
    aqi_warnings: Boolean(notifIn.aqi_warnings ?? curNotif.aqi_warnings),
    location_alerts: Boolean(notifIn.location_alerts ?? curNotif.location_alerts),
    aqi_threshold: aqiThresh,
    pm25_threshold: pm25Thresh,
    browser_notifications: Boolean(notifIn.browser_notifications ?? curNotif.browser_notifications),
    updated_at: now,
  });

  return getProfileBundle(authToken);
}

function sampleRouteCoordinates(coords: number[][], count = 5): number[][] {
  if (!coords.length) return [];
  if (coords.length <= count || count <= 1) return count > 1 ? coords : [coords[0]];
  const step = (coords.length - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) => coords[Math.round(i * step)]);
}

function formatDurationHrMin(totalMin: number): string {
  const m = Math.max(1, Math.round(totalMin));
  const hrs = Math.floor(m / 60);
  const rem = m % 60;
  if (hrs > 0) {
    return `${hrs} hr ${rem} min`;
  }
  return `${rem} min`;
}

function pointToSegmentKm(
  pLat: number,
  pLon: number,
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number
): number {
  const cosLat = Math.cos(((pLat + aLat + bLat) / 3) * (Math.PI / 180));
  const kx = 111.32 * cosLat;
  const ky = 111.32;
  const px = (pLon - aLon) * kx;
  const py = (pLat - aLat) * ky;
  const bx = (bLon - aLon) * kx;
  const by = (bLat - aLat) * ky;
  const lenSq = bx * bx + by * by;
  if (lenSq <= 1e-9) return Math.hypot(px, py);
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / lenSq));
  const cx = t * bx;
  const cy = t * by;
  return Math.hypot(px - cx, py - cy);
}

function minDistanceToPolylineKm(lat: number, lon: number, coords: number[][]): number {
  if (!coords.length) return Infinity;
  if (coords.length === 1) return haversineKm(lat, lon, coords[0][1], coords[0][0]);
  let best = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const d = pointToSegmentKm(lat, lon, coords[i][1], coords[i][0], coords[i + 1][1], coords[i + 1][0]);
    if (d < best) best = d;
  }
  return best;
}

function countZoneIntersections(
  coords: number[][],
  zones: Array<{ lat: number; lon: number }>,
  clearanceKm = 1.32
): number {
  let hits = 0;
  for (const z of zones) {
    if (minDistanceToPolylineKm(z.lat, z.lon, coords) <= clearanceKm) {
      hits += 1;
    }
  }
  return hits;
}

export async function getCleanRoutes(params: {
  origin: string;
  destination: string;
  mode?: string;
  escape_mode?: boolean;
}) {
  const { origin, destination, mode = "walking", escape_mode = false } = params;
  if (!origin || !destination) {
    throw new HttpError(400, "Both starting location and destination are required.");
  }

  const [origLoc, destLoc] = await Promise.all([
    resolveLocation({ city: origin }),
    resolveLocation({ city: destination }),
  ]);
  if (!origLoc) {
    throw new HttpError(
      404,
      `Starting location '${origin}' was not found in India. Please enter an Indian city or neighborhood.`
    );
  }
  if (!destLoc) {
    throw new HttpError(
      404,
      `Destination '${destination}' was not found in India. Please enter an Indian city or neighborhood.`
    );
  }

  let modeClean = mode.toLowerCase().trim();
  if (!["walking", "cycling", "driving"].includes(modeClean)) modeClean = "walking";
  const osrmProfile = { walking: "foot", cycling: "bike", driving: "driving" }[modeClean]!;

  const osrmUrl =
    `https://router.project-osrm.org/route/v1/${osrmProfile}/` +
    `${origLoc.longitude},${origLoc.latitude};${destLoc.longitude},${destLoc.latitude}` +
    "?overview=full&alternatives=true&geometries=geojson";

  let osrmData: Record<string, any>;
  try {
    osrmData = await httpGetJson<Record<string, any>>(osrmUrl);
  } catch (err: any) {
    throw new HttpError(502, `Routing service unavailable: ${err.message || err}`);
  }

  const rawRoutes: Array<Record<string, any>> = osrmData.routes || [];
  if (!rawRoutes.length) {
    throw new HttpError(404, "No navigable route was found between those two points.");
  }

  const activeReports = db.reports
    .filter((r) => r.status !== "Rejected" && r.status !== "Resolved")
    .slice()
    .sort((a, b) => b.id - a.id)
    .slice(0, 40);

  const origCityL = origLoc.name.toLowerCase();
  const destCityL = destLoc.name.toLowerCase();
  const nearbyIncidents: Array<Record<string, any>> = [];
  const incidentUpdates: Array<Record<string, any>> = [];

  for (const r of activeReports) {
    const locL = r.location_name.toLowerCase();
    let isNear = false;
    if (r.latitude !== null && r.longitude !== null) {
      const dOrig = haversineKm(origLoc.latitude, origLoc.longitude, r.latitude, r.longitude);
      const dDest = haversineKm(destLoc.latitude, destLoc.longitude, r.latitude, r.longitude);
      isNear = Math.min(dOrig, dDest) <= 45;
    } else if ((origCityL && locL.includes(origCityL)) || (destCityL && locL.includes(destCityL))) {
      isNear = true;
    }
    const item = {
      id: r.id,
      report_code: r.report_code,
      title: r.title,
      category: r.category,
      location_name: r.location_name,
      lat: r.latitude,
      lon: r.longitude,
      status: r.status,
      is_verified: r.status === "Verified",
      hotspot_type: r.status === "Verified" ? "Verified Incident" : "Citizen Report",
      created_at: r.created_at,
    };
    if (isNear && r.latitude !== null && r.longitude !== null) nearbyIncidents.push(item);
    if (isNear || incidentUpdates.length < 4) incidentUpdates.push(item);
  }

  let prefStd = (getProfileBundle().preferences.aqi_standard || "NAQI").toUpperCase();
  if (!["NAQI", "US", "EU"].includes(prefStd)) prefStd = "NAQI";

  async function sampleRouteAqi(coords: number[][]) {
    const samples = sampleRouteCoordinates(coords, 5);
    const lats = samples.map((pt) => pt[1].toFixed(4)).join(",");
    const lons = samples.map((pt) => pt[0].toFixed(4)).join(",");
    const waypointAqiList: Array<Record<string, any>> = [];
    try {
      const aqUrl =
        "https://air-quality-api.open-meteo.com/v1/air-quality" +
        `?latitude=${lats}&longitude=${lons}` +
        "&current=us_aqi,european_aqi,pm2_5,pm10,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide,ozone";
      const aqResp = await httpGetJson<any>(aqUrl);
      const aqItems = Array.isArray(aqResp) ? aqResp : [aqResp];
      for (let ptIdx = 0; ptIdx < aqItems.length; ptIdx++) {
        const cur = aqItems[ptIdx].current || {};
        let aqiV: number | null = null;
        if (prefStd === "NAQI") {
          aqiV = computeIndianNaqi({
            pm2_5: cur.pm2_5 ?? null,
            pm10: cur.pm10 ?? null,
            no2: cur.nitrogen_dioxide ?? null,
            so2: cur.sulphur_dioxide ?? null,
            co: cur.carbon_monoxide ?? null,
            o3: cur.ozone ?? null,
          });
          if (aqiV === null) aqiV = cur.us_aqi ?? null;
        } else if (prefStd === "EU") {
          aqiV = cur.european_aqi ?? null;
        } else {
          aqiV = cur.us_aqi ?? null;
        }
        if (aqiV !== null && aqiV !== undefined) {
          waypointAqiList.push({
            lat: samples[ptIdx][1],
            lon: samples[ptIdx][0],
            aqi: Math.round(aqiV),
            pm2_5: cur.pm2_5 ?? null,
            pm10: cur.pm10 ?? null,
            category: classifyAqi(aqiV, prefStd).category,
          });
        }
      }
    } catch {
      // ignore
    }
    return { samples, waypointAqiList };
  }

  // Evaluate direct route first to determine interior red-circle hotspots that safe_air must detour around
  const baseRoute = rawRoutes[0];
  const baseSample = await sampleRouteAqi(baseRoute.geometry.coordinates);

  const verifiedIncidentZones = nearbyIncidents
    .filter(
      (inc) =>
        inc.is_verified &&
        inc.lat != null &&
        inc.lon != null &&
        haversineKm(inc.lat, inc.lon, origLoc.latitude, origLoc.longitude) > 1.38 &&
        haversineKm(inc.lat, inc.lon, destLoc.latitude, destLoc.longitude) > 1.38
    )
    .map((inc) => ({ lat: Number(inc.lat), lon: Number(inc.lon) }));

  const baseInteriorHotspots = baseSample.waypointAqiList
    .slice(1, -1)
    .filter(
      (hw) =>
        hw.aqi > 100 &&
        haversineKm(hw.lat, hw.lon, origLoc.latitude, origLoc.longitude) > 1.5 &&
        haversineKm(hw.lat, hw.lon, destLoc.latitude, destLoc.longitude) > 1.5
    );

  const redAvoidZones: Array<{ lat: number; lon: number }> = [
    ...verifiedIncidentZones,
    ...baseInteriorHotspots.map((h) => ({ lat: h.lat, lon: h.lon })),
  ];

  // Collect candidate routes and ensure at least one actively detours outside redAvoidZones
  const candidatePool: Array<{ raw: Record<string, any>; preSample?: { samples: number[][]; waypointAqiList: Array<Record<string, any>> } }> = [
    { raw: baseRoute, preSample: baseSample },
  ];
  for (const alt of rawRoutes.slice(1, 3)) {
    candidatePool.push({ raw: alt });
  }

  const hasCleanAlternative = candidatePool
    .slice(1)
    .some((c) => countZoneIntersections(c.raw.geometry.coordinates, redAvoidZones, 1.32) === 0);

  if (!hasCleanAlternative) {
    const dlat = destLoc.latitude - origLoc.latitude;
    const dlon = destLoc.longitude - origLoc.longitude;
    const span = Math.hypot(dlat, dlon);
    if (span > 0.004) {
      // Pick blocking red zone on the base route if any, otherwise route midpoint
      const blockingZone = redAvoidZones.find(
        (z) => minDistanceToPolylineKm(z.lat, z.lon, baseRoute.geometry.coordinates) <= 1.35
      );
      const anchorLat = blockingZone ? blockingZone.lat : (origLoc.latitude + destLoc.latitude) / 2;
      const anchorLon = blockingZone ? blockingZone.lon : (origLoc.longitude + destLoc.longitude) / 2;
      const offsetSteps = [0.022, 0.032, 0.044];

      for (const offsetDeg of offsetSteps) {
        let foundZeroHit = false;
        const px = (-dlat / span) * offsetDeg;
        const py = (dlon / span) * offsetDeg;
        for (const sign of [1, -1]) {
          const wpLat = anchorLat + sign * py;
          const wpLon = anchorLon + sign * px;
          const detourUrl =
            `https://router.project-osrm.org/route/v1/${osrmProfile}/` +
            `${origLoc.longitude.toFixed(5)},${origLoc.latitude.toFixed(5)};` +
            `${wpLon.toFixed(5)},${wpLat.toFixed(5)};` +
            `${destLoc.longitude.toFixed(5)},${destLoc.latitude.toFixed(5)}` +
            "?overview=full&geometries=geojson";
          try {
            const detourData = await httpGetJson<Record<string, any>>(detourUrl);
            const detourRoutes = detourData.routes || [];
            if (detourRoutes.length) {
              const cand = detourRoutes[0];
              const baseDist = baseRoute.distance || 0;
              if ((cand.distance || 0) > 0 && Math.abs(cand.distance - baseDist) >= 40) {
                candidatePool.push({ raw: cand });
                if (countZoneIntersections(cand.geometry.coordinates, redAvoidZones, 1.32) === 0) {
                  foundZeroHit = true;
                  break;
                }
              }
            }
          } catch {
            // try next sign/offset
          }
        }
        if (foundZeroHit) break;
      }
    }
  }

  // Pick best non-intersecting alternative alongside baseRoute
  const altCandidates = candidatePool.slice(1);
  let chosenAlt: (typeof candidatePool)[number] | null = null;
  if (altCandidates.length) {
    chosenAlt = [...altCandidates].sort((a, b) => {
      const aRed = countZoneIntersections(a.raw.geometry.coordinates, redAvoidZones, 1.32);
      const bRed = countZoneIntersections(b.raw.geometry.coordinates, redAvoidZones, 1.32);
      if (aRed !== bRed) return aRed - bRed;
      return (a.raw.distance || 0) - (b.raw.distance || 0);
    })[0];
  }

  const finalRawPair = chosenAlt ? [candidatePool[0], chosenAlt] : [candidatePool[0]];
  let routesOut: Array<Record<string, any>> = [];

  for (let idx = 0; idx < finalRawPair.length; idx++) {
    const entry = finalRawPair[idx];
    const r = entry.raw;
    const distanceKm = Math.round((r.distance / 1000) * 100) / 100;
    const durationMin =
      modeClean === "walking"
        ? Math.max(1, Math.round((distanceKm / 4.8) * 60))
        : modeClean === "cycling"
        ? Math.max(1, Math.round((distanceKm / 15.0) * 60))
        : Math.max(1, Math.round(r.duration / 60));

    const coords: number[][] = r.geometry.coordinates;
    const { samples, waypointAqiList } = entry.preSample || (await sampleRouteAqi(coords));

    const avgAqi = waypointAqiList.length
      ? Math.round((waypointAqiList.reduce((s, w) => s + w.aqi, 0) / waypointAqiList.length) * 10) / 10
      : null;
    const maxAqi = waypointAqiList.length ? Math.max(...waypointAqiList.map((w) => w.aqi)) : null;
    const exposureIndex =
      avgAqi !== null ? Math.round(((avgAqi * durationMin) / 60) * 10) / 10 : null;
    const hotspots = waypointAqiList.filter(
      (w) => w.aqi > 100 || (maxAqi !== null && w.aqi === maxAqi && maxAqi > 50)
    );

    let routeIncidentHits = 0;
    for (const inc of nearbyIncidents) {
      if (minDistanceToPolylineKm(inc.lat, inc.lon, coords) <= 1.32) {
        routeIncidentHits++;
      }
    }
    const redZoneHits = countZoneIntersections(coords, redAvoidZones, 1.32);

    routesOut.push({
      id: `route_${idx + 1}`,
      route_type: idx === 0 ? "ordinary" : "safe_air",
      label: idx === 0 ? "Ordinary Route" : "Safe Air Route",
      distance_km: distanceKm,
      duration_min: durationMin,
      duration_formatted: formatDurationHrMin(durationMin),
      geometry: r.geometry,
      waypoints: waypointAqiList,
      avg_aqi: avgAqi,
      max_aqi: maxAqi,
      exposure_index: exposureIndex,
      hotspots,
      incident_hits: routeIncidentHits,
      red_zone_hits: redZoneHits,
      is_recommended: false,
      recommendation_reason: "",
    });
  }

  let recommendationNote = "No routes available.";
  if (routesOut.length >= 2) {
    const ordinary = [...routesOut].sort(
      (a, b) => a.duration_min - b.duration_min || a.distance_km - b.distance_km
    )[0];
    const cleanest = [...routesOut].sort(
      (a, b) =>
        a.red_zone_hits - b.red_zone_hits ||
        a.incident_hits - b.incident_hits ||
        (a.avg_aqi ?? 999) - (b.avg_aqi ?? 999) ||
        (a.max_aqi ?? 999) - (b.max_aqi ?? 999) ||
        a.duration_min - b.duration_min
    )[0];

    const safeAirRoute =
      cleanest === ordinary && routesOut.some((r) => r !== ordinary && r.red_zone_hits === 0 && ordinary.red_zone_hits > 0)
        ? routesOut.find((r) => r !== ordinary)!
        : cleanest === ordinary
        ? routesOut.find((r) => r !== ordinary)!
        : cleanest;

    // Ensure Ordinary Route is the direct/shorter corridor and Safe Air Route avoids red circles
    if (cleanest !== ordinary || ordinary.red_zone_hits > safeAirRoute.red_zone_hits) {
      safeAirRoute.route_type = "safe_air";
      safeAirRoute.label = "Safe Air Route";
      safeAirRoute.is_recommended = true;
      ordinary.route_type = "ordinary";
      ordinary.label = "Ordinary Route";
      ordinary.is_recommended = false;
      ordinary.recommendation_reason = "Standard direct corridor.";
      safeAirRoute.recommendation_reason =
        safeAirRoute.red_zone_hits === 0
          ? "Detours cleanly outside red hotspot circles with lower exposure."
          : "Cleaner alternate corridor avoiding main pollution intersections.";
    } else {
      ordinary.route_type = "ordinary";
      ordinary.label = "Ordinary Route";
      ordinary.is_recommended = true;
      ordinary.recommendation_reason =
        "Direct corridor currently matches lowest regional AQI and shortest time.";
      safeAirRoute.route_type = "safe_air";
      safeAirRoute.label = "Safe Air Route";
      safeAirRoute.is_recommended = false;
      safeAirRoute.recommendation_reason =
        "Alternate corridor keeping clear of verified red hotspot circles.";
    }

    routesOut = [
      routesOut.find((r) => r.route_type === "ordinary")!,
      routesOut.find((r) => r.route_type === "safe_air")!,
    ];
    const [ordR, safeR] = routesOut;
    recommendationNote = `Ordinary Route: ${ordR.duration_formatted} (AQI ${
      ordR.avg_aqi ?? "N/A"
    }) · Safe Air Route: ${safeR.duration_formatted} (AQI ${safeR.avg_aqi ?? "N/A"}).`;
  } else if (routesOut.length === 1) {
    routesOut[0].route_type = "safe_air";
    routesOut[0].label = "Safe Air Route";
    routesOut[0].is_recommended = true;
    routesOut[0].recommendation_reason = "Only navigable corridor returned for this distance.";
    recommendationNote = `Route duration: ${routesOut[0].duration_formatted} (${routesOut[0].distance_km} km).`;
  }

  // Only emit red hotspot circles that stay outside the Safe Air Route corridor (min 1.32 km clearance > 1.2 km circle radius)
  const safeRouteObj = routesOut.find((r) => r.route_type === "safe_air") || routesOut[0];
  const safeCoords: number[][] = safeRouteObj?.geometry?.coordinates || [];

  const measuredHotspots: Array<Record<string, any>> = [];
  for (const hw of baseInteriorHotspots) {
    if (!safeCoords.length || minDistanceToPolylineKm(hw.lat, hw.lon, safeCoords) > 1.32) {
      measuredHotspots.push({
        lat: hw.lat,
        lon: hw.lon,
        aqi: hw.aqi,
        category: hw.category,
        hotspot_type: "Elevated AQI Zone",
        is_verified: true,
        title: `High AQI Spot (${hw.aqi} ${hw.category})`,
      });
    }
  }

  const visibleIncidents = nearbyIncidents.filter((inc) => {
    if (!inc.is_verified || inc.lat == null || inc.lon == null) return true;
    if (!safeCoords.length) return true;
    return minDistanceToPolylineKm(inc.lat, inc.lon, safeCoords) > 1.25;
  });

  let bestWindow: Record<string, any> | null = null;
  let cleanAirWindows: Array<Record<string, any>> = [];
  try {
    const fc = await getForecastData({ lat: origLoc.latitude, lon: origLoc.longitude });
    const fcPts = fc.forecast_24h || [];
    if (fcPts.length) {
      const cleanest = fcPts.reduce((a, b) => (b.aqi < a.aqi ? b : a));
      bestWindow = {
        time: cleanest.time,
        aqi: cleanest.aqi,
        category: cleanest.category,
      };
      cleanAirWindows = buildCleanAirWindows(fcPts, null, fc.aqi_standard || "NAQI");
    }
  } catch {
    // ignore
  }

  let destinationAir: Record<string, any> | null = null;
  try {
    const destLive = await getAirQualityData({ lat: destLoc.latitude, lon: destLoc.longitude });
    destinationAir = {
      aqi: destLive.aqi,
      category: destLive.classification.category,
      level: destLive.classification.level,
      temperature: destLive.weather.temperature,
      temp_unit: destLive.weather.temp_unit || "°C",
      condition: destLive.weather.condition,
    };
  } catch {
    // ignore
  }

  const allHotspots = [...visibleIncidents, ...measuredHotspots];
  return {
    origin: origLoc,
    destination: destLoc,
    destination_air: destinationAir,
    mode: modeClean,
    aqi_standard: prefStd,
    escape_mode: Boolean(escape_mode),
    routes: routesOut,
    hotspot_zones: allHotspots,
    incident_updates: incidentUpdates.slice(0, 8),
    emergency_escape: {
      active: Boolean(escape_mode),
      nearby_hotspot_count: allHotspots.length,
      verified_or_measured_count: allHotspots.filter((h) => h.is_verified).length,
      unverified_report_count: allHotspots.filter((h) => !h.is_verified).length,
      advice: allHotspots.length
        ? `${allHotspots.length} active hotspot(s) near route.`
        : "No high-AQI hotspots or reported incidents along route.",
    },
    clean_air_windows: cleanAirWindows,
    recommendation_note: recommendationNote,
    data_limitation_note: "Regional Open-Meteo grid + OSRM routing + local community incidents.",
    best_travel_time: bestWindow,
    source: "OSRM + Open-Meteo + In-Memory Store",
  };
}

export async function getAlertsData(params: {
  city?: string | null;
  lat?: number | null;
  lon?: number | null;
}) {
  const live = await getAirQualityData(params);
  const bundle = getProfileBundle();

  const history = db.alerts.slice(0, 40);
  const hotspotUpdates = db.reports
    .filter((r) => ["Verified", "Under Review", "Submitted"].includes(r.status))
    .sort((a, b) => {
      const aV = a.status === "Verified" ? 0 : 1;
      const bV = b.status === "Verified" ? 0 : 1;
      return aV - bV || b.id - a.id;
    })
    .slice(0, 12)
    .map((r) => ({
      id: r.id,
      report_code: r.report_code,
      title: r.title,
      category: r.category,
      location_name: r.location_name,
      status: r.status,
      latitude: r.latitude,
      longitude: r.longitude,
      created_at: r.created_at,
      is_verified: r.status === "Verified",
      verification_label:
        r.status === "Verified"
          ? "Verified Hotspot"
          : `Unverified Citizen Report (${r.status})`,
    }));

  const pol = live.pollutants;
  const wth = live.weather;
  const pm25V = pol.pm2_5;
  const pm10V = pol.pm10;
  const windV = wth.wind_speed;
  const reasonParts: string[] = [];
  if (pm25V !== null && pm25V > 60) {
    reasonParts.push(`Elevated PM2.5 (${pm25V.toFixed(1)} µg/m³)`);
  } else if (pm10V !== null && pm10V > 100) {
    reasonParts.push(`High coarse dust PM10 (${pm10V.toFixed(1)} µg/m³)`);
  }
  if (windV !== null && windV < 8) {
    reasonParts.push(`low wind dispersion (${windV.toFixed(1)} km/h)`);
  }
  if (!reasonParts.length) {
    reasonParts.push(`Regional traffic, urban dust & weather (${wth.condition || "Clear"})`);
  }

  const curAqiVal = Number(live.aqi || 0);
  const aqiComp = Math.min(70, (curAqiVal / 400) * 70);
  const pmComp = Math.min(20, (Number(pm25V || 0) / 120) * 20);
  const hsComp = Math.min(10, hotspotUpdates.length * 2);
  const alertRiskScore = Math.max(1, Math.min(100, Math.round(aqiComp + pmComp + hsComp)));
  const alertRiskLevel =
    alertRiskScore >= 76
      ? "Very High Risk"
      : alertRiskScore >= 51
      ? "High Risk"
      : alertRiskScore >= 26
      ? "Moderate Risk"
      : "Low Risk";

  const alertRiskExplain =
    `Risk Score ${alertRiskScore}/100 (${alertRiskLevel}): Calculated from live AQI (${Math.round(
      curAqiVal
    )}), PM2.5 (${pm25V !== null ? pm25V.toFixed(1) : "N/A"} µg/m³), and ${
      hotspotUpdates.length
    } nearby citizen report(s). Scale: 0–25 Low · 26–50 Moderate · 51–75 High · 76–100 Very High.`;

  return {
    location: live.location,
    current_aqi: live.aqi,
    classification: live.classification,
    pollutants: live.pollutants,
    weather: wth,
    alert_reason: reasonParts.join(" and "),
    risk_score: alertRiskScore,
    risk_level: alertRiskLevel,
    risk_explanation: alertRiskExplain,
    live_alerts: live.active_alerts,
    hotspot_updates: hotspotUpdates,
    alert_history: history,
    notification_preferences: bundle.notifications,
    recorded_at: live.recorded_at,
    source: live.source,
  };
}

async function extractHistorySeries(
  location: LocationInfo,
  periodClean: string,
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  std: string
) {
  const pastDays = { daily: 1, weekly: 7, monthly: 30, custom: 31 }[periodClean] || 1;
  const aq = await fetchAirQualityBundle(location.latitude, location.longitude, pastDays, 1);
  const hourly = aq.hourly || {};
  const times: string[] = hourly.time || [];
  const curTime: string = aq.current?.time || utcNowIso();

  const usAqi: Array<number | null> = hourly.us_aqi || [];
  const euAqi: Array<number | null> = hourly.european_aqi || [];
  const pm25: Array<number | null> = hourly.pm2_5 || [];
  const pm10: Array<number | null> = hourly.pm10 || [];
  const co: Array<number | null> = hourly.carbon_monoxide || [];
  const no2: Array<number | null> = hourly.nitrogen_dioxide || [];
  const so2: Array<number | null> = hourly.sulphur_dioxide || [];
  const o3: Array<number | null> = hourly.ozone || [];

  let records: Array<Record<string, any>> = [];
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    if (t > curTime) continue;
    const dStr = t.slice(0, 10);
    if (startDate && dStr < startDate) continue;
    if (endDate && dStr > endDate) continue;
    const pSnap: PollutantMap = {
      pm2_5: pm25[i] ?? null,
      pm10: pm10[i] ?? null,
      co: co[i] ?? null,
      no2: no2[i] ?? null,
      so2: so2[i] ?? null,
      o3: o3[i] ?? null,
    };
    let val: number | null = null;
    if (std === "EU" && euAqi[i] !== null && euAqi[i] !== undefined) val = euAqi[i];
    else if (std === "NAQI") val = computeIndianNaqi(pSnap) ?? usAqi[i] ?? null;
    else val = usAqi[i] ?? null;

    if (val === null || val === undefined) continue;
    records.push({
      time: t,
      date: dStr,
      aqi: Math.round(val),
      ...pSnap,
    });
  }

  if (periodClean === "daily" && !startDate && !endDate) {
    records = records.slice(-24);
  }

  const dailyBuckets = new Map<string, Array<Record<string, any>>>();
  for (const rec of records) {
    if (!dailyBuckets.has(rec.date)) dailyBuckets.set(rec.date, []);
    dailyBuckets.get(rec.date)!.push(rec);
  }

  let series: Array<Record<string, any>> = [];
  if (periodClean === "daily" && !startDate && !endDate) {
    series = records;
  } else {
    for (const dKey of Array.from(dailyBuckets.keys()).sort()) {
      const items = dailyBuckets.get(dKey)!;
      const avgCol = (k: string) => {
        const vals = items.map((x) => x[k]).filter((v) => v !== null && v !== undefined) as number[];
        return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
      };
      series.push({
        time: dKey,
        date: dKey,
        aqi: Math.round((items.reduce((s, x) => s + x.aqi, 0) / items.length) * 10) / 10,
        pm2_5: avgCol("pm2_5"),
        pm10: avgCol("pm10"),
        co: avgCol("co"),
        no2: avgCol("no2"),
        so2: avgCol("so2"),
        o3: avgCol("o3"),
      });
    }
  }
  return { records, series };
}

export async function getReportsData(params: {
  city?: string | null;
  period?: string;
  lat?: number | null;
  lon?: number | null;
  start_date?: string | null;
  end_date?: string | null;
}) {
  let periodClean = (params.period || "daily").toLowerCase().trim();
  if (!["daily", "weekly", "monthly", "custom"].includes(periodClean)) periodClean = "daily";

  const location = await resolveLocation({ city: params.city, lat: params.lat, lon: params.lon });
  if (!location) {
    throw new HttpError(
      404,
      `Location '${params.city}' was not found in India. VayuMitra supports Indian cities only.`
    );
  }

  const std = String(getProfileBundle().preferences.aqi_standard || "NAQI").toUpperCase();
  const { records, series } = await extractHistorySeries(
    location,
    periodClean,
    params.start_date,
    params.end_date,
    std
  );

  if (records.length < 4) {
    return {
      location,
      aqi_standard: std,
      period: periodClean,
      start_date: params.start_date ?? null,
      end_date: params.end_date ?? null,
      generated_at: utcNowIso(),
      sufficient_data: false,
      message:
        "Insufficient historical records returned for the selected date range (Open-Meteo archive retains ~31 days).",
      summary: null,
      series: [],
      records: [],
      hotspot_analysis: [],
      evidence_records: [],
      source: "Open-Meteo Air Quality Historical Archive",
    };
  }

  const aqiVals = records.map((r) => r.aqi as number);
  const avgAqi = Math.round((aqiVals.reduce((a, b) => a + b, 0) / aqiVals.length) * 10) / 10;
  const maxRec = records.reduce((a, b) => (b.aqi > a.aqi ? b : a));
  const minRec = records.reduce((a, b) => (b.aqi < a.aqi ? b : a));
  const netChange = records[records.length - 1].aqi - records[0].aqi;

  const avgMetric = (k: string) => {
    const vals = records.map((r) => r[k]).filter((v) => v !== null && v !== undefined) as number[];
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
  };

  const pollutantAverages = {
    pm2_5: avgMetric("pm2_5"),
    pm10: avgMetric("pm10"),
    co: avgMetric("co"),
    no2: avgMetric("no2"),
    so2: avgMetric("so2"),
    o3: avgMetric("o3"),
  };

  const avgCls = classifyAqi(avgAqi, std);
  const elevatedHours = aqiVals.filter((v) => v > 100).length;
  const cleanHours = Math.max(0, records.length - elevatedHours);
  const pollutantRatios = [
    { key: "PM2.5", val: pollutantAverages.pm2_5, limit: 60, unit: "µg/m³" },
    { key: "PM10", val: pollutantAverages.pm10, limit: 100, unit: "µg/m³" },
    { key: "NO₂", val: pollutantAverages.no2, limit: 80, unit: "µg/m³" },
    { key: "SO₂", val: pollutantAverages.so2, limit: 80, unit: "µg/m³" },
    { key: "O₃", val: pollutantAverages.o3, limit: 100, unit: "µg/m³" },
    { key: "CO", val: pollutantAverages.co, limit: 2000, unit: "µg/m³" },
  ]
    .filter((p) => p.val !== null && p.val !== undefined)
    .map((p) => ({ ...p, ratio: Number(p.val) / p.limit }))
    .sort((a, b) => b.ratio - a.ratio);

  const dominantPollutant = pollutantRatios.length
    ? {
        key: pollutantRatios[0].key,
        value: pollutantRatios[0].val,
        unit: pollutantRatios[0].unit,
      }
    : null;

  const observations = [
    `Mean ${std} AQI over the selected window was ${avgAqi} (${avgCls.category}) across ${records.length} hourly points.`,
    `Highest recorded AQI was ${maxRec.aqi} at ${String(maxRec.time).replace("T", " ")}; lowest was ${
      minRec.aqi
    } at ${String(minRec.time).replace("T", " ")}.`,
    `Net AQI change: ${
      netChange >= 0 ? "+" : ""
    }${netChange} points (${cleanHours} clean/moderate hrs vs ${elevatedHours} elevated hrs > 100 AQI).`,
  ];

  const topHotspotHours = [...records].sort((a, b) => b.aqi - a.aqi).slice(0, 5);
  const dbCount = db.readings.filter(
    (r) => r.city.toLowerCase() === location.name.toLowerCase()
  ).length;
  const evidenceRecords = [...db.reports]
    .sort((a, b) => b.id - a.id)
    .slice(0, 20)
    .map((rr) => ({
      id: rr.id,
      report_code: rr.report_code,
      title: rr.title,
      category: LEGACY_CATEGORY_MAP[rr.category] || rr.category,
      location_name: rr.location_name,
      status: rr.status,
      is_verified: ["Verified", "Resolved"].includes(rr.status),
      photo_url: rr.stored_filename ? `/uploads/${rr.stored_filename}` : null,
      created_at: rr.created_at,
      classification_tag: "Reported (Citizen Evidence)",
    }));

  let airTwinPreview: Record<string, any> | null = null;
  try {
    airTwinPreview = await getAirTwinData(false);
  } catch {
    airTwinPreview = null;
  }

  const benchmarkCities: Array<Record<string, any>> = [];
  try {
    const benchmarks = [
      { name: "Delhi", state: "Delhi NCR", lat: 28.6139, lon: 77.209 },
      { name: "Mumbai", state: "Maharashtra", lat: 19.076, lon: 72.8777 },
      { name: "Kolkata", state: "West Bengal", lat: 22.5726, lon: 88.3639 },
      { name: "Patna", state: "Bihar", lat: 25.5941, lon: 85.1376 },
      { name: "Lucknow", state: "Uttar Pradesh", lat: 26.8467, lon: 80.9462 },
      { name: "Ahmedabad", state: "Gujarat", lat: 23.0225, lon: 72.5714 },
      { name: "Pune", state: "Maharashtra", lat: 18.5204, lon: 73.8567 },
      { name: "Bengaluru", state: "Karnataka", lat: 12.9716, lon: 77.5946 },
      { name: "Hyderabad", state: "Telangana", lat: 17.385, lon: 78.4867 },
      { name: "Chennai", state: "Tamil Nadu", lat: 13.0827, lon: 80.2707 },
    ];
    const latsQ = benchmarks.map((c) => c.lat.toFixed(4)).join(",");
    const lonsQ = benchmarks.map((c) => c.lon.toFixed(4)).join(",");
    const batchUrl =
      "https://air-quality-api.open-meteo.com/v1/air-quality" +
      `?latitude=${latsQ}&longitude=${lonsQ}` +
      "&current=us_aqi,european_aqi,pm2_5,pm10,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide,ozone";
    const batchResp = await httpGetJson<any>(batchUrl, 120);
    const batchItems = Array.isArray(batchResp) ? batchResp : [batchResp];
    for (let i = 0; i < Math.min(batchItems.length, benchmarks.length); i++) {
      const curC = batchItems[i].current || {};
      let cAqi: number | null = null;
      if (std === "EU") cAqi = curC.european_aqi ?? null;
      else if (std === "US") cAqi = curC.us_aqi ?? null;
      else {
        cAqi =
          computeIndianNaqi({
            pm2_5: curC.pm2_5 ?? null,
            pm10: curC.pm10 ?? null,
            no2: curC.nitrogen_dioxide ?? null,
            so2: curC.sulphur_dioxide ?? null,
            co: curC.carbon_monoxide ?? null,
            o3: curC.ozone ?? null,
          }) ??
          curC.us_aqi ??
          null;
      }
      if (cAqi !== null && cAqi !== undefined) {
        const cAqiInt = Math.round(cAqi);
        benchmarkCities.push({
          city: benchmarks[i].name,
          state: benchmarks[i].state,
          aqi: cAqiInt,
          category: classifyAqi(cAqiInt, std).category,
          pm2_5: curC.pm2_5 !== null && curC.pm2_5 !== undefined ? Math.round(curC.pm2_5 * 10) / 10 : null,
          pm10: curC.pm10 !== null && curC.pm10 !== undefined ? Math.round(curC.pm10 * 10) / 10 : null,
        });
      }
    }
  } catch {
    // ignore
  }

  const topPollutedCities = [...benchmarkCities].sort((a, b) => b.aqi - a.aqi).slice(0, 5);
  const cleanestCities = [...benchmarkCities].sort((a, b) => a.aqi - b.aqi).slice(0, 5);

  const rawScore =
    Math.min(70, (avgAqi / 400) * 70) +
    (elevatedHours / Math.max(1, records.length)) * 20 +
    Math.min(10, (maxRec.aqi / 400) * 10);
  const riskScore = Math.max(1, Math.min(100, Math.round(rawScore)));
  const riskLevel =
    rawScore >= 76
      ? "Very High Risk"
      : rawScore >= 51
      ? "High Risk"
      : rawScore >= 26
      ? "Moderate Risk"
      : "Low Risk";

  return {
    location,
    aqi_standard: std,
    period: periodClean,
    start_date: params.start_date ?? null,
    end_date: params.end_date ?? null,
    generated_at: utcNowIso(),
    sufficient_data: true,
    record_count: records.length,
    stored_db_snapshots: dbCount,
    data_classifications: {
      historical_aqi_series: `Measured / Regional Historical Archive (${std})`,
      community_evidence: "Reported (Citizen Evidence)",
      period_averages_and_exposure: "Calculated",
    },
    summary: {
      average_aqi: avgAqi,
      average_category: avgCls.category,
      highest_aqi: maxRec.aqi,
      highest_time: maxRec.time,
      lowest_aqi: minRec.aqi,
      lowest_time: minRec.time,
      net_change: netChange,
      elevated_hours: elevatedHours,
      clean_hours: cleanHours,
      dominant_pollutant: dominantPollutant,
      risk_score: riskScore,
      risk_level: riskLevel,
      risk_explanation: `Computed from mean AQI (${avgAqi}), peak AQI (${maxRec.aqi}), and ${elevatedHours}/${records.length} hours exceeding AQI 100. Scale: 0–25 Low · 26–50 Moderate · 51–75 High · 76–100 Very High.`,
      pollutant_averages: pollutantAverages,
      observations,
    },
    hotspot_analysis: topHotspotHours,
    top_polluted_cities: topPollutedCities,
    cleanest_cities: cleanestCities,
    evidence_records: evidenceRecords,
    personal_exposure_preview: airTwinPreview?.daily_summary ?? null,
    series,
    records: records.slice(-120),
    source: "Open-Meteo Air Quality Historical Feed + In-Memory Store",
  };
}

export async function exportReportsCsv(params: {
  city?: string | null;
  period?: string;
  start_date?: string | null;
  end_date?: string | null;
}) {
  const report = await getReportsData(params);
  if (!report.sufficient_data) {
    throw new HttpError(400, report.message || "Insufficient data to export CSV.");
  }
  const cityName = report.location.name;
  const src = report.source;
  const rows: Array<Array<unknown>> = [
    ["Timestamp", "City", "Data Type", "AQI (US)", "PM2.5 (ug/m3)", "PM10 (ug/m3)", "CO (ug/m3)", "NO2 (ug/m3)", "SO2 (ug/m3)", "O3 (ug/m3)", "Source"],
    ...report.series.map((row) => [
      row.time,
      cityName,
      "Measured / Regional Historical Feed",
      row.aqi,
      row.pm2_5 ?? "",
      row.pm10 ?? "",
      row.co ?? "",
      row.no2 ?? "",
      row.so2 ?? "",
      row.o3 ?? "",
      src,
    ]),
  ];
  const period = params.period || "daily";
  const filename = `vayumitra_${cityName.toLowerCase().replace(/\s+/g, "_")}_${period}_report.csv`;
  return { filename, csvText: toCsv(rows) };
}

function detectImageType(buf: Buffer): "png" | "jpg" | "webp" | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "png";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "jpg";
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

export function listCommunityReports(filters?: {
  status?: string | null;
  category?: string | null;
  search?: string | null;
}) {
  const sFilter = (filters?.status || "").trim();
  const cFilter = (filters?.category || "").trim();
  const qFilter = (filters?.search || "").trim().toLowerCase();

  return [...db.reports]
    .sort((a, b) => b.id - a.id)
    .filter((row) => {
      const mappedCat = LEGACY_CATEGORY_MAP[row.category] || row.category;
      if (sFilter && row.status !== sFilter) return false;
      if (cFilter && mappedCat !== cFilter && row.category !== cFilter) return false;
      if (qFilter) {
        const hay = `${row.report_code} ${row.title} ${row.location_name} ${mappedCat}`.toLowerCase();
        if (!hay.includes(qFilter)) return false;
      }
      return true;
    })
    .map((row) => {
      const mappedCat = LEGACY_CATEGORY_MAP[row.category] || row.category;
      const st = row.status;
      const vLabel =
        st === "Verified"
          ? "Verified Incident"
          : st === "Resolved"
          ? "Verified & Resolved"
          : st === "Rejected"
          ? "Rejected Report"
          : "Unverified Citizen Report (Pending Review)";
      return {
        id: row.id,
        report_code: row.report_code,
        title: row.title,
        description: row.description,
        category: mappedCat,
        location_name: row.location_name,
        latitude: row.latitude,
        longitude: row.longitude,
        status: st,
        is_verified: ["Verified", "Resolved"].includes(st),
        verification_label: vLabel,
        photo_url: row.stored_filename ? `/uploads/${row.stored_filename}` : null,
        original_filename: row.original_filename,
        file_size: row.file_size,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    });
}

export function getCommunityContributionSummary() {
  const reports = listCommunityReports();
  const total = reports.length;
  const verified = reports.filter((r) => r.status === "Verified").length;
  const resolved = reports.filter((r) => r.status === "Resolved").length;
  const rejected = reports.filter((r) => r.status === "Rejected").length;
  const withPhoto = reports.filter((r) => r.photo_url).length;
  const points = Math.max(
    0,
    total * 10 + withPhoto * 5 + verified * 20 + resolved * 25 - rejected * 10
  );
  const tier =
    points >= 200
      ? "Platinum Air Guardian"
      : points >= 100
      ? "Gold Air Guardian"
      : points >= 40
      ? "Silver Air Guardian"
      : "Bronze Air Guardian";

  return {
    total_reports: total,
    verified_count: verified,
    resolved_count: resolved,
    rejected_count: rejected,
    pending_count: Math.max(0, total - verified - resolved - rejected),
    with_photo_count: withPhoto,
    guardian_points: points,
    guardian_tier: tier,
    scoring_note:
      "Calculated transparently in store: +10 per report, +5 photo evidence, +20 Verified, +25 Resolved.",
  };
}

export function createCommunityReport(input: {
  title: string;
  description: string;
  category: string;
  location_name: string;
  latitude?: number | null;
  longitude?: number | null;
  fileBytes?: Buffer | null;
  originalFilename?: string | null;
  authToken?: string | null;
}) {
  const title = (input.title || "").trim();
  const description = (input.description || "").trim();
  let category = (input.category || "").trim();
  const locationName = (input.location_name || "").trim();
  category = LEGACY_CATEGORY_MAP[category] || category;

  if (title.length < 4) throw new HttpError(400, "Report title must be at least 4 characters.");
  if (description.length < 10)
    throw new HttpError(400, "Please provide a description of at least 10 characters.");
  if (!COMMUNITY_CATEGORIES.includes(category))
    throw new HttpError(400, "Invalid environmental issue category.");
  if (locationName.length < 2)
    throw new HttpError(400, "Please specify the location of the issue.");

  let storedFilename: string | null = null;
  let mimeType: string | null = null;
  let fileSize: number | null = null;

  if (input.fileBytes && input.fileBytes.length > 0) {
    fileSize = input.fileBytes.length;
    if (input.fileBytes.length > Config.MAX_UPLOAD_BYTES) {
      throw new HttpError(400, "Uploaded photo exceeds the 5 MB size limit.");
    }
    const imgType = detectImageType(input.fileBytes);
    if (!imgType) {
      throw new HttpError(
        400,
        "Invalid image file. Only PNG, JPG, JPEG, and WEBP images are allowed."
      );
    }
    storedFilename = `${crypto.randomUUID().replace(/-/g, "")}.${imgType}`;
    mimeType = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" }[imgType];
    db.uploads.set(storedFilename, { mimeType, data: input.fileBytes });
  }

  const now = utcNowIso();
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const codePart = crypto.randomBytes(3).toString("hex").slice(0, 5).toUpperCase();
  const reportCode = `VM-${datePart}-${codePart}`;
  const profile = db.resolveProfile(input.authToken);

  db.reports.push({
    id: db.nextId("report"),
    report_code: reportCode,
    profile_id: profile.id,
    title,
    description,
    category,
    location_name: locationName,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    status: "Submitted",
    stored_filename: storedFilename,
    original_filename: input.originalFilename ? input.originalFilename.slice(0, 180) : storedFilename,
    mime_type: mimeType,
    file_size: fileSize,
    created_at: now,
    updated_at: now,
  });

  const all = listCommunityReports();
  return all.find((r) => r.report_code === reportCode) || all[0];
}

export function updateCommunityReportStatus(reportId: number, status: string) {
  if (!REPORT_STATUSES.includes(status)) {
    throw new HttpError(400, `Status must be one of: ${REPORT_STATUSES.join(", ")}.`);
  }
  const rep = db.reports.find((r) => r.id === reportId);
  if (!rep) throw new HttpError(404, "Report not found.");
  rep.status = status;
  rep.updated_at = utcNowIso();
  return listCommunityReports().find((r) => r.id === reportId)!;
}

async function fetchBriefAqi(lat: number, lon: number, standard = "NAQI"): Promise<[number | null, number | null]> {
  try {
    const url =
      "https://air-quality-api.open-meteo.com/v1/air-quality" +
      `?latitude=${lat}&longitude=${lon}&current=us_aqi,european_aqi,pm2_5,pm10,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide,ozone`;
    const resp = await httpGetJson<Record<string, any>>(url, 120);
    const cur = resp.current || {};
    let aqiV: number | null = null;
    if (standard === "EU" && cur.european_aqi !== null && cur.european_aqi !== undefined) {
      aqiV = cur.european_aqi;
    } else if (standard === "NAQI") {
      aqiV =
        computeIndianNaqi({
          pm2_5: cur.pm2_5 ?? null,
          pm10: cur.pm10 ?? null,
          no2: cur.nitrogen_dioxide ?? null,
          so2: cur.sulphur_dioxide ?? null,
          co: cur.carbon_monoxide ?? null,
          o3: cur.ozone ?? null,
        }) ??
        cur.us_aqi ??
        null;
    } else {
      aqiV = cur.us_aqi ?? null;
    }
    return [aqiV !== null ? Math.round(Number(aqiV)) : null, cur.pm2_5 ?? null];
  } catch {
    return [null, null];
  }
}

export async function getAirTwinData(includeLive = true, authToken?: string | null) {
  const profile = db.resolveProfile(authToken);
  const pid = profile.id;
  const std = String(db.preferences.get(pid)?.aqi_standard || "NAQI").toUpperCase();

  const locRows = db.personalLocations.filter((l) => l.profile_id === pid).sort((a, b) => b.id - a.id);
  const actRows = db.personalActivities.filter((a) => a.profile_id === pid).sort((a, b) => b.id - a.id);
  const diaryRows = db.exposureDiary
    .filter((d) => d.profile_id === pid)
    .sort((a, b) => b.entry_date.localeCompare(a.entry_date) || b.id - a.id)
    .slice(0, 30);

  const locList: Array<Record<string, any>> = [];
  const locAqiMap = new Map<number, [number | null, number | null, string]>();

  for (const lr of locRows) {
    const [liveAqi, livePm25] = includeLive
      ? await fetchBriefAqi(lr.latitude, lr.longitude, std)
      : [null, null];
    locAqiMap.set(lr.id, [liveAqi, livePm25, lr.city]);
    locList.push({
      id: lr.id,
      label: lr.label,
      city: lr.city,
      hours_per_day: lr.hours_per_day,
      latitude: lr.latitude,
      longitude: lr.longitude,
      live_aqi: liveAqi,
      live_pm25: livePm25,
      category: liveAqi !== null ? classifyAqi(liveAqi, std).category : "Unavailable",
      created_at: lr.created_at,
    });
  }

  const [fallbackAqi, fallbackPm25] = includeLive
    ? await fetchBriefAqi(profile.preferred_lat, profile.preferred_lon, std)
    : [null, null];

  const intensityFactorMap: Record<string, number> = {
    Low: 1.0,
    Moderate: 1.2,
    Vigorous: 1.45,
  };

  let weightedSum = 0;
  let pm25WeightedSum = 0;
  let totalHours = 0;
  let outdoorHours = 0;
  let validWeightHours = 0;

  const activitiesOut = actRows.map((ar) => {
    const [refAqi, refPm25, refCity] =
      ar.location_id && locAqiMap.has(ar.location_id)
        ? locAqiMap.get(ar.location_id)!
        : [fallbackAqi, fallbackPm25, profile.preferred_city];

    const hrs = ar.hours_per_day;
    const isOut = ar.is_outdoor;
    let envFactor = isOut ? 1.0 : 0.45;
    if (ar.activity_type === "Commuting") envFactor = isOut ? 0.88 : 0.65;
    const intFactor = intensityFactorMap[ar.intensity] || 1.1;

    totalHours += hrs;
    if (isOut) outdoorHours += hrs;

    const estActAqi = refAqi !== null ? Math.round(refAqi * envFactor * intFactor * 10) / 10 : null;
    const estActPm25 = refPm25 !== null ? Math.round(refPm25 * envFactor * intFactor * 10) / 10 : null;
    if (estActAqi !== null) {
      weightedSum += estActAqi * hrs;
      validWeightHours += hrs;
    }
    if (estActPm25 !== null) pm25WeightedSum += estActPm25 * hrs;

    return {
      id: ar.id,
      activity_type: ar.activity_type,
      location_id: ar.location_id,
      location_label: ar.location_label || refCity,
      hours_per_day: hrs,
      intensity: ar.intensity,
      is_outdoor: isOut,
      ambient_aqi: refAqi,
      calculated_exposure_aqi: estActAqi,
      calculated_exposure_pm25: estActPm25,
      created_at: ar.created_at,
    };
  });

  let dailyAvgExposure: number | null = null;
  let dailyPm25Exposure: number | null = null;

  if (validWeightHours > 0) {
    dailyAvgExposure = Math.round((weightedSum / validWeightHours) * 10) / 10;
    dailyPm25Exposure = Math.round((pm25WeightedSum / validWeightHours) * 10) / 10;
  } else if (locList.some((l) => l.live_aqi !== null)) {
    const validLocs = locList.filter((l) => l.live_aqi !== null);
    const wHrs = validLocs.reduce((s, l) => s + l.hours_per_day, 0) || 1;
    dailyAvgExposure =
      Math.round((validLocs.reduce((s, l) => s + l.live_aqi * l.hours_per_day, 0) / wHrs) * 10) / 10;
    const validPmLocs = validLocs.filter((l) => l.live_pm25 !== null);
    dailyPm25Exposure = validPmLocs.length
      ? Math.round(
          (validPmLocs.reduce((s, l) => s + l.live_pm25 * l.hours_per_day, 0) /
            (validPmLocs.reduce((s, l) => s + l.hours_per_day, 0) || 1)) *
            10
        ) / 10
      : null;
  } else if (fallbackAqi !== null) {
    dailyAvgExposure = fallbackAqi;
    dailyPm25Exposure = fallbackPm25;
  }

  const expCls =
    dailyAvgExposure !== null
      ? classifyAqi(dailyAvgExposure, std)
      : { category: "Unavailable", level: "moderate" };

  const locationComparison = locList.length
    ? locList.map((l) => ({
        label: `${l.label} (${l.city})`,
        city: l.city,
        hours_per_day: l.hours_per_day,
        live_aqi: l.live_aqi,
        live_pm25: l.live_pm25,
        category: l.category,
      }))
    : fallbackAqi !== null
    ? [
        {
          label: `Primary (${profile.preferred_city})`,
          city: profile.preferred_city,
          hours_per_day: 24.0,
          live_aqi: fallbackAqi,
          live_pm25: fallbackPm25,
          category: classifyAqi(fallbackAqi, std).category,
        },
      ]
    : [];

  const weeklyExposureTrend: Array<Record<string, any>> = [];
  if (includeLive) {
    const diaryByDate = new Map(diaryRows.map((d) => [d.entry_date, d.estimated_aqi]));
    const exposureRatio =
      dailyAvgExposure !== null && fallbackAqi && fallbackAqi > 0
        ? dailyAvgExposure / fallbackAqi
        : 0.72;
    try {
      const refLat = locList.length ? locList[0].latitude : profile.preferred_lat;
      const refLon = locList.length ? locList[0].longitude : profile.preferred_lon;
      const { series: weekSeries } = await extractHistorySeries(
        {
          latitude: refLat,
          longitude: refLon,
          name: profile.preferred_city,
          country: "India",
          admin1: "",
        },
        "weekly",
        null,
        null,
        std
      );
      for (const ws of weekSeries.slice(-7)) {
        const dKey = ws.date;
        if (diaryByDate.has(dKey)) {
          weeklyExposureTrend.push({
            date: dKey,
            exposure_aqi: Math.round(diaryByDate.get(dKey)! * 10) / 10,
            source_tag: "Logged Diary",
          });
        } else {
          weeklyExposureTrend.push({
            date: dKey,
            exposure_aqi: Math.round(ws.aqi * exposureRatio * 10) / 10,
            source_tag: "7d Archive Est.",
          });
        }
      }
    } catch {
      for (const d of diaryRows.slice(0, 7).reverse()) {
        weeklyExposureTrend.push({
          date: d.entry_date,
          exposure_aqi: Math.round(d.estimated_aqi * 10) / 10,
          source_tag: "Logged Diary",
        });
      }
    }
  }

  const recommendations: string[] = [];
  if (dailyAvgExposure !== null) {
    if (dailyAvgExposure > 200) {
      recommendations.push(
        "Calculated exposure is elevated: shift outdoor workouts indoors and use an N95 mask during commutes."
      );
    } else if (dailyAvgExposure > 100) {
      recommendations.push(
        "Moderate-to-high calculated exposure: wear a mask during commutes and limit vigorous outdoor activity."
      );
    } else {
      recommendations.push(
        "Calculated daily exposure is relatively low under current ambient conditions."
      );
    }
  }
  if (locationComparison.length >= 2) {
    const validCmp = locationComparison.filter((x) => x.live_aqi !== null);
    if (validCmp.length >= 2) {
      const highestLoc = validCmp.reduce((a, b) => (b.live_aqi > a.live_aqi ? b : a));
      const lowestLoc = validCmp.reduce((a, b) => (b.live_aqi < a.live_aqi ? b : a));
      if (highestLoc.label !== lowestLoc.label) {
        recommendations.push(
          `Highest ambient AQI among your places: ${highestLoc.label} (${highestLoc.live_aqi}) vs cleanest ${lowestLoc.label} (${lowestLoc.live_aqi}).`
        );
      }
    }
  }
  if (!locList.length) {
    recommendations.push(
      "Add your frequently visited Indian locations (Home, Office, College) to compare exposure across places."
    );
  }
  if (!activitiesOut.length) {
    recommendations.push(
      "Log daily activities with hours/day to refine outdoor vs indoor exposure weighting."
    );
  }

  return {
    profile_name: profile.name,
    preferred_city: profile.preferred_city,
    aqi_standard: std,
    activity_types: ACTIVITY_TYPES,
    locations: locList,
    location_comparison: locationComparison,
    weekly_exposure_trend: weeklyExposureTrend,
    activities: activitiesOut,
    diary: diaryRows,
    daily_summary: {
      weighted_exposure_aqi: dailyAvgExposure,
      estimated_pm25_exposure: dailyPm25Exposure,
      exposure_category: expCls.category,
      total_logged_hours: Math.round(totalHours * 10) / 10,
      outdoor_hours: Math.round(outdoorHours * 10) / 10,
      locations_tracked: locList.length,
      activities_tracked: activitiesOut.length,
      recommendations,
      data_classification: `Calculated Estimate (Real Open-Meteo ${std} Ambient Feed x Logged Routine Weighting)`,
    },
    medical_disclaimer:
      "IMPORTANT: Personal Air Twin metrics are environmental exposure estimates computed from regional ambient air-quality feeds and your self-reported activity schedule. This is NOT a medical diagnosis and NOT a direct measurement of personal inhaled dose.",
  };
}

export async function addPersonalLocation(
  labelIn: string,
  cityIn: string,
  hoursPerDay = 8.0,
  authToken?: string | null
) {
  const label = (labelIn || "").trim();
  const city = (cityIn || "").trim();
  const hrs = Math.max(0.5, Math.min(24.0, Number(hoursPerDay || 8.0)));
  if (label.length < 2) {
    throw new HttpError(400, "Location label must be at least 2 characters (e.g., Home, Office).");
  }
  const geo = await resolveLocation({ city });
  if (!geo) throw new HttpError(404, `Location '${city}' was not found in India.`);

  const profile = db.resolveProfile(authToken);
  const id = db.nextId("location");
  db.personalLocations.push({
    id,
    profile_id: profile.id,
    label,
    city: geo.name,
    latitude: geo.latitude,
    longitude: geo.longitude,
    hours_per_day: hrs,
    created_at: utcNowIso(),
  });
  return {
    id,
    label,
    city: geo.name,
    latitude: geo.latitude,
    longitude: geo.longitude,
    hours_per_day: hrs,
  };
}

export function deletePersonalLocation(locId: number) {
  const idx = db.personalLocations.findIndex((l) => l.id === locId);
  if (idx === -1) throw new HttpError(404, "Saved location not found.");
  db.personalLocations.splice(idx, 1);
  for (const act of db.personalActivities) {
    if (act.location_id === locId) act.location_id = null;
  }
}

export function addPersonalActivity(input: {
  activity_type: string;
  location_id?: number | null;
  hours_per_day: number;
  intensity?: string;
  is_outdoor?: boolean;
  authToken?: string | null;
}) {
  const activityType = (input.activity_type || "").trim();
  if (!ACTIVITY_TYPES.includes(activityType)) {
    throw new HttpError(400, `Activity must be one of: ${ACTIVITY_TYPES.join(", ")}.`);
  }
  const hrs = Number(input.hours_per_day);
  if (!Number.isFinite(hrs) || hrs <= 0 || hrs > 24) {
    throw new HttpError(400, "Hours per day must be between 0.5 and 24.");
  }
  const intensity = (["Low", "Moderate", "Vigorous"].includes(input.intensity || "")
    ? input.intensity
    : "Moderate") as "Low" | "Moderate" | "Vigorous";

  const profile = db.resolveProfile(input.authToken);
  let locId = input.location_id ?? null;
  let locLabel = profile.preferred_city;
  if (locId !== null) {
    const lrow = db.personalLocations.find((l) => l.id === locId);
    if (lrow) locLabel = `${lrow.label} (${lrow.city})`;
    else locId = null;
  }
  const id = db.nextId("activity");
  db.personalActivities.push({
    id,
    profile_id: profile.id,
    activity_type: activityType,
    location_id: locId,
    location_label: locLabel,
    hours_per_day: hrs,
    intensity,
    is_outdoor: Boolean(input.is_outdoor ?? true),
    created_at: utcNowIso(),
  });
  return { id, activity_type: activityType, location_label: locLabel, hours_per_day: hrs };
}

export function deletePersonalActivity(actId: number) {
  const idx = db.personalActivities.findIndex((a) => a.id === actId);
  if (idx === -1) throw new HttpError(404, "Activity entry not found.");
  db.personalActivities.splice(idx, 1);
}

export async function addExposureDiaryEntry(
  notes = "",
  entryDate?: string | null,
  authToken?: string | null
) {
  const twin = await getAirTwinData(true, authToken);
  const summary = twin.daily_summary;
  const estAqi = summary.weighted_exposure_aqi;
  if (estAqi === null || estAqi === undefined) {
    throw new HttpError(400, "Live AQI data unavailable to log diary entry.");
  }
  const dStr = (entryDate || "").trim() || new Date().toISOString().slice(0, 10);
  const actSummary =
    twin.activities.slice(0, 4).map((a) => `${a.activity_type} (${a.hours_per_day}h)`).join(", ") ||
    `Default ambient profile (${twin.preferred_city})`;
  const cityLabel = twin.locations.length ? twin.locations[0].city : twin.preferred_city;

  const profile = db.resolveProfile(authToken);
  const id = db.nextId("diary");
  db.exposureDiary.push({
    id,
    profile_id: profile.id,
    entry_date: dStr,
    city: cityLabel,
    activity_summary: actSummary,
    estimated_aqi: Number(estAqi),
    estimated_pm25: summary.estimated_pm25_exposure,
    calculated_exposure_score: Number(estAqi),
    notes: (notes || "").trim().slice(0, 500),
    created_at: utcNowIso(),
  });
  return { id, entry_date: dStr, city: cityLabel, estimated_aqi: estAqi };
}

export async function exportAirTwinCsv() {
  const twin = await getAirTwinData(true);
  const rows: Array<Array<unknown>> = [
    ["Section", "Date/Label", "Location/City", "Hours/Day", "Calculated Exposure AQI", "Estimated PM2.5 (ug/m3)", "Notes/Disclaimer"],
    ...twin.activities.map((a) => [
      "Activity Profile",
      a.activity_type,
      a.location_label,
      a.hours_per_day,
      a.calculated_exposure_aqi ?? "",
      a.calculated_exposure_pm25 ?? "",
      `Intensity: ${a.intensity}`,
    ]),
    ...twin.diary.map((d) => [
      "Exposure Diary",
      d.entry_date,
      d.city,
      "",
      d.estimated_aqi,
      d.estimated_pm25 ?? "",
      `${d.activity_summary} | ${d.notes}`,
    ]),
    ["Disclaimer", "", "", "", "", "", twin.medical_disclaimer],
  ];
  return {
    filename: "vayumitra_personal_air_twin_exposure.csv",
    csvText: toCsv(rows),
  };
}

export function createContactMessage(input: {
  name: string;
  email: string;
  subject?: string;
  message: string;
}) {
  const name = (input.name || "").trim();
  const email = (input.email || "").trim();
  const subject = (input.subject || "General Feedback").trim();
  const message = (input.message || "").trim();
  if (name.length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || message.length < 5) {
    throw new HttpError(400, "Please provide a valid name, email, and message.");
  }
  const now = utcNowIso();
  const id = db.nextId("contact");
  db.contactMessages.push({ id, name, email, subject, message, created_at: now });
  return { id, name, email, subject, created_at: now };
}

export async function getDashboardData(params: {
  city?: string | null;
  lat?: number | null;
  lon?: number | null;
}) {
  const aq = await getAirQualityData(params);
  const bundle = getProfileBundle();
  return {
    ...aq,
    profile_summary: {
      name: bundle.profile.name,
      default_city: bundle.preferences.default_city,
      community_reports_count: db.reports.length,
    },
  };
}
