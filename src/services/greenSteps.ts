import crypto from "node:crypto";
import { Config } from "../config.js";
import { db, GreenTaskDefinition, UserProfile, utcNowIso } from "../store/memoryDb.js";
import { HttpError } from "./airQuality.js";

export interface GreenRewardDef {
  code: string;
  title: string;
  description: string;
  required_points: number;
  required_level: "Bronze" | "Silver" | "Gold";
  reward_type: "Digital Badge" | "Milestone Reward" | "Eco Recognition";
}

export const GREENSTEPS_REWARDS: GreenRewardDef[] = [
  {
    code: "bronze_eco_starter",
    title: "Bronze Eco Starter Award",
    description: "Unlocks at 50 Green Points for building consistent eco-friendly daily habits.",
    required_points: 50,
    required_level: "Bronze",
    reward_type: "Digital Badge",
  },
  {
    code: "clean_commuter_reward",
    title: "Clean-Air Commuter Recognition",
    description: "Awarded at 100 Green Points for choosing walking, cycling, and public transport.",
    required_points: 100,
    required_level: "Bronze",
    reward_type: "Eco Recognition",
  },
  {
    code: "silver_action_champion",
    title: "Silver Sustainable Action Champion",
    description: "Milestone recognition at 120 Green Points across travel, energy, and greenery.",
    required_points: 120,
    required_level: "Silver",
    reward_type: "Milestone Reward",
  },
  {
    code: "gold_planet_steward",
    title: "Gold Green Steps Steward",
    description: "Top sustainability award unlocked at 210+ Green Points.",
    required_points: 210,
    required_level: "Gold",
    reward_type: "Milestone Reward",
  },
];

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

function requireActiveUser(authToken?: string | null): UserProfile {
  return db.resolveProfile(authToken);
}

export function computeGreenLevel(points: number): {
  level: "Starter" | "Bronze" | "Silver" | "Gold";
  next_level: "Bronze" | "Silver" | "Gold" | "Max Level";
  points_to_next: number;
} {
  if (points >= 210) {
    return { level: "Gold", next_level: "Max Level", points_to_next: 0 };
  }
  if (points >= 120) {
    return { level: "Silver", next_level: "Gold", points_to_next: 210 - points };
  }
  if (points >= 50) {
    return { level: "Bronze", next_level: "Silver", points_to_next: 120 - points };
  }
  return { level: "Starter", next_level: "Bronze", points_to_next: 50 - points };
}

function getUserPointsTotal(profileId: number): number {
  return db.greenTransactions
    .filter((tx) => tx.profile_id === profileId)
    .reduce((sum, tx) => sum + tx.points, 0);
}

function awardTaskPointsOnce(profile: UserProfile, task: GreenTaskDefinition, submissionId: number): number {
  const alreadyRewarded = db.greenTransactions.some(
    (tx) => tx.profile_id === profile.id && tx.task_id === task.id && tx.tx_type === "task_reward"
  );
  if (alreadyRewarded) {
    return 0;
  }
  db.greenTransactions.push({
    id: db.nextId("greenTx"),
    profile_id: profile.id,
    task_id: task.id,
    submission_id: submissionId,
    tx_type: "task_reward",
    title: `Completed: ${task.title}`,
    points: task.points,
    created_at: utcNowIso(),
  });
  return task.points;
}

function dateOffsetIsoDay(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function formatShortDay(isoDay: string): string {
  const d = new Date(`${isoDay}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

function computeStreakAndWeeklyProgress(profileId: number | null) {
  const approvedRows = profileId
    ? db.userGreenTasks.filter((u) => u.profile_id === profileId && u.status === "approved")
    : [];

  const activeDates = new Set(
    approvedRows.map((r) => r.completed_date || (r.submitted_at || r.updated_at).slice(0, 10))
  );

  // Consecutive daily streak ending today or yesterday
  let streakDays = 0;
  const todayStr = dateOffsetIsoDay(0);
  const startOffset = activeDates.has(todayStr) ? 0 : 1;
  for (let offset = startOffset; offset < 60; offset += 1) {
    const dayStr = dateOffsetIsoDay(offset);
    if (activeDates.has(dayStr)) {
      streakDays += 1;
    } else {
      break;
    }
  }

  // Last 7 days breakdown (oldest -> today)
  const weeklyProgress: Array<{
    date: string;
    day_label: string;
    tasks_completed: number;
    points_earned: number;
    co2_saved_kg: number;
    is_today: boolean;
  }> = [];

  for (let offset = 6; offset >= 0; offset -= 1) {
    const dayStr = dateOffsetIsoDay(offset);
    const dayRows = approvedRows.filter(
      (r) => (r.completed_date || (r.submitted_at || r.updated_at).slice(0, 10)) === dayStr
    );
    weeklyProgress.push({
      date: dayStr,
      day_label: formatShortDay(dayStr),
      tasks_completed: dayRows.length,
      points_earned: dayRows.reduce((s, r) => s + r.points_awarded, 0),
      co2_saved_kg: Number(dayRows.reduce((s, r) => s + (r.co2_saved_kg || 0), 0).toFixed(2)),
      is_today: offset === 0,
    });
  }

  const weeklyActiveDays = weeklyProgress.filter((d) => d.tasks_completed > 0).length;
  const weeklyTasksCount = weeklyProgress.reduce((s, d) => s + d.tasks_completed, 0);
  const weeklyPoints = weeklyProgress.reduce((s, d) => s + d.points_earned, 0);
  const totalCo2SavedKg = Number(
    approvedRows.reduce((s, r) => s + (r.co2_saved_kg || 0), 0).toFixed(2)
  );

  return {
    streakDays,
    weeklyProgress,
    weeklyActiveDays,
    weeklyTasksCount,
    weeklyPoints,
    totalCo2SavedKg,
  };
}

function buildUserBadges(profileId: number | null, totalPoints: number, streakDays: number) {
  const userProgress = profileId ? db.userGreenTasks.filter((u) => u.profile_id === profileId) : [];
  const approvedIds = new Set(userProgress.filter((u) => u.status === "approved").map((u) => u.task_id));

  return [
    {
      code: "first_step",
      title: "First Green Step",
      description: "Complete your first daily green challenge.",
      tier: "Bronze",
      medal: "bronze",
      earned: approvedIds.size >= 1,
    },
    {
      code: "streak_3",
      title: "3-Day Streak Medal",
      description: "Complete eco-friendly activities for 3 consecutive days.",
      tier: "Silver",
      medal: "silver",
      earned: streakDays >= 3,
    },
    {
      code: "green_commuter",
      title: "Clean Commuter Medal",
      description: "Complete Walk/Cycle and Public Transport.",
      tier: "Silver",
      medal: "silver",
      earned: approvedIds.has(1) && approvedIds.has(2),
    },
    {
      code: "tree_caretaker",
      title: "Tree Guardian Medal",
      description: "Complete the Plant or Water a Tree challenge.",
      tier: "Bronze",
      medal: "bronze",
      earned: approvedIds.has(4),
    },
    {
      code: "energy_saver",
      title: "Energy Saver Medal",
      description: "Switch off idle lights & fans.",
      tier: "Bronze",
      medal: "bronze",
      earned: approvedIds.has(3),
    },
    {
      code: "zero_waste_hero",
      title: "Zero Waste Medal",
      description: "Complete both Composting and Reusable Kit tasks.",
      tier: "Silver",
      medal: "silver",
      earned: approvedIds.has(6) && approvedIds.has(7),
    },
    {
      code: "silver_tier",
      title: "Eco Warrior Medal",
      description: "Reach 120+ Green Points.",
      tier: "Silver",
      medal: "silver",
      earned: totalPoints >= 120,
    },
    {
      code: "gold_tier",
      title: "Eco Champion Gold",
      description: "Complete all 8 daily green challenges.",
      tier: "Gold",
      medal: "gold",
      earned: approvedIds.size >= 8,
    },
  ];
}

export function getGreenStepsDashboard(authToken?: string | null) {
  const user = db.resolveProfile(authToken);
  const pid = user.id;

  const userProgressRows = db.userGreenTasks.filter((r) => r.profile_id === pid);
  const progressByTaskId = new Map(userProgressRows.map((r) => [r.task_id, r]));

  const tasks = db.greenTasks.map((t) => {
    const prog = progressByTaskId.get(t.id) || null;
    const status = prog ? prog.status : "not_started";
    return {
      ...t,
      status,
      declaration: prog ? prog.declaration : "",
      proof_url: prog && prog.proof_filename ? `/uploads/${prog.proof_filename}` : null,
      proof_original_name: prog ? prog.proof_original_name : null,
      completed_date: prog ? prog.completed_date : null,
      points_awarded: prog ? prog.points_awarded : 0,
      co2_awarded_kg: prog ? prog.co2_saved_kg : 0,
      can_start: Boolean(user) && status === "not_started",
      can_complete: Boolean(user) && (status === "not_started" || status === "in_progress"),
    };
  });

  const totalPoints = pid ? getUserPointsTotal(pid) : 0;
  const approvedCount = tasks.filter((t) => t.status === "approved").length;
  const inProgressCount = tasks.filter((t) => t.status === "in_progress").length;
  const levelInfo = computeGreenLevel(totalPoints);
  const maxPossiblePoints = db.greenTasks.reduce((s, t) => s + t.points, 0);

  const tracker = computeStreakAndWeeklyProgress(pid);
  const badges = buildUserBadges(pid, totalPoints, tracker.streakDays);

  const userClaims = new Set(
    pid ? db.greenRewardClaims.filter((c) => c.profile_id === pid).map((c) => c.reward_code) : []
  );
  const rewards = GREENSTEPS_REWARDS.map((rw) => {
    const claimRow = pid
      ? db.greenRewardClaims.find((c) => c.profile_id === pid && c.reward_code === rw.code)
      : null;
    return {
      ...rw,
      unlocked: Boolean(user) && totalPoints >= rw.required_points,
      claimed: userClaims.has(rw.code),
      claimed_at: claimRow ? claimRow.claimed_at : null,
    };
  });

  const equivalentTrees = Number((tracker.totalCo2SavedKg / 1.75).toFixed(1));
  const badgeTitle =
    approvedCount >= db.greenTasks.length
      ? "Eco Champion"
      : totalPoints >= 100
      ? "Eco Warrior"
      : totalPoints >= 50
      ? "Eco Explorer"
      : "Eco Starter";

  const leaderboard = db.profiles
    .map((p) => {
      const pts = getUserPointsTotal(p.id);
      const tInfo = computeStreakAndWeeklyProgress(p.id);
      const doneCount = db.userGreenTasks.filter(
        (u) => u.profile_id === p.id && u.status === "approved"
      ).length;
      const pBadge =
        doneCount >= db.greenTasks.length
          ? "Eco Champion"
          : pts >= 100
          ? "Eco Warrior"
          : pts >= 50
          ? "Eco Explorer"
          : "Eco Starter";
      return {
        profile_id: p.id,
        name: p.name,
        city: p.preferred_city,
        total_points: pts,
        completed_count: doneCount,
        streak_days: tInfo.streakDays,
        total_co2_saved_kg: tInfo.totalCo2SavedKg,
        badge_title: pBadge,
        is_current_user: p.id === pid,
      };
    })
    .sort(
      (a, b) =>
        b.total_points - a.total_points ||
        b.completed_count - a.completed_count ||
        b.streak_days - a.streak_days ||
        a.name.localeCompare(b.name)
    )
    .map((entry, idx) => ({ ...entry, rank: idx + 1 }));

  const impactBreakdown = tasks.map((t) => ({
    task_id: t.id,
    title: t.title,
    completed: t.status === "approved",
    co2_saved_kg: Number((t.co2_awarded_kg || t.co2_saved_kg).toFixed(2)),
    explanation: t.impact_explanation,
  }));

  return {
    authenticated: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      preferred_city: user.preferred_city,
      role: user.role,
    },
    summary: {
      total_points: totalPoints,
      max_possible_points: maxPossiblePoints,
      completed_count: approvedCount,
      total_tasks: db.greenTasks.length,
      in_progress_count: inProgressCount,
      progress_pct: Math.round((approvedCount / Math.max(1, db.greenTasks.length)) * 100),
      level: levelInfo.level,
      badge_title: badgeTitle,
      next_level: levelInfo.next_level,
      points_to_next: levelInfo.points_to_next,
      earned_badges_count: badges.filter((b) => b.earned).length,
      total_badges_count: badges.length,
      streak_days: tracker.streakDays,
      weekly_active_days: tracker.weeklyActiveDays,
      weekly_tasks_count: tracker.weeklyTasksCount,
      weekly_points: tracker.weeklyPoints,
      total_co2_saved_kg: tracker.totalCo2SavedKg,
      equivalent_trees: equivalentTrees,
    },
    impact_formula:
      "Each green step lowers local tailpipe smoke, power-plant pollution, and open-waste fumes—helping improve everyday air quality, protect respiratory health, and keep neighbourhoods cooler.",
    impact_breakdown: impactBreakdown,
    leaderboard,
    weekly_progress: tracker.weeklyProgress,
    tasks,
    badges,
    rewards,
  };
}

export function startGreenTask(taskId: number, authToken?: string | null) {
  const user = requireActiveUser(authToken);
  const task = db.greenTasks.find((t) => t.id === taskId);
  if (!task) {
    throw new HttpError(404, "Challenge not found.");
  }

  const existing = db.userGreenTasks.find((u) => u.profile_id === user.id && u.task_id === taskId);
  if (existing) {
    if (existing.status === "approved") {
      throw new HttpError(409, "This challenge is already completed and credited.");
    }
    const now = utcNowIso();
    existing.status = "in_progress";
    existing.updated_at = now;
    return {
      message: `Started "${task.title}". Submit proof when done to earn +${task.points} pts.`,
      task_id: taskId,
      status: existing.status,
    };
  }

  const now = utcNowIso();
  db.userGreenTasks.push({
    id: db.nextId("greenTaskProgress"),
    profile_id: user.id,
    task_id: taskId,
    status: "in_progress",
    declaration: "",
    proof_filename: null,
    proof_original_name: null,
    proof_mime: null,
    proof_size: null,
    completed_date: null,
    co2_saved_kg: 0,
    started_at: now,
    submitted_at: null,
    reviewed_at: null,
    reviewed_by: null,
    reviewer_notes: null,
    points_awarded: 0,
    updated_at: now,
  });

  return {
    message: `Started "${task.title}". Submit proof to earn +${task.points} pts & avoid ~${task.co2_saved_kg} kg CO₂.`,
    task_id: taskId,
    status: "in_progress",
  };
}

export function completeGreenTask(input: {
  taskId: number;
  declaration?: string;
  fileBytes?: Buffer | null;
  originalFilename?: string | null;
  authToken?: string | null;
}) {
  const user = requireActiveUser(input.authToken);
  const task = db.greenTasks.find((t) => t.id === input.taskId);
  if (!task) {
    throw new HttpError(404, "Challenge not found.");
  }

  const existing = db.userGreenTasks.find((u) => u.profile_id === user.id && u.task_id === task.id);
  if (existing && existing.status === "approved") {
    throw new HttpError(409, "Duplicate completion blocked: this challenge is already completed.");
  }

  const declaration = String(input.declaration || "").trim().slice(0, 600);
  const hasFile = Boolean(input.fileBytes && input.fileBytes.length > 0);

  let storedFilename: string | null = existing?.proof_filename ?? null;
  let mimeType: string | null = existing?.proof_mime ?? null;
  let fileSize: number | null = existing?.proof_size ?? null;
  let origName: string | null = existing?.proof_original_name ?? null;

  if (hasFile && input.fileBytes) {
    fileSize = input.fileBytes.length;
    if (input.fileBytes.length > Config.MAX_UPLOAD_BYTES) {
      throw new HttpError(400, "Uploaded photo exceeds the 5 MB size limit.");
    }
    const imgType = detectImageType(input.fileBytes);
    if (!imgType) {
      throw new HttpError(400, "Invalid photo format. Only PNG, JPG, JPEG, and WEBP photos are allowed.");
    }
    storedFilename = `gs_${crypto.randomUUID().replace(/-/g, "")}.${imgType}`;
    mimeType = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" }[imgType];
    origName = input.originalFilename ? String(input.originalFilename).slice(0, 160) : storedFilename;
    db.uploads.set(storedFilename, { mimeType, data: input.fileBytes });
  }

  const now = utcNowIso();
  const todayStr = now.slice(0, 10);
  const effectiveDeclaration =
    declaration || (origName ? `Photo proof attached: ${origName}` : `Completed: ${task.title}`);

  let targetRow = existing;
  if (!targetRow) {
    targetRow = {
      id: db.nextId("greenTaskProgress"),
      profile_id: user.id,
      task_id: task.id,
      status: "approved",
      declaration: effectiveDeclaration,
      proof_filename: storedFilename,
      proof_original_name: origName,
      proof_mime: mimeType,
      proof_size: fileSize,
      completed_date: todayStr,
      co2_saved_kg: task.co2_saved_kg,
      started_at: now,
      submitted_at: now,
      reviewed_at: now,
      reviewed_by: "Verified Action",
      reviewer_notes: "Sustainable activity logged.",
      points_awarded: 0,
      updated_at: now,
    };
    db.userGreenTasks.push(targetRow);
  } else {
    targetRow.declaration = effectiveDeclaration;
    targetRow.proof_filename = storedFilename;
    targetRow.proof_original_name = origName;
    targetRow.proof_mime = mimeType;
    targetRow.proof_size = fileSize;
    targetRow.completed_date = todayStr;
    targetRow.co2_saved_kg = task.co2_saved_kg;
    targetRow.status = "approved";
    targetRow.submitted_at = now;
    targetRow.reviewed_at = now;
    targetRow.reviewed_by = "Verified Action";
    targetRow.reviewer_notes = "Sustainable activity logged.";
    targetRow.updated_at = now;
  }

  const credited = awardTaskPointsOnce(user, task, targetRow.id);
  targetRow.points_awarded = credited || task.points;

  return {
    message: `Completed "${task.title}"! +${credited} Green Points & ~${task.co2_saved_kg} kg CO₂ avoided.`,
    status: targetRow.status,
    points_awarded: credited,
    co2_saved_kg: task.co2_saved_kg,
  };
}

export function estimateEnvironmentalImpact(input: {
  activity: string;
  quantity: number;
  frequency: string;
}) {
  const qty = Math.max(0.1, Math.min(1000, Number(input.quantity) || 0));
  const freq = String(input.frequency || "daily").toLowerCase();
  const multiplierPerYear = freq === "daily" ? 365 : freq === "weekly" ? 52 : freq === "monthly" ? 12 : 1;

  const factors: Record<string, { label: string; unit: string; kgPerUnit: number; carFuelLitersPerUnit: number }> = {
    walking_vs_car: {
      label: "Walking instead of driving a petrol car",
      unit: "km",
      kgPerUnit: 0.21,
      carFuelLitersPerUnit: 0.085,
    },
    cycling_vs_car: {
      label: "Cycling instead of driving a car / two-wheeler",
      unit: "km",
      kgPerUnit: 0.19,
      carFuelLitersPerUnit: 0.075,
    },
    public_transport_vs_car: {
      label: "Using Bus / Metro instead of private car",
      unit: "km",
      kgPerUnit: 0.13,
      carFuelLitersPerUnit: 0.055,
    },
    planting_trees: {
      label: "Planting & maintaining native trees",
      unit: "trees",
      kgPerUnit: 1.75,
      carFuelLitersPerUnit: 0,
    },
    saving_electricity: {
      label: "Saving household electricity",
      unit: "kWh",
      kgPerUnit: 0.82,
      carFuelLitersPerUnit: 0,
    },
    avoid_waste_burning: {
      label: "Composting instead of open waste burning",
      unit: "kg waste",
      kgPerUnit: 1.9,
      carFuelLitersPerUnit: 0,
    },
  };

  const f = factors[input.activity] || factors.walking_vs_car;
  const singleSessionCo2Kg = Number((qty * f.kgPerUnit).toFixed(2));
  const annualCo2Kg = Number((singleSessionCo2Kg * multiplierPerYear).toFixed(1));
  const annualFuelSavedL = Number((qty * f.carFuelLitersPerUnit * multiplierPerYear).toFixed(1));
  const equivalentTreesYear = Number((annualCo2Kg / 21).toFixed(1));

  return {
    activity: input.activity,
    label: f.label,
    unit: f.unit,
    quantity: qty,
    frequency: freq,
    single_co2_kg: singleSessionCo2Kg,
    annual_co2_kg: annualCo2Kg,
    annual_fuel_saved_liters: annualFuelSavedL,
    equivalent_trees_year: equivalentTreesYear,
  };
}

export function reviewGreenTaskSubmission(_input: {
  submissionId: number;
  decision: string;
  notes?: string;
  authToken?: string | null;
}) {
  throw new HttpError(404, "Manual admin review queue has been simplified into direct challenge completion.");
}

export function claimGreenReward(rewardCode: string, authToken?: string | null) {
  const user = requireActiveUser(authToken);
  const rw = GREENSTEPS_REWARDS.find((r) => r.code === rewardCode);
  if (!rw) {
    throw new HttpError(404, "Reward not found.");
  }

  const alreadyClaimed = db.greenRewardClaims.some(
    (c) => c.profile_id === user.id && c.reward_code === rw.code
  );
  if (alreadyClaimed) {
    throw new HttpError(409, "You have already claimed this reward.");
  }

  const userPts = getUserPointsTotal(user.id);
  if (userPts < rw.required_points) {
    throw new HttpError(
      400,
      `You need ${rw.required_points} Green Points to unlock "${rw.title}" (current: ${userPts} pts).`
    );
  }

  const claimRow = {
    id: db.nextId("greenReward"),
    profile_id: user.id,
    reward_code: rw.code,
    title: rw.title,
    points_required: rw.required_points,
    claimed_at: utcNowIso(),
  };
  db.greenRewardClaims.push(claimRow);

  return {
    message: `Unlocked and claimed "${rw.title}"!`,
    claim: claimRow,
  };
}
