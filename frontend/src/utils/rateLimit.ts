import { Api } from '../api'

export async function updateRateLimit(setRateLimit: Function, setRateLimitDisplay: Function, setNearLimit: Function) {
  try {
    const status = await Api.rateLimitStatus();
    setRateLimit(status);
    setRateLimitDisplay(status);
    // Near-limit heuristic: treat small windows differently so 1/5 doesn't immediately trigger.
    // Rules:
    // - Ignore expired windows (reset_s <= 0)
    // - For small limits (<= 10): near if current >= ceil(limit * 0.6)
    // - For larger limits: near if utilization >= 0.7 and at least 3 requests used
    const isNearLimit = (r: { current: number; limit: number; reset_s: number }) => {
      if (r.reset_s <= 0 || r.limit <= 0) return false;
      if (r.limit <= 10) {
        // For very small windows require being one request away from the cap (e.g. 4/5, 5/6, 9/10)
        return r.current >= (r.limit - 1) && r.current < r.limit;
      }
      return r.current >= 3 && (r.current / r.limit) >= 0.7 && r.current < r.limit;
    };
    const near = Object.values(status.rules).some((ruleArr: any) => ruleArr.some(isNearLimit));
    setNearLimit(near);
  } catch (e) {
    // ignore
  }
}
