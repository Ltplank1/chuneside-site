export const QUALIFIED_STREAM_SECONDS = 30;
export const RAPID_REPEAT_COOLDOWN_MINUTES = 10;

export function qualifiedThreshold(trackDurationSeconds: number | null) {
  if (!trackDurationSeconds || trackDurationSeconds <= 0) return QUALIFIED_STREAM_SECONDS;
  return Math.min(QUALIFIED_STREAM_SECONDS, trackDurationSeconds);
}

export function qualifiesListening({
  durationSeconds,
  trackDurationSeconds,
}: {
  durationSeconds: number;
  trackDurationSeconds: number | null;
  completed?: boolean;
}) {
  const threshold = qualifiedThreshold(trackDurationSeconds);
  return durationSeconds >= threshold;
}

export function rapidRepeatBlocked(lastQualifiedAt: Date | null, now: Date) {
  if (!lastQualifiedAt) return false;
  return now.getTime() - lastQualifiedAt.getTime() < RAPID_REPEAT_COOLDOWN_MINUTES * 60 * 1000;
}
