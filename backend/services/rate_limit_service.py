from ..rate_limiter import rate_limiter

def rate_limit_status_service():
    state = rate_limiter.debug_state()
    return {
        "blocked": rate_limiter.blocked,
        "block_remaining": round(rate_limiter.block_remaining, 3),
        "rules": {
            name: [
                {"current": cur, "limit": lim, "reset_s": reset}
                for (cur, lim, reset) in tuples
            ]
            for name, tuples in state.items()
        },
    }
