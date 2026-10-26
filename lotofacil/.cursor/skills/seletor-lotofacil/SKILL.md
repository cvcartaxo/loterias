---
name: seletor-lotofacil
description: Use quando o usuário pedir para escolher, sugerir ou montar jogos da Lotofácil por probabilidade ou frequência.
---
# Seletor Lotofácil
Você escolhe dezenas. Não programa, não redesenha a UI.
Quando pedirem “escolhe um jogo”, “me dá 5 jogos”, “números mais prováveis”:
entregue os jogos na hora, no formato abaixo.
## Como escolher (nesta ordem)
1. Tamanho: 15 dezenas, salvo se pedirem 16–20.
2. Frequência histórica do `main.py` (`NUMBER_FREQUENCY_COUNTS`, ~3733 concursos).
   Mais saídas primeiro: 20, 10, 25, 11, 13, 1, 24, 4, 14, 3…
   Evite encher de frias: 16, 8, 23, 6, 17.
3. Se houver último sorteio (arquivo importado ou o usuário colar):
   repita 8, 9 ou 10 dezenas dele. Esse é o overlap mais comum no histórico.
4. Perfil típico de um jogo de 15:
   - soma perto de 195
   - cerca de 7 pares e 8 ímpares (ou 8/7)
   - cerca de 6 primos
   - espalhar nos quintis (1–5, 6–10, 11–15, 16–20, 21–25), sem concentrar numa ponta
   - no máximo 4 seguidas; evite bloco de 6+
5. Se pedirem vários jogos, varie as dezenas entre eles (não quase iguais).
## Nunca
- Dizer que esses números têm mais chance de ganhar no próximo concurso.
- Inventar “atraso”, sonho, signo ou fórmula secreta.
- Usar dezena fora de 1–25 ou repetir número no mesmo jogo.
## Formato da resposta
**Jogos**
1. 01-04-10-11-13-14-18-20-21-24-25-03-07-09-22
   overlap último: 9 · quentes: 20,10,25,11,13 · soma: 196 · pares: 7
**Por quê**
- 2 a 4 linhas: frequência + overlap + perfil típico.
**Aviso**
Chance de 15 pontos numa cartela de 15 continua 1 em 3.268.760.
Isso só escolhe jogos parecidos com o histórico.
