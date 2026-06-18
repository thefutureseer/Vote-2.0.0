import { useState, useEffect } from "react";

export function useVoted() {
  const [votedPolls, setVotedPolls] = useState<string[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem("voted_polls");
    if (stored) {
      try {
        setVotedPolls(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse voted_polls", e);
      }
    }
  }, []);

  const markVoted = (pollId: string) => {
    const updated = [...votedPolls, pollId];
    setVotedPolls(updated);
    localStorage.setItem("voted_polls", JSON.stringify(updated));
  };

  const hasVoted = (pollId: string) => votedPolls.includes(pollId);

  return { votedPolls, markVoted, hasVoted };
}
