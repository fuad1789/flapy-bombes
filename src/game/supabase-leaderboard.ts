import { supabase } from "@/utils/supabase/client";

export interface LeaderboardEntry {
  readonly id: number;
  readonly name: string;
  readonly score: number;
  readonly created_at: string;
}

export async function fetchLeaderboard(): Promise<readonly LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from("leaderboard")
    .select("id, name, score, created_at")
    .order("score", { ascending: false })
    .limit(20);

  if (error) {
    console.error("Leaderboard fetch error:", error.message);
    return [];
  }

  return data ?? [];
}

/** Check if a username is already taken */
export async function isNameTaken(name: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("leaderboard")
    .select("id")
    .eq("name", name)
    .limit(1);

  if (error) {
    console.error("Name check error:", error.message);
    return false;
  }

  return (data?.length ?? 0) > 0;
}

/** Register a new player with 0 score */
export async function registerPlayer(name: string): Promise<boolean> {
  const { error } = await supabase
    .from("leaderboard")
    .insert({ name, score: 0 });

  if (error) {
    console.error("Register error:", error.message);
    return false;
  }

  return true;
}

/** Submit score — only updates if new score is higher than existing */
export async function submitScore(name: string, score: number): Promise<boolean> {
  // Get current score for this player
  const { data } = await supabase
    .from("leaderboard")
    .select("id, score")
    .eq("name", name)
    .limit(1);

  if (data && data.length > 0) {
    // Player exists — only update if new score is higher
    if (score > data[0].score) {
      const { error } = await supabase
        .from("leaderboard")
        .update({ score })
        .eq("id", data[0].id);

      if (error) {
        console.error("Score update error:", error.message);
        return false;
      }
    }
    return true;
  }

  // Player doesn't exist — insert
  const { error } = await supabase
    .from("leaderboard")
    .insert({ name, score });

  if (error) {
    console.error("Score insert error:", error.message);
    return false;
  }

  return true;
}
