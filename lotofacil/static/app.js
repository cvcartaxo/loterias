// Application State
let mustInclude = new Set();
let mustExclude = new Set();
let pastedExcludeNumbers = new Set();
let minSum = 210;
let maxSum = 310;
let evenCount = -1;
let primeCount = -1;
let excludeMaxEvens = false;
let excludeMaxOdds = false;
let excludeSequence6 = false;
let excludeSequence7 = false;
let excludeSequence8 = false;
let excludeSequence9 = false;
let excludeSequence10 = false;
let runBudgetActive = false;
let runBudgetPrimaryCount = 1;
let runBudgetPrimaryLen = 5;
let runBudgetOtherMax = 4;
let requireBlocksActive = false;
let requireBlocksLengths = [3, 4];
let requireBlocksMin = 1;
let excludeSequenceEntries = [];
let excludeSequencePatterns = [];
let excludeSequenceNumbers = new Set();
let lastDrawNumbers = new Set();
let sequenceGroupNumbers = new Set();
const REPEAT_COUNT_OPTIONS = [6, 7, 8, 9, 10];
const REPEAT_RECOMMENDED = [8, 9, 10];
let repeatFilterActive = false;
let repeatOverlapStats = null;
let lastDrawWasValid = false;
let repeatOptionCounts = {};
let repeatOptionsAbortController = null;
let numberFrequencyStats = null;
let consecutiveSeqStats = null;
let consecutiveSeqLengthFilter = 0;
let activeRepeatCounts = [...REPEAT_COUNT_OPTIONS];
let gameSize = 20;
let gameMeta = [];
let sumMinBound = 210;
let sumMaxBound = 310;
let currentPage = 1;
let pageSize = 50;
const PAGE_SIZE_OPTIONS = [10, 50, 100, 200, 300, 400];
let filteredCount = 0;
let importedExcludeDraws = [];
let importedDrawsFileName = "";
let importedDrawsInvalidLines = 0;
let importedDrawsDuplicateLines = 0;
let lastExcludeDrawsStats = null;
let lastProbability = null;

const PRIMES = new Set([2, 3, 5, 7, 11, 13, 17, 19, 23]);

// Debounce timer
let debounceTimer = null;
let fetchAbortController = null;

const PANEL_STATE_KEY = "lotofacil-panel-state";
const THEME_KEY = "lotofacil-theme";
const COMPARE_DRAWS_KEY = "lotofacil-compare-draws";
const IMPORTED_DRAWS_KEY = "lotofacil-imported-draws";
const WORKFLOW_KEY = "lotofacil-workflow";
const COMPARE_DRAW_COUNT = 5;
const compareDrawSets = Array.from({ length: COMPARE_DRAW_COUNT }, () => new Set());
let top5Cooccurrence = null;
let historicalDataNote = "";
let exportMaxLines = 250000;
let currentWorkflow = "filter";

// Initialize
document.addEventListener("DOMContentLoaded", async () => {
    generateBoard();
    setupCompareDraws();
    restoreImportedDraws();
    await loadGameMeta();
    setupEventListeners();
    setupCollapsiblePanels();
    setupWorkflowSteps();
    setupThemeToggle();
    setupCompareNav();
    setupRepeatCountGrid();
    setupNumberFrequencyPanel();
    syncSequenceGroupNumbers();
    applySumSlidersForGameSize();
    updateImportDrawsDesc();
    updateSlidersTrack();
    fetchData();
});

function showToast(message, tone = "info", durationMs = 4200) {
    const root = document.getElementById("toast-root");
    if (!root) {
        console.warn(message);
        return;
    }
    const el = document.createElement("div");
    el.className = `toast is-${tone}`;
    el.textContent = message;
    root.appendChild(el);
    window.setTimeout(() => {
        el.remove();
    }, durationMs);
}

let lastRenderedCombos = [];
let recentSmartGames = []; // evita repetir os mesmos jogos entre cliques
let lastSmartGeneratedGames = []; // para copiar os últimos gerados

function formatComboCopyText(combo) {
    return combo.map(n => String(n).padStart(2, "0")).join(" ");
}

async function copyTextToClipboard(text) {
    if (!text) return false;
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch (_) {}
    try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return ok;
    } catch (_) {
        return false;
    }
}

function selectElementText(el) {
    if (!el) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

function updateCopySelectedButton() {
    const btn = document.getElementById("btn-copy-selected");
    if (!btn) return;
    const n = document.querySelectorAll(".combo-row-check:checked").length;
    btn.disabled = n === 0;
    btn.textContent = n > 0 ? `Copiar selecionadas (${n})` : "Copiar selecionadas";
}

async function copyComboLines(lines, label) {
    const text = lines.filter(Boolean).join("\n");
    if (!text) {
        showToast("Nada para copiar", "info", 2500);
        return;
    }
    const ok = await copyTextToClipboard(text);
    if (ok) {
        showToast(`${label} copiada(s) — ${lines.length} linha(s)`, "success", 2500);
    } else {
        showToast("Não foi possível copiar. Selecione o texto manualmente.", "error", 3500);
    }
}

function setupWorkflowSteps() {
    const container = document.getElementById("workflow-steps");
    const app = document.querySelector(".app-container");
    if (!container || !app) return;

    try {
        const saved = localStorage.getItem(WORKFLOW_KEY);
        if (saved && ["filter", "analyze", "generate"].includes(saved)) {
            currentWorkflow = saved;
        }
    } catch (_) {}

    const apply = (step) => {
        currentWorkflow = step;
        app.dataset.workflow = step;
        container.querySelectorAll(".workflow-step").forEach(btn => {
            btn.classList.toggle("is-active", btn.dataset.step === step);
        });
        try {
            localStorage.setItem(WORKFLOW_KEY, step);
        } catch (_) {}

        if (step === "analyze") {
            openPanelsByIds(["probability", "analytics", "number-frequency"]);
        } else if (step === "generate") {
            openPanelsByIds(["actions", "combinations"]);
        } else {
            openPanelsByIds(["board", "filters-basic", "combinations"]);
        }
    };

    container.querySelectorAll(".workflow-step").forEach(btn => {
        btn.addEventListener("click", () => apply(btn.dataset.step));
    });
    apply(currentWorkflow);
}

function openPanelsByIds(ids) {
    const idSet = new Set(ids);
    document.querySelectorAll(".dock-panel[data-panel-id]").forEach(panel => {
        const id = panel.dataset.panelId;
        if (!idSet.has(id)) return;
        const toggle = panel.querySelector(".dock-panel-toggle");
        if (toggle) setPanelOpen(panel, toggle, true);
    });
    persistPanelState();
}

function getSumLimitsClient(k) {
    return { min: (k * (k + 1)) / 2, max: Math.floor((k * (51 - k)) / 2) };
}

function getParityLimitsClient(k) {
    return { min: Math.max(0, k - 13), max: Math.min(12, k) };
}

async function loadGameMeta() {
    try {
        const res = await fetch("/api/meta");
        if (!res.ok) {
            repeatOverlapStats = buildFallbackRepeatStats();
            populateGameSizeSelect();
            renderRepeatStatsPanel();
            refreshDrawAnalysis();
            return;
        }
        const data = await res.json();
        gameMeta = data.game_sizes || [];
        repeatOverlapStats = data.repeat_overlap_stats || buildFallbackRepeatStats();
        top5Cooccurrence = data.top5_cooccurrence || null;
        historicalDataNote = data.historical_data_note || "";
        exportMaxLines = data.export_max_lines || 250000;
        populateGameSizeSelect();
        renderRepeatStatsPanel();
        renderTop5Cooccurrence(top5Cooccurrence);
        const histNote = document.getElementById("historical-data-note");
        if (histNote) histNote.textContent = historicalDataNote;
        refreshDrawAnalysis();
    } catch (e) {
        console.warn("Meta indisponível, usando padrões locais", e);
        repeatOverlapStats = buildFallbackRepeatStats();
        gameMeta = [15, 16, 17, 18, 19, 20].map(k => {
            const s = getSumLimitsClient(k);
            const p = getParityLimitsClient(k);
            return { game_size: k, total_combinations: null, min_sum: s.min, max_sum: s.max, min_even: p.min, max_even: p.max };
        });
        populateGameSizeSelect();
        renderRepeatStatsPanel();
        refreshDrawAnalysis();
    }
}

function renderTop5Cooccurrence(data) {
    const panel = document.getElementById("cooccurrence-panel");
    if (!panel) return;
    if (!data) {
        panel.classList.add("hidden");
        return;
    }
    panel.classList.remove("hidden");

    const verdict = document.getElementById("cooccurrence-verdict");
    const grid = document.getElementById("cooccurrence-stats-grid");
    const pairsEl = document.getElementById("cooccurrence-pairs");
    const indep = document.getElementById("cooccurrence-independence");
    const betting = document.getElementById("cooccurrence-betting");
    const desc = document.getElementById("cooccurrence-desc");

    if (desc) {
        desc.textContent = `Grupo ${data.analysis_group.map(n => String(n).padStart(2, "0")).join(" · ")} · histórico ~${data.historical.total_draws.toLocaleString("pt-BR")} concursos.`;
    }
    if (verdict) verdict.textContent = data.verdict || "";
    if (indep) indep.textContent = data.independence_note || "";
    if (betting) betting.textContent = data.betting_note || "";

    if (grid) {
        const th = data.theory || {};
        const hi = data.historical || {};
        grid.innerHTML = `
            <div class="cooccurrence-stat-card">
                <span class="cooccurrence-stat-label">Todos juntos (teoria)</span>
                <span class="cooccurrence-stat-value">${(th.all_together_percent ?? 0).toLocaleString("pt-BR")}%</span>
                <span class="cooccurrence-stat-sub">por concurso</span>
            </div>
            <div class="cooccurrence-stat-card">
                <span class="cooccurrence-stat-label">Todos juntos (histórico)</span>
                <span class="cooccurrence-stat-value">${(hi.all_together_percent ?? 0).toLocaleString("pt-BR")}%</span>
                <span class="cooccurrence-stat-sub">${(hi.all_together_count ?? 0).toLocaleString("pt-BR")} de ${(hi.total_draws ?? 0).toLocaleString("pt-BR")}</span>
            </div>
            <div class="cooccurrence-stat-card">
                <span class="cooccurrence-stat-label">Esperado pela teoria</span>
                <span class="cooccurrence-stat-value">${(hi.theory_expected_count ?? 0).toLocaleString("pt-BR")}</span>
                <span class="cooccurrence-stat-sub">concursos no mesmo período</span>
            </div>
        `;
    }

    if (pairsEl) {
        const pairs = (data.historical?.pairs || []).slice(0, 5);
        pairsEl.innerHTML = pairs.map(p => `
            <div class="cooc-pair-row">
                <span>${String(p.a).padStart(2, "0")}–${String(p.b).padStart(2, "0")}</span>
                <span>${p.count.toLocaleString("pt-BR")}× (${p.percent.toLocaleString("pt-BR")}%)</span>
                <span>teoria ${p.theory_percent.toLocaleString("pt-BR")}%</span>
            </div>
        `).join("");
    }
}

function calcMaxConsecutiveClient(nums) {
    const sorted = [...nums].sort((a, b) => a - b);
    let maxRun = 1;
    let run = 1;
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === sorted[i - 1] + 1) {
            run += 1;
            if (run > maxRun) maxRun = run;
        } else {
            run = 1;
        }
    }
    return maxRun;
}

function extractConsecutiveSequencesFromDraw(nums, minLen = 3) {
    const sorted = [...nums].sort((a, b) => a - b);
    const found = new Set();
    let i = 0;
    while (i < sorted.length) {
        let j = i;
        while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j += 1;
        const runLen = j - i + 1;
        if (runLen >= minLen) {
            for (let length = minLen; length <= runLen; length++) {
                for (let start = i; start <= j - length + 1; start++) {
                    const seq = sorted.slice(start, start + length);
                    found.add(seq.join(","));
                }
            }
        }
        i = j + 1;
    }
    return found;
}

function analyzeConsecutiveSequencesClient(drawLines, minLength = 3, maxLength = 8, topN = 60) {
    const seqCounts = new Map();
    const maxRunHist = new Map();
    const drawsWithAtLeast = Object.fromEntries(
        [...Array(maxLength - minLength + 1)].map((_, idx) => [minLength + idx, 0])
    );
    let totalDraws = 0;

    drawLines.forEach(line => {
        const nums = line.split(",").map(n => parseInt(n, 10)).filter(n => n >= 1 && n <= 25);
        if (nums.length !== 15 || new Set(nums).size !== 15) return;

        totalDraws += 1;
        const maxRun = calcMaxConsecutiveClient(nums);
        maxRunHist.set(maxRun, (maxRunHist.get(maxRun) || 0) + 1);

        for (let length = minLength; length <= maxLength; length++) {
            if (maxRun >= length) drawsWithAtLeast[length] += 1;
        }

        extractConsecutiveSequencesFromDraw(nums, minLength).forEach(key => {
            const len = key.split(",").length;
            if (len > maxLength) return;
            seqCounts.set(key, (seqCounts.get(key) || 0) + 1);
        });
    });

    if (totalDraws === 0) return null;

    const seqRow = (key, count) => {
        const numbers = key.split(",").map(n => parseInt(n, 10));
        return {
            numbers,
            length: numbers.length,
            label: numbers.map(n => String(n).padStart(2, "0")).join(" "),
            count,
            percent: Math.round(count / totalDraws * 10000) / 100,
        };
    };

    const ranked = [...seqCounts.entries()].sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        const alen = a[0].split(",").length;
        const blen = b[0].split(",").length;
        if (blen !== alen) return blen - alen;
        return parseInt(a[0].split(",")[0], 10) - parseInt(b[0].split(",")[0], 10);
    });

    const topSequences = ranked.slice(0, topN).map(([key, count]) => seqRow(key, count));
    const byLength = {};
    for (let length = minLength; length <= maxLength; length++) {
        byLength[String(length)] = ranked
            .filter(([key]) => key.split(",").length === length)
            .slice(0, 20)
            .map(([key, count]) => seqRow(key, count));
    }

    return {
        total_draws: totalDraws,
        min_length: minLength,
        max_length: maxLength,
        max_run_distribution: [...maxRunHist.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([maxRun, count]) => ({
                max_run: maxRun,
                count,
                percent: Math.round(count / totalDraws * 10000) / 100,
            })),
        draws_with_at_least: Object.keys(drawsWithAtLeast).map(k => ({
            length: parseInt(k, 10),
            count: drawsWithAtLeast[k],
            percent: Math.round(drawsWithAtLeast[k] / totalDraws * 10000) / 100,
        })),
        top_sequences: topSequences,
        by_length: byLength,
        note: "Cada sequência consecutiva conta no máximo 1 vez por concurso analisado.",
        unique_sequences: seqCounts.size,
    };
}

function refreshDrawAnalysis() {
    const draws = getAllValidExcludeDraws();
    numberFrequencyStats = draws.length > 0 ? buildNumberFrequencyFromDraws(draws) : null;
    consecutiveSeqStats = draws.length > 0 ? analyzeConsecutiveSequencesClient(draws) : null;
    renderNumberFrequencyPanel();
    updateSmartGamesHistoryStatus();
    if (draws.length > 0) {
        fetchConsecutiveSequencesFromApi(draws);
    }
}

async function fetchConsecutiveSequencesFromApi(draws) {
    try {
        const payload = {
            draws: draws.map(d => d.join(" ")).join(";"),
            min_length: 3,
            max_length: 8,
            top_n: 60,
        };
        const res = await fetch("/api/consecutive-sequences", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!data || !data.total_draws) return;
        consecutiveSeqStats = data;
        renderConsecutiveSequencesPanel();
    } catch (e) {
        console.warn("Fallback local para sequências consecutivas", e);
    }
}

function persistImportedDraws() {
    try {
        const payload = {
            draws: importedExcludeDraws,
            fileName: importedDrawsFileName,
            invalidLines: importedDrawsInvalidLines,
            duplicateLines: importedDrawsDuplicateLines,
            savedAt: new Date().toISOString(),
        };
        localStorage.setItem(IMPORTED_DRAWS_KEY, JSON.stringify(payload));
    } catch (e) {
        console.warn("Não foi possível persistir sorteios importados", e);
    }
}

function restoreImportedDraws() {
    try {
        const raw = localStorage.getItem(IMPORTED_DRAWS_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        const draws = Array.isArray(data.draws) ? data.draws : [];
        importedExcludeDraws = draws
            .map(d => (Array.isArray(d) ? d.map(Number) : []))
            .filter(d => d.length === 15);
        importedDrawsFileName = data.fileName || "sessão anterior";
        importedDrawsInvalidLines = data.invalidLines || 0;
        importedDrawsDuplicateLines = data.duplicateLines || 0;
        if (importedExcludeDraws.length > 0) {
            updateImportDrawsStatus();
            showToast(
                `${importedExcludeDraws.length.toLocaleString("pt-BR")} sorteio(s) restaurados da sessão anterior.`,
                "success",
            );
        }
    } catch (e) {
        console.warn("Falha ao restaurar sorteios importados", e);
    }
}

function clearPersistedImportedDraws() {
    try {
        localStorage.removeItem(IMPORTED_DRAWS_KEY);
    } catch (_) {}
}

function setupConsecutiveSequencePanel() {
    const toolbar = document.getElementById("consecutive-length-toolbar");
    if (!toolbar || toolbar.dataset.ready) return;
    toolbar.dataset.ready = "1";

    const lengths = [
        { value: 0, label: "Todas" },
        { value: 3, label: "3 dez." },
        { value: 4, label: "4 dez." },
        { value: 5, label: "5 dez." },
        { value: 6, label: "6 dez." },
        { value: 7, label: "7 dez." },
        { value: 8, label: "8 dez." },
    ];

    toolbar.innerHTML = lengths.map(item => `
        <button type="button" class="btn btn-text btn-sm consecutive-len-btn${consecutiveSeqLengthFilter === item.value ? " is-active" : ""}" data-len="${item.value}">${item.label}</button>
    `).join("");

    toolbar.querySelectorAll(".consecutive-len-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            consecutiveSeqLengthFilter = parseInt(btn.dataset.len, 10);
            toolbar.querySelectorAll(".consecutive-len-btn").forEach(b => {
                b.classList.toggle("is-active", parseInt(b.dataset.len, 10) === consecutiveSeqLengthFilter);
            });
            renderConsecutiveSequencesPanel();
        });
    });
}

function renderConsecutiveSequencesPanel() {
    setupConsecutiveSequencePanel();

    const emptyEl = document.getElementById("consecutive-sequences-empty");
    const contentEl = document.getElementById("consecutive-sequences-content");
    const sourceEl = document.getElementById("consecutive-sequences-source");
    const summaryEl = document.getElementById("consecutive-sequences-summary");
    const atLeastEl = document.getElementById("consecutive-atleast-grid");
    const maxRunEl = document.getElementById("consecutive-maxrun-grid");
    const tableEl = document.getElementById("consecutive-sequences-table");
    const footnoteEl = document.getElementById("consecutive-sequences-footnote");

    const imported = importedExcludeDraws.length;
    const manual = getAllValidExcludeDraws().length - imported;

    if (!consecutiveSeqStats?.total_draws) {
        emptyEl?.classList.remove("hidden");
        contentEl?.classList.add("hidden");
        if (sourceEl) {
            sourceEl.textContent = imported > 0
                ? "Arquivo sem sorteios válidos (15 dezenas por linha)."
                : "Importe um arquivo .txt na sidebar (Excluir sorteios) para gerar o ranking.";
        }
        return;
    }

    emptyEl?.classList.add("hidden");
    contentEl?.classList.remove("hidden");

    const stats = consecutiveSeqStats;
    let sourceText = `${stats.total_draws.toLocaleString("pt-BR")} sorteio(s) analisado(s)`;
    if (importedDrawsFileName) sourceText += ` · arquivo «${importedDrawsFileName}» (${imported.toLocaleString("pt-BR")})`;
    if (manual > 0) sourceText += ` · +${manual.toLocaleString("pt-BR")} manual(is)`;
    if (sourceEl) sourceEl.textContent = sourceText;

    const top = stats.top_sequences[0];
    if (summaryEl) {
        summaryEl.innerHTML = `
            <div class="consecutive-summary-card">
                <span class="consecutive-summary-label">Sequência campeã</span>
                <span class="consecutive-summary-value">${top ? top.label : "—"}</span>
                <span class="consecutive-summary-sub">${top ? `${top.count.toLocaleString("pt-BR")}× · ${top.percent.toLocaleString("pt-BR")}% dos sorteios` : ""}</span>
            </div>
            <div class="consecutive-summary-card">
                <span class="consecutive-summary-label">Sequências distintas</span>
                <span class="consecutive-summary-value">${(stats.unique_sequences ?? stats.top_sequences.length).toLocaleString("pt-BR")}</span>
                <span class="consecutive-summary-sub">padrões distintos encontrados</span>
            </div>
        `;
    }

    if (atLeastEl) {
        atLeastEl.innerHTML = stats.draws_with_at_least.map(row => `
            <div class="consecutive-atleast-item">
                <span class="consecutive-atleast-len">≥ ${row.length} seguidas</span>
                <span class="consecutive-atleast-val">${row.count.toLocaleString("pt-BR")}×</span>
                <span class="consecutive-atleast-pct">${row.percent.toLocaleString("pt-BR")}%</span>
            </div>
        `).join("");
    }

    if (maxRunEl) {
        maxRunEl.innerHTML = stats.max_run_distribution.map(row => `
            <div class="consecutive-maxrun-item" title="Maior bloco consecutivo no sorteio">
                <span class="consecutive-maxrun-len">${row.max_run} seguidas</span>
                <span class="consecutive-maxrun-val">${row.count.toLocaleString("pt-BR")}×</span>
                <span class="consecutive-maxrun-pct">${row.percent.toLocaleString("pt-BR")}%</span>
            </div>
        `).join("");
    }

    const rows = consecutiveSeqLengthFilter > 0
        ? (stats.by_length[String(consecutiveSeqLengthFilter)] || [])
        : stats.top_sequences;

    if (tableEl) {
        if (!rows.length) {
            tableEl.innerHTML = `<p class="consecutive-table-empty">Nenhuma sequência de ${consecutiveSeqLengthFilter || 3}+ dezenas encontrada.</p>`;
        } else {
            tableEl.innerHTML = `
                <div class="consecutive-table-header">
                    <span>#</span>
                    <span>Sequência</span>
                    <span>Tam.</span>
                    <span>Vezes</span>
                    <span>%</span>
                </div>
                ${rows.map((row, idx) => `
                    <div class="consecutive-table-row">
                        <span class="consecutive-rank">${idx + 1}</span>
                        <span class="consecutive-label">${row.label}</span>
                        <span class="consecutive-len">${row.length}</span>
                        <span class="consecutive-count">${row.count.toLocaleString("pt-BR")}</span>
                        <span class="consecutive-pct">${row.percent.toLocaleString("pt-BR")}%</span>
                    </div>
                `).join("")}
            `;
        }
    }

    if (footnoteEl) footnoteEl.textContent = stats.note || "";
}

function buildNumberFrequencyFromCounts(counts, totalDraws, source) {
    const theoryPct = (15 / 25) * 100;
    const rows = [];
    for (let number = 1; number <= 25; number++) {
        const count = counts[number] || 0;
        const percent = totalDraws ? (count / totalDraws) * 100 : 0;
        rows.push({
            number,
            count,
            percent: Math.round(percent * 100) / 100,
            delta_from_theory: Math.round((percent - theoryPct) * 100) / 100,
        });
    }
    rows.sort((a, b) => b.count - a.count || a.number - b.number);
    rows.forEach((row, idx) => {
        row.rank = idx + 1;
        row.tier = idx < 5 ? "hot" : idx >= 20 ? "cold" : "neutral";
    });
    return {
        total_draws: totalDraws,
        theory_percent: theoryPct,
        source,
        numbers: rows,
        most_drawn: rows.slice(0, 5),
        least_drawn: rows.slice(-5).reverse(),
        note: "Cada sorteio sorteia 15 das 25 dezenas (~60% por número). Diferenças no histórico são esperadas e não prevêem o próximo concurso.",
    };
}

function buildNumberFrequencyFromDraws(drawLines) {
    const counts = Object.fromEntries([...Array(25)].map((_, i) => [i + 1, 0]));
    let totalDraws = 0;
    drawLines.forEach(line => {
        const nums = line.split(",").map(n => parseInt(n, 10)).filter(n => n >= 1 && n <= 25);
        if (nums.length !== 15 || new Set(nums).size !== 15) return;
        totalDraws += 1;
        nums.forEach(n => { counts[n] += 1; });
    });
    if (totalDraws === 0) return null;

    const imported = importedExcludeDraws.length;
    const manual = Math.max(0, drawLines.length - imported);
    let source = `${totalDraws.toLocaleString("pt-BR")} sorteio(s) analisado(s)`;
    if (importedDrawsFileName && imported > 0) {
        source = `Arquivo «${importedDrawsFileName}» (${imported.toLocaleString("pt-BR")} sorteio(s)`;
        if (manual > 0) source += ` + ${manual.toLocaleString("pt-BR")} manual(is)`;
        source += ")";
    } else if (manual > 0) {
        source = `${manual.toLocaleString("pt-BR")} jogo(s) manual(is)`;
    }

    return buildNumberFrequencyFromCounts(counts, totalDraws, source);
}

function setupNumberFrequencyPanel() {
    const board = document.getElementById("number-frequency-board");
    if (board && !board.children.length) {
        for (let n = 1; n <= 25; n++) {
            const cell = document.createElement("span");
            cell.className = "board-num";
            cell.textContent = String(n).padStart(2, "0");
            cell.dataset.number = String(n);
            board.appendChild(cell);
        }
    }
}

function renderNumberFrequencyPanel() {
    const stats = numberFrequencyStats;
    const emptyEl = document.getElementById("number-frequency-empty");
    const contentEl = document.getElementById("number-frequency-content");
    const sourceEl = document.getElementById("number-frequency-source");
    const mostList = document.getElementById("freq-most-list");
    const leastList = document.getElementById("freq-least-list");
    const chart = document.getElementById("number-frequency-chart");
    const footnote = document.getElementById("number-frequency-footnote");
    const board = document.getElementById("number-frequency-board");

    if (!stats?.numbers?.length) {
        emptyEl?.classList.remove("hidden");
        contentEl?.classList.add("hidden");
        if (sourceEl) {
            sourceEl.textContent = importedExcludeDraws.length > 0
                ? "Arquivo sem sorteios válidos (15 dezenas por linha)."
                : "Importe um arquivo .txt na sidebar para gerar o ranking de frequência.";
        }
        if (mostList) mostList.innerHTML = "";
        if (leastList) leastList.innerHTML = "";
        if (chart) chart.innerHTML = "";
        if (footnote) footnote.textContent = "";
        if (board) {
            board.querySelectorAll(".board-num").forEach(cell => {
                cell.className = "board-num";
            });
        }
        renderConsecutiveSequencesPanel();
        return;
    }

    emptyEl?.classList.add("hidden");
    contentEl?.classList.remove("hidden");

    if (sourceEl) {
        sourceEl.textContent = `${stats.source} · teoria: ~${stats.theory_percent}% por sorteio`;
    }

    const formatRow = row => {
        const delta = row.delta_from_theory;
        const deltaLabel = delta > 0 ? `+${delta.toLocaleString("pt-BR")}%` : `${delta.toLocaleString("pt-BR")}%`;
        return `<li><span class="freq-num">${String(row.number).padStart(2, "0")}</span> <span class="freq-count">${row.count.toLocaleString("pt-BR")}×</span> <span class="freq-pct">${row.percent.toLocaleString("pt-BR")}%</span> <span class="freq-delta">${deltaLabel}</span></li>`;
    };

    if (mostList) mostList.innerHTML = stats.most_drawn.map(formatRow).join("");
    if (leastList) leastList.innerHTML = stats.least_drawn.map(formatRow).join("");

    const maxCount = Math.max(...stats.numbers.map(r => r.count), 1);
    if (chart) {
        chart.innerHTML = stats.numbers.map(row => {
            const width = (row.count / maxCount) * 100;
            return `
                <div class="number-freq-row tier-${row.tier}" title="${row.count.toLocaleString("pt-BR")} aparições (${row.percent}%)">
                    <span class="number-freq-rank">#${row.rank}</span>
                    <span class="number-freq-num">${String(row.number).padStart(2, "0")}</span>
                    <div class="number-freq-bar-wrap">
                        <div class="number-freq-bar" style="width:${width.toFixed(1)}%"></div>
                    </div>
                    <span class="number-freq-count">${row.count.toLocaleString("pt-BR")}</span>
                    <span class="number-freq-pct">${row.percent.toLocaleString("pt-BR")}%</span>
                </div>
            `;
        }).join("");
    }

    if (board) {
        const byNumber = new Map(stats.numbers.map(r => [r.number, r]));
        board.querySelectorAll(".board-num").forEach(cell => {
            const num = parseInt(cell.dataset.number, 10);
            const row = byNumber.get(num);
            cell.className = "board-num";
            if (row) cell.classList.add(`state-freq-tier-${row.tier}`);
        });
    }

    if (footnote) footnote.textContent = stats.note || "";
    renderConsecutiveSequencesPanel();
}

function buildFallbackRepeatStats() {
    const hist = { 5: 0.03, 6: 1.40, 7: 9.38, 8: 24.56, 9: 32.59, 10: 21.90, 11: 8.46, 12: 1.67, 13: 0.21, 14: 0.03 };
    const theory = { 5: 0.09, 6: 1.53, 7: 8.86, 8: 23.62, 9: 32.15, 10: 23.15, 11: 8.77, 12: 1.67, 13: 0.14, 14: 0.0 };
    const rows = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map(n => ({
        repeat_count: n,
        theory_percent: theory[n],
        historical_percent: hist[n],
        recommended: REPEAT_RECOMMENDED.includes(n),
    }));
    return {
        rows,
        recommended_counts: REPEAT_RECOMMENDED,
        recommended_theory_percent: 78.92,
        note: "Comparativo histórico vs teoria (dados locais).",
    };
}

function renderRepeatStatsPanel() {
    const chart = document.getElementById("repeat-stats-chart");
    const footnote = document.getElementById("repeat-stats-footnote");
    if (!chart || !repeatOverlapStats?.rows) return;

    const maxPct = Math.max(
        ...repeatOverlapStats.rows.flatMap(r => [r.historical_percent || 0, r.theory_percent || 0]),
        1
    );

    chart.innerHTML = repeatOverlapStats.rows.map(row => {
        const n = row.repeat_count;
        const hist = row.historical_percent;
        const theory = row.theory_percent;
        const histW = hist != null ? (hist / maxPct) * 100 : 0;
        const theoryW = theory != null ? (theory / maxPct) * 100 : 0;
        const inFilter = REPEAT_COUNT_OPTIONS.includes(n);
        const selected = getSelectedRepeatCounts().has(n);
        return `
            <div class="repeat-stats-row${row.recommended ? " is-recommended" : ""}${!inFilter ? " is-outside-filter" : ""}${selected ? " is-selected" : ""}" data-repeat-row="${n}">
                <span class="repeat-stats-count">${n}</span>
                <div class="repeat-stats-bars">
                    <div class="repeat-stats-bar-wrap" title="Histórico: ${hist != null ? hist.toLocaleString("pt-BR") + "%" : "—"}">
                        <div class="repeat-stats-bar hist" style="width:${histW.toFixed(1)}%"></div>
                        <span class="repeat-stats-pct">${hist != null ? hist.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%" : "—"}</span>
                    </div>
                    <div class="repeat-stats-bar-wrap" title="Teoria: ${theory != null ? theory.toLocaleString("pt-BR") + "%" : "—"}">
                        <div class="repeat-stats-bar theory" style="width:${theoryW.toFixed(1)}%"></div>
                        <span class="repeat-stats-pct">${theory != null ? theory.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%" : "—"}</span>
                    </div>
                </div>
            </div>
        `;
    }).join("");

    if (footnote) {
        const recPct = repeatOverlapStats.recommended_theory_percent;
        footnote.textContent = `Sugestão 8+9+10 cobre ~${recPct}% dos sorteios (teoria). ${repeatOverlapStats.note || ""}`;
    }
}

function applyRecommendedRepeatCounts(triggerFetch = true) {
    const recommended = new Set(REPEAT_RECOMMENDED);
    document.querySelectorAll("[data-repeat-count]").forEach(input => {
        if (input.disabled) return;
        const n = parseInt(input.value, 10);
        input.checked = recommended.has(n);
    });
    updateLastDrawUi();
    renderRepeatStatsPanel();
    if (triggerFetch) {
        currentPage = 1;
        debouncedFetch();
    } else {
        updateRepeatOptionCountsUi();
    }
}

function populateGameSizeSelect() {
    const sel = document.getElementById("filter-game-size");
    if (!sel) return;
    sel.innerHTML = "";
    gameMeta.forEach(entry => {
        const k = entry.game_size;
        const total = entry.total_combinations != null
            ? entry.total_combinations.toLocaleString("pt-BR")
            : "...";
        const opt = document.createElement("option");
        opt.value = k;
        opt.textContent = `${k} dezenas (${total} combinações)`;
        if (k === gameSize) opt.selected = true;
        sel.appendChild(opt);
    });
}

function applyLimitsFromResponse(limits) {
    if (!limits) return;
    sumMinBound = limits.min_sum;
    sumMaxBound = limits.max_sum;

    const minSlider = document.getElementById("filter-min-sum");
    const maxSlider = document.getElementById("filter-max-sum");
    minSlider.min = sumMinBound;
    minSlider.max = sumMaxBound;
    maxSlider.min = sumMinBound;
    maxSlider.max = sumMaxBound;

    if (minSum < sumMinBound) minSum = sumMinBound;
    if (maxSum > sumMaxBound) maxSum = sumMaxBound;
    if (minSum > maxSum) minSum = sumMinBound;
    if (maxSum < minSum) maxSum = sumMaxBound;

    minSlider.value = minSum;
    maxSlider.value = maxSum;

    document.getElementById("sum-min-label").textContent = `Mín: ${sumMinBound}`;
    document.getElementById("sum-max-label").textContent = `Máx: ${sumMaxBound}`;

    populateEvenPrimeSelects(limits);
    updateImprobableLabels(limits);
    updateGameSizeLabels();
    updateSlidersTrack();
}

function applySumSlidersForGameSize() {
    const entry = gameMeta.find(e => e.game_size === gameSize);
    const limits = entry
        ? { min_sum: entry.min_sum, max_sum: entry.max_sum, min_even: entry.min_even, max_even: entry.max_even, min_prime: entry.min_prime ?? 0, max_prime: entry.max_prime ?? Math.min(9, gameSize) }
        : { min_sum: getSumLimitsClient(gameSize).min, max_sum: getSumLimitsClient(gameSize).max, ...getParityLimitsClient(gameSize), min_prime: 0, max_prime: Math.min(9, gameSize) };

    minSum = limits.min_sum;
    maxSum = limits.max_sum;
    applyLimitsFromResponse({
        min_sum: limits.min_sum,
        max_sum: limits.max_sum,
        min_even: limits.min_even ?? limits.min,
        max_even: limits.max_even ?? limits.max,
        min_prime: limits.min_prime ?? 0,
        max_prime: limits.max_prime ?? Math.min(9, gameSize),
    });
}

function populateEvenPrimeSelects(limits) {
    const evenSel = document.getElementById("filter-even");
    const oddSel = document.getElementById("filter-odd");
    const primeSel = document.getElementById("filter-prime");
    const prevEven = evenSel.value;
    const prevPrime = primeSel.value;
    const minEven = limits.min_even ?? limits.min ?? 0;
    const maxEven = limits.max_even ?? limits.max ?? gameSize;

    evenSel.innerHTML = '<option value="-1">Todos</option>';
    if (oddSel) oddSel.innerHTML = '<option value="-1">Todos</option>';

    for (let n = minEven; n <= maxEven; n++) {
        const odds = gameSize - n;
        const evenOpt = document.createElement("option");
        evenOpt.value = n;
        evenOpt.textContent = `Exatamente ${n} pares (${odds} ímpares)`;
        evenSel.appendChild(evenOpt);

        if (oddSel) {
            const oddOpt = document.createElement("option");
            oddOpt.value = odds;
            oddOpt.dataset.even = String(n);
            oddOpt.textContent = `Exatamente ${odds} ímpares (${n} pares)`;
            oddSel.appendChild(oddOpt);
        }
    }

    // Ordena ímpares do menor para o maior (opções foram geradas pelo loop de pares)
    if (oddSel && oddSel.options.length > 2) {
        const allOpt = oddSel.options[0];
        const rest = Array.from(oddSel.options).slice(1)
            .sort((a, b) => parseInt(a.value, 10) - parseInt(b.value, 10));
        oddSel.innerHTML = "";
        oddSel.appendChild(allOpt);
        rest.forEach(o => oddSel.appendChild(o));
    }

    primeSel.innerHTML = '<option value="-1">Todos</option>';
    const pMin = limits.min_prime ?? 0;
    const pMax = limits.max_prime ?? Math.min(9, gameSize);
    for (let n = pMin; n <= pMax; n++) {
        const opt = document.createElement("option");
        opt.value = n;
        opt.textContent = `Exatamente ${n} Primos`;
        primeSel.appendChild(opt);
    }

    evenSel.value = [...evenSel.options].some(o => o.value === prevEven) ? prevEven : "-1";
    evenCount = parseInt(evenSel.value, 10);
    syncOddSelectFromEven();
    primeSel.value = [...primeSel.options].some(o => o.value === prevPrime) ? prevPrime : "-1";
    primeCount = parseInt(primeSel.value, 10);

    const parityTotal = document.getElementById("parity-total-label");
    if (parityTotal) parityTotal.textContent = String(gameSize);
}

function syncOddSelectFromEven() {
    const oddSel = document.getElementById("filter-odd");
    if (!oddSel) return;
    if (evenCount === -1) {
        oddSel.value = "-1";
        return;
    }
    const odds = gameSize - evenCount;
    if ([...oddSel.options].some(o => o.value === String(odds))) {
        oddSel.value = String(odds);
    } else {
        oddSel.value = "-1";
    }
}

function setParityFromEven(value) {
    evenCount = parseInt(value, 10);
    const evenSel = document.getElementById("filter-even");
    if (evenSel) evenSel.value = String(evenCount);
    syncOddSelectFromEven();
}

function setParityFromOdd(value) {
    const oddCount = parseInt(value, 10);
    if (oddCount === -1) {
        evenCount = -1;
    } else {
        evenCount = gameSize - oddCount;
    }
    const evenSel = document.getElementById("filter-even");
    if (evenSel && [...evenSel.options].some(o => o.value === String(evenCount))) {
        evenSel.value = String(evenCount);
    } else if (evenSel) {
        evenSel.value = "-1";
        evenCount = -1;
    }
    syncOddSelectFromEven();
}

function updateImprobableLabels(limits) {
    const maxEvens = limits.max_even;
    const minEvens = limits.min_even;
    const maxOdds = gameSize - minEvens;
    const minOdds = gameSize - maxEvens;
    const evLabel = document.getElementById("improb-max-evens-label");
    const odLabel = document.getElementById("improb-max-odds-label");
    if (evLabel) evLabel.textContent = `(${maxEvens} pares / ${minOdds} ímpares)`;
    if (odLabel) odLabel.textContent = `(${maxOdds} ímpares / ${minEvens} pares)`;
}

function updateGameSizeLabels() {
    const label = document.getElementById("game-size-label");
    if (label) label.textContent = gameSize;
    const probActive = document.getElementById("prob-active-size");
    if (probActive) probActive.textContent = gameSize;
    const exLabel = document.getElementById("exclude-combos-label");
    if (exLabel) exLabel.textContent = `Excluir Combinações (${gameSize} dezenas por linha):`;
    updateImportDrawsDesc();

    const excludeCombos = document.getElementById("filter-exclude-combos");
    if (excludeCombos) {
        excludeCombos.placeholder = `Cole combinações completas de ${gameSize} dezenas que não vão sair, uma por linha. Ex:\n` +
            Array.from({ length: gameSize }, (_, i) => String(i + 1).padStart(2, "0")).join(" ");
    }

    const sizeSel = document.getElementById("filter-game-size");
    if (sizeSel && sizeSel.value !== String(gameSize)) {
        sizeSel.value = String(gameSize);
    }

    const randomBtn = document.getElementById("btn-random-draw");
    if (randomBtn) {
        randomBtn.title = "Gera 1 jogo inteligente (padrão espalhado, sem blocos longos)";
    }
}

function refreshGameMetaEntry(data) {
    if (!data?.game_size) return;
    const idx = gameMeta.findIndex(e => e.game_size === data.game_size);
    const entry = {
        game_size: data.game_size,
        total_combinations: data.total_count,
        min_sum: data.limits?.min_sum,
        max_sum: data.limits?.max_sum,
        min_even: data.limits?.min_even,
        max_even: data.limits?.max_even,
        min_prime: data.limits?.min_prime,
        max_prime: data.limits?.max_prime,
    };
    if (idx >= 0) {
        gameMeta[idx] = { ...gameMeta[idx], ...entry };
    } else {
        gameMeta.push(entry);
        gameMeta.sort((a, b) => a.game_size - b.game_size);
    }
    populateGameSizeSelect();
}

// Generate board numbers (1-25)
function generateBoard() {
    const board = document.getElementById("numbers-board");
    board.innerHTML = "";
    
    for (let i = 1; i <= 25; i++) {
        const btn = document.createElement("button");
        btn.className = "board-num";
        btn.textContent = String(i).padStart(2, '0');
        btn.dataset.number = i;
        
        btn.addEventListener("click", () => {
            handleNumberClick(btn, i);
        });
        
        board.appendChild(btn);
    }
}

function setupCompareDraws() {
    const container = document.getElementById("compare-boards-container");
    const freqBoard = document.getElementById("compare-frequency-board");
    if (!container || !freqBoard) return;

    let savedTexts = [];
    try {
        const raw = localStorage.getItem(COMPARE_DRAWS_KEY);
        if (raw) savedTexts = JSON.parse(raw);
    } catch (_) {
        savedTexts = [];
    }

    container.innerHTML = "";
    for (let i = 0; i < COMPARE_DRAW_COUNT; i++) {
        const slot = document.createElement("div");
        slot.className = "compare-board-slot";
        slot.dataset.slotIndex = String(i);

        const label = document.createElement("label");
        label.textContent = `Sorteio ${i + 1}`;
        label.setAttribute("for", `compare-draw-input-${i}`);

        const textarea = document.createElement("textarea");
        textarea.id = `compare-draw-input-${i}`;
        textarea.className = "compare-draw-input";
        textarea.rows = 2;
        textarea.placeholder = "15 dezenas. Ex: 01 03 05 07 09 10 12 14 16 17 18 20 22 24 25";
        if (savedTexts[i]) textarea.value = savedTexts[i];

        const status = document.createElement("div");
        status.className = "compare-slot-status";
        status.id = `compare-slot-status-${i}`;
        status.textContent = "Vazio";

        const grid = document.createElement("div");
        grid.className = "board-grid board-grid-compact compare-board-grid";
        grid.id = `compare-board-${i}`;
        for (let n = 1; n <= 25; n++) {
            const cell = document.createElement("span");
            cell.className = "board-num";
            cell.textContent = String(n).padStart(2, "0");
            cell.dataset.number = String(n);
            grid.appendChild(cell);
        }

        textarea.addEventListener("input", () => {
            syncCompareDrawSlot(i);
            persistCompareDraws();
        });

        slot.appendChild(label);
        slot.appendChild(textarea);
        slot.appendChild(status);
        slot.appendChild(grid);
        container.appendChild(slot);
    }

    freqBoard.innerHTML = "";
    for (let n = 1; n <= 25; n++) {
        const cell = document.createElement("span");
        cell.className = "board-num";
        cell.textContent = String(n).padStart(2, "0");
        cell.dataset.number = String(n);
        freqBoard.appendChild(cell);
    }

    document.getElementById("btn-compare-clear")?.addEventListener("click", () => {
        for (let i = 0; i < COMPARE_DRAW_COUNT; i++) {
            const el = document.getElementById(`compare-draw-input-${i}`);
            if (el) el.value = "";
        }
        syncAllCompareDraws();
        persistCompareDraws();
    });

    syncAllCompareDraws();
}

function syncCompareDrawSlot(index) {
    const textarea = document.getElementById(`compare-draw-input-${index}`);
    const status = document.getElementById(`compare-slot-status-${index}`);
    const grid = document.getElementById(`compare-board-${index}`);
    const line = textarea ? parseLastDrawLine(textarea.value) : null;

    compareDrawSets[index] = new Set();
    if (line) {
        line.split(",").forEach(n => compareDrawSets[index].add(parseInt(n, 10)));
    }

    if (status) {
        if (compareDrawSets[index].size === 15) {
            status.textContent = "15 dezenas válidas";
            status.classList.add("is-valid");
        } else if (textarea?.value.trim()) {
            status.textContent = `${compareDrawSets[index].size}/15 dezenas`;
            status.classList.remove("is-valid");
        } else {
            status.textContent = "Vazio";
            status.classList.remove("is-valid");
        }
    }

    grid?.querySelectorAll(".board-num").forEach(cell => {
        const num = parseInt(cell.dataset.number, 10);
        cell.className = "board-num";
        if (compareDrawSets[index].has(num)) {
            cell.classList.add("state-compare-slot");
        }
    });

    updateCompareFrequencyBoard();
}

function syncAllCompareDraws() {
    for (let i = 0; i < COMPARE_DRAW_COUNT; i++) {
        syncCompareDrawSlot(i);
    }
}

function getCompareDrawFrequency() {
    const freq = new Map();
    for (let n = 1; n <= 25; n++) freq.set(n, 0);
    compareDrawSets.forEach(set => {
        if (set.size !== 15) return;
        set.forEach(n => freq.set(n, (freq.get(n) || 0) + 1));
    });
    return freq;
}

function updateCompareFrequencyBoard() {
    const freqBoard = document.getElementById("compare-frequency-board");
    const summary = document.getElementById("compare-pattern-summary");
    if (!freqBoard) return;

    const freq = getCompareDrawFrequency();
    const validCount = compareDrawSets.filter(s => s.size === 15).length;

    freqBoard.querySelectorAll(".board-num").forEach(cell => {
        const num = parseInt(cell.dataset.number, 10);
        const count = freq.get(num) || 0;
        cell.className = "board-num";
        if (count > 0) {
            cell.classList.add(`state-freq-${count}`);
        }
    });

    if (!summary) return;

    if (validCount === 0) {
        summary.textContent = "Nenhum sorteio preenchido. Cole 15 dezenas em cada tabuleiro.";
        return;
    }

    const hot = [...freq.entries()].filter(([, c]) => c >= Math.min(3, validCount)).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    const cold = [...freq.entries()].filter(([, c]) => c === 0).map(([n]) => n);
    const overlapLast = lastDrawNumbers.size === 15
        ? hot.filter(([n]) => lastDrawNumbers.has(n)).map(([n, c]) => `${String(n).padStart(2, "0")} (${c}×)`)
        : [];

    let text = `${validCount} sorteio(s) válido(s). `;
    if (hot.length) {
        text += `Quentes: ${hot.slice(0, 12).map(([n, c]) => `${String(n).padStart(2, "0")} (${c}×)`).join(", ")}`;
        if (hot.length > 12) text += "…";
    } else {
        text += "Nenhuma dezena se repete em 3+ sorteios ainda.";
    }
    if (cold.length && validCount >= 2) {
        text += ` · Ausentes em todos: ${cold.slice(0, 8).map(n => String(n).padStart(2, "0")).join(", ")}`;
        if (cold.length > 8) text += "…";
    }
    if (overlapLast.length) {
        text += ` · Também no último sorteio: ${overlapLast.join(", ")}`;
    }
    summary.textContent = text;
}

function persistCompareDraws() {
    const texts = [];
    for (let i = 0; i < COMPARE_DRAW_COUNT; i++) {
        texts.push(document.getElementById(`compare-draw-input-${i}`)?.value || "");
    }
    try {
        localStorage.setItem(COMPARE_DRAWS_KEY, JSON.stringify(texts));
    } catch (_) { /* quota */ }
}

// Handle cycling number states: Neutral -> Include -> Exclude -> Neutral
function handleNumberClick(element, num) {
    if (!mustInclude.has(num) && !mustExclude.has(num)) {
        mustInclude.add(num);
    } else if (mustInclude.has(num)) {
        mustInclude.delete(num);
        mustExclude.add(num);
    } else {
        mustExclude.delete(num);
    }

    updateBoardHighlights();
    currentPage = 1;
    debouncedFetch();
}

function getAllValidExcludeDraws() {
    const excludeEl = document.getElementById("filter-exclude-games");
    const excludeText = excludeEl ? excludeEl.value : "";
    const textareaDraws = parseNumberLines(excludeText, 15);
    const seen = new Set(textareaDraws);
    const combined = [...textareaDraws];
    importedExcludeDraws.forEach(draw => {
        if (!seen.has(draw)) {
            seen.add(draw);
            combined.push(draw);
        }
    });
    return combined;
}

function updateImportDrawsDesc() {
    const desc = document.getElementById("import-draws-desc");
    if (!desc) return;
    if (gameSize === 15) {
        desc.innerHTML = `Um sorteio por linha com <strong>15 dezenas</strong>. Alimenta a análise de <strong>sequências consecutivas</strong>. Com jogo de <strong>15 dezenas</strong>, cada sorteio exclui <strong>exatamente 1 combinação</strong>.`;
    } else {
        desc.innerHTML = `Um sorteio por linha com <strong>15 dezenas</strong>. Alimenta a análise de <strong>sequências consecutivas</strong>. Com jogo de <strong>${gameSize} dezenas</strong>, cada sorteio exclui combinações que <strong>contêm aquelas 15 dezenas</strong>.`;
    }
}

function updateSmartGamesHistoryStatus() {
    updateRequiredBlocksHint();
    const el = document.getElementById("smart-games-history-status");
    if (!el) return;
    const n = getAllValidExcludeDraws().length;
    if (n >= 5) {
        el.textContent = `Histórico ativo: ${n.toLocaleString("pt-BR")} sorteio(s) vão orientar a geração (junto com os filtros marcados).`;
        el.classList.add("has-history");
    } else if (n > 0) {
        el.textContent = `Há ${n} sorteio(s), mas o mínimo para perfil histórico é 5. Importe mais linhas ou use só os filtros.`;
        el.classList.remove("has-history");
    } else {
        el.textContent = "Importe o histórico na sidebar para ativar a geração guiada por padrões.";
        el.classList.remove("has-history");
    }
}

function updateImportDrawsStatus(excludeStats = lastExcludeDrawsStats) {
    const statusEl = document.getElementById("import-draws-status");
    const statsBox = document.getElementById("import-draws-stats");
    updateSmartGamesHistoryStatus();
    if (!statusEl) return;

    const totalImported = importedExcludeDraws.length;
    const totalCombined = getAllValidExcludeDraws().length;
    const manualCount = totalCombined - totalImported;

    if (totalImported === 0) {
        statusEl.textContent = "Nenhum arquivo importado";
        statusEl.classList.remove("has-valid");
        statsBox?.classList.add("hidden");
        return;
    }

    let msg = `${totalImported.toLocaleString("pt-BR")} sorteio(s) no arquivo`;
    if (importedDrawsFileName) {
        msg += ` «${importedDrawsFileName}»`;
    }
    if (importedDrawsInvalidLines > 0) {
        msg += ` · ${importedDrawsInvalidLines.toLocaleString("pt-BR")} linha(s) ignorada(s)`;
    }
    if (importedDrawsDuplicateLines > 0) {
        msg += ` · ${importedDrawsDuplicateLines.toLocaleString("pt-BR")} duplicata(s) removida(s)`;
    }
    statusEl.textContent = msg;
    statusEl.classList.add("has-valid");

    if (!statsBox || !excludeStats || excludeStats.draws_count === 0) {
        statsBox?.classList.add("hidden");
        return;
    }

    statsBox.classList.remove("hidden");

    const drawsEl = document.getElementById("import-stat-draws");
    const excludedDrawsEl = document.getElementById("import-stat-excluded-draws");
    const remainingDrawsEl = document.getElementById("import-stat-remaining-draws");
    const otherRow = document.getElementById("import-stat-other-row");
    const excludedOtherEl = document.getElementById("import-stat-excluded-other");
    const remainingEl = document.getElementById("import-stat-remaining");
    const noteEl = document.getElementById("import-stat-note");

    const excludedByDraws = excludeStats.excluded_by_draws ?? excludeStats.excluded_combinations ?? 0;
    const remainingAfterDraws = excludeStats.remaining_after_draws ?? excludeStats.remaining_combinations ?? 0;
    const finalCount = excludeStats.filtered_count_all ?? filteredCount;
    const excludedByOther = excludeStats.excluded_by_other_filters ?? Math.max(0, remainingAfterDraws - finalCount);
    const total = excludeStats.total_combinations ?? 0;
    const excludedAll = excludeStats.excluded_by_all_filters ?? (total - finalCount);

    if (drawsEl) {
        let drawsText = `${totalImported.toLocaleString("pt-BR")} sorteio(s) válido(s)`;
        if (manualCount > 0) {
            drawsText += ` (+ ${manualCount.toLocaleString("pt-BR")} manual(is) = ${totalCombined.toLocaleString("pt-BR")} no filtro)`;
        }
        drawsEl.textContent = drawsText;
    }

    if (excludedDrawsEl) {
        const pct = total > 0 ? (excludedByDraws / total * 100) : 0;
        excludedDrawsEl.textContent =
            `${excludedByDraws.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")} (${pct.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%)`;
    }

    if (remainingDrawsEl) {
        remainingDrawsEl.textContent =
            `${remainingAfterDraws.toLocaleString("pt-BR")} combinações de ${gameSize} dezenas`;
    }

    if (otherRow && excludedOtherEl) {
        const hasOtherFilters = excludedByOther > 0;
        otherRow.classList.toggle("hidden", !hasOtherFilters);
        if (hasOtherFilters) {
            excludedOtherEl.textContent = excludedByOther.toLocaleString("pt-BR");
        }
    }

    if (remainingEl) {
        const finalPct = total > 0 ? (finalCount / total * 100) : 0;
        remainingEl.textContent =
            `${finalCount.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")} (${finalPct.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%) · ${excludedAll.toLocaleString("pt-BR")} excluída(s) no total`;
    }

    if (noteEl) {
        if (excludeStats.exclusion_mode === "exact" || gameSize === 15) {
            noteEl.textContent =
                "Modo 15 dezenas: cada sorteio histórico remove somente a combinação exata (1 sorteio = 1 jogo). Os demais filtros ativos são aplicados em seguida.";
        } else {
            noteEl.textContent =
                `Modo ${gameSize} dezenas: cada sorteio remove combinações que contêm aquelas 15 dezenas. Os demais filtros ativos (soma, pares, sequências etc.) são somados ao resultado final.`;
        }
    }
}

function parseDrawsFromText(text) {
    const valid = [];
    const seen = new Set();
    let invalidLines = 0;
    let duplicateLines = 0;
    if (!text.trim()) {
        return { valid, invalidLines, duplicateLines };
    }

    text.split("\n").forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;

        const numbers = line.match(/\d+/g);
        if (!numbers) {
            invalidLines += 1;
            return;
        }

        const uniqueNums = Array.from(new Set(numbers.map(Number)))
            .filter(n => n >= 1 && n <= 25)
            .sort((a, b) => a - b);

        if (uniqueNums.length !== 15) {
            invalidLines += 1;
            return;
        }

        const key = uniqueNums.join(",");
        if (seen.has(key)) {
            duplicateLines += 1;
            return;
        }

        seen.add(key);
        valid.push(key);
    });

    return { valid, invalidLines, duplicateLines };
}

async function handleImportDrawsFile(file) {
    if (!file) return;

    const statusEl = document.getElementById("import-draws-status");
    if (statusEl) {
        statusEl.textContent = `Lendo «${file.name}» e calculando exclusões...`;
        statusEl.classList.add("has-valid");
    }
    document.getElementById("import-draws-stats")?.classList.add("hidden");

    const text = await file.text();
    const { valid: draws, invalidLines, duplicateLines } = parseDrawsFromText(text);
    importedExcludeDraws = draws;
    importedDrawsFileName = file.name;
    importedDrawsInvalidLines = invalidLines;
    importedDrawsDuplicateLines = duplicateLines;

    if (draws.length === 0) {
        if (statusEl) {
            statusEl.textContent = `Arquivo «${file.name}» sem sorteios válidos (15 dezenas por linha)`;
            statusEl.classList.remove("has-valid");
        }
        showToast("Nenhum sorteio válido encontrado. Cada linha deve ter exatamente 15 dezenas (01–25).", "error");
        return;
    }

    persistImportedDraws();
    syncPastedExcludes();
    refreshDrawAnalysis();
    currentPage = 1;
    debouncedFetch();
    showToast(`${draws.length.toLocaleString("pt-BR")} sorteio(s) importados e salvos nesta sessão.`, "success");
}

function clearImportedDraws(refetch = true) {
    importedExcludeDraws = [];
    importedDrawsFileName = "";
    importedDrawsInvalidLines = 0;
    importedDrawsDuplicateLines = 0;
    lastExcludeDrawsStats = null;
    clearPersistedImportedDraws();
    refreshDrawAnalysis();
    const fileInput = document.getElementById("filter-import-draws-file");
    if (fileInput) fileInput.value = "";
    updateImportDrawsStatus();

    const excludeEl = document.getElementById("filter-exclude-games");
    const excludeText = excludeEl ? excludeEl.value : "";
    updateTextareaStatus(
        "exclude-games-status",
        excludeText,
        parseNumberLines(excludeText, 15).length,
        15,
        "Nenhum jogo inserido",
        "Nenhum jogo válido de 15 dezenas detectado",
        (n) => `${n} jogo(s) válido(s) detectado(s) para exclusão`
    );

    if (refetch) {
        currentPage = 1;
        debouncedFetch();
    }
}

function shouldUsePostForFilters(validDraws) {
    return validDraws.length > 30 || importedExcludeDraws.length > 0;
}

async function apiRequest(path, payload, usePost, signal) {
    const fetchOptions = { signal };
    if (usePost) {
        return fetch(path, {
            ...fetchOptions,
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
    }
    const params = new URLSearchParams();
    Object.entries(payload).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        if (Array.isArray(value)) {
            if (key === "exclude_draws") {
                params.append(key, value.join(";"));
            } else {
                params.append(key, value.join(","));
            }
        } else {
            params.append(key, String(value));
        }
    });
    return fetch(`${path}?${params.toString()}`, fetchOptions);
}

function collectPastedExcludeNumbers(drawText, comboText) {
    const nums = new Set();
    parseNumberLines(drawText, 15).forEach(line => {
        line.split(",").forEach(n => nums.add(parseInt(n, 10)));
    });
    parseNumberLines(comboText, gameSize).forEach(line => {
        line.split(",").forEach(n => nums.add(parseInt(n, 10)));
    });
    return nums;
}

function syncPastedExcludes() {
    const drawText = document.getElementById("filter-exclude-games")?.value || "";
    const comboText = document.getElementById("filter-exclude-combos")?.value || "";
    pastedExcludeNumbers = collectPastedExcludeNumbers(drawText, comboText);
}

function parseSequenceGroup(text) {
    if (!text.trim()) return [];
    const numbers = text.match(/\d+/g);
    if (!numbers) return [];
    const unique = Array.from(new Set(numbers.map(Number)))
        .filter(n => n >= 1 && n <= 25)
        .sort((a, b) => a - b);
    return unique.slice(0, 15);
}

const EXCLUDE_SEQ_MIN = 1;
const EXCLUDE_SEQ_MAX = 15;

function parseExcludeSubsets(text) {
    const entries = [];
    const invalidLines = [];
    const seen = new Set();

    text.split(/\r?\n/).forEach((rawLine, index) => {
        const line = rawLine.trim();
        if (!line) return;

        const nums = [...new Set(
            (line.match(/\d+/g) || []).map(n => parseInt(n, 10)).filter(n => n >= 1 && n <= 25)
        )].sort((a, b) => a - b);

        if (nums.length >= EXCLUDE_SEQ_MIN && nums.length <= EXCLUDE_SEQ_MAX) {
            const key = nums.join(",");
            if (!seen.has(key)) {
                seen.add(key);
                entries.push({ lineNum: index + 1, nums });
            }
        } else {
            invalidLines.push(index + 1);
        }
    });

    return { entries, invalidLines };
}

function syncExcludeSequenceState(text) {
    const { entries, invalidLines } = parseExcludeSubsets(text);
    excludeSequenceEntries = entries;
    excludeSequencePatterns = entries.map(e => e.nums);
    excludeSequenceNumbers = new Set(excludeSequencePatterns.flat());
    return { entries, invalidLines };
}

function syncExcludeSequences() {
    updateExcludeSequencesUi();
}

function updateExcludeSequencesUi() {
    const text = document.getElementById("filter-exclude-sequences")?.value || "";
    const { entries, invalidLines } = syncExcludeSequenceState(text);
    const legend = document.getElementById("legend-exclude-sequences");
    if (legend) legend.classList.toggle("hidden", entries.length === 0);

    const statusEl = document.getElementById("exclude-sequences-status");
    const listEl = document.getElementById("exclude-sequences-lines");

    if (statusEl) {
        if (entries.length > 0) {
            statusEl.textContent = `${entries.length} sequência(s) ativa(s) · exclusões somadas entre linhas`;
            statusEl.classList.add("has-valid");
        } else if (text.trim()) {
            statusEl.textContent = invalidLines.length
                ? `Linha(s) inválida(s): ${invalidLines.join(", ")} · use 1 a 15 dezenas por linha`
                : "Nenhuma linha válida (1 a 15 dezenas por linha)";
            statusEl.classList.remove("has-valid");
        } else {
            statusEl.textContent = "Nenhuma sequência definida";
            statusEl.classList.remove("has-valid");
        }
    }

    if (listEl) {
        if (entries.length === 0) {
            listEl.innerHTML = "";
            listEl.classList.add("hidden");
        } else {
            listEl.classList.remove("hidden");
            listEl.innerHTML = entries.map(entry => `
                <div class="exclude-seq-line-item">
                    <span class="exclude-seq-line-label">Linha ${entry.lineNum}</span>
                    <span class="exclude-seq-line-nums">${formatDezenaList(entry.nums)}</span>
                    <span class="exclude-seq-line-meta">${entry.nums.length} dez. · remove jogos com todas juntas</span>
                </div>
            `).join("");
        }
    }

    updateExcludeSequencesBadge(invalidLines.length);
}

function updateExcludeSequencesBadge(invalidLineCount = 0) {
    const badge = document.getElementById("exclude-sequences-badge");
    if (!badge) return;

    if (excludeSequenceEntries.length === 0) {
        badge.textContent = invalidLineCount
            ? "Corrija as linhas inválidas para aplicar o filtro."
            : "";
        badge.classList.toggle("is-active", invalidLineCount > 0);
        badge.classList.toggle("is-warning", invalidLineCount > 0);
        return;
    }

    const linesSummary = excludeSequenceEntries
        .map(e => `L${e.lineNum}: ${formatDezenaList(e.nums)}`)
        .join(" · ");
    badge.textContent = `${linesSummary} — cada linha exclui jogos que contenham todas as dezenas daquela sequência; todas as linhas se somam.`;
    badge.classList.add("is-active");
    badge.classList.remove("is-warning");
}

function clearExcludeSequences() {
    const el = document.getElementById("filter-exclude-sequences");
    if (el) el.value = "";
    excludeSequenceEntries = [];
    excludeSequencePatterns = [];
    excludeSequenceNumbers.clear();
    document.getElementById("legend-exclude-sequences")?.classList.add("hidden");
    updateExcludeSequencesUi();
    updateBoardHighlights();
    currentPage = 1;
    debouncedFetch();
}

function clampInt(value, min, max, fallback) {
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

function readRunBudgetInputs() {
    runBudgetPrimaryCount = clampInt(document.getElementById("filter-run-budget-count")?.value, 0, 3, 1);
    runBudgetPrimaryLen = clampInt(document.getElementById("filter-run-budget-primary")?.value, 3, 8, 5);
    runBudgetOtherMax = clampInt(document.getElementById("filter-run-budget-other")?.value, 2, 7, 4);
    if (runBudgetOtherMax >= runBudgetPrimaryLen) {
        runBudgetOtherMax = runBudgetPrimaryLen - 1;
        const otherEl = document.getElementById("filter-run-budget-other");
        if (otherEl) otherEl.value = String(runBudgetOtherMax);
    }
    const countEl = document.getElementById("filter-run-budget-count");
    const primaryEl = document.getElementById("filter-run-budget-primary");
    if (countEl) countEl.value = String(runBudgetPrimaryCount);
    if (primaryEl) primaryEl.value = String(runBudgetPrimaryLen);
    updateRunBudgetHint();
}

function updateRunBudgetHint() {
    const hint = document.getElementById("run-budget-hint");
    if (!hint) return;
    const bloco = runBudgetPrimaryCount === 1 ? "sequência" : "sequências";
    hint.textContent = `Até ${runBudgetPrimaryCount} ${bloco} de ${runBudgetPrimaryLen}; as outras com no máximo ${runBudgetOtherMax} seguidos.`;
}

function readRequiredBlocksInputs() {
    requireBlocksLengths = Array.from(document.querySelectorAll(".require-block-length"))
        .filter(el => el.checked)
        .map(el => Number(el.value));
    requireBlocksMin = clampInt(document.getElementById("filter-require-blocks-min")?.value, 1, 4, 1);
    const minEl = document.getElementById("filter-require-blocks-min");
    if (minEl) minEl.value = String(requireBlocksMin);
    updateRequiredBlocksHint();
}

function countRunsMatching(draw, lengths) {
    const nums = Array.isArray(draw) ? draw.map(Number) : String(draw).split(/\D+/).filter(Boolean).map(Number);
    const sorted = nums.sort((a, b) => a - b);
    let hits = 0;
    let run = 1;
    for (let i = 1; i <= sorted.length; i++) {
        if (i < sorted.length && sorted[i] === sorted[i - 1] + 1) {
            run++;
        } else {
            if (lengths.includes(run)) hits++;
            run = 1;
        }
    }
    return hits;
}

function updateRequiredBlocksHint() {
    const hint = document.getElementById("required-blocks-hint");
    if (!hint) return;
    const base = "Bloco de tamanho exato: um bloco de 5 não conta como 3 nem 4.";
    if (!requireBlocksLengths.length) {
        hint.textContent = "Marque pelo menos um tamanho de bloco.";
        return;
    }
    const draws = getAllValidExcludeDraws();
    if (!draws.length) {
        hint.textContent = base;
        return;
    }
    const matching = draws.filter(d => countRunsMatching(d, requireBlocksLengths) >= requireBlocksMin).length;
    const pct = (matching / draws.length * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
    hint.textContent = `${base} No histórico importado, ${matching.toLocaleString("pt-BR")} de `
        + `${draws.length.toLocaleString("pt-BR")} sorteios (${pct}%) seguem esse padrão.`;
}

function syncRequiredBlocksUi() {
    document.getElementById("required-blocks-controls")?.classList.toggle("hidden", !requireBlocksActive);
    updateRequiredBlocksHint();
}

function syncRunBudgetUi() {
    const controls = document.getElementById("run-budget-controls");
    controls?.classList.toggle("hidden", !runBudgetActive);
    ["filter-run-budget-count", "filter-run-budget-primary", "filter-run-budget-other"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = !runBudgetActive;
    });
    if (runBudgetActive) readRunBudgetInputs();
    else updateRunBudgetHint();
}

function formatDezenaList(nums) {
    return nums.map(n => String(n).padStart(2, "0")).join(" ");
}

function getSelectedSequenceCounts() {
    const selected = new Set();
    document.querySelectorAll("[data-sequence-count]:checked").forEach(input => {
        selected.add(parseInt(input.value, 10));
    });
    return selected;
}

function defaultSequenceExcludeCounts(size) {
    const excluded = new Set();
    if (size >= 4) {
        excluded.add(size);
        excluded.add(size - 1);
    } else if (size > 0) {
        excluded.add(size);
    }
    return excluded;
}

function rebuildSequenceCountGrid(prevSelected = null) {
    const grid = document.getElementById("sequence-counts-grid");
    if (!grid) return;

    const size = sequenceGroupNumbers.size;
    const prev = prevSelected ?? getSelectedSequenceCounts();
    grid.innerHTML = "";

    if (size === 0) return;

    for (let n = 0; n <= size; n++) {
        const label = document.createElement("label");
        label.className = "repeat-count-item";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = String(n);
        input.dataset.sequenceCount = "1";
        input.checked = prev.has(n);
        label.appendChild(input);
        const suffix = n === 1 ? "dezena" : "dezenas";
        label.appendChild(document.createTextNode(`Excluir com ${n} ${suffix}`));
        grid.appendChild(label);
    }
}

function syncSequenceGroupNumbers() {
    const text = document.getElementById("filter-sequence-group")?.value || "";
    const prev = getSelectedSequenceCounts();
    const nums = parseSequenceGroup(text);
    sequenceGroupNumbers = new Set(nums);
    const useDefaults = prev.size === 0 && nums.length > 0;
    rebuildSequenceCountGrid(useDefaults ? defaultSequenceExcludeCounts(nums.length) : prev);
    updateSequenceUi();
    updateBoardHighlights();
}

function setAllSequenceCounts(checked) {
    document.querySelectorAll("[data-sequence-count]").forEach(input => {
        input.checked = checked;
    });
}

function updateSequenceUi() {
    const badge = document.getElementById("sequence-auto-badge");
    const statusEl = document.getElementById("sequence-group-status");
    const optionsPanel = document.getElementById("sequence-options-panel");
    const selected = getSelectedSequenceCounts();
    const nums = [...sequenceGroupNumbers].sort((a, b) => a - b);
    const numsLabel = nums.map(n => String(n).padStart(2, "0")).join(" ");
    const selectedLabel = [...selected].sort((a, b) => a - b).join(", ");
    const hasGroup = nums.length > 0;

    if (optionsPanel) {
        optionsPanel.classList.toggle("hidden", !hasGroup);
    }

    const legendSeq = document.getElementById("legend-sequence");
    if (legendSeq) {
        legendSeq.classList.toggle("hidden", !isSequenceFilterActive());
    }

    if (statusEl) {
        if (!hasGroup) {
            statusEl.textContent = "Nenhum grupo definido";
            statusEl.classList.remove("has-valid");
        } else {
            statusEl.textContent = `${nums.length} dezena(s): ${numsLabel}`;
            statusEl.classList.add("has-valid");
        }
    }

    if (badge) {
        badge.classList.toggle("is-active", hasGroup && selected.size > 0);
        if (!hasGroup) {
            badge.textContent = "";
        } else         if (selected.size === 0) {
            badge.textContent = "Marque quantas combinações do grupo deseja excluir (ex: 5 e 6 dezenas).";
        } else {
            badge.textContent = `Excluindo jogos com ${selectedLabel} dezena(s) do grupo (${numsLabel}).`;
        }
    }
}

function isSequenceFilterActive() {
    return sequenceGroupNumbers.size > 0 && getSelectedSequenceCounts().size > 0;
}

function getValidRepeatCountsForGameSize(k) {
    const outsidePool = 10;
    return REPEAT_COUNT_OPTIONS.filter(
        r => r <= 15 && k - r >= 0 && k - r <= outsidePool
    );
}

function updateRepeatOptionCountsUi(combinedSelected = null) {
    const summary = document.getElementById("repeat-options-summary");
    const list = document.getElementById("repeat-options-list");
    const totalEl = document.getElementById("repeat-options-total");
    const hasDraw = lastDrawNumbers.size === 15;
    const valid = getValidRepeatCountsForGameSize(gameSize);
    const selected = getSelectedRepeatCounts();

    document.querySelectorAll("[data-repeat-count-label]").forEach(span => {
        const n = parseInt(span.dataset.repeatCountLabel, 10);
        const count = repeatOptionCounts[n];
        const item = span.closest(".repeat-count-item");
        const unavailable = item?.classList.contains("is-unavailable");
        if (!hasDraw || unavailable || count == null) {
            span.textContent = "";
            span.classList.remove("has-count");
        } else {
            span.textContent = `(${count.toLocaleString("pt-BR")} jogos)`;
            span.classList.add("has-count");
        }
    });

    if (!summary || !list) return;

    if (!hasDraw || Object.keys(repeatOptionCounts).length === 0) {
        summary.classList.add("hidden");
        if (totalEl) totalEl.textContent = "";
        return;
    }

    summary.classList.remove("hidden");
    list.innerHTML = REPEAT_COUNT_OPTIONS.map(n => {
        const inRange = valid.includes(n);
        const count = repeatOptionCounts[n];
        const isRec = REPEAT_RECOMMENDED.includes(n);
        const isSel = selected.has(n);
        const countLabel = count != null ? count.toLocaleString("pt-BR") : "—";
        return `
            <div class="repeat-options-row${isRec ? " is-recommended" : ""}${isSel ? " is-selected" : ""}${!inRange ? " is-unavailable" : ""}">
                <span class="repeat-options-count">${n} repetidas</span>
                <span class="repeat-options-value">${inRange ? countLabel : "não cabe"}</span>
            </div>
        `;
    }).join("");

    if (totalEl) {
        const combined = combinedSelected != null
            ? combinedSelected
            : [...selected].reduce((sum, n) => sum + (repeatOptionCounts[n] || 0), 0);
        if (selected.size === 0) {
            totalEl.textContent = "Marque 8, 9 e/ou 10 para ver o total combinado de jogos.";
        } else {
            const selLabel = [...selected].sort((a, b) => a - b).join(" + ");
            totalEl.textContent = `Marcadas (${selLabel}): ${combined.toLocaleString("pt-BR")} jogos no total`;
        }
    }
}

async function fetchRepeatOptionCounts(payload, signal) {
    if (lastDrawNumbers.size !== 15) {
        repeatOptionCounts = {};
        updateRepeatOptionCountsUi();
        return;
    }

    const requestPayload = { ...payload };
    delete requestPayload.page;
    delete requestPayload.page_size;
    delete requestPayload.include_stats;
    delete requestPayload._usePost;

    try {
        const usePost = payload._usePost;
        const response = await apiRequest("/api/repeat-options", requestPayload, usePost, signal);
        if (!response.ok) return;
        const data = await response.json();
        repeatOptionCounts = data.counts || {};
        updateRepeatOptionCountsUi(data.combined_selected);
    } catch (error) {
        if (error.name !== "AbortError") {
            console.warn("Contagem por repetição indisponível", error);
        }
    }
}

function setupRepeatCountGrid() {
    const grid = document.getElementById("repeat-counts-grid");
    if (!grid) return;
    grid.innerHTML = "";

    REPEAT_COUNT_OPTIONS.forEach(n => {
        const label = document.createElement("label");
        label.className = "repeat-count-item";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = String(n);
        input.dataset.repeatCount = "1";
        input.checked = false;
        label.appendChild(input);
        const text = document.createElement("span");
        text.className = "repeat-count-label";
        text.appendChild(document.createTextNode(`Somente ${n} `));
        const countSpan = document.createElement("span");
        countSpan.className = "repeat-count-games";
        countSpan.dataset.repeatCountLabel = String(n);
        text.appendChild(countSpan);
        label.appendChild(text);
        grid.appendChild(label);
    });

    updateRepeatCountOptionsForGameSize();
}

function getSelectedRepeatCounts() {
    const selected = new Set();
    document.querySelectorAll("[data-repeat-count]:checked:not(:disabled)").forEach(input => {
        selected.add(parseInt(input.value, 10));
    });
    return selected;
}

function setAllRepeatCounts(checked) {
    document.querySelectorAll("[data-repeat-count]").forEach(input => {
        if (!input.disabled) input.checked = checked;
    });
}

function updateRepeatCountOptionsForGameSize() {
    const valid = new Set(getValidRepeatCountsForGameSize(gameSize));
    const hasDraw = lastDrawNumbers.size === 15;

    document.querySelectorAll("[data-repeat-count]").forEach(input => {
        const n = parseInt(input.value, 10);
        const item = input.closest(".repeat-count-item");
        const unavailable = !valid.has(n);
        input.disabled = !hasDraw || unavailable;
        item?.classList.toggle("is-unavailable", unavailable);
        item?.classList.toggle("is-disabled", !hasDraw);
        if (unavailable) input.checked = false;
    });
}

function getSelectedRepeatLabel() {
    const selected = [...getSelectedRepeatCounts()].sort((a, b) => a - b);
    return selected.length ? selected.join(", ") : "nenhuma";
}

function parseLastDrawLine(text) {
    const lines = parseNumberLines(text, 15);
    return lines.length > 0 ? lines[0] : null;
}

function syncLastDrawNumbers() {
    const text = document.getElementById("filter-last-draw")?.value || "";
    const line = parseLastDrawLine(text);
    const wasValid = lastDrawWasValid;
    lastDrawNumbers = new Set();
    if (line) {
        line.split(",").forEach(n => lastDrawNumbers.add(parseInt(n, 10)));
    }
    const isValid = lastDrawNumbers.size === 15;

    if (isValid && !wasValid) {
        applyRecommendedRepeatCounts(false);
    } else {
        updateLastDrawUi();
        renderRepeatStatsPanel();
    }

    if (!isValid && wasValid) {
        setAllRepeatCounts(false);
        repeatOptionCounts = {};
        updateLastDrawUi();
        renderRepeatStatsPanel();
        updateRepeatOptionCountsUi();
    }

    lastDrawWasValid = isValid;
    updateRepeatCountOptionsForGameSize();
    updateBoardHighlights();
    updateCompareFrequencyBoard();
}

function updateBoardMandatoryBadge() {
    const badge = document.getElementById("board-mandatory-badge");
    if (!badge) return;
    if (mustInclude.size === 0) {
        badge.classList.add("hidden");
        badge.textContent = "";
        return;
    }
    const nums = [...mustInclude].sort((a, b) => a - b).map(n => String(n).padStart(2, "0")).join(" ");
    badge.classList.remove("hidden");
    badge.textContent = `${mustInclude.size} obrigatória(s) no tabuleiro: ${nums} — todas devem aparecer em cada combinação.`;
}

function updateLastDrawUi(activeCounts = activeRepeatCounts) {
    const badge = document.getElementById("repeat-auto-badge");
    const hasDraw = lastDrawNumbers.size === 15;
    const selected = getSelectedRepeatCounts();
    const selectedLabel = getSelectedRepeatLabel();
    const activeLabel = activeCounts.join(", ");

    if (badge) {
        badge.classList.remove("is-warning");
        badge.classList.toggle("is-active", hasDraw && selected.size > 0 && activeCounts.length > 0);
        if (!hasDraw) {
            badge.textContent = "Cole o último sorteio — 8, 9 e 10 repetições serão sugeridas automaticamente.";
        } else if (selected.size === 0) {
            badge.classList.add("is-warning");
            badge.textContent = "Filtro de repetição INATIVO — marque abaixo quantas dezenas do último sorteio o jogo deve ter (ex.: Somente 6, 7, 8…).";
        } else if (activeCounts.length === 0) {
            badge.classList.add("is-warning");
            badge.textContent = `Nenhuma das opções marcadas (${selectedLabel}) cabe em ${gameSize} dezenas.`;
        } else {
            const combined = [...selected].reduce((sum, n) => sum + (repeatOptionCounts[n] || 0), 0);
            const gamesHint = combined > 0 ? ` · ${combined.toLocaleString("pt-BR")} jogos possíveis` : "";
            badge.textContent = `Ativo: cada jogo terá exatamente ${activeLabel} dezena(s) do último sorteio (opções marcadas: ${selectedLabel})${gamesHint}.`;
        }
    }
}

function updateRepeatTableColumn(showRepeatCol) {
    const container = document.querySelector(".combinations-list-container");
    const header = document.getElementById("col-repeat-header");
    if (container) container.classList.toggle("has-repeat-filter", showRepeatCol);
    if (header) header.classList.toggle("hidden", !showRepeatCol);
}

function getComboRepeatCount(combo) {
    if (lastDrawNumbers.size !== 15) return null;
    return combo.filter(n => lastDrawNumbers.has(n)).length;
}

function isRepeatFilterActive() {
    return lastDrawNumbers.size === 15 && getSelectedRepeatCounts().size > 0;
}

function formatRepeatSummary(repeatDist, counts = activeRepeatCounts) {
    if (!repeatDist) return "";
    return counts
        .filter(n => repeatDist[n])
        .map(n => `${n} rep.: ${repeatDist[n].toLocaleString("pt-BR")}`)
        .join(" · ");
}

function updateBoardHighlights() {
    document.querySelectorAll(".board-num").forEach(btn => {
        const num = parseInt(btn.dataset.number, 10);
        btn.className = "board-num";
        if (mustInclude.has(num)) {
            btn.classList.add("state-include");
        } else if (mustExclude.has(num)) {
            btn.classList.add("state-exclude");
        } else if (excludeSequenceNumbers.has(num)) {
            btn.classList.add("state-banned");
        } else if (lastDrawNumbers.has(num)) {
            btn.classList.add("state-last-draw");
        } else if (isSequenceFilterActive() && sequenceGroupNumbers.has(num)) {
            btn.classList.add("state-sequence");
        }
    });
    updateBoardMandatoryBadge();
}

// Setup Event Listeners
function setupCompareNav() {
    document.getElementById("btn-scroll-compare")?.addEventListener("click", () => {
        const app = document.querySelector(".app-container");
        if (app && app.dataset.workflow !== "analyze") {
            document.querySelector('.workflow-step[data-step="analyze"]')?.click();
        }
        const section = document.getElementById("compare-draws-section");
        const panel = section?.querySelector('[data-panel-id="compare-draws"]');
        const toggle = panel?.querySelector(".dock-panel-toggle");
        if (panel && toggle && !panel.classList.contains("is-open")) {
            setPanelOpen(panel, toggle, true);
            persistPanelState();
        }
        section?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
}

function setupThemeToggle() {
    const btn = document.getElementById("btn-theme-toggle");
    if (!btn) return;
    btn.addEventListener("click", () => {
        const isLight = document.documentElement.getAttribute("data-theme") === "light";
        applyTheme(isLight ? "dark" : "light");
    });
}

function applyTheme(theme) {
    if (theme === "light") {
        document.documentElement.setAttribute("data-theme", "light");
    } else {
        document.documentElement.removeAttribute("data-theme");
    }
    try {
        localStorage.setItem(THEME_KEY, theme);
    } catch (_) { /* private mode */ }
}

function setupCollapsiblePanels() {
    const panels = document.querySelectorAll(".dock-panel[data-panel-id]");
    if (!panels.length) return;

    let saved = {};
    try {
        const raw = localStorage.getItem(PANEL_STATE_KEY);
        if (raw) saved = JSON.parse(raw);
    } catch (_) {
        saved = {};
    }

    panels.forEach(panel => {
        const id = panel.dataset.panelId;
        const toggle = panel.querySelector(".dock-panel-toggle");
        if (!toggle) return;

        const defaultOpen = panel.dataset.defaultOpen !== "false";
        const isOpen = id in saved ? saved[id] : defaultOpen;
        setPanelOpen(panel, toggle, isOpen);

        toggle.addEventListener("click", () => {
            setPanelOpen(panel, toggle, !panel.classList.contains("is-open"));
            persistPanelState();
        });
    });

    document.getElementById("btn-expand-all")?.addEventListener("click", () => {
        panels.forEach(panel => {
            const toggle = panel.querySelector(".dock-panel-toggle");
            if (toggle) setPanelOpen(panel, toggle, true);
        });
        persistPanelState();
    });

    document.getElementById("btn-collapse-all")?.addEventListener("click", () => {
        panels.forEach(panel => {
            const toggle = panel.querySelector(".dock-panel-toggle");
            if (toggle) setPanelOpen(panel, toggle, false);
        });
        persistPanelState();
    });
}

function setPanelOpen(panel, toggle, open) {
    panel.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
}

function persistPanelState() {
    const state = {};
    document.querySelectorAll(".dock-panel[data-panel-id]").forEach(panel => {
        state[panel.dataset.panelId] = panel.classList.contains("is-open");
    });
    try {
        localStorage.setItem(PANEL_STATE_KEY, JSON.stringify(state));
    } catch (_) { /* quota / private mode */ }
}

function setupEventListeners() {
    // Reset Board
    document.getElementById("btn-reset-board").addEventListener("click", () => {
        mustInclude.clear();
        mustExclude.clear();
        updateBoardHighlights();
        currentPage = 1;
        debouncedFetch();
    });

    // Reset Filters
    document.getElementById("btn-reset-filters").addEventListener("click", () => {
        document.getElementById("filter-exclude-max-evens").checked = false;
        document.getElementById("filter-exclude-max-odds").checked = false;
        document.getElementById("filter-exclude-sequence-6").checked = false;
        document.getElementById("filter-exclude-sequence-7").checked = false;
        document.getElementById("filter-exclude-sequence-8").checked = false;
        document.getElementById("filter-exclude-sequence-9").checked = false;
        document.getElementById("filter-exclude-sequence-10").checked = false;
        const runBudgetEl = document.getElementById("filter-run-budget");
        if (runBudgetEl) runBudgetEl.checked = false;
        document.getElementById("filter-run-budget-count").value = "1";
        document.getElementById("filter-run-budget-primary").value = "5";
        document.getElementById("filter-run-budget-other").value = "4";
        runBudgetActive = false;
        runBudgetPrimaryCount = 1;
        runBudgetPrimaryLen = 5;
        runBudgetOtherMax = 4;
        syncRunBudgetUi();
        const requireBlocksEl = document.getElementById("filter-require-blocks");
        if (requireBlocksEl) requireBlocksEl.checked = false;
        document.querySelectorAll(".require-block-length").forEach(el => { el.checked = true; });
        const requireBlocksMinEl = document.getElementById("filter-require-blocks-min");
        if (requireBlocksMinEl) requireBlocksMinEl.value = "1";
        requireBlocksActive = false;
        requireBlocksLengths = [3, 4];
        requireBlocksMin = 1;
        syncRequiredBlocksUi();

        const excludeSeqEl = document.getElementById("filter-exclude-sequences");
        if (excludeSeqEl) {
            excludeSeqEl.value = "";
            excludeSequenceEntries = [];
            excludeSequencePatterns = [];
            excludeSequenceNumbers.clear();
            updateExcludeSequencesUi();
        }
        document.getElementById("legend-exclude-sequences")?.classList.add("hidden");

        const lastDrawEl = document.getElementById("filter-last-draw");
        if (lastDrawEl) {
            lastDrawEl.value = "";
            const lastDrawStatus = document.getElementById("last-draw-status");
            if (lastDrawStatus) {
                lastDrawStatus.textContent = "Nenhum sorteio inserido";
                lastDrawStatus.classList.remove("has-valid");
            }
        }
        lastDrawNumbers.clear();
        lastDrawWasValid = false;
        repeatOptionCounts = {};
        setAllRepeatCounts(false);
        updateLastDrawUi();
        renderRepeatStatsPanel();
        updateRepeatOptionCountsUi();
        updateRepeatCountOptionsForGameSize();
        updateRepeatTableColumn(false);
        updateBoardHighlights();

        const sequenceEl = document.getElementById("filter-sequence-group");
        if (sequenceEl) {
            sequenceEl.value = "";
            const seqStatus = document.getElementById("sequence-group-status");
            if (seqStatus) {
                seqStatus.textContent = "Nenhum grupo definido";
                seqStatus.classList.remove("has-valid");
            }
        }
        sequenceGroupNumbers.clear();
        document.getElementById("sequence-counts-grid").innerHTML = "";
        document.getElementById("sequence-options-panel")?.classList.add("hidden");
        updateSequenceUi();

        const excludeEl = document.getElementById("filter-exclude-games");
        if (excludeEl) {
            excludeEl.value = "";
            const statusEl = document.getElementById("exclude-games-status");
            if (statusEl) {
                statusEl.textContent = "Nenhum jogo inserido";
                statusEl.classList.remove("has-valid");
            }
        }

        const excludeCombosEl = document.getElementById("filter-exclude-combos");
        if (excludeCombosEl) {
            excludeCombosEl.value = "";
            const combosStatusEl = document.getElementById("exclude-combos-status");
            if (combosStatusEl) {
                combosStatusEl.textContent = "Nenhuma combinação inserida";
                combosStatusEl.classList.remove("has-valid");
            }
        }

        pastedExcludeNumbers.clear();
        clearImportedDraws(false);
        
        evenCount = -1;
        primeCount = -1;
        excludeMaxEvens = false;
        excludeMaxOdds = false;
        excludeSequence6 = false;
        excludeSequence7 = false;
        excludeSequence8 = false;
        excludeSequence9 = false;
        excludeSequence10 = false;
        runBudgetActive = false;
        recentSmartGames = [];
        runBudgetPrimaryCount = 1;
        runBudgetPrimaryLen = 5;
        runBudgetOtherMax = 4;

        applySumSlidersForGameSize();
        const evenSel = document.getElementById("filter-even");
        const oddSel = document.getElementById("filter-odd");
        const primeSel = document.getElementById("filter-prime");
        if (evenSel) evenSel.value = "-1";
        if (oddSel) oddSel.value = "-1";
        if (primeSel) primeSel.value = "-1";
        currentPage = 1;
        debouncedFetch();
    });

    document.getElementById("filter-game-size").addEventListener("change", (e) => {
        gameSize = parseInt(e.target.value, 10);
        evenCount = -1;
        primeCount = -1;
        currentPage = 1;
        applySumSlidersForGameSize();
        updateImportDrawsDesc();
        updateRepeatCountOptionsForGameSize();
        updateLastDrawUi();
        renderRepeatStatsPanel();
        updateExcludeSequencesUi();
        debouncedFetch();
    });

    // Exclude Games Textarea Listener
    const excludeGamesEl = document.getElementById("filter-exclude-games");
    if (excludeGamesEl) {
        excludeGamesEl.addEventListener("input", () => {
            syncPastedExcludes();
            updateImportDrawsStatus();
            refreshDrawAnalysis();
            currentPage = 1;
            debouncedFetch();
        });
    }

    const importDrawsFileEl = document.getElementById("filter-import-draws-file");
    if (importDrawsFileEl) {
        importDrawsFileEl.addEventListener("change", (e) => {
            const file = e.target.files?.[0];
            if (file) handleImportDrawsFile(file);
        });
    }

    document.getElementById("btn-clear-imported-draws")?.addEventListener("click", clearImportedDraws);

    const excludeCombosEl = document.getElementById("filter-exclude-combos");
    if (excludeCombosEl) {
        excludeCombosEl.addEventListener("input", () => {
            syncPastedExcludes();
            currentPage = 1;
            debouncedFetch();
        });
    }

    // Range Sliders
    const minSlider = document.getElementById("filter-min-sum");
    const maxSlider = document.getElementById("filter-max-sum");
    
    minSlider.addEventListener("input", handleMinSliderInput);
    maxSlider.addEventListener("input", handleMaxSliderInput);

    // Selects — pares e ímpares são o mesmo filtro (pares + ímpares = tamanho do jogo)
    document.getElementById("filter-even").addEventListener("change", (e) => {
        setParityFromEven(e.target.value);
        currentPage = 1;
        debouncedFetch();
    });

    document.getElementById("filter-odd")?.addEventListener("change", (e) => {
        setParityFromOdd(e.target.value);
        currentPage = 1;
        debouncedFetch();
    });

    document.getElementById("filter-prime").addEventListener("change", (e) => {
        primeCount = parseInt(e.target.value);
        currentPage = 1;
        debouncedFetch();
    });

    document.getElementById("filter-exclude-max-evens").addEventListener("change", (e) => {
        excludeMaxEvens = e.target.checked;
        currentPage = 1;
        debouncedFetch();
    });

    document.getElementById("filter-exclude-max-odds").addEventListener("change", (e) => {
        excludeMaxOdds = e.target.checked;
        currentPage = 1;
        debouncedFetch();
    });

    document.getElementById("filter-exclude-sequence-6").addEventListener("change", (e) => {
        excludeSequence6 = e.target.checked;
        currentPage = 1;
        debouncedFetch();
    });

    document.getElementById("filter-exclude-sequence-7").addEventListener("change", (e) => {
        excludeSequence7 = e.target.checked;
        currentPage = 1;
        debouncedFetch();
    });

    document.getElementById("filter-exclude-sequence-8").addEventListener("change", (e) => {
        excludeSequence8 = e.target.checked;
        currentPage = 1;
        debouncedFetch();
    });

    document.getElementById("filter-exclude-sequence-9").addEventListener("change", (e) => {
        excludeSequence9 = e.target.checked;
        currentPage = 1;
        debouncedFetch();
    });

    document.getElementById("filter-exclude-sequence-10").addEventListener("change", (e) => {
        excludeSequence10 = e.target.checked;
        currentPage = 1;
        debouncedFetch();
    });

    const runBudgetToggle = document.getElementById("filter-run-budget");
    if (runBudgetToggle) {
        runBudgetToggle.addEventListener("change", (e) => {
            runBudgetActive = e.target.checked;
            syncRunBudgetUi();
            currentPage = 1;
            debouncedFetch();
        });
    }
    ["filter-run-budget-count", "filter-run-budget-primary", "filter-run-budget-other"].forEach(id => {
        document.getElementById(id)?.addEventListener("input", () => {
            readRunBudgetInputs();
            currentPage = 1;
            debouncedFetch();
        });
    });
    syncRunBudgetUi();

    document.getElementById("filter-require-blocks")?.addEventListener("change", (e) => {
        requireBlocksActive = e.target.checked;
        readRequiredBlocksInputs();
        syncRequiredBlocksUi();
        currentPage = 1;
        debouncedFetch();
    });
    document.querySelectorAll(".require-block-length").forEach(el => {
        el.addEventListener("change", () => {
            readRequiredBlocksInputs();
            currentPage = 1;
            debouncedFetch();
        });
    });
    document.getElementById("filter-require-blocks-min")?.addEventListener("input", () => {
        readRequiredBlocksInputs();
        currentPage = 1;
        debouncedFetch();
    });
    syncRequiredBlocksUi();

    const excludeSeqEl = document.getElementById("filter-exclude-sequences");
    if (excludeSeqEl) {
        excludeSeqEl.addEventListener("input", () => {
            syncExcludeSequences();
            updateBoardHighlights();
            currentPage = 1;
            debouncedFetch();
        });
    }

    document.getElementById("btn-exclude-sequences-clear")?.addEventListener("click", clearExcludeSequences);

    const lastDrawEl = document.getElementById("filter-last-draw");
    if (lastDrawEl) {
        lastDrawEl.addEventListener("input", () => {
            syncLastDrawNumbers();
            currentPage = 1;
            debouncedFetch();
        });
    }

    document.getElementById("repeat-counts-grid")?.addEventListener("change", (e) => {
        if (e.target.matches("[data-repeat-count]")) {
            updateLastDrawUi();
            renderRepeatStatsPanel();
            updateRepeatOptionCountsUi();
            currentPage = 1;
            debouncedFetch();
        }
    });

    document.getElementById("btn-repeat-recommended")?.addEventListener("click", () => {
        applyRecommendedRepeatCounts(true);
    });

    document.getElementById("btn-repeat-all")?.addEventListener("click", () => {
        const valid = new Set(getValidRepeatCountsForGameSize(gameSize));
        document.querySelectorAll("[data-repeat-count]").forEach(input => {
            input.checked = valid.has(parseInt(input.value, 10));
        });
        updateLastDrawUi();
        renderRepeatStatsPanel();
        currentPage = 1;
        debouncedFetch();
    });

    document.getElementById("btn-repeat-none")?.addEventListener("click", () => {
        setAllRepeatCounts(false);
        updateLastDrawUi();
        renderRepeatStatsPanel();
        currentPage = 1;
        debouncedFetch();
    });

    const sequenceEl = document.getElementById("filter-sequence-group");
    if (sequenceEl) {
        sequenceEl.addEventListener("input", () => {
            syncSequenceGroupNumbers();
            currentPage = 1;
            debouncedFetch();
        });
    }

    document.getElementById("sequence-counts-grid")?.addEventListener("change", (e) => {
        if (e.target.matches("[data-sequence-count]")) {
            updateSequenceUi();
            currentPage = 1;
            debouncedFetch();
        }
    });

    document.getElementById("btn-sequence-all")?.addEventListener("click", () => {
        setAllSequenceCounts(true);
        updateSequenceUi();
        currentPage = 1;
        debouncedFetch();
    });

    document.getElementById("btn-sequence-none")?.addEventListener("click", () => {
        setAllSequenceCounts(false);
        updateSequenceUi();
        currentPage = 1;
        debouncedFetch();
    });

    // Pagination
    document.getElementById("btn-page-first").addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage = 1;
            fetchData(false);
        }
    });

    document.getElementById("btn-page-prev").addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage--;
            fetchData(false);
        }
    });

    document.getElementById("btn-page-next").addEventListener("click", () => {
        const totalPages = Math.ceil(filteredCount / pageSize);
        if (currentPage < totalPages) {
            currentPage++;
            fetchData(false);
        }
    });

    document.getElementById("btn-page-last").addEventListener("click", () => {
        const totalPages = Math.ceil(filteredCount / pageSize);
        if (currentPage < totalPages) {
            currentPage = totalPages;
            fetchData(false);
        }
    });

    document.getElementById("filter-page-size")?.addEventListener("change", (e) => {
        const next = parseInt(e.target.value, 10);
        pageSize = PAGE_SIZE_OPTIONS.includes(next) ? next : 50;
        e.target.value = String(pageSize);
        currentPage = 1;
        fetchData(false);
    });

    // Simulation
    document.getElementById("btn-random-draw").addEventListener("click", simulateDraw);
    document.getElementById("btn-generate-smart-games")?.addEventListener("click", () => generateSmartGames());
    document.getElementById("btn-close-simulation").addEventListener("click", () => {
        const box = document.getElementById("simulation-box");
        box.classList.add("hidden");
        box.classList.remove("force-show");
    });

    // Exports
    document.getElementById("btn-export-txt").addEventListener("click", () => exportData("txt"));
    document.getElementById("btn-export-csv").addEventListener("click", () => exportData("csv"));

    document.getElementById("btn-copy-page")?.addEventListener("click", async () => {
        const lines = lastRenderedCombos.map(formatComboCopyText);
        await copyComboLines(lines, "Página");
    });

    document.getElementById("btn-copy-selected")?.addEventListener("click", async () => {
        const lines = [...document.querySelectorAll(".combo-row-check:checked")]
            .map(el => el.closest(".combo-row")?.dataset.copyText)
            .filter(Boolean);
        await copyComboLines(lines, "Selecionada");
    });

    document.getElementById("btn-copy-smart-all")?.addEventListener("click", async () => {
        const lines = lastSmartGeneratedGames.map(formatComboCopyText);
        await copyComboLines(lines, "Jogos inteligentes");
    });
}

// Handle Min Slider input changes
function handleMinSliderInput(e) {
    const minVal = parseInt(e.target.value);
    const maxVal = parseInt(document.getElementById("filter-max-sum").value);
    
    if (minVal > maxVal) {
        e.target.value = maxVal;
        minSum = maxVal;
    } else {
        minSum = minVal;
    }
    updateSlidersTrack();
    currentPage = 1;
    debouncedFetch();
}

// Handle Max Slider input changes
function handleMaxSliderInput(e) {
    const minVal = parseInt(document.getElementById("filter-min-sum").value);
    const maxVal = parseInt(e.target.value);
    
    if (maxVal < minVal) {
        e.target.value = minVal;
        maxSum = minVal;
    } else {
        maxSum = maxVal;
    }
    updateSlidersTrack();
    currentPage = 1;
    debouncedFetch();
}

// Update the visual appearance of the dual-range slider track
function updateSlidersTrack() {
    const minSlider = document.getElementById("filter-min-sum");
    const maxSlider = document.getElementById("filter-max-sum");
    const track = document.getElementById("sum-track");
    const label = document.getElementById("sum-val");
    
    const minVal = parseInt(minSlider.value);
    const maxVal = parseInt(maxSlider.value);
    
    const percent1 = ((minVal - sumMinBound) / (sumMaxBound - sumMinBound)) * 100;
    const percent2 = ((maxVal - sumMinBound) / (sumMaxBound - sumMinBound)) * 100;
    
    track.style.left = percent1 + "%";
    track.style.width = (percent2 - percent1) + "%";
    
    label.textContent = `${minVal} - ${maxVal}`;
}

// Debounced API call
function debouncedFetch(includeStats = true) {
    clearTimeout(debounceTimer);
    const delay = gameSize <= 16 ? 600 : 250;
    debounceTimer = setTimeout(() => {
        fetchData(includeStats);
    }, delay);
}

// Parse lines with exactly N unique numbers (1-25) from a textarea
function parseNumberLines(text, requiredCount) {
    const valid = [];
    if (!text.trim()) return valid;

    text.split("\n").forEach(line => {
        const numbers = line.match(/\d+/g);
        if (!numbers) return;

        const uniqueNums = Array.from(new Set(numbers.map(Number)))
            .filter(n => n >= 1 && n <= 25)
            .sort((a, b) => a - b);

        if (uniqueNums.length === requiredCount) {
            valid.push(uniqueNums.join(","));
        }
    });

    return valid;
}

function updateTextareaStatus(statusId, text, validCount, requiredCount, emptyLabel, invalidLabel, validLabel) {
    const statusEl = document.getElementById(statusId);
    if (!statusEl) return;

    if (validCount > 0) {
        statusEl.textContent = validLabel(validCount);
        statusEl.classList.add("has-valid");
    } else {
        statusEl.textContent = text.trim() ? invalidLabel : emptyLabel;
        statusEl.classList.remove("has-valid");
    }
}

// Build filter payload for API requests
function buildFilterPayload(page = currentPage, size = pageSize, includeStats = true) {
    const payload = {
        game_size: gameSize,
        page,
        page_size: size,
        include_stats: includeStats ? "1" : "0",
    };
    
    if (mustInclude.size > 0) {
        payload.must_include = [...mustInclude].sort((a, b) => a - b).join(",");
    }
    if (mustExclude.size > 0) {
        payload.must_exclude = Array.from(mustExclude).join(",");
    }
    
    const excludeEl = document.getElementById("filter-exclude-games");
    const excludeText = excludeEl ? excludeEl.value : "";
    const manualDraws = parseNumberLines(excludeText, 15);
    const validDraws = getAllValidExcludeDraws();

    const excludeCombosEl = document.getElementById("filter-exclude-combos");
    const excludeCombosText = excludeCombosEl ? excludeCombosEl.value : "";
    const validCombos = parseNumberLines(excludeCombosText, gameSize);

    pastedExcludeNumbers = collectPastedExcludeNumbers(excludeText, excludeCombosText);

    updateTextareaStatus(
        "exclude-games-status",
        excludeText,
        manualDraws.length,
        15,
        importedExcludeDraws.length > 0 ? "Nenhum jogo manual (sorteios vêm do arquivo importado)" : "Nenhum jogo inserido",
        "Nenhum jogo válido de 15 dezenas detectado",
        (n) => `${n} jogo(s) manual(is) para exclusão`
    );
    
    if (validDraws.length > 0) {
        payload.exclude_draws = validDraws;
    }

    updateTextareaStatus(
        "exclude-combos-status",
        excludeCombosText,
        validCombos.length,
        gameSize,
        "Nenhuma combinação inserida",
        `Nenhuma combinação válida de ${gameSize} dezenas detectada`,
        (n) => `${n} combinação(ões) excluída(s) do total`
    );

    if (validCombos.length > 0) {
        payload.exclude_combos = validCombos.join(";");
    }
    
    payload.min_sum = minSum;
    payload.max_sum = maxSum;
    
    if (evenCount !== -1) {
        payload.even_count = evenCount;
    }
    if (primeCount !== -1) {
        payload.prime_count = primeCount;
    }
    if (excludeMaxEvens) {
        payload.exclude_max_evens = "1";
    }
    if (excludeMaxOdds) {
        payload.exclude_max_odds = "1";
    }
    if (excludeSequence6) {
        payload.exclude_sequence_6 = "1";
    }
    if (excludeSequence7) {
        payload.exclude_sequence_7 = "1";
    }
    if (excludeSequence8) {
        payload.exclude_sequence_8 = "1";
    }
    if (excludeSequence9) {
        payload.exclude_sequence_9 = "1";
    }
    if (excludeSequence10) {
        payload.exclude_sequence_10 = "1";
    }
    if (runBudgetActive) {
        payload.run_budget_active = "1";
        payload.run_budget_primary_count = runBudgetPrimaryCount;
        payload.run_budget_primary_len = runBudgetPrimaryLen;
        payload.run_budget_other_max = runBudgetOtherMax;
    }
    if (requireBlocksActive && requireBlocksLengths.length) {
        payload.require_blocks_active = "1";
        payload.require_blocks_lengths = requireBlocksLengths.join(",");
        payload.require_blocks_min = requireBlocksMin;
    }

    syncExcludeSequences();
    updateImportDrawsStatus();

    if (excludeSequenceEntries.length > 0) {
        payload.exclude_subsets = excludeSequenceEntries.map(e => e.nums.join(",")).join(";");
    }

    const lastDrawEl = document.getElementById("filter-last-draw");
    const lastDrawText = lastDrawEl ? lastDrawEl.value : "";
    const lastDrawLine = parseLastDrawLine(lastDrawText);

    const selectedRepeats = getSelectedRepeatCounts();
    const selectedLabel = getSelectedRepeatLabel();

    updateTextareaStatus(
        "last-draw-status",
        lastDrawText,
        lastDrawLine ? 1 : 0,
        15,
        "Nenhum sorteio inserido",
        "Informe exatamente 15 dezenas válidas do último sorteio",
        () => `Sorteio válido · repetições marcadas: ${selectedLabel}`
    );

    if (lastDrawLine) {
        payload.last_draw = lastDrawLine;
        if (selectedRepeats.size > 0) {
            payload.repeat_counts = [...selectedRepeats].sort((a, b) => a - b).join(",");
        }
    }

    const sequenceText = document.getElementById("filter-sequence-group")?.value || "";
    const sequenceNums = parseSequenceGroup(sequenceText);
    const selectedSequence = getSelectedSequenceCounts();

    if (sequenceNums.length > 0 && selectedSequence.size > 0) {
        payload.sequence_group = sequenceNums.join(",");
        payload.sequence_counts = [...selectedSequence].sort((a, b) => a - b).join(",");
    }

    payload._usePost = shouldUsePostForFilters(validDraws);
    return payload;
}

// Build URL query string (legacy helper)
function buildQueryParams(page = currentPage, size = pageSize, includeStats = true) {
    const payload = buildFilterPayload(page, size, includeStats);
    const params = new URLSearchParams();
    Object.entries(payload).forEach(([key, value]) => {
        if (key.startsWith("_") || value === undefined || value === null) return;
        if (Array.isArray(value)) {
            params.append(key, value.join(";"));
        } else {
            params.append(key, String(value));
        }
    });
    return params.toString();
}

// Fetch Combinations and Stats from backend
// Fetch Combinations and Stats from backend
let filterProgressTimer = null;
let filterProgressStartedAt = 0;

function setFilterProgress(text, state = "running") {
    const el = document.getElementById("filter-progress");
    if (!el) return;
    el.textContent = text;
    el.classList.remove("hidden", "is-running", "is-done");
    if (state === "running") el.classList.add("is-running");
    if (state === "done") el.classList.add("is-done");
}

function startFilterProgressUI() {
    stopFilterProgressUI(false);
    filterProgressStartedAt = Date.now();
    setFilterProgress("Processando filtros… 0,0s — detalhes no terminal do servidor", "running");
    filterProgressTimer = window.setInterval(() => {
        const s = ((Date.now() - filterProgressStartedAt) / 1000).toFixed(1).replace(".", ",");
        setFilterProgress(
            `Processando filtros… ${s}s — acompanhe o progresso no terminal (python3 main.py)`,
            "running",
        );
    }, 200);
}

function stopFilterProgressUI(hide = true) {
    if (filterProgressTimer) {
        clearInterval(filterProgressTimer);
        filterProgressTimer = null;
    }
    if (hide) {
        document.getElementById("filter-progress")?.classList.add("hidden");
    }
}

function showFilterTiming(timing, fromCache) {
    const el = document.getElementById("filter-progress");
    if (!el || !timing) {
        stopFilterProgressUI(true);
        return;
    }
    stopFilterProgressUI(false);
    const ms = Number(timing.elapsed_ms || 0);
    const sec = (ms / 1000).toFixed(2).replace(".", ",");
    const scanned = Number(timing.scanned || 0).toLocaleString("pt-BR");
    const matched = Number(timing.matched || 0).toLocaleString("pt-BR");
    const rate = timing.rate_per_sec
        ? `${Math.round(timing.rate_per_sec).toLocaleString("pt-BR")} cand/s`
        : "—";
    const cacheLabel = fromCache || timing.from_cache ? "cache" : "cálculo completo";
    setFilterProgress(
        `Pronto em ${sec}s (${cacheLabel}) · varridos ${scanned} · match ${matched} · ${rate}`,
        "done",
    );
}

async function fetchData(includeStats = true) {
    if (fetchAbortController) {
        fetchAbortController.abort();
    }
    fetchAbortController = new AbortController();
    const { signal } = fetchAbortController;

    const tbody = document.getElementById("combinations-table-body");
    tbody.innerHTML = `<div class="table-loading">Carregando combinações de ${gameSize} dezenas${gameSize <= 16 ? " (pode levar alguns segundos)" : ""}...</div>`;
    startFilterProgressUI();
    
    const payload = buildFilterPayload(currentPage, pageSize, includeStats);
    const usePost = payload._usePost;
    const requestPayload = { ...payload };
    delete requestPayload._usePost;
    
    try {
        const repeatOptionsPromise = fetchRepeatOptionCounts(payload, signal);
        const response = await apiRequest("/api/combinations", requestPayload, usePost, signal);
        if (!response.ok) throw new Error("Erro ao buscar dados do servidor");
        
        const data = await response.json();
        filteredCount = data.filtered_count;
        lastExcludeDrawsStats = data.exclude_draws_stats || null;
        showFilterTiming(data.timing, data.from_cache);

        if (data.limits) applyLimitsFromResponse(data.limits);
        if (data.game_size) gameSize = data.game_size;
        refreshGameMetaEntry(data);
        updateGameSizeLabels();

        document.getElementById("total-combinations-badge").textContent =
            data.total_count.toLocaleString("pt-BR");
        document.getElementById("filtered-combinations-badge").textContent =
            filteredCount.toLocaleString("pt-BR");
        const proportion = data.total_count > 0 ? ((filteredCount / data.total_count) * 100).toFixed(2) : "0.00";
        document.getElementById("proportion-badge").textContent = `${proportion}%`;

        const excludeCombosEl = document.getElementById("filter-exclude-combos");
        const excludeCombosText = excludeCombosEl ? excludeCombosEl.value : "";
        const validCombos = parseNumberLines(excludeCombosText, gameSize);
        if (validCombos.length > 0) {
            const combosStatusEl = document.getElementById("exclude-combos-status");
            if (combosStatusEl) {
                combosStatusEl.textContent = `${validCombos.length} combinação(ões) excluída(s) · total filtrado: ${filteredCount.toLocaleString("pt-BR")}`;
                combosStatusEl.classList.add("has-valid");
            }
        }
        
        // Render rows and charts
        renderProbability(data.probability, data.filtered_count, data.total_count, data.game_size);
        repeatFilterActive = isRepeatFilterActive();
        updateRepeatTableColumn(lastDrawNumbers.size === 15);
        if (data.active_repeat_counts) {
            activeRepeatCounts = data.active_repeat_counts;
        }
        updateLastDrawUi(activeRepeatCounts);
        updateBoardMandatoryBadge();
        renderTableRows(
            data.combinations,
            data.page,
            data.page_size,
            data.page_repeat_counts || []
        );
        if (data.stats) {
            lastChartStats = data.stats;
            renderCharts(data.stats);
        } else if (lastChartStats) {
            renderCharts(lastChartStats);
        }

        if (data.repeat_filter_active && data.stats?.repeat_distribution) {
            const summary = formatRepeatSummary(data.stats.repeat_distribution);
            const statusEl = document.getElementById("last-draw-status");
            if (statusEl && summary) {
                statusEl.textContent = `${data.filtered_count.toLocaleString("pt-BR")} jogos · ${summary}`;
                statusEl.classList.add("has-valid");
            }
        } else if (lastDrawNumbers.size === 15 && getSelectedRepeatCounts().size === 0) {
            const statusEl = document.getElementById("last-draw-status");
            if (statusEl) {
                statusEl.textContent = "Marque pelo menos uma repetição (6 a 10) para aplicar o filtro.";
                statusEl.classList.remove("has-valid");
            }
        } else if (data.repeat_filter_active && data.filtered_count === 0) {
            const statusEl = document.getElementById("last-draw-status");
            if (statusEl) {
                statusEl.textContent = `Nenhuma combinação com ${getSelectedRepeatLabel()} repetições para ${gameSize} dezenas.`;
                statusEl.classList.remove("has-valid");
            }
        }
        updatePagination(data.page, Math.ceil(filteredCount / pageSize));
        updateImportDrawsStatus(lastExcludeDrawsStats);
        await repeatOptionsPromise;
        
    } catch (error) {
        stopFilterProgressUI();
        if (error.name === "AbortError") return;
        console.error(error);
        tbody.innerHTML = `<div class="table-loading" style="color: var(--accent-coral)">${error.message}</div>`;
    }
}

// Render probability stats panel
function formatProbPercent(pct) {
    if (pct >= 99.995) return "~100%";
    if (pct > 0 && pct < 0.01) return pct.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 6 }) + "%";
    return pct.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + "%";
}

function formatProbOdds(odds, guaranteed) {
    if (guaranteed) return "Cobertura total estimada";
    if (!odds || odds <= 1) return "—";
    return `1 em ${Math.round(odds).toLocaleString("pt-BR")}`;
}

function formatHitPercent(pct) {
    if (pct >= 99.995) return "~100%";
    if (pct >= 10) return pct.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
    return formatProbPercentSmart(pct);
}

function formatProbPercentSmart(pct) {
    if (pct >= 99.995) return "~100%";
    if (pct > 0 && pct < 0.0001) return pct.toExponential(2).replace(".", ",") + "%";
    if (pct > 0 && pct < 0.01) return pct.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 6 }) + "%";
    return pct.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + "%";
}

function formatCurrency(value) {
    return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function renderEconomics(prob, filteredCount) {
    const econ = prob?.economics;
    const summaryEl = document.getElementById("prob-economics-summary");
    const disclaimerEl = document.getElementById("prob-economics-disclaimer");
    const priceBody = document.getElementById("prob-price-table-body");
    if (!econ || !summaryEl || !priceBody) return;

    const official = econ.official_bet;
    const coverage = econ.coverage;
    const single = coverage.single_official_bet;
    const k = prob.app_game_size;

    summaryEl.innerHTML = `
        <div class="prob-econ-grid">
            <div class="prob-item highlight">
                <span class="prob-label">1 aposta oficial (${k} dez.)</span>
                <span class="prob-val">${formatCurrency(official.bet_price)}</span>
                <span class="prob-sub">Equivale a ${single.simple_lines_covered.toLocaleString("pt-BR")} cartela(s) simples de 15 dezenas</span>
            </div>
            <div class="prob-item">
                <span class="prob-label">Expectativa fixa (11–14 ac.)</span>
                <span class="prob-val prob-val-negative">${formatCurrency(official.expected_fixed_return)}</span>
                <span class="prob-sub">Líquido médio: ${formatCurrency(official.net_expected)} · retorno ${official.roi_percent.toLocaleString("pt-BR")}% do valor apostado${prob.is_filtered ? " · modo memória" : ""}</span>
            </div>
        </div>
    `;

    if (disclaimerEl) {
        disclaimerEl.textContent = "Prêmios de 11 a 14 acertos são fixos pela Caixa. "
            + "15 acertos (prêmio principal) é variável e não entra na expectativa calculada.";
    }

    priceBody.innerHTML = "";
    (coverage.price_table || []).forEach(row => {
        const line = document.createElement("div");
        line.className = "prob-price-table-row" + (row.game_size === k ? " is-app-size" : "");
        line.innerHTML = `
            <span>${row.game_size} dezenas${row.game_size === k ? ' <em class="prob-tag">atual</em>' : ""}</span>
            <span>${formatCurrency(row.bet_price)}</span>
            <span>${row.simple_lines_covered.toLocaleString("pt-BR")}</span>
            <span class="prob-val-negative">${formatCurrency(row.expected_fixed_return)} <small>(${row.roi_percent.toLocaleString("pt-BR")}%)</small></span>
        `;
        priceBody.appendChild(line);
    });
}

const HIT_TIERS = [15, 14, 13, 12, 11];

function renderProbability(prob, filteredCount, totalCount, activeSize) {
    if (!prob) return;
    const k = activeSize || prob.app_game_size || gameSize;

    const probActiveSize = document.getElementById("prob-active-size");
    if (probActiveSize) probActiveSize.textContent = k;

    const mathDisclaimer = document.getElementById("prob-math-disclaimer");
    if (mathDisclaimer) {
        mathDisclaimer.textContent = prob.probability_disclaimer || "";
    }

    renderEconomics(prob, filteredCount);

    document.getElementById("prob-tickets-badge").textContent =
        `${filteredCount.toLocaleString("pt-BR")} cartela(s) · ${k} dez.`;

    const removed = Math.max(0, totalCount - filteredCount);
    document.getElementById("prob-universe-pct").textContent =
        formatProbPercent(prob.memory_removed_percent || 0);
    document.getElementById("prob-universe-odds").textContent = removed > 0
        ? `${removed.toLocaleString("pt-BR")} de ${totalCount.toLocaleString("pt-BR")} combinações não saem · restam ${filteredCount.toLocaleString("pt-BR")}`
        : "Nenhuma combinação removida";

    document.getElementById("prob-filtered-pct").textContent =
        formatHitPercent(prob.single_ticket_percent || 0);
    document.getElementById("prob-filtered-odds").textContent =
        formatProbOdds(prob.single_ticket_odds, false)
        + (prob.is_filtered && prob.single_ticket_odds_raw
            ? ` · sem memória: 1 em ${Math.round(prob.single_ticket_odds_raw).toLocaleString("pt-BR")}`
            : "");

    lastProbability = prob;

    const useFilterHits = Boolean(prob.is_filtered && prob.hits_memory && Object.keys(prob.hits_memory).length);
    const hitsSource = useFilterHits ? prob.hits_memory : prob.hits;
    const hitsTitle = document.getElementById("prob-hits-section-title");
    if (hitsTitle) {
        hitsTitle.textContent = useFilterHits
            ? "Por cartela — modo memória (o filtrado não sai)"
            : "Por cartela — universo completo (nenhum filtro ativo)";
    }

    const hitsGrid = document.getElementById("prob-hits-grid");
    if (hitsGrid) {
        hitsGrid.innerHTML = "";
        HIT_TIERS.forEach(h => {
            const tier = hitsSource?.[String(h)] || hitsSource?.[h];
            const card = document.createElement("div");
            card.className = "prob-hit-card" + (h === 15 ? " is-primary" : "");
            if (!tier) {
                card.classList.add("is-unavailable");
                card.innerHTML = `
                    <span class="prob-hit-badge">${h}</span>
                    <span class="prob-hit-label">acertos</span>
                    <span class="prob-hit-pct">—</span>
                    <span class="prob-hit-odds">Indisponível</span>
                `;
            } else {
                card.innerHTML = `
                    <span class="prob-hit-badge">${h}</span>
                    <span class="prob-hit-label">acertos</span>
                    <span class="prob-hit-pct">${formatHitPercent(tier.percent)}</span>
                    <span class="prob-hit-odds">${formatProbOdds(tier.odds, false)}</span>
                    <span class="prob-hit-filter">${useFilterHits ? "modo memória" : "universo completo"}</span>
                `;
            }
            hitsGrid.appendChild(card);
        });
    }

    const hitsFoot = document.getElementById("prob-hits-footnote");
    if (hitsFoot) {
        hitsFoot.textContent = useFilterHits
            ? `O filtro lembrou ${removed.toLocaleString("pt-BR")} combinações que não saem; `
                + "a chance de 15 acertos sobe na mesma proporção e as faixas de 11 a 14 se reequilibram."
            : "Odds hipergeométricas oficiais no universo completo.";
    }

    const gamesBody = document.getElementById("prob-games-body");
    if (!gamesBody || !prob.games) return;

    gamesBody.innerHTML = "";
    prob.games.forEach(game => {
        const row = document.createElement("div");
        row.className = "prob-games-row" + (game.is_app_size ? " is-app-size" : "");

        const dezCell = document.createElement("span");
        dezCell.className = "col-dez";
        dezCell.innerHTML = `${game.dezenas} de 25` + (game.is_app_size ? ' <em class="prob-tag">app</em>' : "");
        row.appendChild(dezCell);

        const totalCell = document.createElement("span");
        totalCell.className = "col-total";
        totalCell.textContent = game.total_combinations.toLocaleString("pt-BR");
        row.appendChild(totalCell);

        HIT_TIERS.forEach(h => {
            const hitCell = document.createElement("span");
            hitCell.className = "col-hit";
            const useApprox = game.is_app_size && useFilterHits;
            const tier = useApprox
                ? (prob.hits_memory?.[String(h)] || prob.hits_memory?.[h])
                : game.hits?.[h];
            if (tier) {
                hitCell.textContent = formatHitPercent(tier.percent);
                hitCell.title = formatProbOdds(tier.odds, false)
                    + (useApprox ? " (modo memória)" : "");
            } else {
                hitCell.textContent = "—";
            }
            row.appendChild(hitCell);
        });

        gamesBody.appendChild(row);
    });
}

// Render combinations list rows
function renderTableRows(combinations, page, size, pageRepeatCounts = []) {
    const tbody = document.getElementById("combinations-table-body");
    tbody.innerHTML = "";
    lastRenderedCombos = Array.isArray(combinations) ? combinations.slice() : [];
    updateCopySelectedButton();
    
    const countSpan = document.getElementById("results-count");
    if (combinations.length === 0) {
        tbody.innerHTML = '<div class="table-loading">Nenhuma combinação corresponde aos filtros ativos.</div>';
        countSpan.textContent = "Mostrando 0 de 0";
        return;
    }
    
    const startIdx = (page - 1) * size + 1;
    const endIdx = startIdx + combinations.length - 1;
    countSpan.textContent = `Mostrando ${startIdx.toLocaleString("pt-BR")} a ${endIdx.toLocaleString("pt-BR")} de ${filteredCount.toLocaleString("pt-BR")}`;
    
    combinations.forEach((combo, idx) => {
        const row = document.createElement("div");
        row.className = "combo-row";
        const copyText = formatComboCopyText(combo);
        row.dataset.copyText = copyText;

        const checkCell = document.createElement("span");
        checkCell.className = "col-check";
        const check = document.createElement("input");
        check.type = "checkbox";
        check.className = "combo-row-check";
        check.setAttribute("aria-label", `Selecionar combinação ${startIdx + idx}`);
        check.addEventListener("change", () => {
            row.classList.toggle("is-selected", check.checked);
            updateCopySelectedButton();
        });
        checkCell.appendChild(check);
        row.appendChild(checkCell);
        
        const indexCell = document.createElement("span");
        indexCell.className = "col-index";
        indexCell.textContent = `#${(startIdx + idx).toLocaleString("pt-BR")}`;
        row.appendChild(indexCell);
        
        const numbersCell = document.createElement("div");
        numbersCell.className = "col-numbers";

        const ballsWrap = document.createElement("div");
        ballsWrap.className = "col-numbers-balls";
        ballsWrap.setAttribute("aria-hidden", "true");
        
        combo.forEach(num => {
            const ball = document.createElement("span");
            ball.className = "num-ball";
            if (mustInclude.has(num)) {
                ball.classList.add("highlight-req");
            } else if (mustExclude.has(num) || pastedExcludeNumbers.has(num)) {
                ball.classList.add("highlight-exclude");
            } else if (excludeSequenceNumbers.has(num)) {
                ball.classList.add("highlight-banned");
            } else if (lastDrawNumbers.has(num)) {
                ball.classList.add("highlight-repeat");
            } else if (isSequenceFilterActive() && sequenceGroupNumbers.has(num)) {
                ball.classList.add("highlight-sequence");
            }
            ball.textContent = String(num).padStart(2, '0');
            ballsWrap.appendChild(ball);
        });
        numbersCell.appendChild(ballsWrap);

        const textLine = document.createElement("div");
        textLine.className = "combo-numbers-text";
        textLine.textContent = copyText;
        textLine.title = "Selecione este texto ou use o botão Copiar";
        textLine.tabIndex = 0;
        textLine.addEventListener("click", (e) => {
            e.stopPropagation();
            selectElementText(textLine);
        });
        textLine.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                selectElementText(textLine);
            }
        });
        numbersCell.appendChild(textLine);
        row.appendChild(numbersCell);
        
        // Calculations info
        const cSum = combo.reduce((a, b) => a + b, 0);
        const cEvens = combo.filter(n => n % 2 === 0).length;
        const cPrimes = combo.filter(n => PRIMES.has(n)).length;
        
        const sumCell = document.createElement("span");
        sumCell.className = "col-sum";
        sumCell.textContent = cSum;
        row.appendChild(sumCell);
        
        const evenCell = document.createElement("span");
        evenCell.className = "col-even";
        evenCell.textContent = `${cEvens} Pares`;
        row.appendChild(evenCell);
        
        const primeCell = document.createElement("span");
        primeCell.className = "col-prime";
        primeCell.textContent = `${cPrimes} Primos`;
        row.appendChild(primeCell);

        let repeatCount = null;
        if (repeatFilterActive && pageRepeatCounts[idx] !== undefined) {
            repeatCount = pageRepeatCounts[idx];
        } else if (lastDrawNumbers.size === 15) {
            repeatCount = getComboRepeatCount(combo);
        }

        if (lastDrawNumbers.size === 15 && repeatCount !== null) {
            const repeatCell = document.createElement("span");
            repeatCell.className = "col-repeat";
            const selectedRepeats = getSelectedRepeatCounts();
            if (repeatFilterActive && !selectedRepeats.has(repeatCount)) {
                repeatCell.classList.add("is-invalid");
            }
            repeatCell.textContent = String(repeatCount);
            repeatCell.title = repeatFilterActive
                ? `${repeatCount} dezenas do último sorteio (filtro: ${getSelectedRepeatLabel()})`
                : `${repeatCount} dezenas do último sorteio (filtro de repetição inativo)`;
            row.appendChild(repeatCell);
        }

        const copyCell = document.createElement("span");
        copyCell.className = "col-copy";
        const copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.className = "btn-copy-combo";
        copyBtn.textContent = "Copiar";
        copyBtn.title = "Copiar esta combinação";
        copyBtn.setAttribute("aria-label", `Copiar combinação ${startIdx + idx}`);
        copyBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            await copyComboLines([copyText], "Combinação");
        });
        copyCell.appendChild(copyBtn);
        row.appendChild(copyCell);
        
        tbody.appendChild(row);
    });
}

// Update Pagination Control States
function updatePagination(page, totalPages) {
    document.getElementById("page-indicator").textContent = `Página ${page.toLocaleString("pt-BR")} de ${Math.max(1, totalPages).toLocaleString("pt-BR")}`;
    
    document.getElementById("btn-page-first").disabled = (page <= 1);
    document.getElementById("btn-page-prev").disabled = (page <= 1);
    document.getElementById("btn-page-next").disabled = (page >= totalPages || totalPages === 0);
    document.getElementById("btn-page-last").disabled = (page >= totalPages || totalPages === 0);
}

// Render Custom Charts using pure HTML/CSS elements
function renderCharts(stats) {
    renderSomaChart(stats.sum_distribution);
    renderCompactChart("chart-pares", stats.even_distribution, " Pares");
    renderCompactChart("chart-primos", stats.prime_distribution, " Primos");
}

// Sum distribution chart generator
function renderSomaChart(sumDist) {
    const container = document.getElementById("chart-somas");
    container.innerHTML = "";
    
    const entries = Object.entries(sumDist).map(([sum, val]) => [parseInt(sum), val]);
    if (entries.length === 0) {
        container.innerHTML = '<div class="chart-empty-state">Sem dados correspondentes</div>';
        return;
    }
    
    // Sort by sum value
    entries.sort((a, b) => a[0] - b[0]);
    const maxVal = Math.max(...entries.map(e => e[1]));
    
    // Create elements
    entries.forEach(([sum, count]) => {
        const heightPercent = maxVal > 0 ? (count / maxVal) * 90 : 0;
        
        const barCol = document.createElement("div");
        barCol.className = "chart-bar-col";
        
        const bar = document.createElement("div");
        bar.className = "chart-bar";
        bar.style.height = `${heightPercent}%`;
        bar.setAttribute("data-tooltip", `Soma ${sum}: ${count.toLocaleString("pt-BR")} jogos`);
        
        barCol.appendChild(bar);
        container.appendChild(barCol);
    });
}

// Parity/Primes compact chart generator
function renderCompactChart(containerId, dist, labelSuffix) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";
    
    const entries = Object.entries(dist).map(([val, count]) => [parseInt(val), count]);
    if (entries.length === 0) {
        container.innerHTML = '<div class="chart-empty-state">Sem dados</div>';
        return;
    }
    
    entries.sort((a, b) => a[0] - b[0]);
    const maxVal = Math.max(...entries.map(e => e[1]));
    
    entries.forEach(([val, count]) => {
        const heightPercent = maxVal > 0 ? (count / maxVal) * 80 : 0;
        
        const barCol = document.createElement("div");
        barCol.className = "chart-bar-col";
        
        const bar = document.createElement("div");
        bar.className = "chart-bar";
        bar.style.height = `${heightPercent}%`;
        bar.setAttribute("data-tooltip", `${count.toLocaleString("pt-BR")} jogos`);
        
        const label = document.createElement("span");
        label.className = "chart-bar-label";
        label.textContent = `${val}${labelSuffix}`;
        
        barCol.appendChild(bar);
        barCol.appendChild(label);
        container.appendChild(barCol);
    });
}

// Simulate one smart draw matching active filters (15–20 dezenas)
async function simulateDraw() {
    if (filteredCount === 0) {
        showToast("Nenhuma combinação corresponde aos filtros atuais.", "warning");
        return;
    }
    await generateSmartGames(1, { singleMode: true });
}

function formatQuintileDistribution(bins) {
    const labels = ["01–05", "06–10", "11–15", "16–20", "21–25"];
    return bins.map((n, i) => `${labels[i]}:${n}`).join(" · ");
}

function renderSmartGameBalls(container, numbers) {
    container.innerHTML = "";
    numbers.forEach(num => {
        const ball = document.createElement("span");
        ball.className = "sim-num";
        if (PRIMES.has(num)) ball.classList.add("is-prime");
        ball.textContent = String(num).padStart(2, "0");
        container.appendChild(ball);
    });
}

function formatSmartHistorySummary(profile) {
    if (!profile) return "";
    const hot = (profile.hot_numbers || []).slice(0, 5).map(n => String(n).padStart(2, "0")).join(" ");
    return (
        `Histórico: ${Number(profile.total_draws).toLocaleString("pt-BR")} sorteios · ` +
        `paridade típica ${profile.mode_even}p/${profile.mode_odd}i · ` +
        `soma média ${profile.mean_sum} · ` +
        `máx. seguidos típico ${profile.mode_max_run}` +
        (hot ? ` · quentes: ${hot}` : "")
    );
}

function formatMemoryChance(prob) {
    if (!prob || !prob.single_ticket_percent) return "";
    const odds = prob.single_ticket_odds;
    const oddsText = odds && odds > 1 ? `1 em ${Math.round(odds).toLocaleString("pt-BR")}` : "~100%";
    return prob.is_filtered
        ? `${formatHitPercent(prob.single_ticket_percent)} (${oddsText}, modo memória)`
        : `${formatHitPercent(prob.single_ticket_percent)} (${oddsText})`;
}

function showSmartGamesResult(data, singleMode = false) {
    const box = document.getElementById("simulation-box");
    const title = document.getElementById("simulation-title");
    const singleContainer = document.getElementById("simulated-numbers-container");
    const singleMeta = document.getElementById("simulation-meta-text");
    const listEl = document.getElementById("smart-games-list");
    const footerEl = document.getElementById("smart-games-footer");
    const bannerEl = document.getElementById("smart-games-banner");
    const disclaimerEl = document.getElementById("smart-games-disclaimer");
    const toolbarEl = document.getElementById("smart-games-toolbar");
    const games = data.games || [];
    const history = data.history_profile;
    const requested = Number(data.requested_count || games.length || 0);

    if (!box || games.length === 0) {
        showToast(data.message || "Não foi possível gerar jogos inteligentes.", "warning");
        return;
    }

    lastSmartGeneratedGames = games
        .map(g => (Array.isArray(g.numbers) ? g.numbers.slice() : []))
        .filter(n => n.length > 0);

    box.classList.remove("hidden");
    box.classList.add("force-show");
    toolbarEl?.classList.remove("hidden");

    const memoryChance = formatMemoryChance(lastProbability);

    if (disclaimerEl) {
        disclaimerEl.textContent = (history
            ? "Filtros + padrão no volante + semelhança com o histórico importado."
            : "Distribuição no volante. Importe o histórico para também usar padrões passados.")
            + (memoryChance ? ` Chance de 15 acertos por jogo: ${memoryChance}.` : "");
    }

    if (bannerEl) {
        const parts = [];
        if (history) parts.push(formatSmartHistorySummary(history));
        if (data.score_relaxed) {
            parts.push("Limite de padrão flexibilizado para completar a quantidade pedida.");
        }
        if (data.scan_truncated) {
            parts.push(
                `Amostra limitada: ${Number(data.scanned || 0).toLocaleString("pt-BR")} combinações analisadas.`,
            );
        }
        if (games.length < requested) {
            parts.push(`Gerados ${games.length} de ${requested} pedidos.`);
        }
        if (parts.length) {
            bannerEl.classList.remove("hidden");
            bannerEl.textContent = parts.join(" · ");
        } else {
            bannerEl.classList.add("hidden");
            bannerEl.textContent = "";
        }
    }

    const scoreBits = (game) => {
        const bits = [
            ...(memoryChance ? [`15 ac.: ${memoryChance}`] : []),
            `Tipicidade ${game.typicality_percent}%`,
            `Padrão ${game.pattern_score}`,
        ];
        if (game.history_score != null && history) {
            bits.push(`Histórico ${game.history_score}`);
        }
        if (game.total_score != null && history) {
            bits.push(`Total ${game.total_score}`);
        }
        return bits.join(" · ");
    };

    const appendCopyableText = (parent, numbers) => {
        const textLine = document.createElement("div");
        textLine.className = "smart-game-text";
        textLine.textContent = formatComboCopyText(numbers);
        textLine.title = "Clique para selecionar · use Copiar ao lado";
        textLine.tabIndex = 0;
        textLine.addEventListener("click", (e) => {
            e.stopPropagation();
            selectElementText(textLine);
        });
        parent.appendChild(textLine);
        return textLine;
    };

    // Lista sempre que o usuário pediu mais de 1 (mesmo que a API devolva 1).
    if (singleMode && games.length === 1) {
        const game = games[0];
        if (title) {
            title.textContent = history ? "Jogo guiado por filtros + histórico" : "Distribuição no volante";
        }
        singleContainer.classList.remove("hidden");
        if (singleMeta) singleMeta.classList.remove("hidden");
        listEl?.classList.add("hidden");
        footerEl?.classList.add("hidden");
        renderSmartGameBalls(singleContainer, game.numbers);
        appendCopyableText(singleContainer, game.numbers);
        const hot = (game.hot_overlap || []).map(n => String(n).padStart(2, "0")).join(" ");
        singleMeta.innerHTML = `
            ${scoreBits(game)} ·
            Máx. seguidos: <strong>${game.max_consecutive}</strong> ·
            Soma: <strong>${game.sum}</strong> ·
            Pares: <strong>${game.even_count}</strong> ·
            Ímpares: <strong>${game.odd_count ?? (game.numbers.length - game.even_count)}</strong> ·
            Primos: <strong>${game.prime_count}</strong><br>
            Faixas: ${formatQuintileDistribution(game.quintile_distribution)}
            ${game.consecutive_runs.length ? ` · Blocos: ${game.consecutive_runs.join(", ")}` : " · Sem blocos longos"}
            ${hot ? `<br>Sobreposição com quentes: <strong>${hot}</strong>` : ""}
            <br><em>${game.typicality_note || data.disclaimer || ""}</em>
        `;
    } else {
        if (title) {
            title.textContent = history
                ? `${games.length} jogos (filtros + histórico)`
                : `${games.length} jogos (distribuição no volante)`;
        }
        singleContainer.classList.add("hidden");
        singleMeta.classList.add("hidden");
        listEl?.classList.remove("hidden");
        footerEl?.classList.remove("hidden");

        listEl.innerHTML = "";
        games.forEach((game, index) => {
            const row = document.createElement("div");
            row.className = "smart-game-row";
            row.dataset.copyText = formatComboCopyText(game.numbers);

            const head = document.createElement("div");
            head.className = "smart-game-row-head";
            head.innerHTML = `
                <span class="smart-game-index">#${index + 1}</span>
                <span class="smart-game-tip">${scoreBits(game)}</span>
                <span class="smart-game-tip">Máx. ${game.max_consecutive} seguidos</span>
            `;
            const copyBtn = document.createElement("button");
            copyBtn.type = "button";
            copyBtn.className = "btn-copy-smart";
            copyBtn.textContent = "Copiar";
            copyBtn.title = "Copiar este jogo";
            copyBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                await copyComboLines([formatComboCopyText(game.numbers)], "Jogo");
            });
            head.appendChild(copyBtn);
            row.appendChild(head);

            const balls = document.createElement("div");
            balls.className = "smart-game-balls";
            renderSmartGameBalls(balls, game.numbers);
            row.appendChild(balls);
            appendCopyableText(row, game.numbers);

            const meta = document.createElement("div");
            meta.className = "smart-game-meta";
            const odds = game.odd_count ?? (game.numbers.length - game.even_count);
            meta.textContent = `Soma ${game.sum} · Pares ${game.even_count} · Ímpares ${odds} · Primos ${game.prime_count} · ${formatQuintileDistribution(game.quintile_distribution)}`;
            row.appendChild(meta);
            listEl.appendChild(row);
        });

        if (footerEl) {
            footerEl.textContent = [
                data.message || null,
                data.scan_truncated
                    ? `Analisadas ${data.scanned.toLocaleString("pt-BR")} combinações (amostra limitada).`
                    : null,
                data.description || "",
                data.disclaimer || "",
            ].filter(Boolean).join(" ");
        }
    }

    if (data.message) {
        showToast(data.message, data.score_relaxed ? "info" : "warning", 4500);
    }

    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function generateSmartGames(forcedCount, options = {}) {
    if (filteredCount === 0) {
        showToast("Nenhuma combinação corresponde aos filtros atuais.", "warning");
        return;
    }

    const countInput = document.getElementById("smart-games-count");
    const maxScoreSel = document.getElementById("smart-games-max-score");
    const rawCount = typeof forcedCount === "number"
        ? forcedCount
        : parseInt(countInput?.value || "5", 10);
    const count = Math.max(1, Math.min(50, Number.isFinite(rawCount) ? rawCount : 5));
    const singleMode = Boolean(options.singleMode);
    const maxScore = maxScoreSel?.value || "";

    const payload = buildFilterPayload(1, 1, false);
    payload.count = count;
    payload.seed = Date.now() * 1000 + Math.floor(Math.random() * 1000);
    if (recentSmartGames.length > 0) {
        payload.avoid_games = recentSmartGames.slice(-120);
    }
    if (maxScore) payload.max_pattern_score = maxScore;
    delete payload.page;
    delete payload.page_size;
    delete payload.include_stats;

    const requestPayload = { ...payload };
    delete requestPayload._usePost;

    const btn = document.getElementById("btn-generate-smart-games");
    if (btn && !singleMode) {
        btn.disabled = true;
        btn.textContent = "Gerando...";
    }

    try {
        const response = await apiRequest("/api/generate-games", requestPayload, true);
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || "Erro ao gerar jogos");
        }
        const data = await response.json();
        if (Array.isArray(data.games)) {
            data.games.forEach(game => {
                if (Array.isArray(game.numbers)) {
                    recentSmartGames.push(game.numbers.slice());
                }
            });
            if (recentSmartGames.length > 240) {
                recentSmartGames = recentSmartGames.slice(-240);
            }
        }
        showSmartGamesResult(data, singleMode);
        if (!data.message && data.generated_count > 0) {
            showToast(`${data.generated_count} jogo(s) gerados.`, "success", 2500);
        }
    } catch (error) {
        console.error(error);
        showToast(error.message || "Falha ao gerar jogos inteligentes.", "error");
    } finally {
        if (btn && !singleMode) {
            btn.disabled = false;
            btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z"/></svg> Gerar Jogos Inteligentes`;
        }
    }
}

// Display Simulated Game Ball-Grid (modo clássico / 20 dezenas)
function showSimulationResult(combo) {
    const title = document.getElementById("simulation-title");
    const singleContainer = document.getElementById("simulated-numbers-container");
    const singleMeta = document.getElementById("simulation-meta-text");
    document.getElementById("smart-games-list")?.classList.add("hidden");
    document.getElementById("smart-games-footer")?.classList.add("hidden");
    if (title) title.textContent = "Jogo Simulado";
    singleContainer?.classList.remove("hidden");
    singleMeta?.classList.remove("hidden");

    const container = document.getElementById("simulated-numbers-container");
    container.innerHTML = "";
    
    combo.forEach(num => {
        const ball = document.createElement("span");
        ball.className = "sim-num";
        if (PRIMES.has(num)) {
            ball.classList.add("is-prime");
        }
        ball.textContent = String(num).padStart(2, '0');
        container.appendChild(ball);
    });
    
    const sum = combo.reduce((a, b) => a + b, 0);
    const evens = combo.filter(n => n % 2 === 0).length;
    const primes = combo.filter(n => PRIMES.has(n)).length;
    
    document.getElementById("simulation-meta-text").innerHTML = `
        Soma total: <strong>${sum}</strong> | 
        Pares: <strong>${evens}</strong> | 
        Ímpares: <strong>${combo.length - evens}</strong> | 
        Primos: <strong>${primes}</strong>
    `;
    
    document.getElementById("simulation-box").classList.remove("hidden");
    
    // Scroll simulation box into view smoothly if not visible
    document.getElementById("simulation-box").scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Export filtered data as download
async function exportData(format) {
    if (filteredCount === 0) {
        showToast("Nenhum dado para exportar.", "warning");
        return;
    }

    if (filteredCount > exportMaxLines) {
        showToast(
            `Filtro com ${filteredCount.toLocaleString("pt-BR")} combinações. A exportação será limitada a ${exportMaxLines.toLocaleString("pt-BR")} linhas — restrinja os filtros para baixar tudo.`,
            "warning",
            7000,
        );
    }

    const payload = buildFilterPayload();
    const usePost = payload._usePost || filteredCount > 5000;
    const requestPayload = { ...payload, format };
    delete requestPayload._usePost;
    delete requestPayload.page;
    delete requestPayload.page_size;
    delete requestPayload.include_stats;

    try {
        let response;
        if (usePost) {
            response = await fetch("/api/export", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestPayload),
            });
        } else {
            const query = buildQueryParams();
            response = await fetch(`/api/export?${query}&format=${format}`);
        }
        if (!response.ok) throw new Error("Erro na exportação");
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `combinacoes_lotofacil.${format}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showToast("Exportação concluída.", "success");
    } catch (error) {
        console.error("Falha na exportação:", error);
        showToast("Erro ao exportar os dados.", "error");
    }
}
