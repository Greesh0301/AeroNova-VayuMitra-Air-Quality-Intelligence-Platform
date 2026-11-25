import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from backend.air_quality import HttpError
from backend.config import Config
from backend.store import db, utc_now_iso

GREENSTEPS_REWARDS: List[Dict[str, Any]] = [
    {
        "code": "bronze_eco_starter",
        "title": "Bronze Eco Starter Award",
        "description": "Unlocks at 50 Green Points for building consistent eco-friendly daily habits.",
        "required_points": 50,
        "required_level": "Bronze",
        "reward_type": "Digital Badge",
    },
    {
        "code": "clean_commuter_reward",
        "title": "Clean-Air Commuter Recognition",
        "description": "Awarded at 100 Green Points for choosing walking, cycling, and public transport.",
        "required_points": 100,
        "required_level": "Bronze",
        "reward_type": "Eco Recognition",
    },
    {
        "code": "silver_action_champion",
        "title": "Silver Sustainable Action Champion",
        "description": "Milestone recognition at 120 Green Points across travel, energy, and greenery.",
        "required_points": 120,
        "required_level": "Silver",
        "reward_type": "Milestone Reward",
    },
    {
        "code": "gold_planet_steward",
        "title": "Gold Green Steps Steward",
        "description": "Top sustainability award unlocked at 210+ Green Points.",
        "required_points": 210,
        "required_level": "Gold",
        "reward_type": "Milestone Reward",
    },
]


def detect_image_type(buf: bytes) -> Optional[str]:
    if len(buf) >= 8 and buf[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if len(buf) >= 3 and buf[0:3] == b"\xff\xd8\xff":
        return "jpg"
    if len(buf) >= 12 and buf[:4] == b"RIFF" and buf[8:12] == b"WEBP":
        return "webp"
    return None


def compute_green_level(points: int) -> Dict[str, Any]:
    if points >= 210:
        return {"level": "Gold", "next_level": "Max Level", "points_to_next": 0}
    if points >= 120:
        return {"level": "Silver", "next_level": "Gold", "points_to_next": 210 - points}
    if points >= 50:
        return {"level": "Bronze", "next_level": "Silver", "points_to_next": 120 - points}
    return {"level": "Starter", "next_level": "Bronze", "points_to_next": 50 - points}


def _get_user_points_total(profile_id: int) -> int:
    return sum(tx["points"] for tx in db.green_transactions if tx["profile_id"] == profile_id)


def _award_task_points_once(profile: Dict[str, Any], task: Dict[str, Any], submission_id: int) -> int:
    already_rewarded = any(
        tx["profile_id"] == profile["id"]
        and tx["task_id"] == task["id"]
        and tx["tx_type"] == "task_reward"
        for tx in db.green_transactions
    )
    if already_rewarded:
        return 0
    db.green_transactions.append(
        {
            "id": db.next_id("greenTx"),
            "profile_id": profile["id"],
            "task_id": task["id"],
            "submission_id": submission_id,
            "tx_type": "task_reward",
            "title": f"Completed: {task['title']}",
            "points": task["points"],
            "created_at": utc_now_iso(),
        }
    )
    return task["points"]


def _date_offset_iso_day(days_ago: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days_ago)).strftime("%Y-%m-%d")


def _format_short_day(iso_day: str) -> str:
    return datetime.strptime(iso_day, "%Y-%m-%d").strftime("%a")


def _compute_streak_and_weekly_progress(profile_id: Optional[int]) -> Dict[str, Any]:
    approved_rows = (
        [u for u in db.user_green_tasks if u["profile_id"] == profile_id and u["status"] == "approved"]
        if profile_id
        else []
    )
    active_dates = {
        (r["completed_date"] or (r["submitted_at"] or r["updated_at"])[:10])
        for r in approved_rows
    }

    streak_days = 0
    today_str = _date_offset_iso_day(0)
    start_offset = 0 if today_str in active_dates else 1
    for offset in range(start_offset, 60):
        day_str = _date_offset_iso_day(offset)
        if day_str in active_dates:
            streak_days += 1
        else:
            break

    weekly_progress: List[Dict[str, Any]] = []
    for offset in range(6, -1, -1):
        day_str = _date_offset_iso_day(offset)
        day_rows = [
            r
            for r in approved_rows
            if (r["completed_date"] or (r["submitted_at"] or r["updated_at"])[:10]) == day_str
        ]
        weekly_progress.append(
            {
                "date": day_str,
                "day_label": _format_short_day(day_str),
                "tasks_completed": len(day_rows),
                "points_earned": sum(r["points_awarded"] for r in day_rows),
                "co2_saved_kg": round(sum(r.get("co2_saved_kg") or 0 for r in day_rows), 2),
                "is_today": offset == 0,
            }
        )

    weekly_active_days = sum(1 for d in weekly_progress if d["tasks_completed"] > 0)
    weekly_tasks_count = sum(d["tasks_completed"] for d in weekly_progress)
    weekly_points = sum(d["points_earned"] for d in weekly_progress)
    total_co2_saved_kg = round(sum(r.get("co2_saved_kg") or 0 for r in approved_rows), 2)

    return {
        "streak_days": streak_days,
        "weekly_progress": weekly_progress,
        "weekly_active_days": weekly_active_days,
        "weekly_tasks_count": weekly_tasks_count,
        "weekly_points": weekly_points,
        "total_co2_saved_kg": total_co2_saved_kg,
    }


def _build_user_badges(profile_id: Optional[int], total_points: int, streak_days: int) -> List[Dict[str, Any]]:
    user_progress = [u for u in db.user_green_tasks if u["profile_id"] == profile_id] if profile_id else []
    approved_ids = {u["task_id"] for u in user_progress if u["status"] == "approved"}

    return [
        {
            "code": "first_step",
            "title": "First Green Step",
            "description": "Complete your first daily green challenge.",
            "tier": "Bronze",
            "medal": "bronze",
            "earned": len(approved_ids) >= 1,
        },
        {
            "code": "streak_3",
            "title": "3-Day Streak Medal",
            "description": "Complete eco-friendly activities for 3 consecutive days.",
            "tier": "Silver",
            "medal": "silver",
            "earned": streak_days >= 3,
        },
        {
            "code": "green_commuter",
            "title": "Clean Commuter Medal",
            "description": "Complete Walk/Cycle and Public Transport.",
            "tier": "Silver",
            "medal": "silver",
            "earned": 1 in approved_ids and 2 in approved_ids,
        },
        {
            "code": "tree_caretaker",
            "title": "Tree Guardian Medal",
            "description": "Complete the Plant or Water a Tree challenge.",
            "tier": "Bronze",
            "medal": "bronze",
            "earned": 4 in approved_ids,
        },
        {
            "code": "energy_saver",
            "title": "Energy Saver Medal",
            "description": "Switch off idle lights & fans.",
            "tier": "Bronze",
            "medal": "bronze",
            "earned": 3 in approved_ids,
        },
        {
            "code": "zero_waste_hero",
            "title": "Zero Waste Medal",
            "description": "Complete both Composting and Reusable Kit tasks.",
            "tier": "Silver",
            "medal": "silver",
            "earned": 6 in approved_ids and 7 in approved_ids,
        },
        {
            "code": "silver_tier",
            "title": "Eco Warrior Medal",
            "description": "Reach 120+ Green Points.",
            "tier": "Silver",
            "medal": "silver",
            "earned": total_points >= 120,
        },
        {
            "code": "gold_tier",
            "title": "Eco Champion Gold",
            "description": "Complete all 8 daily green challenges.",
            "tier": "Gold",
            "medal": "gold",
            "earned": len(approved_ids) >= 8,
        },
    ]


def get_greensteps_dashboard(auth_token: Optional[str] = None) -> Dict[str, Any]:
    with db.lock:
        user = db.resolve_profile(auth_token)
        pid = user["id"]

        user_progress_rows = [r for r in db.user_green_tasks if r["profile_id"] == pid]
        progress_by_task = {r["task_id"]: r for r in user_progress_rows}

        tasks: List[Dict[str, Any]] = []
        for t in db.green_tasks:
            prog = progress_by_task.get(t["id"])
            status = prog["status"] if prog else "not_started"
            tasks.append(
                {
                    **t,
                    "status": status,
                    "declaration": prog["declaration"] if prog else "",
                    "proof_url": f"/uploads/{prog['proof_filename']}" if (prog and prog.get("proof_filename")) else None,
                    "proof_original_name": prog.get("proof_original_name") if prog else None,
                    "completed_date": prog.get("completed_date") if prog else None,
                    "points_awarded": prog.get("points_awarded", 0) if prog else 0,
                    "co2_awarded_kg": prog.get("co2_saved_kg", 0) if prog else 0,
                    "can_start": bool(user) and status == "not_started",
                    "can_complete": bool(user) and status in ("not_started", "in_progress"),
                }
            )

        total_points = _get_user_points_total(pid)
        approved_count = sum(1 for t in tasks if t["status"] == "approved")
        in_progress_count = sum(1 for t in tasks if t["status"] == "in_progress")
        level_info = compute_green_level(total_points)
        max_possible_points = sum(t["points"] for t in db.green_tasks)

        tracker = _compute_streak_and_weekly_progress(pid)
        badges = _build_user_badges(pid, total_points, tracker["streak_days"])

        user_claims = {c["reward_code"] for c in db.green_reward_claims if c["profile_id"] == pid}
        rewards: List[Dict[str, Any]] = []
        for rw in GREENSTEPS_REWARDS:
            claim_row = next(
                (c for c in db.green_reward_claims if c["profile_id"] == pid and c["reward_code"] == rw["code"]),
                None,
            )
            rewards.append(
                {
                    **rw,
                    "unlocked": bool(user) and total_points >= rw["required_points"],
                    "claimed": rw["code"] in user_claims,
                    "claimed_at": claim_row["claimed_at"] if claim_row else None,
                }
            )

        equivalent_trees = round(tracker["total_co2_saved_kg"] / 1.75, 1)
        if approved_count >= len(db.green_tasks):
            badge_title = "Eco Champion"
        elif total_points >= 100:
            badge_title = "Eco Warrior"
        elif total_points >= 50:
            badge_title = "Eco Explorer"
        else:
            badge_title = "Eco Starter"

        lb_entries: List[Dict[str, Any]] = []
        for p in db.profiles:
            pts = _get_user_points_total(p["id"])
            t_info = _compute_streak_and_weekly_progress(p["id"])
            done_count = sum(
                1 for u in db.user_green_tasks if u["profile_id"] == p["id"] and u["status"] == "approved"
            )
            if done_count >= len(db.green_tasks):
                p_badge = "Eco Champion"
            elif pts >= 100:
                p_badge = "Eco Warrior"
            elif pts >= 50:
                p_badge = "Eco Explorer"
            else:
                p_badge = "Eco Starter"
            lb_entries.append(
                {
                    "profile_id": p["id"],
                    "name": p["name"],
                    "city": p["preferred_city"],
                    "total_points": pts,
                    "completed_count": done_count,
                    "streak_days": t_info["streak_days"],
                    "total_co2_saved_kg": t_info["total_co2_saved_kg"],
                    "badge_title": p_badge,
                    "is_current_user": p["id"] == pid,
                }
            )

        lb_entries.sort(
            key=lambda e: (-e["total_points"], -e["completed_count"], -e["streak_days"], e["name"])
        )
        leaderboard = [{**entry, "rank": idx + 1} for idx, entry in enumerate(lb_entries)]

        impact_breakdown = [
            {
                "task_id": t["id"],
                "title": t["title"],
                "completed": t["status"] == "approved",
                "co2_saved_kg": round(t["co2_awarded_kg"] or t["co2_saved_kg"], 2),
                "explanation": t["impact_explanation"],
            }
            for t in tasks
        ]

        return {
            "authenticated": True,
            "user": {
                "id": user["id"],
                "name": user["name"],
                "email": user["email"],
                "preferred_city": user["preferred_city"],
                "role": user["role"],
            },
            "summary": {
                "total_points": total_points,
                "max_possible_points": max_possible_points,
                "completed_count": approved_count,
                "total_tasks": len(db.green_tasks),
                "in_progress_count": in_progress_count,
                "progress_pct": round((approved_count / max(1, len(db.green_tasks))) * 100),
                "level": level_info["level"],
                "badge_title": badge_title,
                "next_level": level_info["next_level"],
                "points_to_next": level_info["points_to_next"],
                "earned_badges_count": sum(1 for b in badges if b["earned"]),
                "total_badges_count": len(badges),
                "streak_days": tracker["streak_days"],
                "weekly_active_days": tracker["weekly_active_days"],
                "weekly_tasks_count": tracker["weekly_tasks_count"],
                "weekly_points": tracker["weekly_points"],
                "total_co2_saved_kg": tracker["total_co2_saved_kg"],
                "equivalent_trees": equivalent_trees,
            },
            "impact_formula": (
                "Each green step lowers local tailpipe smoke, power-plant pollution, and open-waste fumes—helping "
                "improve everyday air quality, protect respiratory health, and keep neighbourhoods cooler."
            ),
            "impact_breakdown": impact_breakdown,
            "leaderboard": leaderboard,
            "weekly_progress": tracker["weekly_progress"],
            "tasks": tasks,
            "badges": badges,
            "rewards": rewards,
        }


def start_green_task(task_id: int, auth_token: Optional[str] = None) -> Dict[str, Any]:
    with db.lock:
        user = db.resolve_profile(auth_token)
        task = next((t for t in db.green_tasks if t["id"] == task_id), None)
        if not task:
            raise HttpError(404, "Challenge not found.")

        existing = next(
            (u for u in db.user_green_tasks if u["profile_id"] == user["id"] and u["task_id"] == task_id),
            None,
        )
        now = utc_now_iso()
        if existing:
            if existing["status"] == "approved":
                raise HttpError(409, "This challenge is already completed and credited.")
            existing["status"] = "in_progress"
            existing["updated_at"] = now
            return {
                "message": f'Started "{task["title"]}". Submit proof when done to earn +{task["points"]} pts.',
                "task_id": task_id,
                "status": existing["status"],
            }

        db.user_green_tasks.append(
            {
                "id": db.next_id("greenTaskProgress"),
                "profile_id": user["id"],
                "task_id": task_id,
                "status": "in_progress",
                "declaration": "",
                "proof_filename": None,
                "proof_original_name": None,
                "proof_mime": None,
                "proof_size": None,
                "completed_date": None,
                "co2_saved_kg": 0,
                "started_at": now,
                "submitted_at": None,
                "reviewed_at": None,
                "reviewed_by": None,
                "reviewer_notes": None,
                "points_awarded": 0,
                "updated_at": now,
            }
        )
        return {
            "message": f'Started "{task["title"]}". Submit proof to earn +{task["points"]} pts & avoid ~{task["co2_saved_kg"]} kg CO₂.',
            "task_id": task_id,
            "status": "in_progress",
        }


def complete_green_task(
    task_id: int,
    declaration: str = "",
    file_bytes: Optional[bytes] = None,
    original_filename: Optional[str] = None,
    auth_token: Optional[str] = None,
) -> Dict[str, Any]:
    with db.lock:
        user = db.resolve_profile(auth_token)
        task = next((t for t in db.green_tasks if t["id"] == task_id), None)
        if not task:
            raise HttpError(404, "Challenge not found.")

        existing = next(
            (u for u in db.user_green_tasks if u["profile_id"] == user["id"] and u["task_id"] == task["id"]),
            None,
        )
        if existing and existing["status"] == "approved":
            raise HttpError(409, "Duplicate completion blocked: this challenge is already completed.")

        decl_clean = str(declaration or "").strip()[:600]
        has_file = bool(file_bytes and len(file_bytes) > 0)

        stored_filename = existing.get("proof_filename") if existing else None
        mime_type = existing.get("proof_mime") if existing else None
        file_size = existing.get("proof_size") if existing else None
        orig_name = existing.get("proof_original_name") if existing else None

        if has_file and file_bytes is not None:
            file_size = len(file_bytes)
            if file_size > Config.MAX_UPLOAD_BYTES:
                raise HttpError(400, "Uploaded photo exceeds the 5 MB size limit.")
            img_type = detect_image_type(file_bytes)
            if not img_type:
                raise HttpError(
                    400,
                    "Invalid photo format. Only PNG, JPG, JPEG, and WEBP photos are allowed.",
                )
            stored_filename = f"gs_{uuid.uuid4().hex}.{img_type}"
            mime_type = {"png": "image/png", "jpg": "image/jpeg", "webp": "image/webp"}[img_type]
            orig_name = str(original_filename)[:160] if original_filename else stored_filename
            db.uploads[stored_filename] = {"mime_type": mime_type, "data": file_bytes}

        now = utc_now_iso()
        today_str = now[:10]
        effective_declaration = decl_clean or (
            f"Photo proof attached: {orig_name}" if orig_name else f"Completed: {task['title']}"
        )

        if existing is None:
            target_row = {
                "id": db.next_id("greenTaskProgress"),
                "profile_id": user["id"],
                "task_id": task["id"],
                "status": "approved",
                "declaration": effective_declaration,
                "proof_filename": stored_filename,
                "proof_original_name": orig_name,
                "proof_mime": mime_type,
                "proof_size": file_size,
                "completed_date": today_str,
                "co2_saved_kg": task["co2_saved_kg"],
                "started_at": now,
                "submitted_at": now,
                "reviewed_at": now,
                "reviewed_by": "Verified Action",
                "reviewer_notes": "Sustainable activity logged.",
                "points_awarded": 0,
                "updated_at": now,
            }
            db.user_green_tasks.append(target_row)
        else:
            target_row = existing
            target_row.update(
                {
                    "declaration": effective_declaration,
                    "proof_filename": stored_filename,
                    "proof_original_name": orig_name,
                    "proof_mime": mime_type,
                    "proof_size": file_size,
                    "completed_date": today_str,
                    "co2_saved_kg": task["co2_saved_kg"],
                    "status": "approved",
                    "submitted_at": now,
                    "reviewed_at": now,
                    "reviewed_by": "Verified Action",
                    "reviewer_notes": "Sustainable activity logged.",
                    "updated_at": now,
                }
            )

        credited = _award_task_points_once(user, task, target_row["id"])
        target_row["points_awarded"] = credited or task["points"]

        return {
            "message": f'Completed "{task["title"]}"! +{credited} Green Points & ~{task["co2_saved_kg"]} kg CO₂ avoided.',
            "status": target_row["status"],
            "points_awarded": credited,
            "co2_saved_kg": task["co2_saved_kg"],
        }


def estimate_environmental_impact(
    activity: str = "walking_vs_car",
    quantity: float = 3.0,
    frequency: str = "daily",
) -> Dict[str, Any]:
    try:
        qty = max(0.1, min(1000.0, float(quantity or 0)))
    except (TypeError, ValueError):
        qty = 0.1
    freq = str(frequency or "daily").lower()
    multiplier = 365 if freq == "daily" else (52 if freq == "weekly" else (12 if freq == "monthly" else 1))

    factors = {
        "walking_vs_car": {
            "label": "Walking instead of driving a petrol car",
            "unit": "km",
            "kg_per_unit": 0.21,
            "fuel_per_unit": 0.085,
        },
        "cycling_vs_car": {
            "label": "Cycling instead of driving a car / two-wheeler",
            "unit": "km",
            "kg_per_unit": 0.19,
            "fuel_per_unit": 0.075,
        },
        "public_transport_vs_car": {
            "label": "Using Bus / Metro instead of private car",
            "unit": "km",
            "kg_per_unit": 0.13,
            "fuel_per_unit": 0.055,
        },
        "planting_trees": {
            "label": "Planting & maintaining native trees",
            "unit": "trees",
            "kg_per_unit": 1.75,
            "fuel_per_unit": 0.0,
        },
        "saving_electricity": {
            "label": "Saving household electricity",
            "unit": "kWh",
            "kg_per_unit": 0.82,
            "fuel_per_unit": 0.0,
        },
        "avoid_waste_burning": {
            "label": "Composting instead of open waste burning",
            "unit": "kg waste",
            "kg_per_unit": 1.9,
            "fuel_per_unit": 0.0,
        },
    }

    f = factors.get(activity, factors["walking_vs_car"])
    single_co2 = round(qty * f["kg_per_unit"], 2)
    annual_co2 = round(single_co2 * multiplier, 1)
    annual_fuel = round(qty * f["fuel_per_unit"] * multiplier, 1)
    equiv_trees = round(annual_co2 / 21.0, 1)

    return {
        "activity": activity,
        "label": f["label"],
        "unit": f["unit"],
        "quantity": qty,
        "frequency": freq,
        "single_co2_kg": single_co2,
        "annual_co2_kg": annual_co2,
        "annual_fuel_saved_liters": annual_fuel,
        "equivalent_trees_year": equiv_trees,
    }


def review_green_task_submission(
    submission_id: int,
    decision: str,
    notes: str = "",
    auth_token: Optional[str] = None,
) -> Dict[str, Any]:
    raise HttpError(
        404,
        "Manual admin review queue has been simplified into direct challenge completion.",
    )


def claim_green_reward(reward_code: str, auth_token: Optional[str] = None) -> Dict[str, Any]:
    with db.lock:
        user = db.resolve_profile(auth_token)
        rw = next((r for r in GREENSTEPS_REWARDS if r["code"] == reward_code), None)
        if not rw:
            raise HttpError(404, "Reward not found.")

        already_claimed = any(
            c["profile_id"] == user["id"] and c["reward_code"] == rw["code"]
            for c in db.green_reward_claims
        )
        if already_claimed:
            raise HttpError(409, "You have already claimed this reward.")

        user_pts = _get_user_points_total(user["id"])
        if user_pts < rw["required_points"]:
            raise HttpError(
                400,
                f'You need {rw["required_points"]} Green Points to unlock "{rw["title"]}" (current: {user_pts} pts).',
            )

        claim_row = {
            "id": db.next_id("greenReward"),
            "profile_id": user["id"],
            "reward_code": rw["code"],
            "title": rw["title"],
            "points_required": rw["required_points"],
            "claimed_at": utc_now_iso(),
        }
        db.green_reward_claims.append(claim_row)
        return {
            "message": f'Unlocked and claimed "{rw["title"]}"!',
            "claim": claim_row,
        }
