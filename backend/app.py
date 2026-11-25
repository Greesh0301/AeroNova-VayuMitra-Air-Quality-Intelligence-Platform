import argparse
import base64
import email.parser
import email.policy
import json
import mimetypes
import os
import re
import sys
import traceback
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from backend.air_quality import (
    HttpError,
    explain_event_replay,
    generate_event_replay_pdf,
    get_air_quality_data,
    get_forecast_data,
    get_insights_data,
    get_pollution_event_replay,
    get_profile_bundle,
    get_time_machine_data,
    simulate_what_if,
)
from backend.config import Config, FRONTEND_DIR
from backend.greensteps import (
    claim_green_reward,
    complete_green_task,
    estimate_environmental_impact,
    get_greensteps_dashboard,
    review_green_task_submission,
    start_green_task,
)
from backend.india_locations import get_india_locations_directory
from backend.services import (
    add_exposure_diary_entry,
    add_personal_activity,
    add_personal_location,
    create_community_report,
    create_contact_message,
    delete_personal_activity,
    delete_personal_location,
    export_air_twin_csv,
    export_reports_csv,
    get_air_twin_data,
    get_alerts_data,
    get_auth_session,
    get_clean_routes,
    get_community_contribution_summary,
    get_dashboard_data,
    get_reports_data,
    list_community_reports,
    login_user,
    logout_user,
    register_user,
    update_community_report_status,
    update_profile_bundle,
)
from backend.store import COMMUNITY_CATEGORIES, REPORT_STATUSES, db

EXTRA_MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8",
}


def _parse_float_opt(val: Any) -> Optional[float]:
    if val is None or val == "":
        return None
    try:
        f = float(val)
        return f
    except (TypeError, ValueError):
        return None


def _parse_int_opt(val: Any) -> Optional[int]:
    if val is None or val == "":
        return None
    try:
        return int(str(val).strip())
    except (TypeError, ValueError):
        return None


def _parse_bool(val: Any) -> bool:
    if val is None:
        return False
    return str(val).strip().lower() in ("1", "true", "yes", "on")


def _parse_multipart(content_type: str, body: bytes) -> Tuple[Dict[str, str], Dict[str, Tuple[bytes, Optional[str]]]]:
    fields: Dict[str, str] = {}
    files: Dict[str, Tuple[bytes, Optional[str]]] = {}
    if not body:
        return fields, files
    header_block = f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode("latin-1")
    msg = email.parser.BytesParser(policy=email.policy.default).parsebytes(header_block + body)
    if not msg.is_multipart():
        return fields, files
    for part in msg.iter_parts():
        name = part.get_param("name", header="content-disposition")
        if not name:
            continue
        filename = part.get_filename()
        payload = part.get_payload(decode=True) or b""
        if filename is not None:
            if len(payload) > Config.MAX_UPLOAD_BYTES:
                raise HttpError(413, "Uploaded photo exceeds the 5 MB size limit.")
            files[name] = (payload, filename)
        else:
            charset = part.get_content_charset() or "utf-8"
            fields[name] = payload.decode(charset, errors="replace")
    return fields, files


def _decode_base64_field(raw: Any) -> bytes:
    b64_str = str(raw or "").split(",")[-1].strip()
    if not b64_str:
        return b""
    try:
        return base64.b64decode(b64_str)
    except Exception as exc:
        raise HttpError(400, "Invalid base64 image payload.") from exc


def _extract_auth_token(headers_get) -> str:
    auth_hdr = str(headers_get("Authorization") or "")
    if auth_hdr.lower().startswith("bearer "):
        return auth_hdr[7:].strip()
    return str(headers_get("X-Auth-Token") or "").strip()


def _dispatch_api(
    method: str,
    path: str,
    query: Dict[str, str],
    json_body: Dict[str, Any],
    form_fields: Dict[str, str],
    files: Dict[str, Tuple[bytes, Optional[str]]],
    is_multipart: bool,
    auth_token: str,
) -> Tuple[int, Any, Dict[str, str]]:
    """Dispatch an API or /uploads request and return (status, payload_or_bytes, headers)."""
    if method == "GET" and path.startswith("/uploads/"):
        fname = os.path.basename(urllib.parse.unquote(path[len("/uploads/"):]))
        with db.lock:
            item = db.uploads.get(fname)
        if not item:
            return 404, {"error": "File not found."}, {}
        return 200, item["data"], {"Content-Type": item["mime_type"], "X-Content-Type-Options": "nosniff"}

    if method == "GET" and path == "/api/dashboard":
        data = get_dashboard_data(
            city=query.get("city"),
            lat=_parse_float_opt(query.get("lat")),
            lon=_parse_float_opt(query.get("lon")),
        )
        return 200, data, {}

    if method == "GET" and path == "/api/locations/india":
        return 200, get_india_locations_directory(), {}

    if method == "GET" and path == "/api/air-quality":
        data = get_air_quality_data(
            city=query.get("city"),
            lat=_parse_float_opt(query.get("lat")),
            lon=_parse_float_opt(query.get("lon")),
        )
        return 200, data, {}

    if method == "GET" and path == "/api/air-quality/forecast":
        data = get_forecast_data(
            city=query.get("city"),
            lat=_parse_float_opt(query.get("lat")),
            lon=_parse_float_opt(query.get("lon")),
        )
        return 200, data, {}

    if method == "GET" and path == "/api/air-quality/history":
        data = get_reports_data(
            city=query.get("city"),
            period=query.get("period") or "daily",
            lat=_parse_float_opt(query.get("lat")),
            lon=_parse_float_opt(query.get("lon")),
            start_date=query.get("start_date"),
            end_date=query.get("end_date"),
        )
        return 200, data, {}

    if method == "GET" and path == "/api/insights":
        data = get_insights_data(
            city=query.get("city"),
            lat=_parse_float_opt(query.get("lat")),
            lon=_parse_float_opt(query.get("lon")),
        )
        return 200, data, {}

    if method == "GET" and path == "/api/insights/time-machine":
        data = get_time_machine_data(
            city=query.get("city"),
            lat=_parse_float_opt(query.get("lat")),
            lon=_parse_float_opt(query.get("lon")),
            target_date=query.get("target_date"),
            compare_date=query.get("compare_date"),
            start_date=query.get("start_date"),
            end_date=query.get("end_date"),
            period=query.get("period"),
            time_slot=query.get("time_slot"),
        )
        return 200, data, {}

    if method == "GET" and path == "/api/insights/event-replay":
        data = get_pollution_event_replay(
            city=query.get("city"),
            lat=_parse_float_opt(query.get("lat")),
            lon=_parse_float_opt(query.get("lon")),
            start_date=query.get("start_date"),
            end_date=query.get("end_date"),
            pollutant=query.get("pollutant") or "pm2_5",
            threshold_pct=_parse_float_opt(query.get("threshold_pct")) or 35.0,
            baseline_method=query.get("baseline_method") or "median",
            window_hours=_parse_int_opt(query.get("window_hours")) or 12,
            case_id=_parse_int_opt(query.get("case_id")),
        )
        return 200, data, {}

    if method == "POST" and path == "/api/insights/event-replay/explain":
        explanation = explain_event_replay(json_body or {})
        return 200, {"explanation": explanation}, {}

    if method == "POST" and path == "/api/insights/event-replay/pdf":
        filename, pdf_bytes = generate_event_replay_pdf(json_body or {})
        return (
            200,
            pdf_bytes,
            {
                "Content-Type": "application/pdf",
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )

    if method == "POST" and path == "/api/insights/simulate":
        body = json_body or {}
        result = simulate_what_if(
            city=body.get("city"),
            lat=_parse_float_opt(body.get("lat")),
            lon=_parse_float_opt(body.get("lon")),
            traffic_reduction_pct=float(body.get("traffic_reduction_pct") or 0),
            dust_control_pct=float(body.get("dust_control_pct") or 0),
            greenery_increase_pct=float(body.get("greenery_increase_pct") or 0),
            burning_reduction_pct=float(body.get("burning_reduction_pct") or 0),
            industrial_reduction_pct=float(body.get("industrial_reduction_pct") or 0),
        )
        return 200, result, {}

    if method == "GET" and path == "/api/routes":
        data = get_clean_routes(
            origin=str(query.get("origin") or ""),
            destination=str(query.get("destination") or ""),
            mode=str(query.get("mode") or "walking"),
            escape_mode=_parse_bool(query.get("escape_mode")),
        )
        return 200, data, {}

    if method == "GET" and path == "/api/alerts":
        data = get_alerts_data(
            city=query.get("city"),
            lat=_parse_float_opt(query.get("lat")),
            lon=_parse_float_opt(query.get("lon")),
        )
        return 200, data, {}

    if method == "GET" and path == "/api/reports":
        data = get_reports_data(
            city=query.get("city"),
            period=query.get("period") or "daily",
            lat=_parse_float_opt(query.get("lat")),
            lon=_parse_float_opt(query.get("lon")),
            start_date=query.get("start_date"),
            end_date=query.get("end_date"),
        )
        return 200, data, {}

    if method == "GET" and path == "/api/reports/export":
        filename, csv_text = export_reports_csv(
            city=query.get("city"),
            period=query.get("period") or "daily",
            start_date=query.get("start_date"),
            end_date=query.get("end_date"),
        )
        return (
            200,
            csv_text.encode("utf-8"),
            {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )

    if method == "GET" and path == "/api/community/reports":
        return (
            200,
            {
                "categories": COMMUNITY_CATEGORIES,
                "statuses": REPORT_STATUSES,
                "contribution_summary": get_community_contribution_summary(),
                "reports": list_community_reports(
                    status=query.get("status"),
                    category=query.get("category"),
                    search=query.get("search"),
                ),
            },
            {},
        )

    if method == "POST" and path == "/api/community/report":
        body: Dict[str, Any] = form_fields if is_multipart else (json_body or {})
        file_bytes: Optional[bytes] = None
        orig_name: Optional[str] = None
        if is_multipart and "photo" in files:
            file_bytes, orig_name = files["photo"]
        elif not is_multipart and body.get("photo_base64"):
            file_bytes = _decode_base64_field(body.get("photo_base64"))
            orig_name = body.get("photo_name")
        created = create_community_report(
            title=str(body.get("title") or ""),
            description=str(body.get("description") or ""),
            category=str(body.get("category") or ""),
            location_name=str(body.get("location_name") or ""),
            latitude=_parse_float_opt(body.get("latitude")),
            longitude=_parse_float_opt(body.get("longitude")),
            file_bytes=file_bytes,
            original_filename=orig_name,
            auth_token=auth_token,
        )
        return 201, {"message": "Community report submitted successfully.", "report": created}, {}

    m_rep_status = re.fullmatch(r"/api/community/reports/(\d+)/status", path)
    if m_rep_status and method in ("PUT", "PATCH"):
        report_id = int(m_rep_status.group(1))
        updated = update_community_report_status(report_id, str((json_body or {}).get("status") or ""))
        return 200, {"report": updated}, {}

    if method == "GET" and path == "/api/greensteps":
        return 200, get_greensteps_dashboard(auth_token), {}

    m_gs_start = re.fullmatch(r"/api/greensteps/tasks/(\d+)/start", path)
    if m_gs_start and method == "POST":
        return 200, start_green_task(int(m_gs_start.group(1)), auth_token), {}

    m_gs_complete = re.fullmatch(r"/api/greensteps/tasks/(\d+)/complete", path)
    if m_gs_complete and method == "POST":
        task_id = int(m_gs_complete.group(1))
        body = form_fields if is_multipart else (json_body or {})
        file_bytes = None
        orig_name = None
        if is_multipart and "proof" in files:
            file_bytes, orig_name = files["proof"]
        elif not is_multipart and body.get("proof_base64"):
            file_bytes = _decode_base64_field(body.get("proof_base64"))
            orig_name = body.get("proof_name")
        result = complete_green_task(
            task_id=task_id,
            declaration=str(body.get("declaration") or ""),
            file_bytes=file_bytes,
            original_filename=orig_name,
            auth_token=auth_token,
        )
        return 200, result, {}

    m_gs_claim = re.fullmatch(r"/api/greensteps/rewards/([^/]+)/claim", path)
    if m_gs_claim and method == "POST":
        code = urllib.parse.unquote(m_gs_claim.group(1))
        return 200, claim_green_reward(code, auth_token), {}

    if method == "POST" and path == "/api/greensteps/estimate":
        body = json_body or {}
        result = estimate_environmental_impact(
            activity=str(body.get("activity") or "walking_vs_car"),
            quantity=float(body.get("quantity") if body.get("quantity") is not None else 3),
            frequency=str(body.get("frequency") or "daily"),
        )
        return 200, result, {}

    m_gs_review = re.fullmatch(r"/api/greensteps/admin/submissions/(\d+)/review", path)
    if m_gs_review and method == "POST":
        body = json_body or {}
        result = review_green_task_submission(
            submission_id=int(m_gs_review.group(1)),
            decision=str(body.get("decision") or ""),
            notes=str(body.get("notes") or ""),
            auth_token=auth_token,
        )
        return 200, result, {}

    if method == "POST" and path == "/api/auth/login":
        body = json_body or {}
        return 200, login_user(str(body.get("email") or ""), str(body.get("password") or "")), {}

    if method == "POST" and path == "/api/auth/register":
        body = json_body or {}
        result = register_user(
            str(body.get("name") or ""),
            str(body.get("email") or ""),
            str(body.get("password") or ""),
            str(body.get("preferred_city") or "Mumbai"),
        )
        return 201, result, {}

    if method == "POST" and path == "/api/auth/logout":
        return 200, logout_user(auth_token), {}

    if method == "GET" and path == "/api/auth/me":
        return 200, get_auth_session(auth_token), {}

    if method == "GET" and path == "/api/profile":
        return 200, get_profile_bundle(auth_token), {}

    if method == "PUT" and path == "/api/profile":
        updated = update_profile_bundle(json_body or {}, auth_token)
        return 200, {"message": "Settings saved successfully.", **updated}, {}

    if method == "GET" and path == "/api/air-twin":
        return 200, get_air_twin_data(True, auth_token), {}

    if method == "POST" and path == "/api/air-twin/locations":
        body = json_body or {}
        created = add_personal_location(
            str(body.get("label") or ""),
            str(body.get("city") or ""),
            float(body.get("hours_per_day") or 8.0),
            auth_token,
        )
        return 201, {"message": "Frequent location added.", "location": created}, {}

    m_twin_loc = re.fullmatch(r"/api/air-twin/locations/(\d+)", path)
    if m_twin_loc and method == "DELETE":
        delete_personal_location(int(m_twin_loc.group(1)))
        return 200, {"message": "Location removed."}, {}

    if method == "POST" and path == "/api/air-twin/activities":
        body = json_body or {}
        created = add_personal_activity(
            activity_type=str(body.get("activity_type") or ""),
            location_id=_parse_int_opt(body.get("location_id")),
            hours_per_day=float(body.get("hours_per_day") if body.get("hours_per_day") is not None else 1),
            intensity=str(body.get("intensity") or "Moderate"),
            is_outdoor=bool(body["is_outdoor"]) if "is_outdoor" in body and body["is_outdoor"] is not None else True,
            auth_token=auth_token,
        )
        return 201, {"message": "Daily activity logged.", "activity": created}, {}

    m_twin_act = re.fullmatch(r"/api/air-twin/activities/(\d+)", path)
    if m_twin_act and method == "DELETE":
        delete_personal_activity(int(m_twin_act.group(1)))
        return 200, {"message": "Activity removed."}, {}

    if method == "POST" and path == "/api/air-twin/diary":
        body = json_body or {}
        entry = add_exposure_diary_entry(
            str(body.get("notes") or ""),
            body.get("entry_date"),
            auth_token,
        )
        return 201, {"message": "Exposure diary snapshot logged.", "entry": entry}, {}

    if method == "GET" and path == "/api/air-twin/export":
        filename, csv_text = export_air_twin_csv(auth_token)
        return (
            200,
            csv_text.encode("utf-8"),
            {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )

    if method == "POST" and path == "/api/contact":
        body = json_body or {}
        saved = create_contact_message(
            name=str(body.get("name") or ""),
            email=str(body.get("email") or ""),
            subject=str(body.get("subject") or "General Feedback"),
            message=str(body.get("message") or ""),
        )
        return 201, {"message": "Thank you for contacting VayuMitra.", "ticket": saved}, {}

    return 404, {"error": "Endpoint not found."}, {}


class VayuMitraHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args: Any) -> None:
        pass

    def _send_json(self, status: int, data: Any, extra_headers: Optional[Dict[str, str]] = None) -> None:
        raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        if extra_headers:
            for k, v in extra_headers.items():
                self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(raw)

    def _send_bytes(self, status: int, raw: bytes, headers: Dict[str, str]) -> None:
        self.send_response(status)
        for k, v in headers.items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(raw)

    def _serve_static(self, req_path: str) -> None:
        rel = "index.html" if req_path == "/" else req_path.lstrip("/")
        frontend_root = FRONTEND_DIR.resolve()
        candidate = (frontend_root / rel).resolve()
        if str(candidate).startswith(str(frontend_root)) and candidate.is_file():
            target = candidate
        else:
            target = frontend_root / "index.html"
        data = target.read_bytes()
        ext = target.suffix.lower()
        ctype = EXTRA_MIME_TYPES.get(ext) or mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        self._send_bytes(200, data, {"Content-Type": ctype})

    def _handle_request(self, method: str) -> None:
        parsed = urllib.parse.urlsplit(self.path)
        req_path = urllib.parse.unquote(parsed.path or "/")
        query_pairs = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
        query = {k: v[0] for k, v in query_pairs.items() if v}

        if method in ("GET", "HEAD") and not req_path.startswith("/api/") and not req_path.startswith("/uploads/"):
            try:
                self._serve_static(req_path)
            except Exception as exc:
                self._send_json(500, {"error": f"Failed to serve static asset: {exc}"})
            return

        content_len = int(self.headers.get("Content-Length") or "0")
        if content_len > 10 * 1024 * 1024:
            self._send_json(413, {"error": "Request payload too large (limit 10 MB)."})
            return

        raw_body = self.rfile.read(content_len) if content_len > 0 else b""
        content_type = str(self.headers.get("Content-Type") or "")
        is_multipart = "multipart/form-data" in content_type.lower()

        json_body: Dict[str, Any] = {}
        form_fields: Dict[str, str] = {}
        files: Dict[str, Tuple[bytes, Optional[str]]] = {}

        try:
            if is_multipart:
                form_fields, files = _parse_multipart(content_type, raw_body)
            elif raw_body:
                try:
                    loaded = json.loads(raw_body.decode("utf-8"))
                    if isinstance(loaded, dict):
                        json_body = loaded
                except Exception:
                    json_body = {}

            status, payload, headers = _dispatch_api(
                method=method,
                path=req_path,
                query=query,
                json_body=json_body,
                form_fields=form_fields,
                files=files,
                is_multipart=is_multipart,
                auth_token=_extract_auth_token(self.headers.get),
            )
            if isinstance(payload, (bytes, bytearray)):
                self._send_bytes(status, bytes(payload), headers)
            else:
                self._send_json(status, payload, headers)
        except HttpError as err:
            self._send_json(err.status, {"error": err.message})
        except Exception as err:
            traceback.print_exc()
            self._send_json(502, {"error": str(err) or "Internal server error."})

    def do_GET(self) -> None:
        self._handle_request("GET")

    def do_HEAD(self) -> None:
        self._handle_request("HEAD")

    def do_POST(self) -> None:
        self._handle_request("POST")

    def do_PUT(self) -> None:
        self._handle_request("PUT")

    def do_PATCH(self) -> None:
        self._handle_request("PATCH")

    def do_DELETE(self) -> None:
        self._handle_request("DELETE")


def _try_run_flask(host: str, port: int) -> bool:
    try:
        from flask import Flask, Response, jsonify, request, send_from_directory
    except ImportError:
        return False

    app = Flask(__name__, static_folder=None)
    app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024

    @app.route("/uploads/<path:filename>", methods=["GET"])
    def serve_upload(filename: str):
        status, payload, headers = _dispatch_api("GET", f"/uploads/{filename}", {}, {}, {}, {}, False, "")
        if isinstance(payload, (bytes, bytearray)):
            return Response(bytes(payload), status=status, headers=headers)
        return jsonify(payload), status

    @app.route("/api/<path:subpath>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
    def handle_api(subpath: str):
        ctype = request.content_type or ""
        is_multi = "multipart/form-data" in ctype.lower()
        fields: Dict[str, str] = {}
        files: Dict[str, Tuple[bytes, Optional[str]]] = {}
        jbody: Dict[str, Any] = {}
        if is_multi:
            fields = {k: v for k, v in request.form.items()}
            for fkey, fobj in request.files.items():
                raw = fobj.read()
                if len(raw) > Config.MAX_UPLOAD_BYTES:
                    return jsonify({"error": "Uploaded photo exceeds the 5 MB size limit."}), 413
                files[fkey] = (raw, fobj.filename)
        else:
            jbody = request.get_json(silent=True) or {}

        query = {k: v for k, v in request.args.items()}
        try:
            status, payload, headers = _dispatch_api(
                method=request.method,
                path=f"/api/{subpath}",
                query=query,
                json_body=jbody,
                form_fields=fields,
                files=files,
                is_multipart=is_multi,
                auth_token=_extract_auth_token(request.headers.get),
            )
            if isinstance(payload, (bytes, bytearray)):
                return Response(bytes(payload), status=status, headers=headers)
            resp = jsonify(payload)
            for hk, hv in headers.items():
                resp.headers[hk] = hv
            return resp, status
        except HttpError as err:
            return jsonify({"error": err.message}), err.status
        except Exception as err:
            traceback.print_exc()
            return jsonify({"error": str(err) or "Internal server error."}), 502

    @app.route("/", defaults={"req_path": ""})
    @app.route("/<path:req_path>")
    def serve_frontend(req_path: str):
        rel = req_path or "index.html"
        target = (FRONTEND_DIR / rel).resolve()
        if str(target).startswith(str(FRONTEND_DIR.resolve())) and target.is_file():
            return send_from_directory(str(FRONTEND_DIR), rel)
        return send_from_directory(str(FRONTEND_DIR), "index.html")

    print(f"VayuMitra Flask server listening on http://{host}:{port}", flush=True)
    app.run(host=host, port=port, threaded=True, use_reloader=False)
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="VayuMitra Python Web Server")
    parser.add_argument("--host", default=Config.HOST, help="Bind host address")
    parser.add_argument("--port", type=int, default=Config.PORT, help="Bind port number")
    parser.add_argument("--stdlib", action="store_true", help="Force built-in Python stdlib HTTP server")
    args = parser.parse_args()

    if not args.stdlib and _try_run_flask(args.host, args.port):
        return

    server = ThreadingHTTPServer((args.host, args.port), VayuMitraHandler)
    print(f"VayuMitra Python server listening on http://{args.host}:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
