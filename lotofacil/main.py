import http.server
import json
import itertools
import math
import re
import urllib.parse
import os
import sys
import time
import heapq
import random

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

PRIMES = {2, 3, 5, 7, 11, 13, 17, 19, 23}
NON_PRIMES_IN_POOL = 25 - len(PRIMES)
EVENS_IN_POOL = 12
ODDS_IN_POOL = 13
LOTOFACIL_DRAWS = math.comb(25, 15)
DEFAULT_GAME_SIZE = 20
GAME_SIZES = list(range(15, 21))
HIT_TIERS = (15, 14, 13, 12, 11)
DEFAULT_REPEAT_COUNTS = frozenset({6, 7, 8, 9, 10})
REPEAT_OVERLAP_RECOMMENDED = (8, 9, 10)
# Histórico agregado (~3.700+ concursos) — fontes: Só Matemática / Só Lotofácil
REPEAT_OVERLAP_HISTORICAL_PCT = {
    5: 0.03, 6: 1.40, 7: 9.38, 8: 24.56, 9: 32.59, 10: 21.90,
    11: 8.46, 12: 1.67, 13: 0.21, 14: 0.03,
}
# Frequência histórica por dezena (~3.733 concursos, fonte: agregado público Lotofácil)
TOTAL_HISTORICAL_DRAWS = 3733
NUMBER_FREQUENCY_COUNTS = {
    1: 2265, 2: 2240, 3: 2247, 4: 2255, 5: 2244, 6: 2196, 7: 2206, 8: 2160,
    9: 2226, 10: 2326, 11: 2295, 12: 2242, 13: 2273, 14: 2258, 15: 2229, 16: 2134,
    17: 2191, 18: 2224, 19: 2225, 20: 2334, 21: 2218, 22: 2233, 23: 2188, 24: 2266,
    25: 2320,
}
# Coocorrência histórica do conjunto dos 5 mais sorteados (10, 11, 13, 20, 25) — Lotodicas/grupos
TOP5_MOST_DRAWN_NUMBERS = (20, 10, 25, 11, 13)
TOP5_GROUP_CANONICAL = (10, 11, 13, 20, 25)
HISTORICAL_TOP5_ALL_TOGETHER = 277
HISTORICAL_TOP5_PAIR_COUNTS = {
    (10, 25): 1422, (11, 20): 1421, (10, 20): 1414, (13, 20): 1410, (20, 25): 1406,
    (10, 11): 1392, (10, 13): 1362, (11, 13): 1356, (11, 25): 1372, (13, 25): 1357,
}
NUMBERS_IN_DRAW = 15
SMART_GAME_SIZES = frozenset(range(15, 21))
SMART_GAME_MAX_SCAN = 220_000
SMART_GAME_CANDIDATE_POOL = 80
SMART_GAME_POOL_MIN = 160
SMART_GAME_MAX_COUNT = 50
SMART_GAME_SCORE_BAND = 28.0
SMART_GAME_AVOID_MAX = 240
SMART_GAME_JITTER = 10.0
EXPORT_MAX_LINES = 250_000
EXPORT_CHUNK_LINES = 2_000
HISTORICAL_DATA_NOTE = (
    f"Frequências agregadas de ~{TOTAL_HISTORICAL_DRAWS} concursos públicos. "
    "Não são atualizadas automaticamente; o ranking do seu arquivo importado "
    "reflete apenas os sorteios que você carregou."
)
PROBABILITY_DISCLAIMER = (
    "Modo memória: tudo que os filtros removem é tratado como resultado que não vai sair. "
    "O universo de sorteios encolhe na mesma proporção do filtro e a chance de 15 acertos "
    "de cada cartela que restou sobe junto. As faixas de 11 a 14 se reequilibram para o "
    "total fechar em 100%."
)

# Tabela oficial de preços — Lotofácil (Caixa)
BET_PRICES_BY_SIZE = {
    15: 3.50,
    16: 56.00,
    17: 476.00,
    18: 2856.00,
    19: 13566.00,
    20: 54264.00,
}
BASE_SIMPLE_BET_PRICE = BET_PRICES_BY_SIZE[15]

# Prêmios fixos oficiais (11 a 14 acertos). 15 acertos = prêmio principal variável.
FIXED_PRIZES = {
    11: 6.00,
    12: 12.00,
    13: 30.00,
    14: 1500.00,
}
STREAMING_GAME_THRESHOLD = 18  # k <= 18: não materializa todas as combinações
FILTER_STATS_CACHE = {}
FILTER_STATS_CACHE_MAX = 48
REPEAT_OPTIONS_CACHE = {}
REPEAT_OPTIONS_CACHE_MAX = 32
COMBINATIONS_CACHE = {}
EXCLUDED_BY_DRAWS_CACHE = {}
EXCLUDED_BY_DRAWS_CACHE_MAX = 16
# Log de progresso no terminal (a cada N candidatos varridos)
FILTER_LOG = os.environ.get("LOTOFACIL_FILTER_LOG", "1") != "0"
FILTER_LOG_EVERY = max(1_000, int(os.environ.get("LOTOFACIL_FILTER_LOG_EVERY", "50000")))

def get_excluded_combos_by_draws(k, exclude_sets):
    """Combinações excluídas por sorteios históricos (15 dezenas).

    k == 15: apenas a combinação exata (1 sorteio = 1 jogo removido).
    k > 15: combinações que contêm o sorteio completo como subconjunto.
    """
    if not exclude_sets or k < NUMBERS_IN_DRAW:
        return frozenset()

    key = (k, tuple(sorted(frozenset(s) for s in exclude_sets)))
    if key in EXCLUDED_BY_DRAWS_CACHE:
        return EXCLUDED_BY_DRAWS_CACHE[key]

    if k == NUMBERS_IN_DRAW:
        excluded = {frozenset(draw) for draw in exclude_sets}
    else:
        need = k - NUMBERS_IN_DRAW
        excluded = set()
        for draw in exclude_sets:
            draw_tuple = tuple(sorted(draw))
            pool = [n for n in range(1, 26) if n not in draw]
            if need > len(pool):
                continue
            for extra in itertools.combinations(pool, need):
                excluded.add(frozenset(draw_tuple + extra))

    result = frozenset(excluded)
    if key not in EXCLUDED_BY_DRAWS_CACHE and len(EXCLUDED_BY_DRAWS_CACHE) >= EXCLUDED_BY_DRAWS_CACHE_MAX:
        EXCLUDED_BY_DRAWS_CACHE.pop(next(iter(EXCLUDED_BY_DRAWS_CACHE)))
    EXCLUDED_BY_DRAWS_CACHE[key] = result
    return result

def calc_exclude_draws_stats(k, exclude_sets, filtered_count=None):
    total = math.comb(25, k)
    if not exclude_sets or k < NUMBERS_IN_DRAW:
        stats = {
            "draws_count": len(exclude_sets),
            "excluded_by_draws": 0,
            "excluded_combinations": 0,
            "total_combinations": total,
            "remaining_after_draws": total,
            "excluded_percent": 0.0,
            "exclusion_mode": "exact" if k == NUMBERS_IN_DRAW else "subset",
        }
    else:
        excluded = get_excluded_combos_by_draws(k, exclude_sets)
        excluded_count = len(excluded)
        remaining = total - excluded_count
        stats = {
            "draws_count": len(exclude_sets),
            "excluded_by_draws": excluded_count,
            "excluded_combinations": excluded_count,
            "total_combinations": total,
            "remaining_after_draws": remaining,
            "remaining_combinations": remaining,
            "excluded_percent": round(excluded_count / total * 100, 4) if total else 0.0,
            "exclusion_mode": "exact" if k == NUMBERS_IN_DRAW else "subset",
        }

    if filtered_count is not None:
        stats["filtered_count_all"] = filtered_count
        stats["excluded_by_all_filters"] = total - filtered_count
        stats["excluded_by_other_filters"] = max(0, stats["remaining_after_draws"] - filtered_count)
        stats["remaining_combinations"] = filtered_count
    return stats

def get_sum_limits(k):
    return k * (k + 1) // 2, k * (51 - k) // 2

def get_parity_limits(k):
    return max(0, k - ODDS_IN_POOL), min(EVENS_IN_POOL, k)

def get_prime_limits(k):
    return max(0, k - NON_PRIMES_IN_POOL), min(len(PRIMES), k)

def get_game_limits(k):
    sum_min, sum_max = get_sum_limits(k)
    min_even, max_even = get_parity_limits(k)
    min_prime, max_prime = get_prime_limits(k)
    return {
        "game_size": k,
        "total_combinations": math.comb(25, k),
        "min_sum": sum_min,
        "max_sum": sum_max,
        "min_even": min_even,
        "max_even": max_even,
        "min_prime": min_prime,
        "max_prime": max_prime,
    }

def resolve_repeat_counts(k):
    """Quantas dezenas do último sorteio cabem no jogo de tamanho k."""
    outside_pool = 25 - NUMBERS_IN_DRAW
    return frozenset(
        r for r in DEFAULT_REPEAT_COUNTS
        if r <= NUMBERS_IN_DRAW and 0 <= k - r <= outside_pool
    )

def calc_repeat_overlap_stats():
    """Distribuição de repetições vs concurso anterior (15 dezenas sorteadas de 25)."""
    n = NUMBERS_IN_DRAW
    k_prev = NUMBERS_IN_DRAW
    total = math.comb(25, n)
    rows = []
    for overlap in range(max(0, n + k_prev - 25), min(n, k_prev) + 1):
        ways = math.comb(k_prev, overlap) * math.comb(25 - k_prev, n - overlap)
        theory_pct = ways / total * 100.0 if total else 0.0
        rows.append({
            "repeat_count": overlap,
            "theory_percent": round(theory_pct, 2),
            "historical_percent": REPEAT_OVERLAP_HISTORICAL_PCT.get(overlap),
            "recommended": overlap in REPEAT_OVERLAP_RECOMMENDED,
        })
    recommended_sum = sum(
        r["theory_percent"] for r in rows if r["recommended"]
    )
    return {
        "rows": rows,
        "recommended_counts": list(REPEAT_OVERLAP_RECOMMENDED),
        "recommended_theory_percent": round(recommended_sum, 2),
        "historical_source": "Média histórica Lotofácil (~3.700+ concursos)",
        "note": (
            "Comparativo entre probabilidade matemática (sorteios independentes) "
            "e frequência observada no histórico. Não prevê o próximo concurso."
        ),
    }

def calc_number_frequency_stats(counts=None, total_draws=None, source=None):
    """Ranking de frequência das dezenas 1–25 em sorteios de 15 dezenas."""
    if counts is None:
        counts = NUMBER_FREQUENCY_COUNTS
        total_draws = TOTAL_HISTORICAL_DRAWS
        source = source or (
            f"Histórico Lotofácil ({TOTAL_HISTORICAL_DRAWS:,} concursos, até concurso 3733)"
        )

    theory_pct = (NUMBERS_IN_DRAW / 25) * 100.0
    rows = []
    for number in range(1, 26):
        count = int(counts.get(number, 0))
        percent = (count / total_draws * 100.0) if total_draws else 0.0
        rows.append({
            "number": number,
            "count": count,
            "percent": round(percent, 2),
            "delta_from_theory": round(percent - theory_pct, 2),
        })

    rows.sort(key=lambda r: (-r["count"], r["number"]))
    for idx, row in enumerate(rows, start=1):
        row["rank"] = idx
        if idx <= 5:
            row["tier"] = "hot"
        elif idx >= 21:
            row["tier"] = "cold"
        else:
            row["tier"] = "neutral"

    return {
        "total_draws": total_draws,
        "theory_percent": round(theory_pct, 2),
        "source": source,
        "numbers": rows,
        "most_drawn": rows[:5],
        "least_drawn": list(reversed(rows[-5:])),
        "note": (
            "Cada sorteio sorteia 15 das 25 dezenas (~60% por número). "
            "Diferenças no histórico são esperadas em jogos aleatórios e "
            "não indicam maior chance no próximo concurso."
        ),
    }

def calc_frequency_from_draw_lines(draw_lines):
    """Conta frequência a partir de linhas '01,02,...' com 15 dezenas."""
    counts = {n: 0 for n in range(1, 26)}
    total = 0
    for line in draw_lines:
        if not line or not str(line).strip():
            continue
        nums = [int(n) for n in str(line).split(",") if n.strip()]
        if len(nums) != 15:
            continue
        total += 1
        for n in nums:
            if 1 <= n <= 25:
                counts[n] += 1
    if total == 0:
        return None
    return calc_number_frequency_stats(
        counts=counts,
        total_draws=total,
        source=f"Arquivo analisado ({total:,} sorteio(s))",
    )

def calc_group_overlap_theory(group_size):
    """Distribuição teórica: quantas dezenas de um grupo fixo aparecem no sorteio."""
    total = math.comb(25, NUMBERS_IN_DRAW)
    distribution = []
    for overlap in range(0, min(group_size, NUMBERS_IN_DRAW) + 1):
        outside_need = NUMBERS_IN_DRAW - overlap
        outside_pool = 25 - group_size
        if outside_need < 0 or outside_need > outside_pool:
            continue
        ways = math.comb(group_size, overlap) * math.comb(outside_pool, outside_need)
        pct = ways / total * 100.0 if total else 0.0
        distribution.append({
            "overlap": overlap,
            "theory_percent": round(pct, 2),
            "theory_count_per_3733": round(3733 * ways / total) if total else 0,
        })
    all_together = next((d for d in distribution if d["overlap"] == group_size), None)
    at_least_3 = sum(d["theory_percent"] for d in distribution if d["overlap"] >= 3)
    pair_pct = math.comb(25 - 2, NUMBERS_IN_DRAW - 2) / total * 100.0 if total else 0.0
    return {
        "group_size": group_size,
        "distribution": distribution,
        "all_together_percent": all_together["theory_percent"] if all_together else 0.0,
        "at_least_3_percent": round(at_least_3, 2),
        "pair_together_percent": round(pair_pct, 2),
    }

def analyze_group_cooccurrence_draws(draw_lines, numbers):
    """Conta em quantos sorteios apareceram 0..N dezenas do grupo."""
    group = frozenset(numbers)
    g = len(group)
    overlap_counts = {i: 0 for i in range(g + 1)}
    total = 0
    for line in draw_lines:
        if not line or not str(line).strip():
            continue
        nums = {int(n) for n in str(line).split(",") if n.strip()}
        if len(nums) != 15:
            continue
        total += 1
        overlap = len(nums & group)
        overlap_counts[overlap] = overlap_counts.get(overlap, 0) + 1

    if total == 0:
        return None

    distribution = []
    for overlap in sorted(overlap_counts):
        count = overlap_counts[overlap]
        distribution.append({
            "overlap": overlap,
            "count": count,
            "percent": round(count / total * 100.0, 2),
        })

    pair_counts = {}
    nums_list = sorted(group)
    for i, a in enumerate(nums_list):
        for b in nums_list[i + 1:]:
            pair_hits = 0
            for line in draw_lines:
                if not line or not str(line).strip():
                    continue
                draw_nums = {int(n) for n in str(line).split(",") if n.strip()}
                if len(draw_nums) != 15:
                    continue
                if a in draw_nums and b in draw_nums:
                    pair_hits += 1
            pair_counts[f"{a}-{b}"] = {
                "a": a, "b": b,
                "count": pair_hits,
                "percent": round(pair_hits / total * 100.0, 2),
            }

    all_together = overlap_counts.get(g, 0)
    at_least_3 = sum(overlap_counts.get(i, 0) for i in range(3, g + 1))
    return {
        "numbers": sorted(group),
        "total_draws": total,
        "distribution": distribution,
        "all_together_count": all_together,
        "all_together_percent": round(all_together / total * 100.0, 2),
        "at_least_3_count": at_least_3,
        "at_least_3_percent": round(at_least_3 / total * 100.0, 2),
        "pairs": sorted(pair_counts.values(), key=lambda p: (-p["count"], p["a"], p["b"])),
    }

def calc_top5_cooccurrence_analysis():
    """Análise: os 5 mais sorteados saem juntos? Teoria vs histórico agregado."""
    numbers = list(TOP5_GROUP_CANONICAL)
    theory = calc_group_overlap_theory(len(numbers))
    historical_all = HISTORICAL_TOP5_ALL_TOGETHER
    historical_pct = round(historical_all / TOTAL_HISTORICAL_DRAWS * 100.0, 2)
    theory_all = theory["all_together_percent"]
    theory_expected = round(TOTAL_HISTORICAL_DRAWS * theory_all / 100.0)

    pairs = []
    for (a, b), count in sorted(
        HISTORICAL_TOP5_PAIR_COUNTS.items(),
        key=lambda x: (-x[1], x[0][0], x[0][1]),
    ):
        pairs.append({
            "a": a, "b": b,
            "count": count,
            "percent": round(count / TOTAL_HISTORICAL_DRAWS * 100.0, 2),
            "theory_percent": theory["pair_together_percent"],
        })

    return {
        "top_numbers_by_frequency": list(TOP5_MOST_DRAWN_NUMBERS),
        "analysis_group": numbers,
        "theory": theory,
        "historical": {
            "total_draws": TOTAL_HISTORICAL_DRAWS,
            "all_together_count": historical_all,
            "all_together_percent": historical_pct,
            "theory_expected_count": theory_expected,
            "distribution_estimate": [
                {
                    "overlap": d["overlap"],
                    "theory_percent": d["theory_percent"],
                    "historical_percent": None,
                }
                for d in theory["distribution"]
            ],
            "pairs": pairs,
        },
        "verdict": (
            "Os 5 mais sorteados individualmente (20, 10, 25, 11, 13) já apareceram "
            f"todos juntos em cerca de {historical_pct}% dos concursos históricos "
            f"({historical_all} de {TOTAL_HISTORICAL_DRAWS}). Isso é mais frequente do que "
            "parece, porque cada sorteio já traz 15 dezenas — mas não significa que apostar "
            "só nesses 5 aumente a chance no próximo concurso."
        ),
        "independence_note": (
            "Cada sorteio é independente. A probabilidade matemática de um conjunto fixo de "
            f"5 dezenas sair junto é sempre ~{theory_all:.2f}% por concurso (~1 em "
            f"{round(100 / theory_all) if theory_all else '—'}), seja ele os mais ou os menos "
            "sorteados. O ranking histórico descreve o passado; não prevê o futuro."
        ),
        "betting_note": (
            "Se você marcar apenas esses 5 números numa aposta, ainda precisa que todos "
            "estejam entre as 15 sorteadas — a chance por concurso continua sendo a mesma "
            "combinatória (~5,65%), independentemente de serem 'quentes' ou 'frios'."
        ),
    }

def count_combos_for_single_repeat(k, must_include, must_exclude, last_draw, repeat):
    """Quantos jogos de k dezenas repetem exatamente `repeat` dezenas do último sorteio."""
    if must_include & must_exclude:
        return 0

    mi_last = must_include & last_draw
    mi_out = must_include - last_draw

    last_available = [
        n for n in sorted(last_draw)
        if n not in must_exclude and n not in mi_last
    ]
    out_available = [
        n for n in range(1, 26)
        if n not in last_draw and n not in must_exclude and n not in mi_out
    ]

    need_from_last = repeat - len(mi_last)
    need_outside = k - repeat - len(mi_out)
    if need_from_last < 0 or need_outside < 0:
        return 0
    if need_from_last > len(last_available) or need_outside > len(out_available):
        return 0
    return math.comb(len(last_available), need_from_last) * math.comb(len(out_available), need_outside)

def is_repeat_count_fast_path(f):
    """Caminho rápido: só tabuleiro + último sorteio (sem demais filtros)."""
    limits = get_game_limits(f["game_size"])
    if f["min_sum"] != limits["min_sum"] or f["max_sum"] != limits["max_sum"]:
        return False
    if f["even_count"] != -1 or f["prime_count"] != -1:
        return False
    if f["exclude_max_evens"] or f["exclude_max_odds"]:
        return False
    if (
        f["exclude_sequence_6"]
        or f["exclude_sequence_7"]
        or f["exclude_sequence_8"]
        or f.get("exclude_sequence_9")
        or f.get("exclude_sequence_10")
    ):
        return False
    if f.get("run_budget_active") or f.get("require_blocks_active"):
        return False
    if f["exclude_sets"] or f["exclude_combos"] or f["exclude_subsets"]:
        return False
    if f["sequence_group"] and f["sequence_counts"]:
        return False
    if f["banned_numbers"]:
        return False
    return True

def get_cached_repeat_options(key):
    return REPEAT_OPTIONS_CACHE.get(key)

def set_cached_repeat_options(key, counts):
    if key not in REPEAT_OPTIONS_CACHE and len(REPEAT_OPTIONS_CACHE) >= REPEAT_OPTIONS_CACHE_MAX:
        REPEAT_OPTIONS_CACHE.pop(next(iter(REPEAT_OPTIONS_CACHE)))
    REPEAT_OPTIONS_CACHE[key] = counts

def calc_repeat_option_counts(f):
    """Jogos possíveis para cada quantidade de repetição (6–10), com filtros atuais."""
    if not f["last_draw"]:
        return {}

    key = filter_cache_key({**f, "repeat_counts": frozenset()})
    cached = get_cached_repeat_options(key)
    if cached is not None:
        return cached

    valid = sorted(resolve_repeat_counts(f["game_size"]))
    counts = {r: 0 for r in valid}
    f_no_repeat = {**f, "repeat_counts": frozenset()}
    excluded = get_all_excluded(f_no_repeat)

    if is_repeat_count_fast_path(f_no_repeat):
        for repeat in valid:
            counts[repeat] = count_combos_for_single_repeat(
                f["game_size"],
                f["must_include"],
                excluded,
                f["last_draw"],
                repeat,
            )
    else:
        for combo in iter_filtered_combos(f_no_repeat):
            overlap = len(frozenset(combo) & f["last_draw"])
            if overlap in counts:
                counts[overlap] += 1

    set_cached_repeat_options(key, counts)
    return counts

def get_combinations(k):
    """Cache completo só para jogos menores (k >= 19)."""
    if k not in GAME_SIZES:
        raise ValueError(f"Tamanho de jogo inválido: {k}")
    if k > STREAMING_GAME_THRESHOLD:
        if k not in COMBINATIONS_CACHE:
            print(f"Gerando combinações C(25,{k})...")
            t0 = time.time()
            combos = [ComboInfo(c) for c in itertools.combinations(range(1, 26), k)]
            COMBINATIONS_CACHE[k] = combos
            print(f"  {len(combos):,} combinações em {time.time() - t0:.2f}s")
        return COMBINATIONS_CACHE[k]
    return None

def iter_combo_tuples(k, must_include, must_exclude, last_draw=None, repeat_counts=None):
    """Gera combinações sem materializar o universo inteiro."""
    if last_draw and repeat_counts:
        yield from iter_combo_tuples_repeat(k, must_include, must_exclude, last_draw, repeat_counts)
        return

    if must_include & must_exclude:
        return

    pool = [n for n in range(1, 26) if n not in must_exclude and n not in must_include]
    need = k - len(must_include)
    if need < 0 or need > len(pool):
        return

    base = tuple(sorted(must_include))
    if need == 0:
        yield base
        return

    if not must_include and not must_exclude:
        yield from itertools.combinations(range(1, 26), k)
        return

    for extra in itertools.combinations(pool, need):
        yield tuple(sorted(base + extra))

def iter_combo_tuples_repeat(k, must_include, must_exclude, last_draw, repeat_counts):
    """Gera só combinações com N dezenas em comum com o último sorteio."""
    if must_include & must_exclude:
        return

    mi_last = must_include & last_draw
    mi_out = must_include - last_draw

    last_available = [n for n in sorted(last_draw) if n not in must_exclude and n not in mi_last]
    out_available = [
        n for n in range(1, 26)
        if n not in last_draw and n not in must_exclude and n not in mi_out
    ]

    seen = set()
    for repeat in sorted(repeat_counts):
        if repeat < len(mi_last):
            continue
        if repeat > len(mi_last) + len(last_available):
            continue

        need_from_last = repeat - len(mi_last)
        need_outside = k - repeat - len(mi_out)
        if need_outside < 0 or need_outside > len(out_available):
            continue

        base_last = tuple(sorted(mi_last))
        base_out = tuple(sorted(mi_out))

        if need_from_last == 0 and need_outside == 0:
            combo = tuple(sorted(base_last + base_out))
            if combo not in seen:
                seen.add(combo)
                yield combo
            continue

        for extra_last in itertools.combinations(last_available, need_from_last):
            last_part = base_last + extra_last
            for extra_out in itertools.combinations(out_available, need_outside):
                combo = tuple(sorted(last_part + base_out + extra_out))
                if combo not in seen:
                    seen.add(combo)
                    yield combo

def combo_stats(combo):
    total = 0
    evens = 0
    primes = 0
    for x in combo:
        total += x
        if x % 2 == 0:
            evens += 1
        if x in PRIMES:
            primes += 1
    return total, evens, primes

def calc_max_consecutive(combo):
    max_run = 1
    run = 1
    for i in range(1, len(combo)):
        if combo[i] == combo[i - 1] + 1:
            run += 1
            if run > max_run:
                max_run = run
        else:
            run = 1
    return max_run

def get_consecutive_runs(combo):
    combo = sorted(combo)
    runs = []
    run = 1
    for i in range(1, len(combo)):
        if combo[i] == combo[i - 1] + 1:
            run += 1
        else:
            if run >= 2:
                runs.append(run)
            run = 1
    if run >= 2:
        runs.append(run)
    return runs

def passes_consecutive_run_budget(combo, primary_len, primary_count, other_max):
    """Limita blocos seguidos no volante.

    Permite até `primary_count` sequências de tamanho `primary_len`
    (ex.: um bloco de 5) e exige que os demais blocos tenham no máximo
    `other_max` (ex.: 4). Nenhum bloco pode passar de `primary_len`.
    """
    if primary_len <= 1:
        return True
    primary_count = max(0, int(primary_count))
    other_max = max(1, min(int(other_max), primary_len - 1))
    runs = get_consecutive_runs(combo)
    if not runs:
        return True
    if any(run > primary_len for run in runs):
        return False
    if sum(1 for run in runs if run == primary_len) > primary_count:
        return False
    return all(run <= other_max or run == primary_len for run in runs)

def passes_required_blocks(combo, lengths, min_count):
    """Exige pelo menos `min_count` blocos seguidos com tamanho exato em `lengths`.

    Bloco = sequência máxima sem buraco; um bloco de 5 não conta como 3 nem 4.
    """
    if not lengths or min_count <= 0:
        return True
    hits = sum(1 for run in get_consecutive_runs(combo) if run in lengths)
    return hits >= min_count

def extract_consecutive_sequences_from_draw(nums, min_len=3):
    """Subsequências consecutivas no volante (ex.: 1-2-3-4) dentro de um sorteio."""
    sorted_nums = sorted(nums)
    found = set()
    n = len(sorted_nums)
    i = 0
    while i < n:
        j = i
        while j + 1 < n and sorted_nums[j + 1] == sorted_nums[j] + 1:
            j += 1
        run_len = j - i + 1
        if run_len >= min_len:
            for length in range(min_len, run_len + 1):
                for start in range(i, j - length + 2):
                    found.add(tuple(sorted_nums[start:start + length]))
        i = j + 1
    return found

def analyze_consecutive_sequences_draws(
    draw_lines,
    min_length=3,
    max_length=8,
    top_n=60,
):
    """Ranking de sequências consecutivas mais frequentes nos sorteios importados."""
    seq_counts = {}
    max_run_hist = {}
    draws_with_at_least = {l: 0 for l in range(min_length, max_length + 1)}
    total_draws = 0

    for line in draw_lines:
        if not line or not str(line).strip():
            continue
        nums = [int(n) for n in str(line).split(",") if n.strip()]
        if len(nums) != 15 or len(set(nums)) != 15:
            continue
        if not all(1 <= n <= 25 for n in nums):
            continue

        total_draws += 1
        sorted_nums = sorted(nums)
        max_run = calc_max_consecutive(sorted_nums)
        max_run_hist[max_run] = max_run_hist.get(max_run, 0) + 1

        for length in range(min_length, max_length + 1):
            if max_run >= length:
                draws_with_at_least[length] += 1

        for seq in extract_consecutive_sequences_from_draw(sorted_nums, min_length):
            if len(seq) > max_length:
                continue
            seq_counts[seq] = seq_counts.get(seq, 0) + 1

    if total_draws == 0:
        return None

    def seq_row(seq, count):
        label = " ".join(f"{n:02d}" for n in seq)
        return {
            "numbers": list(seq),
            "length": len(seq),
            "label": label,
            "count": count,
            "percent": round(count / total_draws * 100.0, 2),
        }

    ranked = sorted(
        seq_counts.items(),
        key=lambda item: (-item[1], -len(item[0]), item[0][0]),
    )
    top_sequences = [seq_row(seq, count) for seq, count in ranked[:top_n]]

    by_length = {}
    for length in range(min_length, max_length + 1):
        length_ranked = [
            (seq, count) for seq, count in ranked if len(seq) == length
        ][:20]
        by_length[str(length)] = [seq_row(seq, count) for seq, count in length_ranked]

    max_run_distribution = [
        {
            "max_run": run_len,
            "count": count,
            "percent": round(count / total_draws * 100.0, 2),
        }
        for run_len, count in sorted(max_run_hist.items())
    ]

    return {
        "total_draws": total_draws,
        "min_length": min_length,
        "max_length": max_length,
        "max_run_distribution": max_run_distribution,
        "draws_with_at_least": [
            {
                "length": length,
                "count": draws_with_at_least[length],
                "percent": round(draws_with_at_least[length] / total_draws * 100.0, 2),
            }
            for length in range(min_length, max_length + 1)
        ],
        "top_sequences": top_sequences,
        "by_length": by_length,
        "unique_sequences": len(seq_counts),
        "note": (
            "Conta quantas vezes cada sequência consecutiva no volante (ex.: 05-06-07-08) "
            "apareceu nos sorteios analisados. Cada sequência conta no máximo 1 vez por concurso."
        ),
    }

def calc_quintile_counts(combo):
    bins = [0] * 5
    for n in combo:
        bins[min(4, (n - 1) // 5)] += 1
    return bins

def _pattern_thresholds(k):
    """Limites de penalidade conforme tamanho do jogo (jogos maiores toleram runs um pouco maiores)."""
    if k <= 15:
        return 3, 5, 5
    if k <= 17:
        return 4, 6, 5
    return 5, 7, 6

def calc_pattern_score(combo):
    """Penalidade de padrão no volante 1–25: blocos seguidos longos e clusters extremos."""
    k = len(combo)
    run_min, bin_heavy, cluster_heavy = _pattern_thresholds(k)
    combo = sorted(combo)
    penalty = 0.0

    max_run = calc_max_consecutive(combo)
    if max_run >= run_min:
        penalty += (max_run - (run_min - 1)) ** 2 * 14.0

    runs = get_consecutive_runs(combo)
    long_runs = [r for r in runs if r >= run_min]
    penalty += sum(r * 9.0 for r in long_runs)
    if len(long_runs) >= 2:
        penalty += 32.0

    low = sum(1 for n in combo if n <= 5)
    high = sum(1 for n in combo if n >= 21)
    if low >= cluster_heavy:
        penalty += 38.0
    elif low >= cluster_heavy - 1:
        penalty += 18.0
    if high >= cluster_heavy:
        penalty += 38.0
    elif high >= cluster_heavy - 1:
        penalty += 18.0
    if low >= cluster_heavy - 1 and high >= cluster_heavy - 1:
        penalty += 22.0

    bins = calc_quintile_counts(combo)
    for count in bins:
        if count >= bin_heavy:
            penalty += 26.0
        elif count == bin_heavy - 1:
            penalty += 6.0

    return round(penalty, 2)

def calc_typicality_percent(penalty):
    """Índice heurístico de 'espalhamento' no volante — não é probabilidade de acerto."""
    pct = 95.0 - penalty * 0.35
    return round(max(5.0, min(99.0, pct)), 1)

def build_smart_history_profile(draws):
    """Extrai padrões descritivos dos sorteios importados para orientar a geração."""
    cleaned = []
    for draw in draws or []:
        nums = sorted({int(n) for n in draw if 1 <= int(n) <= 25})
        if len(nums) == NUMBERS_IN_DRAW:
            cleaned.append(nums)
    if len(cleaned) < 5:
        return None

    total = len(cleaned)
    freq = {n: 0 for n in range(1, 26)}
    even_counts = {}
    prime_counts = {}
    max_runs = {}
    sums = []
    quintile_acc = [0.0] * 5

    for nums in cleaned:
        for n in nums:
            freq[n] += 1
        combo_sum, even_count, prime_count = combo_stats(nums)
        even_counts[even_count] = even_counts.get(even_count, 0) + 1
        prime_counts[prime_count] = prime_counts.get(prime_count, 0) + 1
        run = calc_max_consecutive(nums)
        max_runs[run] = max_runs.get(run, 0) + 1
        sums.append(combo_sum)
        for i, c in enumerate(calc_quintile_counts(nums)):
            quintile_acc[i] += c

    freq_rate = {n: freq[n] / total for n in range(1, 26)}
    avg_freq = sum(freq_rate.values()) / 25.0
    mode_even = max(even_counts.items(), key=lambda x: (x[1], -abs(x[0] - 7)))[0]
    mode_prime = max(prime_counts.items(), key=lambda x: (x[1], -abs(x[0] - 6)))[0]
    mode_max_run = max(max_runs.items(), key=lambda x: (x[1], -x[0]))[0]
    mean_sum = sum(sums) / total
    hot = sorted(range(1, 26), key=lambda n: (-freq[n], n))[:10]
    cold = sorted(range(1, 26), key=lambda n: (freq[n], n))[:5]

    return {
        "total_draws": total,
        "freq": freq,
        "freq_rate": freq_rate,
        "avg_freq": avg_freq,
        "mode_even": mode_even,
        "mode_prime": mode_prime,
        "mode_max_run": mode_max_run,
        "mean_sum": mean_sum,
        "avg_quintiles": [q / total for q in quintile_acc],
        "hot_numbers": hot,
        "cold_numbers": cold,
        "even_distribution": dict(sorted(even_counts.items())),
        "max_run_distribution": dict(sorted(max_runs.items())),
    }

def summarize_history_profile(profile):
    if not profile:
        return None
    return {
        "total_draws": profile["total_draws"],
        "mode_even": profile["mode_even"],
        "mode_odd": NUMBERS_IN_DRAW - profile["mode_even"],
        "mode_prime": profile["mode_prime"],
        "mode_max_run": profile["mode_max_run"],
        "mean_sum": round(profile["mean_sum"], 1),
        "hot_numbers": profile["hot_numbers"],
        "cold_numbers": profile["cold_numbers"],
        "note": (
            "Padrões descritivos do histórico importado. "
            "Aproximam combinações 'parecidas' com o passado."
        ),
    }

def calc_history_affinity_penalty(combo, profile):
    """Penalidade quanto mais a combinação diverge do perfil histórico (menor = melhor)."""
    if not profile:
        return 0.0

    k = len(combo)
    scale = k / float(NUMBERS_IN_DRAW)
    combo = sorted(combo)
    combo_sum, even_count, prime_count = combo_stats(combo)
    penalty = 0.0

    # Preferir dezenas historicamente mais frequentes
    for n in combo:
        rate = profile["freq_rate"].get(n, 0.0)
        gap = profile["avg_freq"] - rate
        if gap > 0:
            penalty += gap * 55.0

    hot = set(profile["hot_numbers"])
    cold = set(profile["cold_numbers"])
    hot_hits = len(set(combo) & hot)
    cold_hits = len(set(combo) & cold)
    expected_hot = max(1, round(len(hot) * scale * 0.55))
    if hot_hits < expected_hot:
        penalty += (expected_hot - hot_hits) * 6.0
    penalty += cold_hits * 4.5

    expected_even = int(round(profile["mode_even"] * scale))
    min_even, max_even = get_parity_limits(k)
    expected_even = max(min_even, min(max_even, expected_even))
    penalty += abs(even_count - expected_even) * 14.0

    expected_prime = int(round(profile["mode_prime"] * scale))
    expected_prime = max(0, min(9, min(k, expected_prime)))
    penalty += abs(prime_count - expected_prime) * 5.0

    expected_sum = profile["mean_sum"] * scale
    penalty += abs(combo_sum - expected_sum) / 6.5

    max_run = calc_max_consecutive(combo)
    mode_run = profile["mode_max_run"]
    if max_run > mode_run + 1:
        penalty += (max_run - mode_run) ** 2 * 9.0
    elif max_run < max(2, mode_run - 2):
        penalty += (mode_run - max_run) * 3.0

    hist_q = profile["avg_quintiles"]
    combo_q = calc_quintile_counts(combo)
    for hq, cq in zip(hist_q, combo_q):
        penalty += abs(cq - hq * scale) * 4.0

    return round(penalty, 2)

def calc_smart_total_score(combo, profile=None):
    pattern = calc_pattern_score(combo)
    history = calc_history_affinity_penalty(combo, profile) if profile else 0.0
    # Com histórico, a afinidade pesa mais; sem histórico, só o padrão visual.
    if profile:
        total = pattern * 0.35 + history * 0.65
    else:
        total = pattern
    return round(total, 2), pattern, history

def format_smart_game_entry(combo, profile=None):
    combo = sorted(combo)
    total, pattern, history = calc_smart_total_score(combo, profile)
    combo_sum, even_count, prime_count = combo_stats(combo)
    entry = {
        "numbers": combo,
        "pattern_score": pattern,
        "history_score": history,
        "total_score": total,
        "typicality_percent": calc_typicality_percent(total if profile else pattern),
        "typicality_note": (
            "Heurística: distribuição no volante"
            + (" + semelhança com o histórico importado" if profile else "")
            + ". A chance de acerto no modo memória aparece ao lado."
        ),
        "max_consecutive": calc_max_consecutive(combo),
        "consecutive_runs": get_consecutive_runs(combo),
        "quintile_distribution": calc_quintile_counts(combo),
        "sum": combo_sum,
        "even_count": even_count,
        "odd_count": len(combo) - even_count,
        "prime_count": prime_count,
    }
    if profile:
        entry["hot_overlap"] = sorted(set(combo) & set(profile["hot_numbers"]))
    return entry

def _combo_difference(a, b):
    return len(set(a) - set(b))

def select_diverse_games(candidates, count, rng=None):
    """Escolhe jogos bons e diferentes entre si.

    `candidates`: lista (score, combo) com score menor = melhor.
    Com `rng`, o primeiro jogo e os empates variam a cada geração.
    """
    if not candidates:
        return []
    rng = rng or random.Random()
    count = max(1, min(count, len(candidates)))
    ordered = sorted(candidates, key=lambda x: (x[0], tuple(x[1])))
    best_score = ordered[0][0]
    band = [c for c in ordered if c[0] <= best_score + SMART_GAME_SCORE_BAND]
    if len(band) < count:
        band = ordered[:]

    starter_pool = band[: max(count * 4, min(len(band), 24))]
    first = rng.choice(starter_pool)
    selected = [list(first[1])]
    selected_sets = [set(first[1])]
    remaining = [c for c in band if tuple(c[1]) != tuple(first[1])]

    while len(selected) < count and remaining:
        scored = []
        for score, combo in remaining:
            diff = min(_combo_difference(combo, prev) for prev in selected_sets)
            # Maximiza diferença; depois favorece score; jitter quebra empates.
            scored.append((diff, -score + rng.random() * 4.0, score, combo))
        scored.sort(reverse=True)
        pick_n = min(10, len(scored))
        # Peso maior para as opções mais diversas do topo.
        weights = [pick_n - i for i in range(pick_n)]
        chosen = rng.choices(scored[:pick_n], weights=weights, k=1)[0]
        _, _, _, combo = chosen
        selected.append(list(combo))
        selected_sets.append(set(combo))
        remaining = [c for c in remaining if tuple(c[1]) != tuple(combo)]

    return selected

def _parse_avoid_games(raw, game_size):
    """Aceita lista JSON [[1,2,...], ...] ou string '1,2,...;3,4,...'."""
    avoid = []
    if not raw:
        return avoid
    entries = raw
    if isinstance(raw, str):
        entries = [part for part in raw.split(";") if part.strip()]
    if not isinstance(entries, list):
        return avoid
    for entry in entries:
        if isinstance(entry, str):
            nums = [int(x) for x in entry.replace("-", ",").split(",") if x.strip().isdigit()]
        elif isinstance(entry, (list, tuple)):
            nums = [int(x) for x in entry]
        else:
            continue
        nums = sorted({n for n in nums if 1 <= n <= 25})
        if len(nums) == game_size:
            avoid.append(nums)
        if len(avoid) >= SMART_GAME_AVOID_MAX:
            break
    return avoid

def _collect_smart_candidate_heap(
    f, profile, pool_size, scan_limit, max_pattern_score, rng, avoid_sets, skip=0
):
    """Varre combinações do filtro e mantém um pool dos melhores (com jitter)."""
    heap = []  # (-rank, idx, true_total, combo) — pior do pool no topo
    scanned = 0
    skipped = 0
    idx = 0
    considered = 0
    accepted = 0

    for combo in iter_filtered_combos(f):
        scanned += 1
        if skipped < skip:
            skipped += 1
            continue

        combo_key = frozenset(combo)
        if combo_key in avoid_sets:
            considered += 1
            if considered >= scan_limit:
                break
            continue

        total, pattern, _history = calc_smart_total_score(combo, profile)
        if max_pattern_score is not None and pattern > max_pattern_score:
            considered += 1
            if considered >= scan_limit:
                break
            continue

        rank = total + rng.uniform(0.0, SMART_GAME_JITTER)
        item = (-rank, idx, total, tuple(combo))
        idx += 1
        if len(heap) < pool_size:
            heapq.heappush(heap, item)
        elif rank < -heap[0][0]:
            heapq.heapreplace(heap, item)

        accepted += 1
        considered += 1
        if considered >= scan_limit:
            break

    return heap, scanned, skipped, considered, accepted

def _merge_candidate_heaps(primary, secondary, pool_size):
    """Une dois heaps de candidatos, mantendo os melhores até pool_size."""
    merged = {}
    for item in list(primary) + list(secondary):
        _neg, idx, total, combo = item
        key = frozenset(combo)
        prev = merged.get(key)
        if prev is None or total < prev[2]:
            merged[key] = item
    items = sorted(merged.values(), key=lambda x: x[2])[:pool_size]
    heap = []
    for idx, item in enumerate(items):
        _neg, _old_idx, total, combo = item
        heapq.heappush(heap, (-total, idx, total, combo))
    return heap

def generate_smart_games(f, count, max_pattern_score=None, seed=None, avoid=None):
    k = f["game_size"]
    if k not in SMART_GAME_SIZES:
        raise ValueError("Jogos inteligentes disponíveis apenas para 15 a 20 dezenas.")

    count = max(1, min(int(count), SMART_GAME_MAX_COUNT))
    f = enrich_filters(f)
    profile = build_smart_history_profile(f.get("exclude_sets") or [])
    rng = random.Random(seed if seed is not None else time.time_ns())
    avoid_list = _parse_avoid_games(avoid, k)
    avoid_sets = {frozenset(c) for c in avoid_list}

    universe = math.comb(25, k)
    scan_limit = min(SMART_GAME_MAX_SCAN, universe)
    pool_size = min(
        max(count * SMART_GAME_CANDIDATE_POOL, SMART_GAME_POOL_MIN),
        scan_limit,
    )
    # Pulo limitado: em universos pequenos (ex.: 20 dez.) não pode esgotar o fluxo.
    skip_max = max(0, min(scan_limit // 3, max(0, universe - count * 20)))
    skip = rng.randint(0, skip_max) if skip_max > 0 else 0

    heap, scanned, skipped, considered, accepted = _collect_smart_candidate_heap(
        f, profile, pool_size, scan_limit, max_pattern_score, rng, avoid_sets, skip=skip
    )
    score_relaxed = False
    scan_truncated = considered >= scan_limit and scan_limit < universe

    if accepted < count and skip > 0:
        heap2, scanned2, _, considered2, accepted2 = _collect_smart_candidate_heap(
            f, profile, pool_size, scan_limit, max_pattern_score, rng, avoid_sets, skip=0
        )
        heap = _merge_candidate_heaps(heap, heap2, pool_size)
        scanned += scanned2
        considered += considered2
        accepted = max(accepted, accepted2)
        skipped = 0
        scan_truncated = considered2 >= scan_limit and scan_limit < universe

    # Limite de padrão é preferência: se não encheu a quantidade pedida, completa com os melhores.
    if len(heap) < count:
        heap3, scanned3, _, considered3, _accepted3 = _collect_smart_candidate_heap(
            f, profile, pool_size, scan_limit, None, rng, avoid_sets, skip=0
        )
        if heap3:
            heap = _merge_candidate_heaps(heap, heap3, pool_size)
            score_relaxed = max_pattern_score is not None
        scanned += scanned3
        considered += considered3
        scan_truncated = considered3 >= scan_limit and scan_limit < universe

    if not heap and avoid_sets:
        heap4, scanned4, _, considered4, _ = _collect_smart_candidate_heap(
            f, profile, pool_size, scan_limit, None, rng, set(), skip=0
        )
        heap = heap4
        scanned += scanned4
        considered += considered4
        score_relaxed = True
        scan_truncated = considered4 >= scan_limit and scan_limit < universe

    if not heap:
        return {
            "game_size": k,
            "requested_count": count,
            "generated_count": 0,
            "games": [],
            "scanned": scanned,
            "scan_truncated": scan_truncated,
            "score_relaxed": score_relaxed,
            "seed": seed,
            "history_profile": summarize_history_profile(profile),
            "message": "Nenhuma combinação do filtro atende aos critérios de padrão.",
        }

    candidates = [(true_total, list(combo)) for _neg, _i, true_total, combo in heap]
    selected = select_diverse_games(candidates, count, rng=rng)
    games = [format_smart_game_entry(combo, profile) for combo in selected]

    if profile:
        method = "filters+pattern+history+random"
        description = (
            f"Combinações que passam pelos filtros marcados, com bom score de padrão no volante "
            f"e semelhança com o histórico importado ({profile['total_draws']} sorteios): "
            f"paridade típica {profile['mode_even']} pares/"
            f"{NUMBERS_IN_DRAW - profile['mode_even']} ímpares, soma média "
            f"{profile['mean_sum']:.0f}, dezenas quentes e formato de blocos. "
            "Cada geração sorteia um conjunto diferente entre os melhores candidatos."
        )
        disclaimer = (
            "Modo memória: tudo que os filtros removem não entra nos jogos e é tratado "
            "como resultado que não sai; a chance de acerto reflete esse universo reduzido."
        )
    else:
        method = "filters+pattern+random"
        description = (
            "Heurística de distribuição no volante entre as combinações do filtro. "
            "Cada clique sorteia jogos diferentes entre os melhores candidatos. "
            "Importe o histórico de sorteios para também orientar por padrões passados "
            "(paridade, soma, frequência e blocos)."
        )
        disclaimer = (
            "Modo memória: tudo que os filtros removem não entra nos jogos e é tratado "
            "como resultado que não sai. Tipicidade e padrão medem só a distribuição no volante."
        )

    message = None
    if len(games) < count:
        message = (
            f"Só foi possível montar {len(games)} de {count} jogo(s) com os filtros atuais."
        )
    elif score_relaxed:
        message = (
            "O limite de penalidade era muito rígido para a quantidade pedida; "
            "completei com os melhores jogos do filtro."
        )

    return {
        "game_size": k,
        "requested_count": count,
        "generated_count": len(games),
        "games": games,
        "scanned": scanned,
        "scan_truncated": scan_truncated,
        "skip_offset": skipped,
        "score_relaxed": score_relaxed,
        "seed": seed,
        "max_pattern_score": max_pattern_score,
        "method": method,
        "history_profile": summarize_history_profile(profile),
        "description": description,
        "disclaimer": disclaimer,
        "message": message,
    }

def filter_cache_key(f):
    return (
        f["game_size"],
        frozenset(f["must_include"]),
        frozenset(f["must_exclude"]),
        tuple(sorted(frozenset(es) for es in f["exclude_sets"])),
        frozenset(f["exclude_combos"]),
        f["min_sum"],
        f["max_sum"],
        f["even_count"],
        f["prime_count"],
        f["exclude_max_evens"],
        f["exclude_max_odds"],
        f["exclude_sequence_6"],
        f["exclude_sequence_7"],
        f["exclude_sequence_8"],
        f.get("exclude_sequence_9", False),
        f.get("exclude_sequence_10", False),
        f.get("run_budget_active", False),
        f.get("run_budget_primary_len", 0),
        f.get("run_budget_primary_count", 0),
        f.get("run_budget_other_max", 0),
        f.get("require_blocks_active", False),
        f.get("require_blocks_lengths", frozenset()),
        f.get("require_blocks_min", 0),
        f["min_even"],
        f["max_even"],
        f["last_draw"],
        f["repeat_counts"],
        f["sequence_group"],
        f["sequence_counts"],
        f["banned_numbers"],
        tuple(sorted(f["exclude_subsets"])),
    )

def get_cached_stats(key):
    return FILTER_STATS_CACHE.get(key)

def set_cached_stats(key, stats):
    if key not in FILTER_STATS_CACHE and len(FILTER_STATS_CACHE) >= FILTER_STATS_CACHE_MAX:
        FILTER_STATS_CACHE.pop(next(iter(FILTER_STATS_CACHE)))
    FILTER_STATS_CACHE[key] = stats

def get_all_excluded(f):
    return f["must_exclude"] | f["banned_numbers"]

def passes_filters_tuple(combo, f, combo_sum, even_count, prime_count, combo_frozenset=None):
    if combo_frozenset is None:
        combo_frozenset = frozenset(combo)

    if f["must_include"] and not f["must_include"].issubset(combo_frozenset):
        return False

    if not (f["min_sum"] <= combo_sum <= f["max_sum"]):
        return False
    if f["even_count"] != -1 and even_count != f["even_count"]:
        return False
    if f["prime_count"] != -1 and prime_count != f["prime_count"]:
        return False
    if f["exclude_max_evens"] and even_count == f["max_even"]:
        return False
    if f["exclude_max_odds"] and even_count == f["min_even"]:
        return False
    max_run = None
    if (
        f["exclude_sequence_6"]
        or f["exclude_sequence_7"]
        or f["exclude_sequence_8"]
        or f.get("exclude_sequence_9")
        or f.get("exclude_sequence_10")
    ):
        max_run = calc_max_consecutive(combo)
    if f["exclude_sequence_6"] and max_run >= 6:
        return False
    if f["exclude_sequence_7"] and max_run >= 7:
        return False
    if f["exclude_sequence_8"] and max_run >= 8:
        return False
    if f.get("exclude_sequence_9") and max_run >= 9:
        return False
    if f.get("exclude_sequence_10") and max_run >= 10:
        return False
    if f.get("run_budget_active") and not passes_consecutive_run_budget(
        combo,
        f.get("run_budget_primary_len", 0),
        f.get("run_budget_primary_count", 1),
        f.get("run_budget_other_max", 0),
    ):
        return False
    if f.get("require_blocks_active") and not passes_required_blocks(
        combo,
        f.get("require_blocks_lengths", frozenset()),
        f.get("require_blocks_min", 1),
    ):
        return False

    if f["last_draw"] and f["repeat_counts"]:
        if len(combo_frozenset & f["last_draw"]) not in f["repeat_counts"]:
            return False

    if f["sequence_group"] and f["sequence_counts"]:
        overlap = len(combo_frozenset & f["sequence_group"])
        if overlap in f["sequence_counts"]:
            return False

    all_excluded = get_all_excluded(f)
    if all_excluded and not all_excluded.isdisjoint(combo_frozenset):
        return False
    if f["exclude_sets"]:
        excluded_by_draws = f.get("excluded_combos_by_draws")
        if excluded_by_draws is None:
            excluded_by_draws = get_excluded_combos_by_draws(f["game_size"], f["exclude_sets"])
        if combo_frozenset in excluded_by_draws:
            return False
    if f["exclude_combos"] and combo_frozenset in f["exclude_combos"]:
        return False
    if f["exclude_subsets"]:
        for pattern in f["exclude_subsets"]:
            if pattern.issubset(combo_frozenset):
                return False
    return True

def passes_filters(c, f):
    return passes_filters_tuple(c.combo, f, c.sum, c.even_count, c.prime_count, c.combo_set)

def filter_log(msg):
    if FILTER_LOG:
        print(msg, flush=True)

def enrich_filters(f):
    if f["exclude_sets"] and f["game_size"] >= NUMBERS_IN_DRAW:
        n_draws = len(f["exclude_sets"])
        t0 = time.perf_counter()
        filter_log(
            f"[filtro] pré-cálculo de exclusões · {n_draws:,} sorteio(s) · k={f['game_size']}..."
        )
        f["excluded_combos_by_draws"] = get_excluded_combos_by_draws(f["game_size"], f["exclude_sets"])
        filter_log(
            f"[filtro] exclusões prontas · {len(f['excluded_combos_by_draws']):,} combinações "
            f"em {time.perf_counter() - t0:.2f}s"
        )
    else:
        f["excluded_combos_by_draws"] = frozenset()
    return f

def _filter_source(f):
    """Fonte de candidatos (cache materializado ou streaming)."""
    k = f["game_size"]
    excluded = get_all_excluded(f)
    cached_list = get_combinations(k)
    if cached_list is not None:
        return (
            (c.combo, c.sum, c.even_count, c.prime_count, c.combo_set)
            for c in cached_list
        ), True
    return (
        (combo, *combo_stats(combo), None)
        for combo in iter_combo_tuples(
            k,
            f["must_include"],
            excluded,
            f["last_draw"] or None,
            f["repeat_counts"] or None,
        )
    ), False

def query_combinations(f, page, page_size, include_stats=True):
    t0 = time.perf_counter()
    f = enrich_filters(f)
    k = f["game_size"]
    total_count = math.comb(25, k)
    limits = get_game_limits(k)
    cache_key = filter_cache_key(f)
    cached = get_cached_stats(cache_key)
    start = (page - 1) * page_size

    filter_log(
        f"[filtro] início · k={k} · universo={total_count:,} · página={page} "
        f"· page_size={page_size} · stats={'sim' if include_stats else 'não'} "
        f"· cache={'HIT' if cached else 'MISS'}"
    )

    if cached and not include_stats:
        page_combos = []
        page_repeat_counts = []
        has_last_draw = bool(f["last_draw"] and f["repeat_counts"])
        idx = 0
        scanned = 0
        source, from_materialized = _filter_source(f)
        for combo, combo_sum, even_count, prime_count, combo_set in source:
            scanned += 1
            if not passes_filters_tuple(combo, f, combo_sum, even_count, prime_count, combo_set):
                continue
            idx += 1
            if idx > start and len(page_combos) < page_size:
                page_combos.append(list(combo))
                if has_last_draw:
                    page_repeat_counts.append(len(frozenset(combo) & f["last_draw"]))
            if len(page_combos) >= page_size:
                break
        elapsed = time.perf_counter() - t0
        filter_log(
            f"[filtro] fim (cache) · match≈{cached['filtered_count']:,} · "
            f"varridos={scanned:,} · {elapsed:.2f}s"
        )
        return {
            "game_size": k,
            "limits": limits,
            "total_count": total_count,
            "filtered_count": cached["filtered_count"],
            "page": page,
            "page_size": page_size,
            "combinations": page_combos,
            "page_repeat_counts": page_repeat_counts,
            "repeat_filter_active": has_last_draw,
            "active_repeat_counts": sorted(f["repeat_counts"]) if has_last_draw else [],
            "stats": cached["stats"],
            "from_cache": True,
            "exclude_draws_stats": calc_exclude_draws_stats(k, f["exclude_sets"], cached["filtered_count"]),
            "timing": {
                "elapsed_ms": round(elapsed * 1000, 1),
                "scanned": scanned,
                "matched": cached["filtered_count"],
                "from_cache": True,
                "rate_per_sec": round(scanned / elapsed, 1) if elapsed > 0 else None,
            },
        }

    total_filtered = 0
    sum_dist = {}
    even_dist = {}
    prime_dist = {}
    repeat_dist = {}
    page_combos = []
    page_repeat_counts = []
    collect_stats = include_stats or cached is None
    has_last_draw = bool(f["last_draw"] and f["repeat_counts"])
    scanned = 0
    last_log_at = 0
    source, from_materialized = _filter_source(f)
    filter_log(
        f"[filtro] varredura · fonte={'cache k=' + str(k) if from_materialized else 'streaming'} "
        f"· log a cada {FILTER_LOG_EVERY:,} candidatos"
    )

    for combo, combo_sum, even_count, prime_count, combo_set in source:
        scanned += 1
        if FILTER_LOG and (scanned - last_log_at >= FILTER_LOG_EVERY or scanned == 1):
            elapsed = time.perf_counter() - t0
            rate = scanned / elapsed if elapsed > 0 else 0
            pct = min(100.0, scanned / total_count * 100) if total_count else 0
            filter_log(
                f"[filtro] {scanned:,}/{total_count:,} ({pct:.1f}%) · "
                f"match={total_filtered:,} · {rate:,.0f} cand/s · {elapsed:.1f}s"
            )
            last_log_at = scanned

        if not passes_filters_tuple(combo, f, combo_sum, even_count, prime_count, combo_set):
            continue

        total_filtered += 1
        if collect_stats:
            sum_dist[combo_sum] = sum_dist.get(combo_sum, 0) + 1
            even_dist[even_count] = even_dist.get(even_count, 0) + 1
            prime_dist[prime_count] = prime_dist.get(prime_count, 0) + 1
            if has_last_draw:
                overlap = len(frozenset(combo) & f["last_draw"])
                repeat_dist[overlap] = repeat_dist.get(overlap, 0) + 1

        if page_size > 0 and total_filtered > start and len(page_combos) < page_size:
            page_combos.append(list(combo))
            if has_last_draw:
                page_repeat_counts.append(len(frozenset(combo) & f["last_draw"]))

    stats = {
        "sum_distribution": sum_dist,
        "even_distribution": even_dist,
        "prime_distribution": prime_dist,
    }
    if repeat_dist:
        stats["repeat_distribution"] = repeat_dist

    if collect_stats:
        set_cached_stats(cache_key, {"filtered_count": total_filtered, "stats": stats})
    elif cached:
        total_filtered = cached["filtered_count"]
        stats = cached["stats"]

    elapsed = time.perf_counter() - t0
    rate = scanned / elapsed if elapsed > 0 else 0
    filter_log(
        f"[filtro] fim · match={total_filtered:,} · varridos={scanned:,} · "
        f"{rate:,.0f} cand/s · {elapsed:.2f}s · cache_salvo={'sim' if collect_stats else 'não'}"
    )

    return {
        "game_size": k,
        "limits": limits,
        "total_count": total_count,
        "filtered_count": total_filtered,
        "page": page,
        "page_size": page_size,
        "combinations": page_combos if page_size > 0 else [],
        "page_repeat_counts": page_repeat_counts,
        "repeat_filter_active": has_last_draw,
        "active_repeat_counts": sorted(f["repeat_counts"]) if has_last_draw else [],
        "stats": stats,
        "from_cache": False,
        "exclude_draws_stats": calc_exclude_draws_stats(k, f["exclude_sets"], total_filtered),
        "timing": {
            "elapsed_ms": round(elapsed * 1000, 1),
            "scanned": scanned,
            "matched": total_filtered,
            "from_cache": False,
            "rate_per_sec": round(rate, 1) if elapsed > 0 else None,
        },
    }

def calc_hit_ways(k, h):
    """Formas de acertar exatamente h dezenas com um jogo de k dezenas."""
    if h > k or h > NUMBERS_IN_DRAW or (NUMBERS_IN_DRAW - h) > (25 - k):
        return 0
    return math.comb(k, h) * math.comb(25 - k, NUMBERS_IN_DRAW - h)

def calc_hit_tier_stats(k, h):
    ways = calc_hit_ways(k, h)
    if ways <= 0:
        return None
    return {
        "hits": h,
        "ways": ways,
        "percent": round(ways / LOTOFACIL_DRAWS * 100, 8),
        "odds": round(LOTOFACIL_DRAWS / ways, 2),
        "coverage_tickets": round(LOTOFACIL_DRAWS / ways, 2),
    }

def copy_hit_tier(tier):
    """Cópia da faixa de acertos sem ajuste por filtro (probabilidade real)."""
    if not tier:
        return None
    result = dict(tier)
    result["is_filtered"] = False
    return result

def calc_memory_hit_tiers(k, filter_ratio):
    """Modo memória: o que o filtro remove não sai mais.

    O universo de sorteios encolhe na proporção do filtro. As C(k,15) linhas de uma
    cartela que passou no filtro continuam possíveis, então a chance de 15 acertos
    sobe 1/ratio; as demais faixas são reescaladas para a distribuição somar 100%.
    """
    if filter_ratio <= 0:
        return {}
    base15 = calc_hit_ways(k, 15) / LOTOFACIL_DRAWS
    p15 = min(1.0, base15 / filter_ratio)
    rest_scale = (1.0 - p15) / (1.0 - base15) if base15 < 1.0 else 0.0
    tiers = {}
    for h in HIT_TIERS:
        ways = calc_hit_ways(k, h)
        if ways <= 0:
            continue
        p = p15 if h == 15 else ways / LOTOFACIL_DRAWS * rest_scale
        tiers[h] = {
            "hits": h,
            "ways": ways,
            "percent": round(p * 100, 8),
            "odds": round(1 / p, 2) if p > 0 else None,
            "is_filtered": True,
            "is_memory": True,
        }
    return tiers

def calc_game_size_stats(k):
    hits = {}
    for h in HIT_TIERS:
        tier = calc_hit_tier_stats(k, h)
        if tier:
            hits[h] = tier

    hits15 = hits.get(15, {}).get("ways", 0)
    total_combos = math.comb(25, k)
    coverage_tickets = LOTOFACIL_DRAWS / hits15 if hits15 else 0
    tier15 = hits.get(15, {})
    return {
        "dezenas": k,
        "total_combinations": total_combos,
        "hits": hits,
        "hits15_ways": hits15,
        "single_ticket_percent": tier15.get("percent", 0.0),
        "single_ticket_odds": tier15.get("odds"),
        "coverage_tickets": round(coverage_tickets, 2),
    }

GAME_SIZE_STATS = {k: calc_game_size_stats(k) for k in GAME_SIZES}

def calc_bet_cost_info(k):
    simple_lines = math.comb(k, NUMBERS_IN_DRAW)
    price = BET_PRICES_BY_SIZE[k]
    return {
        "game_size": k,
        "bet_price": price,
        "simple_lines_covered": simple_lines,
        "price_per_simple_line": round(price / simple_lines, 4) if simple_lines else 0.0,
    }

def calc_expected_fixed_return(k, hits=None):
    """Expectativa de retorno com prêmios fixos (11–14 ac.) para uma aposta oficial.

    `hits`: faixas já calculadas (ex.: modo memória); sem elas usa o universo completo.
    """
    expected = 0.0
    breakdown = {}
    for h in (11, 12, 13, 14):
        tier = (hits or {}).get(h) or calc_hit_tier_stats(k, h)
        if not tier:
            continue
        pct = tier["percent"]
        prob = pct / 100.0
        prize = FIXED_PRIZES[h]
        ev = prob * prize
        expected += ev
        breakdown[h] = {
            "probability_percent": round(pct, 8 if pct < 0.01 else 4),
            "prize": prize,
            "expected_value": round(ev, 4),
        }

    price = BET_PRICES_BY_SIZE[k]
    roi = (expected / price * 100.0) if price else 0.0
    return {
        "bet_price": price,
        "expected_fixed_return": round(expected, 2),
        "net_expected": round(expected - price, 2),
        "roi_percent": round(roi, 2),
        "breakdown": breakdown,
        "jackpot_excluded": True,
    }

def _merge_price_row(k):
    cost = calc_bet_cost_info(k)
    ev = calc_expected_fixed_return(k)
    return {
        **cost,
        "expected_fixed_return": ev["expected_fixed_return"],
        "net_expected": ev["net_expected"],
        "roi_percent": ev["roi_percent"],
    }

def calc_coverage_economics(filtered_count, total_count, game_size):
    """Custos de cobertura e probabilidade agregada ao comprar todo o filtro."""
    simple_unit = BET_PRICES_BY_SIZE[15]
    cover_all_cost = round(filtered_count * simple_unit, 2)
    jackpot_prob_all = round(filtered_count / LOTOFACIL_DRAWS * 100, 8) if LOTOFACIL_DRAWS else 0.0
    jackpot_guaranteed = filtered_count >= LOTOFACIL_DRAWS

    official = calc_bet_cost_info(game_size)
    return {
        "cover_filter_as_simple_bets": {
            "tickets": filtered_count,
            "unit_price": simple_unit,
            "total_cost": cover_all_cost,
            "jackpot_probability_percent": 100.0 if jackpot_guaranteed else jackpot_prob_all,
            "jackpot_guaranteed": jackpot_guaranteed,
            "note": "1 cartela simples (15 dezenas) por combinação do filtro",
        },
        "single_official_bet": official,
        "universe_share_percent": round(filtered_count / total_count * 100, 4) if total_count else 0.0,
        "price_table": [
            _merge_price_row(k)
            for k in GAME_SIZES
        ],
        "fixed_prizes": dict(FIXED_PRIZES),
        "disclaimer": (
            "Prêmios de 11 a 14 acertos são fixos pela Caixa. "
            "15 acertos (prêmio principal) é variável e não entra na expectativa calculada. "
            "A loteria tem expectativa negativa: em média, você recupera menos do que aposta."
        ),
    }

def calc_probability(filtered_count, total_count, game_size):
    games = []
    filter_ratio = filtered_count / total_count if total_count else 1.0
    is_filtered = 0 < filtered_count < total_count

    for k in GAME_SIZES:
        base = GAME_SIZE_STATS[k]
        g = {
            "dezenas": k,
            "total_combinations": base["total_combinations"],
            "coverage_tickets": base["coverage_tickets"],
            "hits15_ways": base["hits15_ways"],
            "single_ticket_percent": base["single_ticket_percent"],
            "single_ticket_odds": base["single_ticket_odds"],
            "hits": {},
            "is_app_size": k == game_size,
            "is_filtered": is_filtered and k == game_size,
        }

        for h in HIT_TIERS:
            tier = copy_hit_tier(base["hits"].get(h))
            if tier:
                g["hits"][h] = tier

        if k == game_size:
            g["universe_percent"] = round(filtered_count / total_count * 100, 4) if total_count else 0.0
            g["filtered_tickets"] = filtered_count

        games.append(g)

    active_hits = {}
    for h in HIT_TIERS:
        raw = copy_hit_tier(GAME_SIZE_STATS[game_size]["hits"].get(h))
        if raw:
            active_hits[str(h)] = raw
    memory_tiers = calc_memory_hit_tiers(game_size, filter_ratio) if is_filtered else {}
    hits_memory = {str(h): tier for h, tier in memory_tiers.items()}

    active = GAME_SIZE_STATS[game_size]
    raw_single_pct = active["hits"].get(15, {}).get("percent", 0.0)
    raw_single_odds = active["hits"].get(15, {}).get("odds")
    memory15 = memory_tiers.get(15)

    return {
        "lotofacil_draws": LOTOFACIL_DRAWS,
        "app_game_size": game_size,
        "games": games,
        "hits": active_hits,
        "hits_memory": hits_memory,
        "universe_percent": round(filtered_count / total_count * 100, 4) if total_count else 0.0,
        "single_ticket_percent": memory15["percent"] if memory15 else round(raw_single_pct, 8 if raw_single_pct < 0.01 else 4),
        "single_ticket_odds": memory15["odds"] if memory15 else (round(raw_single_odds, 2) if raw_single_odds else None),
        "single_ticket_percent_raw": raw_single_pct,
        "single_ticket_odds_raw": raw_single_odds,
        "is_filtered": is_filtered,
        "filter_ratio": round(filter_ratio, 8) if is_filtered else 1.0,
        "filtered_tickets": filtered_count,
        "memory_removed_combinations": total_count - filtered_count,
        "memory_removed_percent": round((1 - filter_ratio) * 100, 4) if is_filtered else 0.0,
        "memory_draw_universe": round(LOTOFACIL_DRAWS * filter_ratio) if is_filtered else LOTOFACIL_DRAWS,
        "probability_disclaimer": PROBABILITY_DISCLAIMER,
        "economics": {
            "official_bet": calc_expected_fixed_return(game_size, memory_tiers or None),
            "coverage": calc_coverage_economics(filtered_count, total_count, game_size),
        },
    }

def iter_filtered_combos(f):
    f = enrich_filters(f) if "excluded_combos_by_draws" not in f else f
    source, _ = _filter_source(f)
    for combo, combo_sum, even_count, prime_count, combo_set in source:
        if passes_filters_tuple(combo, f, combo_sum, even_count, prime_count, combo_set):
            yield combo

class ComboInfo:
    __slots__ = ['combo', 'combo_set', 'sum', 'even_count', 'prime_count', 'max_consecutive']
    def __init__(self, combo):
        self.combo = combo
        self.combo_set = set(combo)
        self.sum = sum(combo)
        self.even_count = sum(1 for x in combo if x % 2 == 0)
        self.prime_count = sum(1 for x in combo if x in PRIMES)
        self.max_consecutive = calc_max_consecutive(combo)

# Pré-aquece o tamanho padrão (20 dezenas) apenas ao iniciar o servidor.
def warmup_default_combinations():
    print("Iniciando servidor Lotofácil...")
    get_combinations(DEFAULT_GAME_SIZE)

class ThreadingHTTPServer(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

def _parse_bool(query, key):
    return query.get(key, ["0"])[0] in ("1", "true", "True")

def _param_first(params, key, default=""):
    val = params.get(key, default)
    if isinstance(val, list):
        return val[0] if val else default
    return val if val is not None else default

def _parse_draw_entries(raw):
    """Aceita string (; separado), lista de strings ou lista de inteiros."""
    if not raw:
        return []
    if isinstance(raw, list):
        if len(raw) == 1 and isinstance(raw[0], str) and ";" in raw[0]:
            entries = [s for s in raw[0].split(";") if s.strip()]
        else:
            entries = [e for e in raw if e]
    elif isinstance(raw, str):
        entries = [s for s in raw.split(";") if s.strip()]
    else:
        return []

    exclude_sets = []
    for draw_str in entries:
        if isinstance(draw_str, (list, tuple, set, frozenset)):
            draw_set = {int(x) for x in draw_str if 1 <= int(x) <= 25}
        else:
            nums = re.findall(r"\d+", str(draw_str))
            draw_set = {int(x) for x in nums if 1 <= int(x) <= 25}
        if len(draw_set) == 15:
            exclude_sets.append(draw_set)
    return exclude_sets

def parse_filters(query):
    return parse_filters_from_params(query)

def parse_filters_from_params(params):
    game_size = int(_param_first(params, "game_size", DEFAULT_GAME_SIZE))
    if game_size not in GAME_SIZES:
        game_size = DEFAULT_GAME_SIZE

    sum_min, sum_max = get_sum_limits(game_size)
    min_even, max_even = get_parity_limits(game_size)

    must_include_raw = _param_first(params, "must_include", "")
    must_include = {int(x) for x in must_include_raw.split(",") if x.strip()} if must_include_raw else set()

    must_exclude_raw = _param_first(params, "must_exclude", "")
    must_exclude = {int(x) for x in must_exclude_raw.split(",") if x.strip()} if must_exclude_raw else set()

    exclude_sets = _parse_draw_entries(params.get("exclude_draws"))

    exclude_combos = set()
    exclude_combos_raw = _param_first(params, "exclude_combos", "")
    if exclude_combos_raw:
        for combo_str in exclude_combos_raw.split(";"):
            if combo_str.strip():
                combo_set = frozenset(int(x) for x in combo_str.split(",") if x.strip())
                if len(combo_set) == game_size:
                    exclude_combos.add(combo_set)

    last_draw = frozenset()
    last_draw_raw = _param_first(params, "last_draw", "")
    if last_draw_raw:
        draw_nums = {int(x) for x in last_draw_raw.split(",") if x.strip()}
        if len(draw_nums) == 15:
            last_draw = frozenset(draw_nums)

    repeat_counts = frozenset()
    repeat_raw = _param_first(params, "repeat_counts", "")
    if last_draw and repeat_raw:
        repeat_counts = frozenset(
            int(x) for x in repeat_raw.split(",") if x.strip().isdigit()
        )
        repeat_counts &= resolve_repeat_counts(game_size)

    sequence_group = frozenset()
    sequence_counts = frozenset()
    sequence_raw = _param_first(params, "sequence_group", "")
    if sequence_raw:
        nums = {int(x) for x in sequence_raw.split(",") if x.strip().isdigit()}
        nums = {n for n in nums if 1 <= n <= 25}
        if nums:
            sequence_group = frozenset(nums)

    sequence_counts_raw = _param_first(params, "sequence_counts", "")
    if sequence_group and sequence_counts_raw:
        sequence_counts = frozenset(
            int(x) for x in sequence_counts_raw.split(",")
            if x.strip().isdigit() and 0 <= int(x) <= len(sequence_group)
        )

    banned_numbers = frozenset()
    banned_raw = _param_first(params, "banned_numbers", "")
    if banned_raw:
        banned_numbers = frozenset(
            int(x) for x in re.findall(r"\d+", banned_raw)
            if 1 <= int(x) <= 25
        )

    exclude_subsets = ()
    exclude_subsets_raw = _param_first(params, "exclude_subsets", "")
    if exclude_subsets_raw:
        seen_patterns = set()
        patterns = []
        # Cada linha (textarea) ou bloco separado por ; = uma sequência independente
        normalized = exclude_subsets_raw.replace("\r\n", "\n").replace("\r", "\n")
        for line in re.split(r"[;\n]+", normalized):
            line = line.strip()
            if not line:
                continue
            nums = {
                int(x) for x in re.findall(r"\d+", line)
                if 1 <= int(x) <= 25
            }
            if 1 <= len(nums) <= 15:
                pattern = frozenset(nums)
                if pattern not in seen_patterns:
                    seen_patterns.add(pattern)
                    patterns.append(pattern)
        exclude_subsets = tuple(patterns)

    def parse_bool(key):
        val = _param_first(params, key, "0")
        return str(val) in ("1", "true", "True")

    require_blocks_lengths = frozenset(
        int(x) for x in re.findall(r"\d+", str(_param_first(params, "require_blocks_lengths", "")))
        if 2 <= int(x) <= 10
    )
    require_blocks_min = max(1, min(4, int(_param_first(params, "require_blocks_min", 1) or 1)))
    require_blocks_active = parse_bool("require_blocks_active") and bool(require_blocks_lengths)

    return {
        "game_size": game_size,
        "must_include": must_include,
        "must_exclude": must_exclude,
        "banned_numbers": banned_numbers,
        "exclude_sets": exclude_sets,
        "exclude_combos": exclude_combos,
        "last_draw": last_draw,
        "repeat_counts": repeat_counts,
        "sequence_group": sequence_group,
        "sequence_counts": sequence_counts,
        "exclude_subsets": exclude_subsets,
        "min_sum": int(_param_first(params, "min_sum", sum_min)),
        "max_sum": int(_param_first(params, "max_sum", sum_max)),
        "even_count": int(_param_first(params, "even_count", -1)),
        "prime_count": int(_param_first(params, "prime_count", -1)),
        "exclude_max_evens": parse_bool("exclude_max_evens"),
        "exclude_max_odds": parse_bool("exclude_max_odds"),
        "exclude_sequence_6": parse_bool("exclude_sequence_6"),
        "exclude_sequence_7": parse_bool("exclude_sequence_7"),
        "exclude_sequence_8": parse_bool("exclude_sequence_8"),
        "exclude_sequence_9": parse_bool("exclude_sequence_9"),
        "exclude_sequence_10": parse_bool("exclude_sequence_10"),
        "run_budget_active": parse_bool("run_budget_active"),
        "run_budget_primary_len": int(_param_first(params, "run_budget_primary_len", 5) or 5),
        "run_budget_primary_count": int(_param_first(params, "run_budget_primary_count", 1) or 1),
        "run_budget_other_max": int(_param_first(params, "run_budget_other_max", 4) or 4),
        "require_blocks_active": require_blocks_active,
        "require_blocks_lengths": require_blocks_lengths if require_blocks_active else frozenset(),
        "require_blocks_min": require_blocks_min,
        "min_even": min_even,
        "max_even": max_even,
    }

CLIENT_DISCONNECT_ERRORS = (BrokenPipeError, ConnectionResetError)

class LotofacilHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Prevent excessive logging
        pass

    def _safe_write(self, data):
        try:
            self.wfile.write(data)
            return True
        except CLIENT_DISCONNECT_ERRORS:
            return False

    def _send_json_response(self, status, payload):
        try:
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self._safe_write(body)
        except CLIENT_DISCONNECT_ERRORS:
            pass

    def _send_bytes_response(self, status, body, content_type, extra_headers=None):
        try:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            if extra_headers:
                for key, value in extra_headers.items():
                    self.send_header(key, value)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self._safe_write(body)
        except CLIENT_DISCONNECT_ERRORS:
            pass

    def _write_http_chunk(self, data):
        if not data:
            return True
        try:
            self.wfile.write(f"{len(data):X}\r\n".encode("ascii"))
            self.wfile.write(data)
            self.wfile.write(b"\r\n")
            return True
        except CLIENT_DISCONNECT_ERRORS:
            return False

    def _end_http_chunks(self):
        try:
            self.wfile.write(b"0\r\n\r\n")
            return True
        except CLIENT_DISCONNECT_ERRORS:
            return False

    def _stream_export(self, filters, export_format):
        """Exporta combinações em chunks (sem materializar tudo na RAM)."""
        k = filters["game_size"]
        is_csv = export_format == "csv"
        filename = "combinacoes_lotofacil.csv" if is_csv else "combinacoes_lotofacil.txt"
        content_type = "text/csv; charset=utf-8" if is_csv else "text/plain; charset=utf-8"

        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Disposition", f"attachment; filename={filename}")
        self.send_header("Transfer-Encoding", "chunked")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("X-Export-Max-Lines", str(EXPORT_MAX_LINES))
        self.end_headers()

        buffer = []
        exported = 0
        truncated = False

        def flush():
            if not buffer:
                return True
            payload = ("\n".join(buffer) + "\n").encode("utf-8")
            buffer.clear()
            return self._write_http_chunk(payload)

        if is_csv:
            buffer.append(",".join(f"N{i}" for i in range(1, k + 1)))

        for combo in iter_filtered_combos(filters):
            if exported >= EXPORT_MAX_LINES:
                truncated = True
                break
            if is_csv:
                buffer.append(",".join(map(str, combo)))
            else:
                buffer.append(" ".join(f"{n:02d}" for n in combo))
            exported += 1
            if len(buffer) >= EXPORT_CHUNK_LINES:
                if not flush():
                    return

        if truncated:
            buffer.append(
                f"# truncado: limite de {EXPORT_MAX_LINES} linhas "
                f"(restrija os filtros para exportar o restante)"
            )

        if not flush():
            return
        self._end_http_chunks()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        if not path.startswith("/api/"):
            self.send_response(404)
            self.end_headers()
            return

        content_length = int(self.headers.get("Content-Length", 0))
        if content_length > 10 * 1024 * 1024:
            self._send_json_response(413, {"error": "Arquivo muito grande (máx. 10 MB)"})
            return

        try:
            body_bytes = self.rfile.read(content_length)
            body = json.loads(body_bytes.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            self._send_json_response(400, {"error": f"JSON inválido: {e}"})
            return

        self.handle_api(path, {}, body=body)

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query = urllib.parse.parse_qs(parsed_url.query)
        
        if path.startswith("/api/"):
            self.handle_api(path, query)
        else:
            self.handle_static(path)

    def handle_api(self, path, query, body=None):
        if path == "/api/meta":
            try:
                sizes = []
                for k in GAME_SIZES:
                    limits = get_game_limits(k)
                    entry = {
                        "game_size": k,
                        "total_combinations": limits["total_combinations"],
                        "min_sum": limits["min_sum"],
                        "max_sum": limits["max_sum"],
                        "min_even": limits["min_even"],
                        "max_even": limits["max_even"],
                        "min_prime": limits["min_prime"],
                        "max_prime": limits["max_prime"],
                    }
                    sizes.append(entry)
                self._send_json_response(200, {
                    "game_sizes": sizes,
                    "bet_prices": BET_PRICES_BY_SIZE,
                    "fixed_prizes": FIXED_PRIZES,
                    "price_table": [_merge_price_row(k) for k in GAME_SIZES],
                    "repeat_overlap_stats": calc_repeat_overlap_stats(),
                    "number_frequency_stats": calc_number_frequency_stats(),
                    "top5_cooccurrence": calc_top5_cooccurrence_analysis(),
                    "historical_draws_count": TOTAL_HISTORICAL_DRAWS,
                    "historical_data_note": HISTORICAL_DATA_NOTE,
                    "probability_disclaimer": PROBABILITY_DISCLAIMER,
                    "export_max_lines": EXPORT_MAX_LINES,
                    "economics_disclaimer": (
                        "Prêmios de 11 a 14 acertos são fixos pela Caixa. "
                        "15 acertos (prêmio principal) é variável e não entra na expectativa calculada."
                    ),
                })
            except CLIENT_DISCONNECT_ERRORS:
                return
            except Exception as e:
                self._send_json_response(400, {"error": str(e)})

        elif path == "/api/repeat-options":
            try:
                params = body if body is not None else query
                f = parse_filters_from_params(params)
                f = enrich_filters(f)
                if not f["last_draw"]:
                    self._send_json_response(200, {
                        "counts": {},
                        "game_size": f["game_size"],
                        "combined_selected": 0,
                        "valid_counts": sorted(resolve_repeat_counts(f["game_size"])),
                    })
                    return

                counts = calc_repeat_option_counts(f)
                selected = f["repeat_counts"]
                combined = sum(counts.get(r, 0) for r in selected) if selected else 0
                self._send_json_response(200, {
                    "counts": counts,
                    "game_size": f["game_size"],
                    "combined_selected": combined,
                    "valid_counts": sorted(resolve_repeat_counts(f["game_size"])),
                })
            except CLIENT_DISCONNECT_ERRORS:
                return
            except Exception as e:
                self._send_json_response(400, {"error": str(e)})

        elif path == "/api/consecutive-sequences":
            try:
                params = body if body is not None else query
                draws_raw = _param_first(params, "draws", "")
                min_length = int(_param_first(params, "min_length", 3))
                max_length = int(_param_first(params, "max_length", 8))
                top_n = int(_param_first(params, "top_n", 60))
                if not draws_raw.strip():
                    self._send_json_response(200, {
                        "total_draws": 0,
                        "message": "Nenhum sorteio enviado para análise.",
                    })
                    return
                if ";" in draws_raw:
                    lines = [ln.strip() for ln in draws_raw.split(";") if ln.strip()]
                else:
                    lines = [ln.strip() for ln in draws_raw.splitlines() if ln.strip()]
                result = analyze_consecutive_sequences_draws(
                    lines,
                    min_length=min_length,
                    max_length=max_length,
                    top_n=top_n,
                )
                if not result:
                    self._send_json_response(200, {
                        "total_draws": 0,
                        "message": "Nenhum sorteio válido (15 dezenas por linha).",
                    })
                    return
                self._send_json_response(200, result)
            except CLIENT_DISCONNECT_ERRORS:
                return
            except Exception as e:
                self._send_json_response(400, {"error": str(e)})

        elif path == "/api/combinations":
            try:
                params = body if body is not None else query
                page = max(1, int(_param_first(params, "page", 1)))
                page_size = max(1, min(400, int(_param_first(params, "page_size", 50))))
                include_stats = _param_first(params, "include_stats", "1") != "0"
                f = parse_filters_from_params(params)
                result = query_combinations(f, page, page_size, include_stats=include_stats)

                response_data = {
                    "game_size": result["game_size"],
                    "limits": result["limits"],
                    "total_count": result["total_count"],
                    "filtered_count": result["filtered_count"],
                    "page": result["page"],
                    "page_size": result["page_size"],
                    "combinations": result["combinations"],
                    "page_repeat_counts": result.get("page_repeat_counts", []),
                    "repeat_filter_active": result.get("repeat_filter_active", False),
                    "active_repeat_counts": sorted(result.get("active_repeat_counts", [])),
                    "exclude_draws_stats": result.get("exclude_draws_stats"),
                    "probability": calc_probability(
                        result["filtered_count"],
                        result["total_count"],
                        result["game_size"],
                    ),
                    "stats": result["stats"],
                    "timing": result.get("timing"),
                    "from_cache": result.get("from_cache", False),
                }

                self._send_json_response(200, response_data)

            except CLIENT_DISCONNECT_ERRORS:
                return
            except Exception as e:
                self._send_json_response(400, {"error": str(e)})

        elif path == "/api/generate-games":
            try:
                params = body if body is not None else query
                f = parse_filters_from_params(params)
                count = int(_param_first(params, "count", 1))
                max_score_raw = _param_first(params, "max_pattern_score", "")
                max_pattern_score = float(max_score_raw) if str(max_score_raw).strip() else None
                seed_raw = _param_first(params, "seed", "")
                seed = int(seed_raw) if str(seed_raw).strip().lstrip("-").isdigit() else None
                avoid_raw = params.get("avoid_games")
                if avoid_raw is None:
                    avoid_raw = _param_first(params, "avoid_games", "")
                result = generate_smart_games(
                    f,
                    count,
                    max_pattern_score=max_pattern_score,
                    seed=seed,
                    avoid=avoid_raw,
                )
                self._send_json_response(200, result)
            except CLIENT_DISCONNECT_ERRORS:
                return
            except Exception as e:
                self._send_json_response(400, {"error": str(e)})

        elif path == "/api/export":
            try:
                params = body if body is not None else query
                f = parse_filters_from_params(params)
                export_format = _param_first(params, "format", "txt")
                if export_format not in ("txt", "csv"):
                    export_format = "txt"
                self._stream_export(f, export_format)
            except CLIENT_DISCONNECT_ERRORS:
                return
            except Exception as e:
                try:
                    self._send_json_response(400, {"error": str(e)})
                except Exception:
                    pass
        else:
            self._send_json_response(404, {"error": "Endpoint not found"})

    def handle_static(self, path):
        if path == "/":
            path = "/index.html"
        
        safe_path = path.lstrip("/")
        file_path = os.path.join(DIRECTORY, "static", safe_path)
        
        static_dir = os.path.join(DIRECTORY, "static")
        real_path = os.path.realpath(file_path)
        if not real_path.startswith(os.path.realpath(static_dir)):
            self.send_response(403)
            self.end_headers()
            self.wfile.write(b"Access Denied")
            return
            
        if not os.path.exists(file_path) or os.path.isdir(file_path):
            # Fallback to index.html for SPA if not found
            file_path = os.path.join(static_dir, "index.html")
            
        mime_type = "text/plain"
        if file_path.endswith(".html"):
            mime_type = "text/html"
        elif file_path.endswith(".css"):
            mime_type = "text/css"
        elif file_path.endswith(".js"):
            mime_type = "application/javascript"
        elif file_path.endswith(".svg"):
            mime_type = "image/svg+xml"
        elif file_path.endswith(".png"):
            mime_type = "image/png"
        elif file_path.endswith(".jpg") or file_path.endswith(".jpeg"):
            mime_type = "image/jpeg"
        elif file_path.endswith(".ico"):
            mime_type = "image/x-icon"
            
        try:
            with open(file_path, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", mime_type)
            self.send_header("Content-Length", len(content))
            self.end_headers()
            self._safe_write(content)
        except CLIENT_DISCONNECT_ERRORS:
            return
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self._safe_write(str(e).encode("utf-8"))

def main():
    # Make sure static directory exists
    os.makedirs(os.path.join(DIRECTORY, "static"), exist_ok=True)
    warmup_default_combinations()

    server_address = ('', PORT)
    try:
        httpd = ThreadingHTTPServer(server_address, LotofacilHandler)
    except OSError as e:
        if e.errno == 98:
            print(f"\nErro: a porta {PORT} já está em uso.")
            print("Outro servidor já está rodando ou não foi encerrado corretamente.")
            print(f"\nPara liberar a porta, execute:\n  fuser -k {PORT}/tcp")
            print(f"\nOu acesse diretamente: http://localhost:{PORT}")
            sys.exit(1)
        raise
    print(f"Servidor rodando em http://localhost:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nDesligando o servidor...")
        httpd.server_close()
        sys.exit(0)

if __name__ == "__main__":
    main()
