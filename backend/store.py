import hashlib
import hmac
import secrets
import threading
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from backend.config import Config

COMMUNITY_CATEGORIES: List[str] = [
    "Smoke and burning",
    "Construction dust",
    "Industrial emissions",
    "Garbage burning",
    "Vehicle-related pollution",
    "Other environmental issues",
]

LEGACY_CATEGORY_MAP: Dict[str, str] = {
    "Garbage dumping": "Other environmental issues",
    "Open burning": "Smoke and burning",
    "Vehicle emissions": "Vehicle-related pollution",
    "Industrial smoke": "Industrial emissions",
    "Smoke emissions": "Smoke and burning",
    "Industrial pollution": "Industrial emissions",
    "Water pollution": "Other environmental issues",
}

REPORT_STATUSES: List[str] = [
    "Submitted",
    "Under Review",
    "Verified",
    "Resolved",
    "Rejected",
]

ACTIVITY_TYPES: List[str] = [
    "Commuting",
    "Outdoor Exercise",
    "Office / Work",
    "Home / Indoor",
    "School / Campus",
    "Market / Errands",
]

GREENSTEPS_TASKS: List[Dict[str, Any]] = [
    {
        "id": 1,
        "slug": "walk_cycle",
        "title": "Walk or Cycle",
        "description": "Prefer walking or cycling for short-distance journeys.",
        "instructions": [
            "Walk or ride a bicycle for short trips (1–4 km) instead of a car or motorbike."
        ],
        "category": "Active Travel",
        "difficulty": "Easy",
        "points": 25,
        "co2_saved_kg": 1.8,
        "requires_admin_review": False,
        "proof_hint": "e.g., Cycled 3 km to market instead of driving",
        "impact_explanation": (
            "Cuts street-level vehicle exhaust and traffic dust while keeping your daily commute active and healthy."
        ),
    },
    {
        "id": 2,
        "slug": "public_transport",
        "title": "Use Public Transport",
        "description": "Choose buses, metro, or local trains instead of private vehicles.",
        "instructions": [
            "Take a metro, suburban rail, or public bus instead of a private cab or car."
        ],
        "category": "Clean Mobility",
        "difficulty": "Medium",
        "points": 40,
        "co2_saved_kg": 2.4,
        "requires_admin_review": False,
        "proof_hint": "e.g., Took metro & bus for 15 km commute",
        "impact_explanation": (
            "Reduces the number of private cars on busy roads, easing congestion and lowering urban NO₂ and particulate smog."
        ),
    },
    {
        "id": 3,
        "slug": "save_electricity",
        "title": "Switch Off Idle Lights & Fans",
        "description": "Power off unused lights, fans, and chargers at home or work.",
        "instructions": [
            "Unplug standby chargers and turn off idle lights or AC in empty rooms for 2+ hours."
        ],
        "category": "Energy",
        "difficulty": "Easy",
        "points": 30,
        "co2_saved_kg": 0.9,
        "requires_admin_review": False,
        "proof_hint": "e.g., Turned off 3 room lights & AC standby for 3 hrs",
        "impact_explanation": (
            "Lowers peak power plant demand, helping reduce regional coal smoke, sulfur emissions, and household energy waste."
        ),
    },
    {
        "id": 4,
        "slug": "plant_trees",
        "title": "Plant or Water a Tree",
        "description": "Care for a sapling, balcony plant, or neighbourhood street tree.",
        "instructions": [
            "Plant a native sapling or water and mulch an existing neighbourhood tree."
        ],
        "category": "Greenery",
        "difficulty": "Medium",
        "points": 50,
        "co2_saved_kg": 2.5,
        "requires_admin_review": False,
        "proof_hint": "e.g., Watered 2 street saplings near park gate",
        "impact_explanation": (
            "Helps trees trap airborne dust, cool nearby streets, and steadily absorb carbon for fresher neighbourhood air."
        ),
    },
    {
        "id": 5,
        "slug": "carpool_rideshare",
        "title": "Carpool or Share a Ride",
        "description": "Share your daily commute with colleagues, classmates, or neighbours.",
        "instructions": [
            "Combine at least one trip by carpooling or sharing an auto/cab with someone heading the same way."
        ],
        "category": "Clean Mobility",
        "difficulty": "Medium",
        "points": 35,
        "co2_saved_kg": 2.1,
        "requires_admin_review": False,
        "proof_hint": "e.g., Shared office commute with 2 colleagues",
        "impact_explanation": (
            "Fewer vehicles per trip means cleaner air along school and office corridors and less fuel burned overall."
        ),
    },
    {
        "id": 6,
        "slug": "compost_zero_burn",
        "title": "Compost Organic Waste (No Burning)",
        "description": "Separate wet kitchen or garden waste for composting instead of burning.",
        "instructions": [
            "Segregate fruit/vegetable peels or dry garden leaves into a compost bin instead of open disposal."
        ],
        "category": "Zero Waste",
        "difficulty": "Easy",
        "points": 30,
        "co2_saved_kg": 1.9,
        "requires_admin_review": False,
        "proof_hint": "e.g., Added kitchen peels and dry leaves to home compost bin",
        "impact_explanation": (
            "Prevents toxic smoke from open leaf/waste burning and turns organic waste into nutrient-rich soil for plants."
        ),
    },
    {
        "id": 7,
        "slug": "reusable_kit",
        "title": "Carry Reusable Bottle & Cloth Bag",
        "description": "Skip single-use plastic bags, bottles, and disposable cups today.",
        "instructions": [
            "Bring your own cloth tote bag and refillable water bottle when stepping out for errands."
        ],
        "category": "Zero Waste",
        "difficulty": "Easy",
        "points": 20,
        "co2_saved_kg": 0.7,
        "requires_admin_review": False,
        "proof_hint": "e.g., Used cloth bag at grocery market and steel water bottle",
        "impact_explanation": (
            "Keeps plastic litter out of drains and landfills where plastics often end up burned and release harmful fumes."
        ),
    },
    {
        "id": 8,
        "slug": "no_idling_air_check",
        "title": "Zero Engine Idling & Tyre Check",
        "description": "Turn off the engine at red lights (>20s) and keep tyres properly inflated.",
        "instructions": [
            "Switch off your vehicle engine at long traffic signals or waiting zones and verify tyre pressure."
        ],
        "category": "Energy",
        "difficulty": "High",
        "points": 45,
        "co2_saved_kg": 2.2,
        "requires_admin_review": False,
        "proof_hint": "e.g., Turned off engine at 4 signals and topped up tyre air",
        "impact_explanation": (
            "Stops unnecessary exhaust buildup at busy intersections, protecting pedestrians and commuters from concentrated fumes."
        ),
    },
]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def hash_password(password: str, salt: Optional[bytes] = None) -> Tuple[str, str]:
    salt_bytes = salt if salt is not None else secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", str(password).encode("utf-8"), salt_bytes, 100_000)
    return salt_bytes.hex(), digest.hex()


def verify_password(password: str, pw_hash: str, pw_salt: str) -> bool:
    if not pw_hash or not pw_salt:
        return False
    try:
        salt_bytes = bytes.fromhex(pw_salt)
        expected = hashlib.pbkdf2_hmac("sha256", str(password).encode("utf-8"), salt_bytes, 100_000).hex()
        return hmac.compare_digest(bytes.fromhex(expected), bytes.fromhex(pw_hash))
    except Exception:
        return False


class MemoryStore:
    def __init__(self) -> None:
        self.lock = threading.RLock()
        self.profiles: List[Dict[str, Any]] = []
        self.preferences: Dict[int, Dict[str, Any]] = {}
        self.notifications: Dict[int, Dict[str, Any]] = {}
        self.readings: List[Dict[str, Any]] = []
        self.alerts: List[Dict[str, Any]] = []
        self.reports: List[Dict[str, Any]] = []
        self.personal_locations: List[Dict[str, Any]] = []
        self.personal_activities: List[Dict[str, Any]] = []
        self.exposure_diary: List[Dict[str, Any]] = []
        self.contact_messages: List[Dict[str, Any]] = []
        self.sessions: Dict[str, Dict[str, Any]] = {}
        self.uploads: Dict[str, Dict[str, Any]] = {}
        self.green_tasks: List[Dict[str, Any]] = [dict(t) for t in GREENSTEPS_TASKS]
        self.user_green_tasks: List[Dict[str, Any]] = []
        self.green_transactions: List[Dict[str, Any]] = []
        self.green_reward_claims: List[Dict[str, Any]] = []

        self._next_ids: Dict[str, int] = {
            "profile": 1,
            "reading": 1,
            "alert": 1,
            "report": 1,
            "location": 1,
            "activity": 1,
            "diary": 1,
            "contact": 1,
            "greenTaskProgress": 1,
            "greenTx": 1,
            "greenReward": 1,
        }
        self._seed()

    def next_id(self, key: str) -> int:
        with self.lock:
            val = self._next_ids[key]
            self._next_ids[key] = val + 1
            return val

    def _seed(self) -> None:
        now = utc_now_iso()
        salt_hex, hash_hex = hash_password("vayumitra123")
        pid = self.next_id("profile")
        self.profiles.append(
            {
                "id": pid,
                "name": "Aarav Sharma",
                "email": "aarav@vayumitra.in",
                "role": "admin",
                "bio": "Environmental observer and GreenSteps verification coordinator.",
                "preferred_city": Config.DEFAULT_CITY,
                "preferred_lat": 19.076,
                "preferred_lon": 72.8777,
                "password_hash": hash_hex,
                "password_salt": salt_hex,
                "created_at": now,
                "updated_at": now,
            }
        )
        self.preferences[pid] = {
            "profile_id": pid,
            "default_city": Config.DEFAULT_CITY,
            "auto_detect_location": False,
            "temp_unit": "C",
            "pollutant_unit": "ugm3",
            "aqi_standard": "NAQI",
            "share_location": True,
            "anonymous_reports": False,
            "updated_at": now,
        }
        self.notifications[pid] = {
            "profile_id": pid,
            "enabled": True,
            "aqi_warnings": True,
            "location_alerts": True,
            "aqi_threshold": 100,
            "pm25_threshold": 35.0,
            "browser_notifications": False,
            "updated_at": now,
        }

        seeded_reports = [
            {
                "report_code": "VM-INDIA-101",
                "profile_id": pid,
                "title": "Heavy smoke from construction site",
                "description": "Visible dust and diesel generator smoke near metro pillar corridor affecting pedestrians.",
                "category": "Construction dust",
                "location_name": "MG Road, Bengaluru",
                "latitude": 12.9756,
                "longitude": 77.6066,
                "status": "Under Review",
                "created_at": now,
                "updated_at": now,
            },
            {
                "report_code": "VM-INDIA-102",
                "profile_id": pid,
                "title": "Open garbage burning near flyover",
                "description": "Piles of mixed waste burning along the service lane producing dense acrid smoke.",
                "category": "Garbage burning",
                "location_name": "Andheri East, Mumbai",
                "latitude": 19.1136,
                "longitude": 72.8697,
                "status": "Verified",
                "created_at": now,
                "updated_at": now,
            },
            {
                "report_code": "VM-INDIA-103",
                "profile_id": pid,
                "title": "Heavy traffic exhaust congestion",
                "description": "Long peak-hour idling of heavy commercial vehicles creating high particulate levels.",
                "category": "Vehicle-related pollution",
                "location_name": "ITO Junction, Delhi",
                "latitude": 28.6289,
                "longitude": 77.2416,
                "status": "Verified",
                "created_at": now,
                "updated_at": now,
            },
            {
                "report_code": "VM-INDIA-104",
                "profile_id": pid,
                "title": "Factory chimney smoke plume",
                "description": "Dark smoke observed emitting continuously from nearby industrial estate shed.",
                "category": "Industrial emissions",
                "location_name": "Pimpri-Chinchwad, Pune",
                "latitude": 18.6298,
                "longitude": 73.7997,
                "status": "Under Review",
                "created_at": now,
                "updated_at": now,
            },
            {
                "report_code": "VM-INDIA-105",
                "profile_id": pid,
                "title": "Uncovered road widening dust",
                "description": "Dry soil and gravel left uncovered along busy intersection causing thick dust clouds.",
                "category": "Construction dust",
                "location_name": "T. Nagar, Chennai",
                "latitude": 13.0418,
                "longitude": 80.2341,
                "status": "Resolved",
                "created_at": now,
                "updated_at": now,
            },
            {
                "report_code": "VM-INDIA-106",
                "profile_id": pid,
                "title": "Evening dry leaf and brush burning",
                "description": "Multiple small bonfires of dry garden leaves lowering visibility in residential block.",
                "category": "Smoke and burning",
                "location_name": "Mansarovar, Jaipur",
                "latitude": 26.8505,
                "longitude": 75.7628,
                "status": "Submitted",
                "created_at": now,
                "updated_at": now,
            },
            {
                "report_code": "VM-INDIA-107",
                "profile_id": pid,
                "title": "Roadside plastic and packaging burning",
                "description": "Discarded plastic wrappers and packaging burnt near market loading bay late evening.",
                "category": "Garbage burning",
                "location_name": "Salt Lake Sector V, Kolkata",
                "latitude": 22.5735,
                "longitude": 88.4331,
                "status": "Verified",
                "created_at": now,
                "updated_at": now,
            },
            {
                "report_code": "VM-INDIA-108",
                "profile_id": pid,
                "title": "Diesel truck idling near logistics hub",
                "description": "Long queue of freight trucks idling along outer ring feeder road during morning peak.",
                "category": "Vehicle-related pollution",
                "location_name": "HITEC City, Hyderabad",
                "latitude": 17.4435,
                "longitude": 78.3772,
                "status": "Under Review",
                "created_at": now,
                "updated_at": now,
            },
            {
                "report_code": "VM-INDIA-109",
                "profile_id": pid,
                "title": "Unfiltered boiler smoke from textile unit",
                "description": "Thick grey smoke drifting across nearby residential lanes from industrial boiler stack.",
                "category": "Industrial emissions",
                "location_name": "Naroda GIDC, Ahmedabad",
                "latitude": 23.0764,
                "longitude": 72.6626,
                "status": "Verified",
                "created_at": now,
                "updated_at": now,
            },
            {
                "report_code": "VM-INDIA-110",
                "profile_id": pid,
                "title": "Demolition debris and cement dust",
                "description": "Old commercial building demolition operating without water misting or green barrier cloth.",
                "category": "Construction dust",
                "location_name": "Gomti Nagar, Lucknow",
                "latitude": 26.8542,
                "longitude": 81.0052,
                "status": "Submitted",
                "created_at": now,
                "updated_at": now,
            },
            {
                "report_code": "VM-INDIA-111",
                "profile_id": pid,
                "title": "Foul chemical odor near backwater canal",
                "description": "Strong chemical smell and localized haze reported near canal bridge after midnight.",
                "category": "Other environmental issues",
                "location_name": "Edappally, Kochi",
                "latitude": 10.0261,
                "longitude": 76.3125,
                "status": "Resolved",
                "created_at": now,
                "updated_at": now,
            },
        ]

        sample_svgs = {
            "sample-construction-dust.svg": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 380"><defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fde68a"/><stop offset="100%" stop-color="#d97706"/></linearGradient></defs><rect width="640" height="380" fill="url(#g1)"/><rect y="275" width="640" height="105" fill="#78350f"/><path d="M90 275 L90 110 L260 110 L260 140 L125 140 L125 275 Z" fill="#334155"/><circle cx="240" cy="235" r="46" fill="#fef3c7" opacity="0.55"/><circle cx="310" cy="220" r="62" fill="#fef3c7" opacity="0.48"/><circle cx="400" cy="240" r="54" fill="#fde68a" opacity="0.55"/><rect x="18" y="18" width="252" height="30" rx="15" fill="#10343b" opacity="0.88"/><text x="32" y="38" fill="#ffffff" font-family="sans-serif" font-size="13" font-weight="700">SAMPLE INCIDENT ILLUSTRATION</text><text x="32" y="348" fill="#fef3c7" font-family="sans-serif" font-size="16" font-weight="700">Unshielded Construction Dust Plume</text></svg>',
            "sample-garbage-smoke.svg": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 380"><defs><linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#cbd5e1"/><stop offset="100%" stop-color="#475569"/></linearGradient></defs><rect width="640" height="380" fill="url(#g2)"/><rect y="280" width="640" height="100" fill="#1e293b"/><path d="M270 280 Q290 230 320 280 Q340 235 370 280 Z" fill="#ef4444"/><path d="M295 280 Q315 245 340 280 Z" fill="#facc15"/><circle cx="315" cy="195" r="44" fill="#334155" opacity="0.65"/><circle cx="345" cy="145" r="58" fill="#475569" opacity="0.55"/><circle cx="385" cy="100" r="66" fill="#64748b" opacity="0.45"/><rect x="18" y="18" width="252" height="30" rx="15" fill="#10343b" opacity="0.88"/><text x="32" y="38" fill="#ffffff" font-family="sans-serif" font-size="13" font-weight="700">SAMPLE INCIDENT ILLUSTRATION</text><text x="32" y="348" fill="#f1f5f9" font-family="sans-serif" font-size="16" font-weight="700">Open Waste Burning Smoke Corridor</text></svg>',
            "sample-traffic-exhaust.svg": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 380"><defs><linearGradient id="g3" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#bae6fd"/><stop offset="100%" stop-color="#94a3b8"/></linearGradient></defs><rect width="640" height="380" fill="url(#g3)"/><rect y="250" width="640" height="130" fill="#334155"/><line x1="20" y1="315" x2="620" y2="315" stroke="#fde047" stroke-width="5" stroke-dasharray="28 20"/><rect x="110" y="215" width="140" height="58" rx="10" fill="#0f766e"/><rect x="330" y="205" width="175" height="68" rx="10" fill="#ea580c"/><circle cx="145" cy="276" r="14" fill="#0f172a"/><circle cx="220" cy="276" r="14" fill="#0f172a"/><circle cx="370" cy="276" r="15" fill="#0f172a"/><circle cx="470" cy="276" r="15" fill="#0f172a"/><ellipse cx="75" cy="245" rx="34" ry="20" fill="#e2e8f0" opacity="0.72"/><rect x="18" y="18" width="252" height="30" rx="15" fill="#10343b" opacity="0.88"/><text x="32" y="38" fill="#ffffff" font-family="sans-serif" font-size="13" font-weight="700">SAMPLE INCIDENT ILLUSTRATION</text><text x="32" y="356" fill="#f8fafc" font-family="sans-serif" font-size="16" font-weight="700">Peak-Hour Traffic Exhaust Congestion</text></svg>',
            "sample-industrial-plume.svg": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 380"><defs><linearGradient id="g4" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fed7aa"/><stop offset="100%" stop-color="#64748b"/></linearGradient></defs><rect width="640" height="380" fill="url(#g4)"/><rect y="275" width="640" height="105" fill="#1e293b"/><rect x="120" y="185" width="220" height="90" fill="#475569"/><rect x="155" y="110" width="28" height="75" fill="#334155"/><rect x="245" y="95" width="32" height="90" fill="#334155"/><circle cx="195" cy="82" r="32" fill="#f8fafc" opacity="0.65"/><circle cx="295" cy="68" r="42" fill="#e2e8f0" opacity="0.65"/><circle cx="365" cy="58" r="48" fill="#cbd5e1" opacity="0.52"/><rect x="18" y="18" width="252" height="30" rx="15" fill="#10343b" opacity="0.88"/><text x="32" y="38" fill="#ffffff" font-family="sans-serif" font-size="13" font-weight="700">SAMPLE INCIDENT ILLUSTRATION</text><text x="32" y="348" fill="#f8fafc" font-family="sans-serif" font-size="16" font-weight="700">Industrial Stack Plume Observation</text></svg>',
        }
        for fname, svg_text in sample_svgs.items():
            self.uploads[fname] = {
                "mime_type": "image/svg+xml",
                "data": svg_text.encode("utf-8"),
            }

        report_photo_by_code = {
            "VM-INDIA-101": "sample-construction-dust.svg",
            "VM-INDIA-102": "sample-garbage-smoke.svg",
            "VM-INDIA-103": "sample-traffic-exhaust.svg",
            "VM-INDIA-104": "sample-industrial-plume.svg",
            "VM-INDIA-105": "sample-construction-dust.svg",
            "VM-INDIA-107": "sample-garbage-smoke.svg",
            "VM-INDIA-108": "sample-traffic-exhaust.svg",
            "VM-INDIA-109": "sample-industrial-plume.svg",
        }
        for r in seeded_reports:
            sample_file = report_photo_by_code.get(r["report_code"])
            sample_bytes = len(self.uploads[sample_file]["data"]) if sample_file else None
            row = dict(r)
            row.update(
                {
                    "id": self.next_id("report"),
                    "stored_filename": sample_file,
                    "original_filename": sample_file,
                    "mime_type": "image/svg+xml" if sample_file else None,
                    "file_size": sample_bytes,
                }
            )
            self.reports.append(row)

        priya_salt, priya_hash = hash_password("vayumitra123")
        priya_id = self.next_id("profile")
        self.profiles.append(
            {
                "id": priya_id,
                "name": "Priya Nair",
                "email": "priya@vayumitra.in",
                "role": "citizen",
                "bio": "Daily metro commuter and urban gardening volunteer.",
                "preferred_city": "Bengaluru",
                "preferred_lat": 12.9716,
                "preferred_lon": 77.5946,
                "password_hash": priya_hash,
                "password_salt": priya_salt,
                "created_at": now,
                "updated_at": now,
            }
        )
        self.preferences[priya_id] = {
            "profile_id": priya_id,
            "default_city": "Bengaluru",
            "auto_detect_location": False,
            "temp_unit": "C",
            "pollutant_unit": "ugm3",
            "aqi_standard": "NAQI",
            "share_location": True,
            "anonymous_reports": False,
            "updated_at": now,
        }
        self.notifications[priya_id] = {
            "profile_id": priya_id,
            "enabled": True,
            "aqi_warnings": True,
            "location_alerts": True,
            "aqi_threshold": 100,
            "pm25_threshold": 35.0,
            "browser_notifications": False,
            "updated_at": now,
        }

        rohan_salt, rohan_hash = hash_password("vayumitra123")
        rohan_id = self.next_id("profile")
        self.profiles.append(
            {
                "id": rohan_id,
                "name": "Rohan Mehta",
                "email": "rohan@vayumitra.in",
                "role": "citizen",
                "bio": "Cyclist and neighbourhood zero-burn advocate.",
                "preferred_city": "Delhi",
                "preferred_lat": 28.6139,
                "preferred_lon": 77.209,
                "password_hash": rohan_hash,
                "password_salt": rohan_salt,
                "created_at": now,
                "updated_at": now,
            }
        )
        self.preferences[rohan_id] = {
            "profile_id": rohan_id,
            "default_city": "Delhi",
            "auto_detect_location": False,
            "temp_unit": "C",
            "pollutant_unit": "ugm3",
            "aqi_standard": "NAQI",
            "share_location": True,
            "anonymous_reports": False,
            "updated_at": now,
        }
        self.notifications[rohan_id] = {
            "profile_id": rohan_id,
            "enabled": True,
            "aqi_warnings": True,
            "location_alerts": True,
            "aqi_threshold": 100,
            "pm25_threshold": 35.0,
            "browser_notifications": False,
            "updated_at": now,
        }

        def days_ago_iso(days_ago: int) -> str:
            return (datetime.now(timezone.utc) - timedelta(days=days_ago)).replace(microsecond=0).isoformat()

        def seed_approved(profile_id: int, task_id: int, declaration: str, reviewer: str, days_ago: int = 0) -> None:
            task = next((t for t in self.green_tasks if t["id"] == task_id), None)
            if not task:
                return
            stamp = days_ago_iso(days_ago)
            date_str = stamp[:10]
            sub_id = self.next_id("greenTaskProgress")
            self.user_green_tasks.append(
                {
                    "id": sub_id,
                    "profile_id": profile_id,
                    "task_id": task_id,
                    "status": "approved",
                    "declaration": declaration,
                    "proof_filename": None,
                    "proof_original_name": None,
                    "proof_mime": None,
                    "proof_size": None,
                    "completed_date": date_str,
                    "co2_saved_kg": task["co2_saved_kg"],
                    "started_at": stamp,
                    "submitted_at": stamp,
                    "reviewed_at": stamp,
                    "reviewed_by": reviewer,
                    "reviewer_notes": "Verified completion.",
                    "points_awarded": task["points"],
                    "updated_at": stamp,
                }
            )
            self.green_transactions.append(
                {
                    "id": self.next_id("greenTx"),
                    "profile_id": profile_id,
                    "task_id": task_id,
                    "submission_id": sub_id,
                    "tx_type": "task_reward",
                    "title": f"Completed: {task['title']}",
                    "points": task["points"],
                    "created_at": stamp,
                }
            )

        seed_approved(pid, 2, "Used metro and bus instead of driving.", "Verified Action", 0)
        seed_approved(pid, 3, "Switched off idle lights and fans.", "Verified Action", 1)
        seed_approved(pid, 4, "Watered neighbourhood tree sapling.", "Verified Action", 2)

        seed_approved(priya_id, 2, "Commuted via Namma Metro.", "Verified Action", 0)
        seed_approved(priya_id, 3, "Switched off idle office monitors and fans.", "Verified Action", 1)
        seed_approved(priya_id, 4, "Planted a Neem sapling.", "Verified Action", 2)

        seed_approved(rohan_id, 1, "Cycled 3 km along Lodhi Road.", "Verified Action", 0)
        seed_approved(rohan_id, 3, "Powered off idle home appliances.", "Verified Action", 1)

    def resolve_profile(self, auth_token: Optional[str] = None) -> Dict[str, Any]:
        authed = self.resolve_authenticated_profile(auth_token)
        if authed is not None:
            return authed
        return self.profiles[0]

    def resolve_authenticated_profile(self, auth_token: Optional[str] = None) -> Optional[Dict[str, Any]]:
        if auth_token and auth_token.strip():
            sess = self.sessions.get(auth_token.strip())
            if sess and sess["expires_at"] > utc_now_iso():
                for p in self.profiles:
                    if p["id"] == sess["profile_id"]:
                        return p
        return None


db = MemoryStore()
