"""Path of Exile API rate limiting helper.

The PoE trade API returns headers like:

X-Rate-Limit-Rules: Account,Ip
X-Rate-Limit-Ip: 7:15:60,15:90:120,45:300:1800
X-Rate-Limit-Ip-State: 1:15:0,0:90:14,40:300:1555
Retry-After: 1555 (only present when hard limited)

Empirical interpretation (conservative, we only rely on *State*):
Each comma-separated triple in a *State* header appears to be:
  current:limit:reset_seconds_remaining

When current >= limit and reset_seconds_remaining > 0, further requests for
that rule will be blocked until the reset window elapses.

We treat any Retry-After as a global lock regardless of per-rule state.
For safety we also implement a soft-throttle: if usage ratio > 0.8 we sleep
briefly (5% of the reset window or at least 0.2s) to smooth bursts.

This module exposes RateLimiter with two primary entry points:
  limiter.wait_before_request()  # blocks if required before sending
  limiter.on_response(headers)   # update internal state after a response

Thread-safe; suitable for synchronous usage. (For async you could adapt the
sleep calls to asyncio.sleep.)
"""

from __future__ import annotations

import time
import logging
import os
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple
from threading import RLock

log = logging.getLogger("poe-backend")


@dataclass
class RuleState:
    name: str
    current: int
    limit: int
    reset_s: int  # seconds until window reset or lock expires

    @property
    def ratio(self) -> float:
        if self.limit <= 0:
            return 0.0
        return self.current / float(self.limit)


def _parse_state_header(name: str, raw: str) -> List[RuleState]:
    states: List[RuleState] = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        pieces = part.split(":")
        if len(pieces) != 3:
            continue
        try:
            current, limit, reset_s = (int(pieces[0]), int(pieces[1]), int(pieces[2]))
        except ValueError:
            continue
        states.append(RuleState(name=name, current=current, limit=limit, reset_s=reset_s))
    return states


class RateLimiter:
    def __init__(self):
        # Use re-entrant lock to avoid deadlocks when nested property access occurs.
        self._lock = RLock()
        self._block_until: float = 0.0  # hard block (Retry-After or full rule)
        self._soft_delay_until: float = 0.0  # gentle spacing suggestion
        self._last_rules: List[RuleState] = []
        # Configurable thresholds
        self.soft_ratio = float(os.getenv("POE_SOFT_RATIO", "0.8"))
        self.soft_sleep_factor = float(os.getenv("POE_SOFT_SLEEP_FACTOR", "0.05"))

    def wait_before_request(self):
        """Block the calling thread until it's safe to issue a request."""
        while True:
            with self._lock:
                now = time.time()
                block = max(self._block_until, self._soft_delay_until)
                if now >= block:
                    return
                sleep_for = block - now
            # sleep outside lock
            if sleep_for > 0:
                time.sleep(min(sleep_for, 2.0))  # cap interval sleep to allow re-check

    def on_response(self, headers: Dict[str, str]):
        """Inspect PoE headers to update throttling state."""
        retry_after = headers.get("Retry-After") or headers.get("retry-after")

        with self._lock:
            now = time.time()
            # Reset soft delay; will be recomputed.
            self._soft_delay_until = 0.0
            self._last_rules = []

            if retry_after:
                try:
                    ra = int(retry_after)
                    if ra > 0:
                        self._block_until = max(self._block_until, now + ra)
                        log.warning(f"PoE global Retry-After received ({ra}s). Blocking until {self._block_until:.0f}.")
                except ValueError:
                    pass

            # Collect state headers based on rule names (& fallback detection)
            rule_names_raw = headers.get("X-Rate-Limit-Rules") or headers.get("x-rate-limit-rules")
            rule_names: List[str] = []
            if rule_names_raw:
                rule_names = [r.strip() for r in rule_names_raw.split(",") if r.strip()]
            # Always attempt generic known rules even if not listed
            for candidate in ["Ip", "Account"]:
                if candidate not in rule_names:
                    rule_names.append(candidate)

            for rule in rule_names:
                state_header = headers.get(f"X-Rate-Limit-{rule}-State") or headers.get(f"x-rate-limit-{rule.lower()}-state")
                if not state_header:
                    continue
                parsed = _parse_state_header(rule, state_header)
                self._last_rules.extend(parsed)
                # Determine hard block condition
                for st in parsed:
                    if st.current >= st.limit and st.reset_s > 0:
                        until = now + st.reset_s
                        if until > self._block_until:
                            self._block_until = until
                            log.warning(f"Rate limit reached for {st.name} rule: current={st.current} limit={st.limit}. Blocking {st.reset_s}s.")

            # Soft throttle: space out if nearing limits
            soft_sleep = 0.0
            for st in self._last_rules:
                if st.reset_s <= 0 or st.limit <= 0:
                    continue
                # heuristic: if usage above configured ratio and not yet at limit
                if st.ratio >= self.soft_ratio and st.current < st.limit:
                    # Sleep configured factor of remaining window or at least 0.2s (cap 3s)
                    candidate = min(max(st.reset_s * self.soft_sleep_factor, 0.2), 3.0)
                    soft_sleep = max(soft_sleep, candidate)
            if soft_sleep > 0:
                self._soft_delay_until = now + soft_sleep
                log.info(f"Applying soft throttle sleep={soft_sleep:.2f}s (utilization >= {self.soft_ratio:.2f}, factor={self.soft_sleep_factor}).")

    def debug_state(self) -> Dict[str, List[Tuple[int, int, int]]]:
        """Return last parsed rule states for introspection (counts, limits, resets)."""
        with self._lock:
            out: Dict[str, List[Tuple[int, int, int]]] = {}
            for st in self._last_rules:
                out.setdefault(st.name, []).append((st.current, st.limit, st.reset_s))
            return out

    @property
    def blocked(self) -> bool:
        with self._lock:
            return time.time() < self._block_until

    @property
    def block_remaining(self) -> float:
        with self._lock:
            return max(0.0, self._block_until - time.time())

    @property
    def soft_remaining(self) -> float:
        """Seconds remaining for soft throttle delay (non-hard block)."""
        with self._lock:
            return max(0.0, self._soft_delay_until - time.time())

    @property
    def throttled_remaining(self) -> float:
        """Maximum remaining time of either hard block or soft throttle.
        Computed under one lock acquisition to avoid nested locking.
        """
        with self._lock:
            hard = max(0.0, self._block_until - time.time())
            soft = max(0.0, self._soft_delay_until - time.time())
            return max(hard, soft)

    @property
    def throttled(self) -> bool:
        return self.throttled_remaining > 0


# Singleton instance for simple integration
rate_limiter = RateLimiter()
