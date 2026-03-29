import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

interface GroupMeta {
  groupId: string;
  groupName: string;
  isPublic: boolean;
  joinCode: string;
  creatorUserId: string;
  createdAt: number;
}

// Server-side in-memory store for group metadata.
// Survives across requests but not across server restarts.
const groupStore = new Map<string, GroupMeta>();

// Cleanup stale groups older than 12 hours (in case leave/cleanup was missed)
function pruneStaleGroups() {
  const twelveHoursAgo = Date.now() - 12 * 60 * 60 * 1000;
  for (const [id, meta] of groupStore) {
    if (meta.createdAt < twelveHoursAgo) {
      groupStore.delete(id);
    }
  }
}

function generateJoinCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars (0/O, 1/I)
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function getUnlockedGroupIds(cookieStore: ReturnType<typeof cookies> extends Promise<infer T> ? T : never): string[] {
  const raw = cookieStore.get("syncplay-unlocked")?.value;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// POST: Register a new group (called when creating via Watch Together)
// Body: { groupId, groupName, isPublic, creatorUserId }
// Returns: { joinCode }
export async function POST(req: NextRequest) {
  pruneStaleGroups();

  const body = await req.json();
  const { groupId, groupName, isPublic, creatorUserId } = body;

  if (!groupId || !creatorUserId) {
    return NextResponse.json({ error: "Missing groupId or creatorUserId" }, { status: 400 });
  }

  const joinCode = generateJoinCode();

  groupStore.set(groupId, {
    groupId,
    groupName: groupName || "Watch Party",
    isPublic: isPublic ?? false,
    joinCode,
    creatorUserId,
    createdAt: Date.now(),
  });

  // Auto-unlock for the creator
  const cookieStore = await cookies();
  const unlocked = getUnlockedGroupIds(cookieStore);
  if (!unlocked.includes(groupId)) {
    unlocked.push(groupId);
  }
  cookieStore.set("syncplay-unlocked", JSON.stringify(unlocked), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 86400, // 24 hours
  });

  return NextResponse.json({ joinCode });
}

// GET: List groups visible to the current user
// Returns groups that are public OR unlocked by this user
// Query param: ?userId=xxx (to check creator)
export async function GET(req: NextRequest) {
  pruneStaleGroups();

  const cookieStore = await cookies();
  const unlocked = getUnlockedGroupIds(cookieStore);
  const userId = req.nextUrl.searchParams.get("userId") || "";

  const visibleGroups: (GroupMeta & { isUnlocked: boolean })[] = [];

  for (const meta of groupStore.values()) {
    const isCreator = meta.creatorUserId === userId;
    const isUnlocked = unlocked.includes(meta.groupId);

    if (meta.isPublic || isCreator || isUnlocked) {
      visibleGroups.push({ ...meta, isUnlocked: isCreator || isUnlocked });
    }
  }

  // For non-unlocked private groups, indicate they exist but hide details
  // Actually — we only return visible ones. Private groups the user hasn't
  // unlocked are invisible. They enter a code to unlock.

  return NextResponse.json({ groups: visibleGroups });
}

// PUT: Validate a join code and unlock the group for this user
// Body: { joinCode }
// Returns: { groupId, groupName } on success, 403 on wrong code
export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { joinCode } = body;

  if (!joinCode) {
    return NextResponse.json({ error: "Missing joinCode" }, { status: 400 });
  }

  const upperCode = joinCode.toUpperCase().trim();

  for (const meta of groupStore.values()) {
    if (meta.joinCode === upperCode) {
      // Unlock for this user
      const cookieStore = await cookies();
      const unlocked = getUnlockedGroupIds(cookieStore);
      if (!unlocked.includes(meta.groupId)) {
        unlocked.push(meta.groupId);
        cookieStore.set("syncplay-unlocked", JSON.stringify(unlocked), {
          httpOnly: true,
          sameSite: "strict",
          secure: process.env.NODE_ENV === "production",
          maxAge: 86400,
        });
      }

      return NextResponse.json({
        groupId: meta.groupId,
        groupName: meta.groupName,
      });
    }
  }

  return NextResponse.json({ error: "Invalid code" }, { status: 403 });
}

// DELETE: Remove group metadata (called when leaving/group ends)
// Body: { groupId }
export async function DELETE(req: NextRequest) {
  const body = await req.json();
  const { groupId } = body;

  if (groupId) {
    groupStore.delete(groupId);
  }

  return NextResponse.json({ success: true });
}
