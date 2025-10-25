def calculate_profit_margins(pairs):
    for i, pair_a in enumerate(pairs):
        if getattr(pair_a, 'linked_pair_index', None) is not None or getattr(pair_a, 'median_rate', None) is None:
            continue
        for j, pair_b in enumerate(pairs):
            if i == j:
                continue
            if pair_a.get == pair_b.pay and pair_a.pay == pair_b.get:
                if getattr(pair_b, 'median_rate', None) is not None and pair_b.median_rate > 0:
                    pair_a.linked_pair_index = j
                    pair_b.linked_pair_index = i
                    receive_per_cycle = pair_a.median_rate
                    spend_to_get_back = 1.0 / pair_b.median_rate if pair_b.median_rate > 0 else 0
                    raw_profit = receive_per_cycle - spend_to_get_back
                    profit_pct = (raw_profit / spend_to_get_back * 100) if spend_to_get_back > 0 else 0
                    pair_a.profit_margin_raw = round(raw_profit, 4)
                    pair_a.profit_margin_pct = round(profit_pct, 2)
                    pair_b.profit_margin_raw = round(raw_profit, 4)
                    pair_b.profit_margin_pct = round(profit_pct, 2)
                break
