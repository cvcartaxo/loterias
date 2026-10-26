#!/usr/bin/env python3
"""Testes de combinatória e filtros do Lotofácil Combinador."""
import math
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

import main as app  # noqa: E402


class TestHitWays(unittest.TestCase):
    def test_full_universe_15(self):
        # C(25,15) formas de acertar 15 com jogo de 15
        self.assertEqual(app.calc_hit_ways(15, 15), 1)
        self.assertEqual(app.calc_hit_ways(15, 14), math.comb(15, 14) * math.comb(10, 1))

    def test_impossible_hits(self):
        self.assertEqual(app.calc_hit_ways(15, 16), 0)
        self.assertEqual(app.calc_hit_ways(20, 0), 0)

    def test_tier_odds_sum_near_100(self):
        total_pct = 0.0
        for h in range(0, 16):
            ways = app.calc_hit_ways(15, h)
            total_pct += ways / app.LOTOFACIL_DRAWS * 100
        self.assertAlmostEqual(total_pct, 100.0, places=6)


class TestProbabilityMemory(unittest.TestCase):
    def test_filtered_exposes_memory_and_raw(self):
        total = math.comb(25, 20)
        filtered = total // 10
        prob = app.calc_probability(filtered, total, 20)
        raw = app.GAME_SIZE_STATS[20]["hits"][15]
        self.assertFalse(prob["hits"]["15"]["is_filtered"])
        self.assertEqual(prob["hits"]["15"]["odds"], raw["odds"])
        self.assertTrue(prob["is_filtered"])
        memory = prob["hits_memory"]["15"]
        self.assertTrue(memory["is_memory"])
        self.assertAlmostEqual(memory["percent"], raw["percent"] / prob["filter_ratio"], places=4)
        self.assertEqual(prob["single_ticket_percent"], memory["percent"])
        self.assertIn("modo memória", prob["probability_disclaimer"].lower())

    def test_memory_15_exact_universe(self):
        # 15 dezenas: o universo lembrado é exatamente o que sobrou do filtro
        remaining = app.LOTOFACIL_DRAWS - 3804
        prob = app.calc_probability(remaining, app.LOTOFACIL_DRAWS, 15)
        self.assertAlmostEqual(prob["hits_memory"]["15"]["odds"], remaining, delta=1)

    def test_memory_caps_at_100_and_tiers_stay_coherent(self):
        prob = app.calc_probability(1, math.comb(25, 15), 15)
        tiers = prob["hits_memory"]
        self.assertAlmostEqual(tiers["15"]["percent"], 100.0, places=4)
        self.assertAlmostEqual(tiers["14"]["percent"], 0.0, places=4)
        total = math.comb(25, 20)
        prob20 = app.calc_probability(total // 1000, total, 20)
        pct_sum = sum(t["percent"] for t in prob20["hits_memory"].values())
        self.assertLessEqual(pct_sum, 100.0 + 1e-6)


class TestPatternScore(unittest.TestCase):
    def test_cluster_penalized(self):
        clustered = list(range(1, 16))  # 1..15
        spread = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 22, 23, 24, 25]
        self.assertGreater(app.calc_pattern_score(clustered), app.calc_pattern_score(spread))


class TestPassesFilters(unittest.TestCase):
    def _base_filters(self, **overrides):
        f = {
            "game_size": 15,
            "must_include": set(),
            "must_exclude": set(),
            "banned_numbers": set(),
            "exclude_sets": [],
            "exclude_combos": set(),
            "exclude_subsets": [],
            "min_sum": 0,
            "max_sum": 999,
            "even_count": -1,
            "prime_count": -1,
            "min_even": 2,
            "max_even": 12,
            "exclude_max_evens": False,
            "exclude_max_odds": False,
            "exclude_sequence_6": False,
            "exclude_sequence_7": False,
            "exclude_sequence_8": False,
            "exclude_sequence_9": False,
            "exclude_sequence_10": False,
            "run_budget_active": False,
            "run_budget_primary_len": 5,
            "run_budget_primary_count": 1,
            "run_budget_other_max": 4,
            "last_draw": frozenset(),
            "repeat_counts": frozenset(),
            "sequence_group": frozenset(),
            "sequence_counts": frozenset(),
            "excluded_combos_by_draws": frozenset(),
        }
        f.update(overrides)
        return f

    def test_must_include(self):
        combo = tuple(range(1, 16))
        f = self._base_filters(must_include={1, 2})
        self.assertTrue(app.passes_filters_tuple(combo, f, sum(combo), 7, 6))
        f2 = self._base_filters(must_include={20})
        self.assertFalse(app.passes_filters_tuple(combo, f2, sum(combo), 7, 6))

    def test_must_exclude(self):
        combo = tuple(range(1, 16))
        f = self._base_filters(must_exclude={15})
        self.assertFalse(app.passes_filters_tuple(combo, f, sum(combo), 7, 6))


class TestExcludeLongSequences(unittest.TestCase):
    def test_ten_window_rejected(self):
        # 01–10 completo + 5 extras → bloco de 10
        combo = (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20)
        f = TestPassesFilters()._base_filters(exclude_sequence_10=True)
        self.assertEqual(app.calc_max_consecutive(combo), 10)
        self.assertFalse(app.passes_filters_tuple(combo, f, sum(combo), 10, 6))

    def test_partial_ten_window_allowed(self):
        # 01–10 com buraco (falta o 5) → não é 10 seguidos
        combo = (1, 2, 3, 4, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 22)
        f = TestPassesFilters()._base_filters(exclude_sequence_10=True)
        self.assertLess(app.calc_max_consecutive(combo), 10)
        self.assertTrue(app.passes_filters_tuple(combo, f, sum(combo), 9, 6))

    def test_two_to_eleven_rejected(self):
        combo = (2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 21)
        f = TestPassesFilters()._base_filters(exclude_sequence_10=True)
        self.assertEqual(app.calc_max_consecutive(combo), 10)
        self.assertFalse(app.passes_filters_tuple(combo, f, sum(combo), 8, 6))


class TestSmartGeneration(unittest.TestCase):
    def _filters(self, **overrides):
        f = TestPassesFilters()._base_filters(
            game_size=20,
            min_sum=0,
            max_sum=999,
            min_even=0,
            max_even=20,
        )
        f.update(overrides)
        return f

    def test_different_seeds_yield_different_sets(self):
        f = self._filters()
        a = app.generate_smart_games(f, 5, seed=101)
        b = app.generate_smart_games(f, 5, seed=202)
        self.assertEqual(a["generated_count"], 5)
        self.assertEqual(b["generated_count"], 5)
        set_a = {tuple(g["numbers"]) for g in a["games"]}
        set_b = {tuple(g["numbers"]) for g in b["games"]}
        self.assertNotEqual(set_a, set_b)

    def test_respects_filters(self):
        f = self._filters(must_exclude={1, 2, 3}, exclude_sequence_8=True)
        result = app.generate_smart_games(f, 4, seed=7)
        self.assertGreater(result["generated_count"], 0)
        for game in result["games"]:
            nums = game["numbers"]
            self.assertTrue(set(nums).isdisjoint({1, 2, 3}))
            self.assertLess(app.calc_max_consecutive(nums), 8)
            self.assertTrue(app.passes_filters_tuple(
                tuple(nums),
                app.enrich_filters(dict(f)),
                sum(nums),
                sum(1 for n in nums if n % 2 == 0),
                sum(1 for n in nums if n in app.PRIMES),
            ))

    def test_avoid_previous_games(self):
        f = self._filters()
        first = app.generate_smart_games(f, 3, seed=10)
        avoid = [g["numbers"] for g in first["games"]]
        second = app.generate_smart_games(f, 3, seed=11, avoid=avoid)
        set1 = {tuple(g["numbers"]) for g in first["games"]}
        set2 = {tuple(g["numbers"]) for g in second["games"]}
        self.assertTrue(set1.isdisjoint(set2))

    def test_fulfills_requested_count_with_strict_cap(self):
        f = self._filters()
        result = app.generate_smart_games(f, 5, max_pattern_score=18, seed=33)
        self.assertEqual(result["requested_count"], 5)
        self.assertEqual(result["generated_count"], 5)
        self.assertEqual(len(result["games"]), 5)


class TestRunBudget(unittest.TestCase):
    def test_two_blocks_of_five_rejected(self):
        combo = (1, 2, 3, 4, 5, 8, 10, 12, 14, 17, 21, 22, 23, 24, 25)
        self.assertEqual(app.get_consecutive_runs(combo), [5, 5])
        self.assertFalse(app.passes_consecutive_run_budget(combo, 5, 1, 4))

    def test_one_five_and_one_four_allowed(self):
        combo = (1, 2, 3, 4, 5, 8, 10, 12, 14, 16, 18, 21, 22, 23, 24)
        self.assertEqual(app.get_consecutive_runs(combo), [5, 4])
        self.assertTrue(app.passes_consecutive_run_budget(combo, 5, 1, 4))

    def test_block_of_six_rejected(self):
        combo = (1, 2, 3, 4, 5, 6, 10, 12, 14, 16, 18, 20, 22, 24, 25)
        self.assertFalse(app.passes_consecutive_run_budget(combo, 5, 1, 4))

    def test_several_short_blocks_allowed(self):
        combo = (1, 2, 3, 4, 8, 9, 10, 11, 15, 16, 17, 20, 22, 24, 25)
        self.assertTrue(app.passes_consecutive_run_budget(combo, 5, 1, 4))


class TestRequiredBlocks(unittest.TestCase):
    def test_block_of_three_required(self):
        with_three = (1, 2, 3, 6, 8, 10, 12, 14, 16, 18, 20, 22, 23, 24, 25)
        without = (1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 22, 23, 24, 25)
        self.assertEqual(app.get_consecutive_runs(with_three), [3, 4])
        self.assertTrue(app.passes_required_blocks(with_three, {3}, 1))
        self.assertFalse(app.passes_required_blocks(without, {3}, 1))

    def test_longer_block_does_not_count(self):
        five = (1, 2, 3, 4, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25)
        self.assertFalse(app.passes_required_blocks(five, {3, 4}, 1))

    def test_min_count(self):
        combo = (1, 2, 3, 6, 8, 10, 12, 14, 16, 18, 20, 22, 23, 24, 25)
        self.assertTrue(app.passes_required_blocks(combo, {3, 4}, 2))
        self.assertFalse(app.passes_required_blocks(combo, {3}, 2))

    def test_generation_respects_required_blocks(self):
        f = TestSmartGeneration()._filters(
            game_size=16,
            require_blocks_active=True,
            require_blocks_lengths=frozenset({3, 4}),
            require_blocks_min=1,
        )
        result = app.generate_smart_games(f, 4, seed=3)
        self.assertGreater(result["generated_count"], 0)
        for game in result["games"]:
            self.assertTrue(app.passes_required_blocks(game["numbers"], {3, 4}, 1))


class TestHistorySmartScore(unittest.TestCase):
    def _fake_draws(self):
        # Muitos jogos com 8 pares / 7 ímpares e dezenas "quentes" no meio-alto
        draws = []
        base = [2, 4, 6, 8, 10, 12, 14, 16, 1, 3, 5, 7, 9, 11, 13]  # 8 pares, 7 ímpares
        for i in range(20):
            d = list(base)
            # pequena variação
            if i % 3 == 0:
                d[0] = 18
                d[8] = 15
            draws.append(sorted(set(d))[:15] if len(set(d)) >= 15 else sorted(d))
        # garantir 15 únicos
        out = []
        for i, d in enumerate(draws):
            nums = set(range(1, 16))
            if i % 2 == 0:
                nums = {2, 4, 6, 8, 10, 12, 14, 16, 1, 3, 5, 7, 9, 11, 13}
            else:
                nums = {2, 4, 6, 8, 10, 12, 14, 18, 1, 3, 5, 7, 9, 11, 15}
            out.append(sorted(nums))
        return out

    def test_profile_needs_min_draws(self):
        self.assertIsNone(app.build_smart_history_profile([[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]] * 3))

    def test_profile_from_history(self):
        profile = app.build_smart_history_profile(self._fake_draws())
        self.assertIsNotNone(profile)
        self.assertEqual(profile["mode_even"], 8)
        self.assertEqual(len(profile["hot_numbers"]), 10)

    def test_affinity_prefers_historical_parity(self):
        profile = app.build_smart_history_profile(self._fake_draws())
        like = (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16)  # 8 pares
        unlike = (1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 2, 4)  # 2 pares
        pen_like = app.calc_history_affinity_penalty(like, profile)
        pen_unlike = app.calc_history_affinity_penalty(unlike, profile)
        self.assertLess(pen_like, pen_unlike)


if __name__ == "__main__":
    unittest.main()
