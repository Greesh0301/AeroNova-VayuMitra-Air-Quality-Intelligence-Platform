import csv
import io
import math
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from backend.air_quality import (
    HttpError,
    build_clean_air_windows,
    classify_aqi,
    compute_indian_naqi,
    fetch_air_quality_bundle,
    get_air_quality_data,
    get_forecast_data,
    get_profile_bundle,
    haversine_km,
    http_get_json,
    resolve_location,
)
from backend.config import Config
from backend.greensteps import detect_image_type
from backend.store import (
    ACTIVITY_TYPES,
    COMMUNITY_CATEGORIES,
    LEGACY_CATEGORY_MAP,
    REPORT_STATUSES,
    db,
    hash_password,
    utc_now_iso,
    verify_password,
)


def _to_csv(rows: List[List[Any]]) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\r\n")
    for row in rows:
        writer.writerow(["" if v is None else v for v in row])
    return buf.getvalue()


def _create_session_token(profile_id: int) -> str:
    token = secrets.token_urlsafe(24)
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=14)
    with db.lock:
        db.sessions[token] = {
            "token": token,
            "profile_id": profile_id,
            "created_at": now.replace(microsecond=0).isoformat(),
            "expires_at": expires.replace(microsecond=0).isoformat(),
        }
    return token


def register_user(
    name_in: str,
    email_in: str,
    password_in: str,
    preferred_city_in: str = "Mumbai",
) -> Dict[str, Any]:
    name = (name_in or "").strip()
    email = (email_in or "").strip().lower()
    pw = str(password_in or "")
    city_in = (preferred_city_in or Config.DEFAULT_CITY).strip() or Config.DEFAULT_CITY

    if len(name) < 2:
        raise HttpError(400, "Please enter your full name (at least 2 characters).")
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise HttpError(400, "Please enter a valid email address.")
    if len(pw) < 6:
        raise HttpError(400, "Password must be at least 6 characters long.")

    geo = resolve_location(city=city_in)
    if not geo:
        raise HttpError(
            400,
            "Preferred city must be located within India (e.g., Mumbai, Delhi, Bengaluru).",
        )

    with db.lock:
        if any(p["email"].lower() == email for p in db.profiles):
            raise HttpError(400, "An account with this email already exists. Please sign in instead.")

        now = utc_now_iso()
        salt_hex, hash_hex = hash_password(pw)
        pid = db.next_id("profile")
        db.profiles.append(
            {
                "id": pid,
                "name": name,
                "email": email,
                "role": "citizen",
                "bio": "VayuMitra environmental citizen tracking air quality.",
                "preferred_city": geo["name"],
                "preferred_lat": geo["latitude"],
                "preferred_lon": geo["longitude"],
                "password_hash": hash_hex,
                "password_salt": salt_hex,
                "created_at": now,
                "updated_at": now,
            }
        )
        db.preferences[pid] = {
            "profile_id": pid,
            "default_city": geo["name"],
            "auto_detect_location": False,
            "temp_unit": "C",
            "pollutant_unit": "ugm3",
            "aqi_standard": "NAQI",
            "share_location": True,
            "anonymous_reports": False,
            "updated_at": now,
        }
        db.notifications[pid] = {
            "profile_id": pid,
            "enabled": True,
            "aqi_warnings": True,
            "location_alerts": True,
            "aqi_threshold": 100,
            "pm25_threshold": 35.0,
            "browser_notifications": False,
            "updated_at": now,
        }

    token = _create_session_token(pid)
    bundle = get_profile_bundle(token)
    return {
        "token": token,
        "authenticated": True,
        "user": bundle["profile"],
        "bundle": bundle,
        "message": f"Welcome to VayuMitra, {bundle['profile']['name']}!",
    }


def login_user(email_in: str, password_in: str) -> Dict[str, Any]:
    email_norm = (email_in or "").strip().lower()
    pw = str(password_in or "")
    if not email_norm or not pw:
        raise HttpError(401, "Please enter both email and password.")

    with db.lock:
        profile = next((p for p in db.profiles if p["email"].lower() == email_norm), None)
        if not profile or not verify_password(pw, profile["password_hash"], profile["password_salt"]):
            raise HttpError(401, "Invalid email or password.")
        pid = profile["id"]

    token = _create_session_token(pid)
    bundle = get_profile_bundle(token)
    return {
        "token": token,
        "authenticated": True,
        "user": bundle["profile"],
        "bundle": bundle,
        "message": f"Signed in as {bundle['profile']['name']}.",
    }


def logout_user(auth_token: Optional[str] = None) -> Dict[str, Any]:
    if auth_token:
        with db.lock:
            db.sessions.pop(auth_token.strip(), None)
    return {"authenticated": False, "message": "You have been logged out of VayuMitra."}


def get_auth_session(auth_token: Optional[str] = None) -> Dict[str, Any]:
    if not auth_token or not auth_token.strip():
        return {"authenticated": False, "user": None}
    with db.lock:
        sess = db.sessions.get(auth_token.strip())
        if not sess or sess["expires_at"] <= utc_now_iso():
            return {"authenticated": False, "user": None}
        p = next((u for u in db.profiles if u["id"] == sess["profile_id"]), None)
        if not p:
            return {"authenticated": False, "user": None}
        return {
            "authenticated": True,
            "user": {
                "id": p["id"],
                "name": p["name"],
                "email": p["email"],
                "role": p["role"],
                "preferred_city": p["preferred_city"],
            },
        }


def update_profile_bundle(
    payload: Dict[str, Any],
    auth_token: Optional[str] = None,
) -> Dict[str, Any]:
    prof_in = payload.get("profile") or {}
    prefs_in = payload.get("preferences") or {}
    notif_in = payload.get("notifications") or {}
    sec_in = payload.get("security") or {}

    with db.lock:
        profile = db.resolve_profile(auth_token)
        current_pref_city = profile["preferred_city"]

    preferred_city = (
        str(prof_in.get("preferred_city") or prefs_in.get("default_city") or current_pref_city).strip()
        or "Mumbai"
    )
    geo = resolve_location(city=preferred_city)
    if not geo:
        raise HttpError(
            400,
            "Default city must be located within India (e.g., Mumbai, Delhi, Bengaluru, Pune).",
        )

    with db.lock:
        profile = db.resolve_profile(auth_token)
        pid = profile["id"]
        now = utc_now_iso()

        name = str(prof_in.get("name") if prof_in.get("name") is not None else profile["name"]).strip() or profile["name"]
        email = str(prof_in.get("email") if prof_in.get("email") is not None else profile["email"]).strip()
        if email and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
            raise HttpError(400, "Please provide a valid email address.")
        bio = str(prof_in.get("bio") if prof_in.get("bio") is not None else profile["bio"]).strip()[:400]

        new_pw = sec_in.get("new_password")
        if new_pw is not None and str(new_pw).strip() != "":
            pw = str(new_pw)
            if len(pw) < 8:
                raise HttpError(400, "Password must be at least 8 characters long.")
            if profile.get("password_hash"):
                cur_pw = str(sec_in.get("current_password") or "")
                if not verify_password(cur_pw, profile["password_hash"], profile["password_salt"]):
                    raise HttpError(400, "Current password does not match.")
            salt_hex, hash_hex = hash_password(pw)
            profile["password_hash"] = hash_hex
            profile["password_salt"] = salt_hex

        profile.update(
            {
                "name": name,
                "email": email,
                "bio": bio,
                "preferred_city": geo["name"],
                "preferred_lat": geo["latitude"],
                "preferred_lon": geo["longitude"],
                "updated_at": now,
            }
        )

        cur_prefs = db.preferences[pid]
        temp_unit = str(prefs_in.get("temp_unit") if prefs_in.get("temp_unit") is not None else cur_prefs["temp_unit"]).upper()
        if temp_unit not in ("C", "F"):
            temp_unit = "C"
        pol_unit = str(prefs_in.get("pollutant_unit") if prefs_in.get("pollutant_unit") is not None else cur_prefs["pollutant_unit"]).lower()
        if pol_unit not in ("ugm3", "mgm3"):
            pol_unit = "ugm3"
        aqi_std = str(prefs_in.get("aqi_standard") if prefs_in.get("aqi_standard") is not None else cur_prefs["aqi_standard"]).upper()
        if aqi_std not in ("NAQI", "US", "EU"):
            aqi_std = "NAQI"

        db.preferences[pid] = {
            "profile_id": pid,
            "default_city": geo["name"],
            "auto_detect_location": bool(
                prefs_in["auto_detect_location"]
                if "auto_detect_location" in prefs_in and prefs_in["auto_detect_location"] is not None
                else cur_prefs["auto_detect_location"]
            ),
            "temp_unit": temp_unit,
            "pollutant_unit": pol_unit,
            "aqi_standard": aqi_std,
            "share_location": bool(
                prefs_in["share_location"]
                if "share_location" in prefs_in and prefs_in["share_location"] is not None
                else cur_prefs["share_location"]
            ),
            "anonymous_reports": bool(
                prefs_in["anonymous_reports"]
                if "anonymous_reports" in prefs_in and prefs_in["anonymous_reports"] is not None
                else cur_prefs["anonymous_reports"]
            ),
            "updated_at": now,
        }

        cur_notif = db.notifications[pid]
        try:
            aqi_thresh_raw = int(notif_in.get("aqi_threshold", cur_notif["aqi_threshold"]) or 100)
        except (TypeError, ValueError):
            aqi_thresh_raw = 100
        try:
            pm25_thresh_raw = float(notif_in.get("pm25_threshold", cur_notif["pm25_threshold"]) or 35)
        except (TypeError, ValueError):
            pm25_thresh_raw = 35.0

        db.notifications[pid] = {
            "profile_id": pid,
            "enabled": bool(
                notif_in["enabled"]
                if "enabled" in notif_in and notif_in["enabled"] is not None
                else cur_notif["enabled"]
            ),
            "aqi_warnings": bool(
                notif_in["aqi_warnings"]
                if "aqi_warnings" in notif_in and notif_in["aqi_warnings"] is not None
                else cur_notif["aqi_warnings"]
            ),
            "location_alerts": bool(
                notif_in["location_alerts"]
                if "location_alerts" in notif_in and notif_in["location_alerts"] is not None
                else cur_notif["location_alerts"]
            ),
            "aqi_threshold": max(25, min(400, aqi_thresh_raw)),
            "pm25_threshold": max(5.0, min(250.0, pm25_thresh_raw)),
            "browser_notifications": bool(
                notif_in["browser_notifications"]
                if "browser_notifications" in notif_in and notif_in["browser_notifications"] is not None
                else cur_notif["browser_notifications"]
            ),
            "updated_at": now,
        }

    return get_profile_bundle(auth_token)


def _sample_route_coordinates(coords: List[List[float]], count: int = 5) -> List[List[float]]:
    if not coords:
        return []
    if len(coords) <= count or count <= 1:
        return coords if count > 1 else [coords[0]]
    step = (len(coords) - 1) / (count - 1)
    return [coords[round(i * step)] for i in range(count)]


def _format_duration_hr_min(total_min: float) -> str:
    m = max(1, round(total_min))
    hrs = m // 60
    rem = m % 60
    if hrs > 0:
        return f"{hrs} hr {rem} min"
    return f"{rem} min"


def _point_to_segment_km(
    p_lat: float,
    p_lon: float,
    a_lat: float,
    a_lon: float,
    b_lat: float,
    b_lon: float,
) -> float:
    cos_lat = math.cos(math.radians((p_lat + a_lat + b_lat) / 3.0))
    kx = 111.32 * cos_lat
    ky = 111.32
    px = (p_lon - a_lon) * kx
    py = (p_lat - a_lat) * ky
    bx = (b_lon - a_lon) * kx
    by = (b_lat - a_lat) * ky
    len_sq = bx * bx + by * by
    if len_sq <= 1e-9:
        return math.hypot(px, py)
    t = max(0.0, min(1.0, (px * bx + py * by) / len_sq))
    cx = t * bx
    cy = t * by
    return math.hypot(px - cx, py - cy)


def _min_distance_to_polyline_km(lat: float, lon: float, coords: List[List[float]]) -> float:
    if not coords:
        return float("inf")
    if len(coords) == 1:
        return haversine_km(lat, lon, coords[0][1], coords[0][0])
    best = float("inf")
    for i in range(len(coords) - 1):
        d = _point_to_segment_km(lat, lon, coords[i][1], coords[i][0], coords[i + 1][1], coords[i + 1][0])
        if d < best:
            best = d
    return best


def _count_zone_intersections(
    coords: List[List[float]],
    zones: List[Dict[str, float]],
    clearance_km: float = 1.32,
) -> int:
    hits = 0
    for z in zones:
        if _min_distance_to_polyline_km(z["lat"], z["lon"], coords) <= clearance_km:
            hits += 1
    return hits


def get_clean_routes(
    origin: str,
    destination: str,
    mode: str = "walking",
    escape_mode: bool = False,
) -> Dict[str, Any]:
    if not origin or not destination:
        raise HttpError(400, "Both starting location and destination are required.")

    orig_loc = resolve_location(city=origin)
    dest_loc = resolve_location(city=destination)
    if not orig_loc:
        raise HttpError(
            404,
            f"Starting location '{origin}' was not found in India. Please enter an Indian city or neighborhood.",
        )
    if not dest_loc:
        raise HttpError(
            404,
            f"Destination '{destination}' was not found in India. Please enter an Indian city or neighborhood.",
        )

    mode_clean = mode.lower().strip()
    if mode_clean not in ("walking", "cycling", "driving"):
        mode_clean = "walking"
    osrm_profile = {"walking": "foot", "cycling": "bike", "driving": "driving"}[mode_clean]

    osrm_url = (
        f"https://router.project-osrm.org/route/v1/{osrm_profile}/"
        f"{orig_loc['longitude']},{orig_loc['latitude']};{dest_loc['longitude']},{dest_loc['latitude']}"
        "?overview=full&alternatives=true&geometries=geojson"
    )
    try:
        osrm_data = http_get_json(osrm_url)
    except Exception as exc:
        raise HttpError(502, f"Routing service unavailable: {exc}") from exc

    raw_routes = osrm_data.get("routes") or []
    if not raw_routes:
        raise HttpError(404, "No navigable route was found between those two points.")

    with db.lock:
        active_reports = sorted(
            [r for r in db.reports if r["status"] not in ("Rejected", "Resolved")],
            key=lambda r: r["id"],
            reverse=True,
        )[:40]

    orig_city_l = orig_loc["name"].lower()
    dest_city_l = dest_loc["name"].lower()
    nearby_incidents: List[Dict[str, Any]] = []
    incident_updates: List[Dict[str, Any]] = []

    for r in active_reports:
        loc_l = r["location_name"].lower()
        is_near = False
        if r["latitude"] is not None and r["longitude"] is not None:
            d_orig = haversine_km(orig_loc["latitude"], orig_loc["longitude"], r["latitude"], r["longitude"])
            d_dest = haversine_km(dest_loc["latitude"], dest_loc["longitude"], r["latitude"], r["longitude"])
            is_near = min(d_orig, d_dest) <= 45
        elif (orig_city_l and orig_city_l in loc_l) or (dest_city_l and dest_city_l in loc_l):
            is_near = True

        item = {
            "id": r["id"],
            "report_code": r["report_code"],
            "title": r["title"],
            "category": r["category"],
            "location_name": r["location_name"],
            "lat": r["latitude"],
            "lon": r["longitude"],
            "status": r["status"],
            "is_verified": r["status"] == "Verified",
            "hotspot_type": "Verified Incident" if r["status"] == "Verified" else "Citizen Report",
            "created_at": r["created_at"],
        }
        if is_near and r["latitude"] is not None and r["longitude"] is not None:
            nearby_incidents.append(item)
        if is_near or len(incident_updates) < 4:
            incident_updates.append(item)

    pref_std = str(get_profile_bundle()["preferences"].get("aqi_standard") or "NAQI").upper()
    if pref_std not in ("NAQI", "US", "EU"):
        pref_std = "NAQI"

    def sample_route_aqi(coords: List[List[float]]) -> Tuple[List[List[float]], List[Dict[str, Any]]]:
        samples = _sample_route_coordinates(coords, 5)
        lats = ",".join(f"{pt[1]:.4f}" for pt in samples)
        lons = ",".join(f"{pt[0]:.4f}" for pt in samples)
        waypoint_aqi_list: List[Dict[str, Any]] = []
        try:
            aq_url = (
                "https://air-quality-api.open-meteo.com/v1/air-quality"
                f"?latitude={lats}&longitude={lons}"
                "&current=us_aqi,european_aqi,pm2_5,pm10,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide,ozone"
            )
            aq_resp = http_get_json(aq_url)
            aq_items = aq_resp if isinstance(aq_resp, list) else [aq_resp]
            for pt_idx, item in enumerate(aq_items):
                cur = item.get("current") or {}
                aqi_v: Optional[float] = None
                if pref_std == "NAQI":
                    aqi_v = compute_indian_naqi(
                        {
                            "pm2_5": cur.get("pm2_5"),
                            "pm10": cur.get("pm10"),
                            "no2": cur.get("nitrogen_dioxide"),
                            "so2": cur.get("sulphur_dioxide"),
                            "co": cur.get("carbon_monoxide"),
                            "o3": cur.get("ozone"),
                        }
                    )
                    if aqi_v is None:
                        aqi_v = cur.get("us_aqi")
                elif pref_std == "EU":
                    aqi_v = cur.get("european_aqi")
                else:
                    aqi_v = cur.get("us_aqi")
                if aqi_v is not None and pt_idx < len(samples):
                    waypoint_aqi_list.append(
                        {
                            "lat": samples[pt_idx][1],
                            "lon": samples[pt_idx][0],
                            "aqi": round(float(aqi_v)),
                            "pm2_5": cur.get("pm2_5"),
                            "pm10": cur.get("pm10"),
                            "category": classify_aqi(aqi_v, pref_std)["category"],
                        }
                    )
        except Exception:
            pass
        return samples, waypoint_aqi_list

    base_route = raw_routes[0]
    base_sample = sample_route_aqi(base_route["geometry"]["coordinates"])

    verified_incident_zones = [
        {"lat": float(inc["lat"]), "lon": float(inc["lon"])}
        for inc in nearby_incidents
        if inc["is_verified"]
        and inc["lat"] is not None
        and inc["lon"] is not None
        and haversine_km(inc["lat"], inc["lon"], orig_loc["latitude"], orig_loc["longitude"]) > 1.38
        and haversine_km(inc["lat"], inc["lon"], dest_loc["latitude"], dest_loc["longitude"]) > 1.38
    ]

    base_interior_hotspots = [
        hw
        for hw in base_sample[1][1:-1]
        if hw["aqi"] > 100
        and haversine_km(hw["lat"], hw["lon"], orig_loc["latitude"], orig_loc["longitude"]) > 1.5
        and haversine_km(hw["lat"], hw["lon"], dest_loc["latitude"], dest_loc["longitude"]) > 1.5
    ]

    red_avoid_zones = verified_incident_zones + [{"lat": h["lat"], "lon": h["lon"]} for h in base_interior_hotspots]

    candidate_pool: List[Dict[str, Any]] = [{"raw": base_route, "pre_sample": base_sample}]
    for alt in raw_routes[1:3]:
        candidate_pool.append({"raw": alt, "pre_sample": None})

    has_clean_alt = any(
        _count_zone_intersections(c["raw"]["geometry"]["coordinates"], red_avoid_zones, 1.32) == 0
        for c in candidate_pool[1:]
    )

    if not has_clean_alt:
        dlat = dest_loc["latitude"] - orig_loc["latitude"]
        dlon = dest_loc["longitude"] - orig_loc["longitude"]
        span = math.hypot(dlat, dlon)
        if span > 0.004:
            blocking_zone = next(
                (
                    z
                    for z in red_avoid_zones
                    if _min_distance_to_polyline_km(z["lat"], z["lon"], base_route["geometry"]["coordinates"]) <= 1.35
                ),
                None,
            )
            anchor_lat = blocking_zone["lat"] if blocking_zone else (orig_loc["latitude"] + dest_loc["latitude"]) / 2.0
            anchor_lon = blocking_zone["lon"] if blocking_zone else (orig_loc["longitude"] + dest_loc["longitude"]) / 2.0

            for offset_deg in (0.022, 0.032, 0.044):
                found_zero_hit = False
                px = (-dlat / span) * offset_deg
                py = (dlon / span) * offset_deg
                for sign in (1, -1):
                    wp_lat = anchor_lat + sign * py
                    wp_lon = anchor_lon + sign * px
                    detour_url = (
                        f"https://router.project-osrm.org/route/v1/{osrm_profile}/"
                        f"{orig_loc['longitude']:.5f},{orig_loc['latitude']:.5f};"
                        f"{wp_lon:.5f},{wp_lat:.5f};"
                        f"{dest_loc['longitude']:.5f},{dest_loc['latitude']:.5f}"
                        "?overview=full&geometries=geojson"
                    )
                    try:
                        detour_data = http_get_json(detour_url)
                        detour_routes = detour_data.get("routes") or []
                        if detour_routes:
                            cand = detour_routes[0]
                            base_dist = base_route.get("distance") or 0
                            if (cand.get("distance") or 0) > 0 and abs(cand["distance"] - base_dist) >= 40:
                                candidate_pool.append({"raw": cand, "pre_sample": None})
                                if _count_zone_intersections(cand["geometry"]["coordinates"], red_avoid_zones, 1.32) == 0:
                                    found_zero_hit = True
                                    break
                    except Exception:
                        pass
                if found_zero_hit:
                    break

    alt_candidates = candidate_pool[1:]
    chosen_alt = None
    if alt_candidates:
        chosen_alt = sorted(
            alt_candidates,
            key=lambda c: (
                _count_zone_intersections(c["raw"]["geometry"]["coordinates"], red_avoid_zones, 1.32),
                c["raw"].get("distance") or 0,
            ),
        )[0]

    final_raw_pair = [candidate_pool[0], chosen_alt] if chosen_alt else [candidate_pool[0]]
    routes_out: List[Dict[str, Any]] = []

    for idx, entry in enumerate(final_raw_pair):
        r = entry["raw"]
        distance_km = round((r["distance"] / 1000.0), 2)
        if mode_clean == "walking":
            duration_min = max(1, round((distance_km / 4.8) * 60.0))
        elif mode_clean == "cycling":
            duration_min = max(1, round((distance_km / 15.0) * 60.0))
        else:
            duration_min = max(1, round(r["duration"] / 60.0))

        coords = r["geometry"]["coordinates"]
        _, waypoint_aqi_list = entry["pre_sample"] or sample_route_aqi(coords)

        avg_aqi = (
            round(sum(w["aqi"] for w in waypoint_aqi_list) / len(waypoint_aqi_list), 1)
            if waypoint_aqi_list
            else None
        )
        max_aqi = max((w["aqi"] for w in waypoint_aqi_list), default=None)
        exposure_index = round((avg_aqi * duration_min) / 60.0, 1) if avg_aqi is not None else None
        hotspots = [
            w
            for w in waypoint_aqi_list
            if w["aqi"] > 100 or (max_aqi is not None and w["aqi"] == max_aqi and max_aqi > 50)
        ]

        route_inc_hits = sum(
            1
            for inc in nearby_incidents
            if inc["lat"] is not None
            and inc["lon"] is not None
            and _min_distance_to_polyline_km(inc["lat"], inc["lon"], coords) <= 1.32
        )
        red_zone_hits = _count_zone_intersections(coords, red_avoid_zones, 1.32)

        routes_out.append(
            {
                "id": f"route_{idx + 1}",
                "route_type": "ordinary" if idx == 0 else "safe_air",
                "label": "Ordinary Route" if idx == 0 else "Safe Air Route",
                "distance_km": distance_km,
                "duration_min": duration_min,
                "duration_formatted": _format_duration_hr_min(duration_min),
                "geometry": r["geometry"],
                "waypoints": waypoint_aqi_list,
                "avg_aqi": avg_aqi,
                "max_aqi": max_aqi,
                "exposure_index": exposure_index,
                "hotspots": hotspots,
                "incident_hits": route_inc_hits,
                "red_zone_hits": red_zone_hits,
                "is_recommended": False,
                "recommendation_reason": "",
            }
        )

    recommendation_note = "No routes available."
    if len(routes_out) >= 2:
        ordinary = sorted(routes_out, key=lambda r: (r["duration_min"], r["distance_km"]))[0]
        cleanest = sorted(
            routes_out,
            key=lambda r: (
                r["red_zone_hits"],
                r["incident_hits"],
                r["avg_aqi"] if r["avg_aqi"] is not None else 999,
                r["max_aqi"] if r["max_aqi"] is not None else 999,
                r["duration_min"],
            ),
        )[0]
        safe_air_route = (
            next((r for r in routes_out if r is not ordinary), routes_out[1])
            if cleanest is ordinary
            else cleanest
        )

        if cleanest is not ordinary or ordinary["red_zone_hits"] > safe_air_route["red_zone_hits"]:
            safe_air_route.update(
                {
                    "route_type": "safe_air",
                    "label": "Safe Air Route",
                    "is_recommended": True,
                    "recommendation_reason": (
                        "Detours cleanly outside red hotspot circles with lower exposure."
                        if safe_air_route["red_zone_hits"] == 0
                        else "Cleaner alternate corridor avoiding main pollution intersections."
                    ),
                }
            )
            ordinary.update(
                {
                    "route_type": "ordinary",
                    "label": "Ordinary Route",
                    "is_recommended": False,
                    "recommendation_reason": "Standard direct corridor.",
                }
            )
        else:
            ordinary.update(
                {
                    "route_type": "ordinary",
                    "label": "Ordinary Route",
                    "is_recommended": True,
                    "recommendation_reason": "Direct corridor currently matches lowest regional AQI and shortest time.",
                }
            )
            safe_air_route.update(
                {
                    "route_type": "safe_air",
                    "label": "Safe Air Route",
                    "is_recommended": False,
                    "recommendation_reason": "Alternate corridor keeping clear of verified red hotspot circles.",
                }
            )

        routes_out = [ordinary, safe_air_route]
        recommendation_note = (
            f"Ordinary Route: {ordinary['duration_formatted']} (AQI {ordinary['avg_aqi'] if ordinary['avg_aqi'] is not None else 'N/A'})"
            f" · Safe Air Route: {safe_air_route['duration_formatted']} (AQI {safe_air_route['avg_aqi'] if safe_air_route['avg_aqi'] is not None else 'N/A'})."
        )
    elif len(routes_out) == 1:
        routes_out[0].update(
            {
                "route_type": "safe_air",
                "label": "Safe Air Route",
                "is_recommended": True,
                "recommendation_reason": "Only navigable corridor returned for this distance.",
            }
        )
        recommendation_note = f"Route duration: {routes_out[0]['duration_formatted']} ({routes_out[0]['distance_km']} km)."

    safe_route_obj = next((r for r in routes_out if r["route_type"] == "safe_air"), routes_out[0] if routes_out else None)
    safe_coords = safe_route_obj["geometry"]["coordinates"] if safe_route_obj else []

    measured_hotspots: List[Dict[str, Any]] = []
    for hw in base_interior_hotspots:
        if not safe_coords or _min_distance_to_polyline_km(hw["lat"], hw["lon"], safe_coords) > 1.32:
            measured_hotspots.append(
                {
                    "lat": hw["lat"],
                    "lon": hw["lon"],
                    "aqi": hw["aqi"],
                    "category": hw["category"],
                    "hotspot_type": "Elevated AQI Zone",
                    "is_verified": True,
                    "title": f"High AQI Spot ({hw['aqi']} {hw['category']})",
                }
            )

    visible_incidents = [
        inc
        for inc in nearby_incidents
        if (
            not inc["is_verified"]
            or inc["lat"] is None
            or inc["lon"] is None
            or not safe_coords
            or _min_distance_to_polyline_km(inc["lat"], inc["lon"], safe_coords) > 1.25
        )
    ]

    best_window = None
    clean_air_windows: List[Dict[str, Any]] = []
    try:
        fc = get_forecast_data(lat=orig_loc["latitude"], lon=orig_loc["longitude"])
        fc_pts = fc.get("forecast_24h") or []
        if fc_pts:
            cleanest_pt = min(fc_pts, key=lambda b: b["aqi"])
            best_window = {
                "time": cleanest_pt["time"],
                "aqi": cleanest_pt["aqi"],
                "category": cleanest_pt["category"],
            }
            clean_air_windows = build_clean_air_windows(fc_pts, None, fc.get("aqi_standard") or "NAQI")
    except Exception:
        pass

    destination_air = None
    try:
        dest_live = get_air_quality_data(lat=dest_loc["latitude"], lon=dest_loc["longitude"])
        destination_air = {
            "aqi": dest_live["aqi"],
            "category": dest_live["classification"]["category"],
            "level": dest_live["classification"]["level"],
            "temperature": dest_live["weather"]["temperature"],
            "temp_unit": dest_live["weather"].get("temp_unit") or "°C",
            "condition": dest_live["weather"]["condition"],
        }
    except Exception:
        pass

    all_hotspots = visible_incidents + measured_hotspots
    return {
        "origin": orig_loc,
        "destination": dest_loc,
        "destination_air": destination_air,
        "mode": mode_clean,
        "aqi_standard": pref_std,
        "escape_mode": bool(escape_mode),
        "routes": routes_out,
        "hotspot_zones": all_hotspots,
        "incident_updates": incident_updates[:8],
        "emergency_escape": {
            "active": bool(escape_mode),
            "nearby_hotspot_count": len(all_hotspots),
            "verified_or_measured_count": sum(1 for h in all_hotspots if h.get("is_verified")),
            "unverified_report_count": sum(1 for h in all_hotspots if not h.get("is_verified")),
            "advice": (
                f"{len(all_hotspots)} active hotspot(s) near route."
                if all_hotspots
                else "No high-AQI hotspots or reported incidents along route."
            ),
        },
        "clean_air_windows": clean_air_windows,
        "recommendation_note": recommendation_note,
        "data_limitation_note": "Regional Open-Meteo grid + OSRM routing + local community incidents.",
        "best_travel_time": best_window,
        "source": "OSRM + Open-Meteo + In-Memory Store",
    }


def get_alerts_data(
    city: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
) -> Dict[str, Any]:
    live = get_air_quality_data(city=city, lat=lat, lon=lon)
    bundle = get_profile_bundle()

    with db.lock:
        history = [dict(a) for a in db.alerts[:40]]
        candidate_reports = [
            dict(r) for r in db.reports if r["status"] in ("Verified", "Under Review", "Submitted")
        ]

    candidate_reports.sort(key=lambda r: (0 if r["status"] == "Verified" else 1, -r["id"]))
    hotspot_updates = [
        {
            "id": r["id"],
            "report_code": r["report_code"],
            "title": r["title"],
            "category": r["category"],
            "location_name": r["location_name"],
            "status": r["status"],
            "latitude": r["latitude"],
            "longitude": r["longitude"],
            "created_at": r["created_at"],
            "is_verified": r["status"] == "Verified",
            "verification_label": (
                "Verified Hotspot" if r["status"] == "Verified" else f"Unverified Citizen Report ({r['status']})"
            ),
        }
        for r in candidate_reports[:12]
    ]

    pol = live["pollutants"]
    wth = live["weather"]
    pm25_v = pol.get("pm2_5")
    pm10_v = pol.get("pm10")
    wind_v = wth.get("wind_speed")

    reason_parts: List[str] = []
    if pm25_v is not None and pm25_v > 60:
        reason_parts.append(f"Elevated PM2.5 ({pm25_v:.1f} µg/m³)")
    elif pm10_v is not None and pm10_v > 100:
        reason_parts.append(f"High coarse dust PM10 ({pm10_v:.1f} µg/m³)")
    if wind_v is not None and wind_v < 8:
        reason_parts.append(f"low wind dispersion ({wind_v:.1f} km/h)")
    if not reason_parts:
        reason_parts.append(f"Regional traffic, urban dust & weather ({wth.get('condition') or 'Clear'})")

    cur_aqi_val = float(live["aqi"] or 0)
    aqi_comp = min(70.0, (cur_aqi_val / 400.0) * 70.0)
    pm_comp = min(20.0, (float(pm25_v or 0) / 120.0) * 20.0)
    hs_comp = min(10.0, len(hotspot_updates) * 2.0)
    alert_risk_score = max(1, min(100, round(aqi_comp + pm_comp + hs_comp)))
    alert_risk_level = (
        "Very High Risk"
        if alert_risk_score >= 76
        else ("High Risk" if alert_risk_score >= 51 else ("Moderate Risk" if alert_risk_score >= 26 else "Low Risk"))
    )

    alert_risk_explain = (
        f"Risk Score {alert_risk_score}/100 ({alert_risk_level}): Calculated from live AQI ({round(cur_aqi_val)}), "
        f"PM2.5 ({f'{pm25_v:.1f}' if pm25_v is not None else 'N/A'} µg/m³), and {len(hotspot_updates)} nearby citizen "
        "report(s). Scale: 0–25 Low · 26–50 Moderate · 51–75 High · 76–100 Very High."
    )

    return {
        "location": live["location"],
        "current_aqi": live["aqi"],
        "classification": live["classification"],
        "pollutants": live["pollutants"],
        "weather": wth,
        "alert_reason": " and ".join(reason_parts),
        "risk_score": alert_risk_score,
        "risk_level": alert_risk_level,
        "risk_explanation": alert_risk_explain,
        "live_alerts": live["active_alerts"],
        "hotspot_updates": hotspot_updates,
        "alert_history": history,
        "notification_preferences": bundle["notifications"],
        "recorded_at": live["recorded_at"],
        "source": live["source"],
    }


def _extract_history_series(
    location: Dict[str, Any],
    period_clean: str,
    start_date: Optional[str],
    end_date: Optional[str],
    std: str,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    past_days = {"daily": 1, "weekly": 7, "monthly": 30, "custom": 31}.get(period_clean, 1)
    aq = fetch_air_quality_bundle(location["latitude"], location["longitude"], past_days, 1)
    hourly = aq.get("hourly") or {}
    times = hourly.get("time") or []
    cur_time = (aq.get("current") or {}).get("time") or utc_now_iso()

    us_aqi = hourly.get("us_aqi") or []
    eu_aqi = hourly.get("european_aqi") or []
    pm25 = hourly.get("pm2_5") or []
    pm10 = hourly.get("pm10") or []
    co = hourly.get("carbon_monoxide") or []
    no2 = hourly.get("nitrogen_dioxide") or []
    so2 = hourly.get("sulphur_dioxide") or []
    o3 = hourly.get("ozone") or []

    def _at(arr: List[Any], i: int) -> Any:
        return arr[i] if i < len(arr) else None

    records: List[Dict[str, Any]] = []
    for i, t in enumerate(times):
        if t > cur_time:
            continue
        d_str = t[:10]
        if start_date and d_str < start_date:
            continue
        if end_date and d_str > end_date:
            continue
        p_snap = {
            "pm2_5": _at(pm25, i),
            "pm10": _at(pm10, i),
            "co": _at(co, i),
            "no2": _at(no2, i),
            "so2": _at(so2, i),
            "o3": _at(o3, i),
        }
        val: Optional[float] = None
        if std == "EU" and _at(eu_aqi, i) is not None:
            val = eu_aqi[i]
        elif std == "NAQI":
            val = compute_indian_naqi(p_snap)
            if val is None:
                val = _at(us_aqi, i)
        else:
            val = _at(us_aqi, i)
        if val is None:
            continue
        records.append({"time": t, "date": d_str, "aqi": round(float(val)), **p_snap})

    if period_clean == "daily" and not start_date and not end_date:
        records = records[-24:]

    daily_buckets: Dict[str, List[Dict[str, Any]]] = {}
    for rec in records:
        daily_buckets.setdefault(rec["date"], []).append(rec)

    series: List[Dict[str, Any]] = []
    if period_clean == "daily" and not start_date and not end_date:
        series = records
    else:
        for d_key in sorted(daily_buckets.keys()):
            items = daily_buckets[d_key]

            def avg_col(k: str) -> Optional[float]:
                vals = [x[k] for x in items if x.get(k) is not None]
                return round(sum(vals) / len(vals), 2) if vals else None

            series.append(
                {
                    "time": d_key,
                    "date": d_key,
                    "aqi": round(sum(x["aqi"] for x in items) / len(items), 1),
                    "pm2_5": avg_col("pm2_5"),
                    "pm10": avg_col("pm10"),
                    "co": avg_col("co"),
                    "no2": avg_col("no2"),
                    "so2": avg_col("so2"),
                    "o3": avg_col("o3"),
                }
            )
    return records, series


def get_reports_data(
    city: Optional[str] = None,
    period: str = "daily",
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> Dict[str, Any]:
    period_clean = (period or "daily").lower().strip()
    if period_clean not in ("daily", "weekly", "monthly", "custom"):
        period_clean = "daily"

    location = resolve_location(city=city, lat=lat, lon=lon)
    if not location:
        raise HttpError(
            404,
            f"Location '{city}' was not found in India. VayuMitra supports Indian cities only.",
        )

    std = str(get_profile_bundle()["preferences"].get("aqi_standard") or "NAQI").upper()
    records, series = _extract_history_series(location, period_clean, start_date, end_date, std)

    if len(records) < 4:
        return {
            "location": location,
            "aqi_standard": std,
            "period": period_clean,
            "start_date": start_date,
            "end_date": end_date,
            "generated_at": utc_now_iso(),
            "sufficient_data": False,
            "message": "Insufficient historical records returned for the selected date range (Open-Meteo archive retains ~31 days).",
            "summary": None,
            "series": [],
            "records": [],
            "hotspot_analysis": [],
            "evidence_records": [],
            "source": "Open-Meteo Air Quality Historical Archive",
        }

    aqi_vals = [r["aqi"] for r in records]
    avg_aqi = round(sum(aqi_vals) / len(aqi_vals), 1)
    max_rec = max(records, key=lambda r: r["aqi"])
    min_rec = min(records, key=lambda r: r["aqi"])
    net_change = records[-1]["aqi"] - records[0]["aqi"]

    def avg_metric(k: str) -> Optional[float]:
        vals = [r[k] for r in records if r.get(k) is not None]
        return round(sum(vals) / len(vals), 2) if vals else None

    pollutant_averages = {
        "pm2_5": avg_metric("pm2_5"),
        "pm10": avg_metric("pm10"),
        "co": avg_metric("co"),
        "no2": avg_metric("no2"),
        "so2": avg_metric("so2"),
        "o3": avg_metric("o3"),
    }

    avg_cls = classify_aqi(avg_aqi, std)
    elevated_hours = sum(1 for v in aqi_vals if v > 100)
    clean_hours = max(0, len(records) - elevated_hours)

    ratios_raw = [
        {"key": "PM2.5", "val": pollutant_averages["pm2_5"], "limit": 60, "unit": "µg/m³"},
        {"key": "PM10", "val": pollutant_averages["pm10"], "limit": 100, "unit": "µg/m³"},
        {"key": "NO₂", "val": pollutant_averages["no2"], "limit": 80, "unit": "µg/m³"},
        {"key": "SO₂", "val": pollutant_averages["so2"], "limit": 80, "unit": "µg/m³"},
        {"key": "O₃", "val": pollutant_averages["o3"], "limit": 100, "unit": "µg/m³"},
        {"key": "CO", "val": pollutant_averages["co"], "limit": 2000, "unit": "µg/m³"},
    ]
    pollutant_ratios = sorted(
        [{**p, "ratio": float(p["val"]) / p["limit"]} for p in ratios_raw if p["val"] is not None],
        key=lambda p: p["ratio"],
        reverse=True,
    )
    dominant_pollutant = (
        {
            "key": pollutant_ratios[0]["key"],
            "value": pollutant_ratios[0]["val"],
            "unit": pollutant_ratios[0]["unit"],
        }
        if pollutant_ratios
        else None
    )

    observations = [
        f"Mean {std} AQI over the selected window was {avg_aqi} ({avg_cls['category']}) across {len(records)} hourly points.",
        f"Highest recorded AQI was {max_rec['aqi']} at {str(max_rec['time']).replace('T', ' ')}; lowest was {min_rec['aqi']} at {str(min_rec['time']).replace('T', ' ')}.",
        f"Net AQI change: {'+' if net_change >= 0 else ''}{net_change} points ({clean_hours} clean/moderate hrs vs {elevated_hours} elevated hrs > 100 AQI).",
    ]

    top_hotspot_hours = sorted(records, key=lambda r: r["aqi"], reverse=True)[:5]
    with db.lock:
        db_count = sum(1 for r in db.readings if r["city"].lower() == location["name"].lower())
        reports_sorted = sorted([dict(r) for r in db.reports], key=lambda r: r["id"], reverse=True)[:20]

    evidence_records = [
        {
            "id": rr["id"],
            "report_code": rr["report_code"],
            "title": rr["title"],
            "category": LEGACY_CATEGORY_MAP.get(rr["category"], rr["category"]),
            "location_name": rr["location_name"],
            "status": rr["status"],
            "is_verified": rr["status"] in ("Verified", "Resolved"),
            "photo_url": f"/uploads/{rr['stored_filename']}" if rr.get("stored_filename") else None,
            "created_at": rr["created_at"],
            "classification_tag": "Reported (Citizen Evidence)",
        }
        for rr in reports_sorted
    ]

    try:
        air_twin_preview = get_air_twin_data(include_live=False)
    except Exception:
        air_twin_preview = None

    benchmark_cities: List[Dict[str, Any]] = []
    try:
        benchmarks = [
            {"name": "Delhi", "state": "Delhi NCR", "lat": 28.6139, "lon": 77.209},
            {"name": "Mumbai", "state": "Maharashtra", "lat": 19.076, "lon": 72.8777},
            {"name": "Kolkata", "state": "West Bengal", "lat": 22.5726, "lon": 88.3639},
            {"name": "Patna", "state": "Bihar", "lat": 25.5941, "lon": 85.1376},
            {"name": "Lucknow", "state": "Uttar Pradesh", "lat": 26.8467, "lon": 80.9462},
            {"name": "Ahmedabad", "state": "Gujarat", "lat": 23.0225, "lon": 72.5714},
            {"name": "Pune", "state": "Maharashtra", "lat": 18.5204, "lon": 73.8567},
            {"name": "Bengaluru", "state": "Karnataka", "lat": 12.9716, "lon": 77.5946},
            {"name": "Hyderabad", "state": "Telangana", "lat": 17.385, "lon": 78.4867},
            {"name": "Chennai", "state": "Tamil Nadu", "lat": 13.0827, "lon": 80.2707},
        ]
        lats_q = ",".join(f"{c['lat']:.4f}" for c in benchmarks)
        lons_q = ",".join(f"{c['lon']:.4f}" for c in benchmarks)
        batch_url = (
            "https://air-quality-api.open-meteo.com/v1/air-quality"
            f"?latitude={lats_q}&longitude={lons_q}"
            "&current=us_aqi,european_aqi,pm2_5,pm10,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide,ozone"
        )
        batch_resp = http_get_json(batch_url, cache_ttl_sec=120)
        batch_items = batch_resp if isinstance(batch_resp, list) else [batch_resp]
        for i in range(min(len(batch_items), len(benchmarks))):
            cur_c = batch_items[i].get("current") or {}
            c_aqi: Optional[float] = None
            if std == "EU":
                c_aqi = cur_c.get("european_aqi")
            elif std == "US":
                c_aqi = cur_c.get("us_aqi")
            else:
                c_aqi = compute_indian_naqi(
                    {
                        "pm2_5": cur_c.get("pm2_5"),
                        "pm10": cur_c.get("pm10"),
                        "no2": cur_c.get("nitrogen_dioxide"),
                        "so2": cur_c.get("sulphur_dioxide"),
                        "co": cur_c.get("carbon_monoxide"),
                        "o3": cur_c.get("ozone"),
                    }
                )
                if c_aqi is None:
                    c_aqi = cur_c.get("us_aqi")
            if c_aqi is not None:
                c_aqi_int = round(float(c_aqi))
                benchmark_cities.append(
                    {
                        "city": benchmarks[i]["name"],
                        "state": benchmarks[i]["state"],
                        "aqi": c_aqi_int,
                        "category": classify_aqi(c_aqi_int, std)["category"],
                        "pm2_5": round(cur_c["pm2_5"], 1) if cur_c.get("pm2_5") is not None else None,
                        "pm10": round(cur_c["pm10"], 1) if cur_c.get("pm10") is not None else None,
                    }
                )
    except Exception:
        pass

    top_polluted_cities = sorted(benchmark_cities, key=lambda c: c["aqi"], reverse=True)[:5]
    cleanest_cities = sorted(benchmark_cities, key=lambda c: c["aqi"])[:5]

    raw_score = (
        min(70.0, (avg_aqi / 400.0) * 70.0)
        + (elevated_hours / max(1, len(records))) * 20.0
        + min(10.0, (max_rec["aqi"] / 400.0) * 10.0)
    )
    risk_score = max(1, min(100, round(raw_score)))
    risk_level = (
        "Very High Risk"
        if raw_score >= 76
        else ("High Risk" if raw_score >= 51 else ("Moderate Risk" if raw_score >= 26 else "Low Risk"))
    )

    return {
        "location": location,
        "aqi_standard": std,
        "period": period_clean,
        "start_date": start_date,
        "end_date": end_date,
        "generated_at": utc_now_iso(),
        "sufficient_data": True,
        "record_count": len(records),
        "stored_db_snapshots": db_count,
        "data_classifications": {
            "historical_aqi_series": f"Measured / Regional Historical Archive ({std})",
            "community_evidence": "Reported (Citizen Evidence)",
            "period_averages_and_exposure": "Calculated",
        },
        "summary": {
            "average_aqi": avg_aqi,
            "average_category": avg_cls["category"],
            "highest_aqi": max_rec["aqi"],
            "highest_time": max_rec["time"],
            "lowest_aqi": min_rec["aqi"],
            "lowest_time": min_rec["time"],
            "net_change": net_change,
            "elevated_hours": elevated_hours,
            "clean_hours": clean_hours,
            "dominant_pollutant": dominant_pollutant,
            "risk_score": risk_score,
            "risk_level": risk_level,
            "risk_explanation": (
                f"Computed from mean AQI ({avg_aqi}), peak AQI ({max_rec['aqi']}), and {elevated_hours}/{len(records)} "
                "hours exceeding AQI 100. Scale: 0–25 Low · 26–50 Moderate · 51–75 High · 76–100 Very High."
            ),
            "pollutant_averages": pollutant_averages,
            "observations": observations,
        },
        "hotspot_analysis": top_hotspot_hours,
        "top_polluted_cities": top_polluted_cities,
        "cleanest_cities": cleanest_cities,
        "evidence_records": evidence_records,
        "personal_exposure_preview": air_twin_preview["daily_summary"] if air_twin_preview else None,
        "series": series,
        "records": records[-120:],
        "source": "Open-Meteo Air Quality Historical Feed + In-Memory Store",
    }


def export_reports_csv(
    city: Optional[str] = None,
    period: str = "daily",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> Tuple[str, str]:
    report = get_reports_data(city=city, period=period, start_date=start_date, end_date=end_date)
    if not report["sufficient_data"]:
        raise HttpError(400, report.get("message") or "Insufficient data to export CSV.")
    city_name = report["location"]["name"]
    src = report["source"]
    rows: List[List[Any]] = [
        ["Timestamp", "City", "Data Type", "AQI (US)", "PM2.5 (ug/m3)", "PM10 (ug/m3)", "CO (ug/m3)", "NO2 (ug/m3)", "SO2 (ug/m3)", "O3 (ug/m3)", "Source"]
    ]
    for row in report["series"]:
        rows.append(
            [
                row["time"],
                city_name,
                "Measured / Regional Historical Feed",
                row["aqi"],
                row.get("pm2_5"),
                row.get("pm10"),
                row.get("co"),
                row.get("no2"),
                row.get("so2"),
                row.get("o3"),
                src,
            ]
        )
    p = period or "daily"
    safe_city = re.sub(r"\s+", "_", city_name.lower())
    filename = f"vayumitra_{safe_city}_{p}_report.csv"
    return filename, _to_csv(rows)


def list_community_reports(
    status: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
) -> List[Dict[str, Any]]:
    s_filter = (status or "").strip()
    c_filter = (category or "").strip()
    q_filter = (search or "").strip().lower()

    with db.lock:
        sorted_rows = sorted([dict(r) for r in db.reports], key=lambda r: r["id"], reverse=True)

    out: List[Dict[str, Any]] = []
    for row in sorted_rows:
        mapped_cat = LEGACY_CATEGORY_MAP.get(row["category"], row["category"])
        if s_filter and row["status"] != s_filter:
            continue
        if c_filter and mapped_cat != c_filter and row["category"] != c_filter:
            continue
        if q_filter:
            hay = f"{row['report_code']} {row['title']} {row['location_name']} {mapped_cat}".lower()
            if q_filter not in hay:
                continue
        st = row["status"]
        v_label = (
            "Verified Incident"
            if st == "Verified"
            else ("Verified & Resolved" if st == "Resolved" else ("Rejected Report" if st == "Rejected" else "Unverified Citizen Report (Pending Review)"))
        )
        out.append(
            {
                "id": row["id"],
                "report_code": row["report_code"],
                "title": row["title"],
                "description": row["description"],
                "category": mapped_cat,
                "location_name": row["location_name"],
                "latitude": row["latitude"],
                "longitude": row["longitude"],
                "status": st,
                "is_verified": st in ("Verified", "Resolved"),
                "verification_label": v_label,
                "photo_url": f"/uploads/{row['stored_filename']}" if row.get("stored_filename") else None,
                "original_filename": row.get("original_filename"),
                "file_size": row.get("file_size"),
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            }
        )
    return out


def get_community_contribution_summary() -> Dict[str, Any]:
    reports = list_community_reports()
    total = len(reports)
    verified = sum(1 for r in reports if r["status"] == "Verified")
    resolved = sum(1 for r in reports if r["status"] == "Resolved")
    rejected = sum(1 for r in reports if r["status"] == "Rejected")
    with_photo = sum(1 for r in reports if r.get("photo_url"))
    points = max(0, total * 10 + with_photo * 5 + verified * 20 + resolved * 25 - rejected * 10)
    tier = (
        "Platinum Air Guardian"
        if points >= 200
        else ("Gold Air Guardian" if points >= 100 else ("Silver Air Guardian" if points >= 40 else "Bronze Air Guardian"))
    )
    return {
        "total_reports": total,
        "verified_count": verified,
        "resolved_count": resolved,
        "rejected_count": rejected,
        "pending_count": max(0, total - verified - resolved - rejected),
        "with_photo_count": with_photo,
        "guardian_points": points,
        "guardian_tier": tier,
        "scoring_note": "Calculated transparently in store: +10 per report, +5 photo evidence, +20 Verified, +25 Resolved.",
    }


def create_community_report(
    title: str,
    description: str,
    category: str,
    location_name: str,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    file_bytes: Optional[bytes] = None,
    original_filename: Optional[str] = None,
    auth_token: Optional[str] = None,
) -> Dict[str, Any]:
    t = (title or "").strip()
    desc = (description or "").strip()
    cat = LEGACY_CATEGORY_MAP.get((category or "").strip(), (category or "").strip())
    loc_name = (location_name or "").strip()

    if len(t) < 4:
        raise HttpError(400, "Report title must be at least 4 characters.")
    if len(desc) < 10:
        raise HttpError(400, "Please provide a description of at least 10 characters.")
    if cat not in COMMUNITY_CATEGORIES:
        raise HttpError(400, "Invalid environmental issue category.")
    if len(loc_name) < 2:
        raise HttpError(400, "Please specify the location of the issue.")

    stored_filename: Optional[str] = None
    mime_type: Optional[str] = None
    file_size: Optional[int] = None

    with db.lock:
        if file_bytes and len(file_bytes) > 0:
            file_size = len(file_bytes)
            if file_size > Config.MAX_UPLOAD_BYTES:
                raise HttpError(400, "Uploaded photo exceeds the 5 MB size limit.")
            img_type = detect_image_type(file_bytes)
            if not img_type:
                raise HttpError(400, "Invalid image file. Only PNG, JPG, JPEG, and WEBP images are allowed.")
            stored_filename = f"{uuid.uuid4().hex}.{img_type}"
            mime_type = {"png": "image/png", "jpg": "image/jpeg", "webp": "image/webp"}[img_type]
            db.uploads[stored_filename] = {"mime_type": mime_type, "data": file_bytes}

        now = utc_now_iso()
        date_part = datetime.now(timezone.utc).strftime("%Y%m%d")
        code_part = secrets.token_hex(3)[:5].upper()
        report_code = f"VM-{date_part}-{code_part}"
        profile = db.resolve_profile(auth_token)

        db.reports.append(
            {
                "id": db.next_id("report"),
                "report_code": report_code,
                "profile_id": profile["id"],
                "title": t,
                "description": desc,
                "category": cat,
                "location_name": loc_name,
                "latitude": latitude,
                "longitude": longitude,
                "status": "Submitted",
                "stored_filename": stored_filename,
                "original_filename": original_filename[:180] if original_filename else stored_filename,
                "mime_type": mime_type,
                "file_size": file_size,
                "created_at": now,
                "updated_at": now,
            }
        )

    all_reps = list_community_reports()
    return next((r for r in all_reps if r["report_code"] == report_code), all_reps[0])


def update_community_report_status(report_id: int, status: str) -> Dict[str, Any]:
    if status not in REPORT_STATUSES:
        raise HttpError(400, f"Status must be one of: {', '.join(REPORT_STATUSES)}.")
    with db.lock:
        rep = next((r for r in db.reports if r["id"] == report_id), None)
        if not rep:
            raise HttpError(404, "Report not found.")
        rep["status"] = status
        rep["updated_at"] = utc_now_iso()
    return next(r for r in list_community_reports() if r["id"] == report_id)


def _fetch_brief_aqi(lat: float, lon: float, standard: str = "NAQI") -> Tuple[Optional[int], Optional[float]]:
    try:
        url = (
            "https://air-quality-api.open-meteo.com/v1/air-quality"
            f"?latitude={lat}&longitude={lon}&current=us_aqi,european_aqi,pm2_5,pm10,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide,ozone"
        )
        resp = http_get_json(url, cache_ttl_sec=120)
        cur = resp.get("current") or {}
        aqi_v: Optional[float] = None
        if standard == "EU" and cur.get("european_aqi") is not None:
            aqi_v = cur["european_aqi"]
        elif standard == "NAQI":
            aqi_v = compute_indian_naqi(
                {
                    "pm2_5": cur.get("pm2_5"),
                    "pm10": cur.get("pm10"),
                    "no2": cur.get("nitrogen_dioxide"),
                    "so2": cur.get("sulphur_dioxide"),
                    "co": cur.get("carbon_monoxide"),
                    "o3": cur.get("ozone"),
                }
            )
            if aqi_v is None:
                aqi_v = cur.get("us_aqi")
        else:
            aqi_v = cur.get("us_aqi")
        return (round(float(aqi_v)) if aqi_v is not None else None, cur.get("pm2_5"))
    except Exception:
        return None, None


def get_air_twin_data(include_live: bool = True, auth_token: Optional[str] = None) -> Dict[str, Any]:
    with db.lock:
        profile = dict(db.resolve_profile(auth_token))
        pid = profile["id"]
        std = str(db.preferences.get(pid, {}).get("aqi_standard") or "NAQI").upper()
        loc_rows = sorted([dict(l) for l in db.personal_locations if l["profile_id"] == pid], key=lambda l: l["id"], reverse=True)
        act_rows = sorted([dict(a) for a in db.personal_activities if a["profile_id"] == pid], key=lambda a: a["id"], reverse=True)
        diary_rows = sorted(
            [dict(d) for d in db.exposure_diary if d["profile_id"] == pid],
            key=lambda d: (d["entry_date"], d["id"]),
            reverse=True,
        )[:30]

    loc_list: List[Dict[str, Any]] = []
    loc_aqi_map: Dict[int, Tuple[Optional[int], Optional[float], str]] = {}

    for lr in loc_rows:
        live_aqi, live_pm25 = _fetch_brief_aqi(lr["latitude"], lr["longitude"], std) if include_live else (None, None)
        loc_aqi_map[lr["id"]] = (live_aqi, live_pm25, lr["city"])
        loc_list.append(
            {
                "id": lr["id"],
                "label": lr["label"],
                "city": lr["city"],
                "hours_per_day": lr["hours_per_day"],
                "latitude": lr["latitude"],
                "longitude": lr["longitude"],
                "live_aqi": live_aqi,
                "live_pm25": live_pm25,
                "category": classify_aqi(live_aqi, std)["category"] if live_aqi is not None else "Unavailable",
                "created_at": lr["created_at"],
            }
        )

    fallback_aqi, fallback_pm25 = (
        _fetch_brief_aqi(profile["preferred_lat"], profile["preferred_lon"], std)
        if include_live
        else (None, None)
    )

    intensity_factor_map = {"Low": 1.0, "Moderate": 1.2, "Vigorous": 1.45}
    weighted_sum = 0.0
    pm25_weighted_sum = 0.0
    total_hours = 0.0
    outdoor_hours = 0.0
    valid_weight_hours = 0.0

    activities_out: List[Dict[str, Any]] = []
    for ar in act_rows:
        if ar.get("location_id") and ar["location_id"] in loc_aqi_map:
            ref_aqi, ref_pm25, ref_city = loc_aqi_map[ar["location_id"]]
        else:
            ref_aqi, ref_pm25, ref_city = fallback_aqi, fallback_pm25, profile["preferred_city"]

        hrs = ar["hours_per_day"]
        is_out = ar["is_outdoor"]
        env_factor = (0.88 if is_out else 0.65) if ar["activity_type"] == "Commuting" else (1.0 if is_out else 0.45)
        int_factor = intensity_factor_map.get(ar["intensity"], 1.1)

        total_hours += hrs
        if is_out:
            outdoor_hours += hrs

        est_act_aqi = round(ref_aqi * env_factor * int_factor, 1) if ref_aqi is not None else None
        est_act_pm25 = round(ref_pm25 * env_factor * int_factor, 1) if ref_pm25 is not None else None
        if est_act_aqi is not None:
            weighted_sum += est_act_aqi * hrs
            valid_weight_hours += hrs
        if est_act_pm25 is not None:
            pm25_weighted_sum += est_act_pm25 * hrs

        activities_out.append(
            {
                "id": ar["id"],
                "activity_type": ar["activity_type"],
                "location_id": ar["location_id"],
                "location_label": ar.get("location_label") or ref_city,
                "hours_per_day": hrs,
                "intensity": ar["intensity"],
                "is_outdoor": is_out,
                "ambient_aqi": ref_aqi,
                "calculated_exposure_aqi": est_act_aqi,
                "calculated_exposure_pm25": est_act_pm25,
                "created_at": ar["created_at"],
            }
        )

    daily_avg_exposure: Optional[float] = None
    daily_pm25_exposure: Optional[float] = None

    if valid_weight_hours > 0:
        daily_avg_exposure = round(weighted_sum / valid_weight_hours, 1)
        daily_pm25_exposure = round(pm25_weighted_sum / valid_weight_hours, 1)
    elif any(l["live_aqi"] is not None for l in loc_list):
        valid_locs = [l for l in loc_list if l["live_aqi"] is not None]
        w_hrs = sum(l["hours_per_day"] for l in valid_locs) or 1
        daily_avg_exposure = round(sum(l["live_aqi"] * l["hours_per_day"] for l in valid_locs) / w_hrs, 1)
        valid_pm_locs = [l for l in valid_locs if l["live_pm25"] is not None]
        if valid_pm_locs:
            pm_hrs = sum(l["hours_per_day"] for l in valid_pm_locs) or 1
            daily_pm25_exposure = round(sum(l["live_pm25"] * l["hours_per_day"] for l in valid_pm_locs) / pm_hrs, 1)
    elif fallback_aqi is not None:
        daily_avg_exposure = float(fallback_aqi)
        daily_pm25_exposure = fallback_pm25

    exp_cls = (
        classify_aqi(daily_avg_exposure, std)
        if daily_avg_exposure is not None
        else {"category": "Unavailable", "level": "moderate"}
    )

    if loc_list:
        location_comparison = [
            {
                "label": f"{l['label']} ({l['city']})",
                "city": l["city"],
                "hours_per_day": l["hours_per_day"],
                "live_aqi": l["live_aqi"],
                "live_pm25": l["live_pm25"],
                "category": l["category"],
            }
            for l in loc_list
        ]
    elif fallback_aqi is not None:
        location_comparison = [
            {
                "label": f"Primary ({profile['preferred_city']})",
                "city": profile["preferred_city"],
                "hours_per_day": 24.0,
                "live_aqi": fallback_aqi,
                "live_pm25": fallback_pm25,
                "category": classify_aqi(fallback_aqi, std)["category"],
            }
        ]
    else:
        location_comparison = []

    weekly_exposure_trend: List[Dict[str, Any]] = []
    if include_live:
        diary_by_date = {d["entry_date"]: d["estimated_aqi"] for d in diary_rows}
        exposure_ratio = (
            daily_avg_exposure / fallback_aqi if (daily_avg_exposure is not None and fallback_aqi and fallback_aqi > 0) else 0.72
        )
        try:
            ref_lat = loc_list[0]["latitude"] if loc_list else profile["preferred_lat"]
            ref_lon = loc_list[0]["longitude"] if loc_list else profile["preferred_lon"]
            _, week_series = _extract_history_series(
                {"latitude": ref_lat, "longitude": ref_lon, "name": profile["preferred_city"], "country": "India", "admin1": ""},
                "weekly",
                None,
                None,
                std,
            )
            for ws in week_series[-7:]:
                d_key = ws["date"]
                if d_key in diary_by_date:
                    weekly_exposure_trend.append(
                        {"date": d_key, "exposure_aqi": round(diary_by_date[d_key], 1), "source_tag": "Logged Diary"}
                    )
                else:
                    weekly_exposure_trend.append(
                        {"date": d_key, "exposure_aqi": round(ws["aqi"] * exposure_ratio, 1), "source_tag": "7d Archive Est."}
                    )
        except Exception:
            for d in reversed(diary_rows[:7]):
                weekly_exposure_trend.append(
                    {"date": d["entry_date"], "exposure_aqi": round(d["estimated_aqi"], 1), "source_tag": "Logged Diary"}
                )

    recommendations: List[str] = []
    if daily_avg_exposure is not None:
        if daily_avg_exposure > 200:
            recommendations.append("Calculated exposure is elevated: shift outdoor workouts indoors and use an N95 mask during commutes.")
        elif daily_avg_exposure > 100:
            recommendations.append("Moderate-to-high calculated exposure: wear a mask during commutes and limit vigorous outdoor activity.")
        else:
            recommendations.append("Calculated daily exposure is relatively low under current ambient conditions.")
    if len(location_comparison) >= 2:
        valid_cmp = [x for x in location_comparison if x["live_aqi"] is not None]
        if len(valid_cmp) >= 2:
            highest_loc = max(valid_cmp, key=lambda x: x["live_aqi"])
            lowest_loc = min(valid_cmp, key=lambda x: x["live_aqi"])
            if highest_loc["label"] != lowest_loc["label"]:
                recommendations.append(
                    f"Highest ambient AQI among your places: {highest_loc['label']} ({highest_loc['live_aqi']}) "
                    f"vs cleanest {lowest_loc['label']} ({lowest_loc['live_aqi']})."
                )
    if not loc_list:
        recommendations.append("Add your frequently visited Indian locations (Home, Office, College) to compare exposure across places.")
    if not activities_out:
        recommendations.append("Log daily activities with hours/day to refine outdoor vs indoor exposure weighting.")

    return {
        "profile_name": profile["name"],
        "preferred_city": profile["preferred_city"],
        "aqi_standard": std,
        "activity_types": ACTIVITY_TYPES,
        "locations": loc_list,
        "location_comparison": location_comparison,
        "weekly_exposure_trend": weekly_exposure_trend,
        "activities": activities_out,
        "diary": diary_rows,
        "daily_summary": {
            "weighted_exposure_aqi": daily_avg_exposure,
            "estimated_pm25_exposure": daily_pm25_exposure,
            "exposure_category": exp_cls["category"],
            "total_logged_hours": round(total_hours, 1),
            "outdoor_hours": round(outdoor_hours, 1),
            "locations_tracked": len(loc_list),
            "activities_tracked": len(activities_out),
            "recommendations": recommendations,
            "data_classification": f"Calculated Estimate (Real Open-Meteo {std} Ambient Feed x Logged Routine Weighting)",
        },
        "medical_disclaimer": (
            "IMPORTANT: Personal Air Twin metrics are environmental exposure estimates computed from regional ambient "
            "air-quality feeds and your self-reported activity schedule. This is NOT a medical diagnosis and NOT a direct "
            "measurement of personal inhaled dose."
        ),
    }


def add_personal_location(
    label_in: str,
    city_in: str,
    hours_per_day: float = 8.0,
    auth_token: Optional[str] = None,
) -> Dict[str, Any]:
    label = (label_in or "").strip()
    city = (city_in or "").strip()
    hrs = max(0.5, min(24.0, float(hours_per_day or 8.0)))
    if len(label) < 2:
        raise HttpError(400, "Location label must be at least 2 characters (e.g., Home, Office).")
    geo = resolve_location(city=city)
    if not geo:
        raise HttpError(404, f"Location '{city}' was not found in India.")

    with db.lock:
        profile = db.resolve_profile(auth_token)
        loc_id = db.next_id("location")
        db.personal_locations.append(
            {
                "id": loc_id,
                "profile_id": profile["id"],
                "label": label,
                "city": geo["name"],
                "latitude": geo["latitude"],
                "longitude": geo["longitude"],
                "hours_per_day": hrs,
                "created_at": utc_now_iso(),
            }
        )
    return {
        "id": loc_id,
        "label": label,
        "city": geo["name"],
        "latitude": geo["latitude"],
        "longitude": geo["longitude"],
        "hours_per_day": hrs,
    }


def delete_personal_location(loc_id: int) -> None:
    with db.lock:
        idx = next((i for i, l in enumerate(db.personal_locations) if l["id"] == loc_id), -1)
        if idx == -1:
            raise HttpError(404, "Saved location not found.")
        db.personal_locations.pop(idx)
        for act in db.personal_activities:
            if act.get("location_id") == loc_id:
                act["location_id"] = None


def add_personal_activity(
    activity_type: str,
    location_id: Optional[int] = None,
    hours_per_day: float = 1.0,
    intensity: str = "Moderate",
    is_outdoor: bool = True,
    auth_token: Optional[str] = None,
) -> Dict[str, Any]:
    act_type = (activity_type or "").strip()
    if act_type not in ACTIVITY_TYPES:
        raise HttpError(400, f"Activity must be one of: {', '.join(ACTIVITY_TYPES)}.")
    try:
        hrs = float(hours_per_day)
    except (TypeError, ValueError) as exc:
        raise HttpError(400, "Hours per day must be between 0.5 and 24.") from exc
    if not math.isfinite(hrs) or hrs <= 0 or hrs > 24:
        raise HttpError(400, "Hours per day must be between 0.5 and 24.")

    int_clean = intensity if intensity in ("Low", "Moderate", "Vigorous") else "Moderate"

    with db.lock:
        profile = db.resolve_profile(auth_token)
        loc_id = location_id
        loc_label = profile["preferred_city"]
        if loc_id is not None:
            lrow = next((l for l in db.personal_locations if l["id"] == loc_id), None)
            if lrow:
                loc_label = f"{lrow['label']} ({lrow['city']})"
            else:
                loc_id = None
        act_id = db.next_id("activity")
        db.personal_activities.append(
            {
                "id": act_id,
                "profile_id": profile["id"],
                "activity_type": act_type,
                "location_id": loc_id,
                "location_label": loc_label,
                "hours_per_day": hrs,
                "intensity": int_clean,
                "is_outdoor": bool(is_outdoor),
                "created_at": utc_now_iso(),
            }
        )
    return {"id": act_id, "activity_type": act_type, "location_label": loc_label, "hours_per_day": hrs}


def delete_personal_activity(act_id: int) -> None:
    with db.lock:
        idx = next((i for i, a in enumerate(db.personal_activities) if a["id"] == act_id), -1)
        if idx == -1:
            raise HttpError(404, "Activity entry not found.")
        db.personal_activities.pop(idx)


def add_exposure_diary_entry(
    notes: str = "",
    entry_date: Optional[str] = None,
    auth_token: Optional[str] = None,
) -> Dict[str, Any]:
    twin = get_air_twin_data(include_live=True, auth_token=auth_token)
    summary = twin["daily_summary"]
    est_aqi = summary.get("weighted_exposure_aqi")
    if est_aqi is None:
        raise HttpError(400, "Live AQI data unavailable to log diary entry.")
    d_str = (entry_date or "").strip() or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    act_summary = (
        ", ".join(f"{a['activity_type']} ({a['hours_per_day']}h)" for a in twin["activities"][:4])
        or f"Default ambient profile ({twin['preferred_city']})"
    )
    city_label = twin["locations"][0]["city"] if twin["locations"] else twin["preferred_city"]

    with db.lock:
        profile = db.resolve_profile(auth_token)
        entry_id = db.next_id("diary")
        db.exposure_diary.append(
            {
                "id": entry_id,
                "profile_id": profile["id"],
                "entry_date": d_str,
                "city": city_label,
                "activity_summary": act_summary,
                "estimated_aqi": float(est_aqi),
                "estimated_pm25": summary.get("estimated_pm25_exposure"),
                "calculated_exposure_score": float(est_aqi),
                "notes": (notes or "").strip()[:500],
                "created_at": utc_now_iso(),
            }
        )
    return {"id": entry_id, "entry_date": d_str, "city": city_label, "estimated_aqi": est_aqi}


def export_air_twin_csv(auth_token: Optional[str] = None) -> Tuple[str, str]:
    twin = get_air_twin_data(include_live=True, auth_token=auth_token)
    rows: List[List[Any]] = [
        ["Section", "Date/Label", "Location/City", "Hours/Day", "Calculated Exposure AQI", "Estimated PM2.5 (ug/m3)", "Notes/Disclaimer"]
    ]
    for a in twin["activities"]:
        rows.append(
            [
                "Activity Profile",
                a["activity_type"],
                a["location_label"],
                a["hours_per_day"],
                a.get("calculated_exposure_aqi"),
                a.get("calculated_exposure_pm25"),
                f"Intensity: {a['intensity']}",
            ]
        )
    for d in twin["diary"]:
        rows.append(
            [
                "Exposure Diary",
                d["entry_date"],
                d["city"],
                "",
                d["estimated_aqi"],
                d.get("estimated_pm25"),
                f"{d['activity_summary']} | {d['notes']}",
            ]
        )
    rows.append(["Disclaimer", "", "", "", "", "", twin["medical_disclaimer"]])
    return "vayumitra_personal_air_twin_exposure.csv", _to_csv(rows)


def create_contact_message(
    name: str,
    email: str,
    subject: str = "General Feedback",
    message: str = "",
) -> Dict[str, Any]:
    n = (name or "").strip()
    em = (email or "").strip()
    subj = (subject or "General Feedback").strip()
    msg = (message or "").strip()
    if len(n) < 2 or not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", em) or len(msg) < 5:
        raise HttpError(400, "Please provide a valid name, email, and message.")
    now = utc_now_iso()
    with db.lock:
        cid = db.next_id("contact")
        db.contact_messages.append({"id": cid, "name": n, "email": em, "subject": subj, "message": msg, "created_at": now})
    return {"id": cid, "name": n, "email": em, "subject": subj, "created_at": now}


def get_dashboard_data(
    city: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
) -> Dict[str, Any]:
    aq = get_air_quality_data(city=city, lat=lat, lon=lon)
    bundle = get_profile_bundle()
    with db.lock:
        reports_cnt = len(db.reports)
    return {
        **aq,
        "profile_summary": {
            "name": bundle["profile"]["name"],
            "default_city": bundle["preferences"]["default_city"],
            "community_reports_count": reports_cnt,
        },
    }
