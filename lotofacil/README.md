# Lotofácil Combinador — 15 a 20 dezenas

Aplicação web local para gerar, filtrar, analisar e exportar combinações da Lotofácil (15–20 dezenas entre 25). Backend em **Python puro** (stdlib) e frontend em **HTML/CSS/JS**.

Não prevê sorteios. Probabilidades são combinatórias; “jogos inteligentes” usam heurística de distribuição no volante.

---

## Como iniciar

```bash
cd /home/cartaxo/Documentos/lotofacil
python3 main.py
```

Abra [http://localhost:8000](http://localhost:8000).

Pré-requisito: Python 3.7+.

---

## Fluxo do dashboard

1. **Filtrar** — tabuleiro, filtros básicos e tabela de combinações  
2. **Analisar** — probabilidades/custos Caixa, gráficos, frequência, top-5, comparar sorteios  
3. **Gerar / Exportar** — jogos por distribuição no volante, export TXT/CSV  

---

## Funcionalidades

- Tabuleiro 1–25: neutro / obrigatório / excluído  
- Filtros: tamanho (15–20), soma, pares, primos, repetição vs último sorteio, sequências, import TXT  
- Probabilidades base (hipergeométricas) + modo memória: o que o filtro remove é tratado como resultado que não sai, e a % por cartela sobe na mesma proporção  
- Jogos por heurística de padrão (tipicidade ≠ probabilidade)  
- Frequência e sequências a partir dos sorteios importados (persistidos no `localStorage`)  
- Export streaming com limite de linhas  
- Tema claro/escuro, painéis colapsáveis  

---

## Testes

```bash
python3 -m unittest tests.test_combinatorics -v
```

---

## Estrutura

```text
lotofacil/
├── main.py              # HTTP + combinatória + filtros
├── tests/               # Testes unitários
├── requirements.txt     # Vazio (stdlib only)
└── static/
    ├── index.html
    ├── style.css
    └── app.js
```

---

## Performance

- Cache em memória para k ≥ 19; streaming para k ≤ 18  
- Debounce 250 ms nos filtros de soma  
- Export em chunks (até 250.000 linhas por arquivo)
