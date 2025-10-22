import time
from rate_limiter import rate_limiter


def simulate(headers):
    rate_limiter.on_response(headers)
    return rate_limiter.debug_state(), rate_limiter.blocked, rate_limiter.block_remaining


def main():
    print("Initial blocked?", rate_limiter.blocked)
    # Simulate normal headers below threshold
    h1 = {
        "X-Rate-Limit-Rules": "Ip,Account",
        "X-Rate-Limit-Ip-State": "1:15:10,0:90:10,40:300:10",  # nearing limit on 300 rule but not exceeded
        "X-Rate-Limit-Account-State": "1:5:10",
    }
    state, blocked, rem = simulate(h1)
    print("State1", state, "blocked?", blocked, "remaining", rem)
    # Exceed a rule hard block
    h2 = {
        "X-Rate-Limit-Rules": "Ip,Account",
        "X-Rate-Limit-Ip-State": "45:300:3",  # current==limit triggers block for 3s
    }
    state2, blocked2, rem2 = simulate(h2)
    print("State2", state2, "blocked?", blocked2, "remaining", rem2)
    if blocked2:
        print("Waiting for unblock...")
        while rate_limiter.blocked:
            time.sleep(0.5)
            print("Remaining", rate_limiter.block_remaining)
    # Retry-After global lock
    h3 = {
        "Retry-After": "2",
    }
    state3, blocked3, rem3 = simulate(h3)
    print("State3", state3, "blocked?", blocked3, "remaining", rem3)
    while rate_limiter.blocked:
        time.sleep(0.5)
        print("Remaining", rate_limiter.block_remaining)
    print("Done.")


if __name__ == "__main__":
    main()
