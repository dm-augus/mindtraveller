# Basic RPG System for Mindtraveller 

Os eventos podem ser influenciados pelos atributos do personagem e por sua "natureza".
Os atributos são:
Força: (varia de -2 a +3) utilizado em jogadas que o LLM julgar que utilizar força, como empurrar uma pedra ou golpear um oponente forte o suficiente
Destreza: (varia de -2 + 3) utilizado em jogadas que o LLM julgar que necessitam de destreza, como pular um muro ou mirar precisamente em um alvo
Inteligência (varia de -2 a +3) utilizado em jogadas que o LLM julgar que necessitam de inteligencia, como botar um plano ou entender um manuscrito
Resistência (varia de -2 a +3) utilizado em jogados que o LLM julgar que necessitam de resistência, como se recuperar de uma doença ou suportar o frio 
Carisma (varia de -1 a +1) utilizado em interações com outras criaturas inteligentes, ajuda para que elas gostem de você ou não, favorecendo situações sociais
Sorte (varia de -1 a +1) utilizado para situações que o LLM julgar de pura sorte

O modulo de sistema é simples, quando o LLM julgar que deve determinar o sucesso de uma ação por meio do sistema, ele primeiro precisa decidir a categoria de dificuldade daquela ação: muito difícil, difícil, média, fácil ou muito fácil.

Um dado de 100 faces é jogado, se o resultado for menor do que uma porcentagem de corte, a ação é bem sucedida. As porcentagens de corte dependem da categoria de dificuldade e do atributo correlacionado, as porcentagens de corte são (por cateogria de dificuldade):

MUITO DIFÍCIL: o resultado deve ser 5 ou inferior
DIFÍCIL: o resultado deve ser 20 ou inferior
MÉDIO: o resultado deve ser 50 ou inferior
FÁCIL: o resultado deve ser 80 ou inferior
MUITO FÁCIL: o resultado deve ser 90 ou inferior

Os atributos contribuem nos testes, se, por exemplo, o LLM determinar que a jogada é influenciada por força e o usuário possui +1 e a categoria é DIFÍCIL, ele ganha um bonus de +10, e agora passa a jogar contra o valor de corte 30 ao invés de 20. Por outro lado, se na mesma situação o usuário possuir -1, passará a jogar contra 10 ao invés de 20, com uma descida do corte em -10.

Nenhuma jogada pode ser fácil o suficiente a ponto de 99 e 100 não serem considerados uma falha.

A natureza do personagem pode ser "BOA", "NEUTRA" ou "MALDOSA"
As ações propostas pelo LLM como escolha devem levar em consieração a natureza do personagem.
Por exemplo, um personagem com natureza "BOA" pode ter opções de ajudar alguém ferido,
enquanto um personagem com a natureza "NEUTRA" pode ignorar o ferido e o com a natureza "MALDOSA" pode furtar o ferido.

------------------

# Prompt:

# Mindtraveller — Sistema de Regras (Versão 1.0)

## 1. Visão Geral

O sistema de regras do Mindtraveller tem como objetivo determinar o sucesso ou fracasso de ações realizadas pelo personagem durante a narrativa.

Os eventos e as ações podem ser influenciados por dois elementos principais:

- **Atributos:** representam as capacidades e características do personagem, influenciando suas chances de sucesso em determinadas ações.
- **Natureza:** representa a inclinação moral e comportamental do personagem, influenciando as escolhas e possibilidades de ação apresentadas pelo LLM.

O sistema deve ser simples e flexível, permitindo que o LLM determine quando uma ação exige uma jogada de dados, qual atributo deve ser utilizado e qual é o nível de dificuldade envolvido.

---

## 2. Atributos do Personagem

Cada personagem possui seis atributos. Seus valores representam modificadores aplicados às jogadas de dados.

### 2.1. Força

**Intervalo:** -2 a +3.

Utilizada em ações que exigem força física.

Exemplos:
- Empurrar ou levantar uma pedra pesada.
- Golpear um oponente que exige força considerável.
- Arrombar uma porta.
- Carregar objetos pesados.

### 2.2. Destreza

**Intervalo:** -2 a +3.

Utilizada em ações que exigem coordenação motora, agilidade ou precisão.

Exemplos:
- Saltar sobre um muro.
- Mirar precisamente em um alvo.
- Escalar uma superfície.
- Desviar de um ataque.

### 2.3. Inteligência

**Intervalo:** -2 a +3.

Utilizada em ações que exigem raciocínio, conhecimento ou capacidade de interpretação.

Exemplos:
- Elaborar um plano.
- Interpretar um manuscrito antigo.
- Resolver um enigma.
- Identificar uma estratégia ou fraqueza de um oponente.

### 2.4. Resistência

**Intervalo:** -2 a +3.

Utilizada em ações que exigem resistência física ou capacidade de suportar condições adversas.

Exemplos:
- Recuperar-se de uma doença.
- Suportar temperaturas extremamente baixas.
- Resistir à exaustão.
- Continuar lutando mesmo estando ferido.

### 2.5. Carisma

**Intervalo:** -1 a +1.

Utilizado em interações sociais com outras criaturas inteligentes. Influencia a capacidade do personagem de estabelecer relações, conquistar a confiança de outros indivíduos ou persuadi-los.

Exemplos:
- Convencer alguém a ajudar.
- Negociar com um comerciante.
- Persuadir um guarda a permitir sua passagem.
- Causar uma boa impressão durante uma conversa.

### 2.6. Sorte

**Intervalo:** -1 a +1.

Utilizada em situações nas quais o resultado depende predominantemente de circunstâncias aleatórias ou fatores fora do controle do personagem.

Exemplos:
- Encontrar um objeto perdido por acaso.
- Escapar de um acontecimento inesperado.
- Encontrar uma passagem secreta sem pistas prévias.
- Ter sorte em uma situação imprevisível.

---

## 3. Sistema de Testes

O sistema de testes é baseado em um dado de 100 faces (D100).

O LLM deve determinar quando uma ação exige uma jogada de dados. Nem todas as ações precisam ser submetidas ao sistema: ações triviais, garantidas ou que não apresentem incerteza relevante podem ser resolvidas diretamente pela narrativa.

Quando uma jogada for necessária, o LLM deverá seguir as etapas abaixo.

### 3.1. Determinação da Dificuldade

Primeiramente, o LLM deve avaliar a complexidade da ação e classificá-la em uma das cinco categorias de dificuldade:

| Categoria | Valor-base de sucesso |
|---|---:|
| Muito difícil | 5 |
| Difícil | 20 |
| Média | 50 |
| Fácil | 80 |
| Muito fácil | 90 |

O valor-base representa o resultado máximo permitido no D100 para que a ação seja considerada bem-sucedida, antes da aplicação dos modificadores de atributos.

### 3.2. Aplicação dos Modificadores de Atributos

Após determinar a dificuldade, o LLM deve identificar qual atributo está relacionado à ação.

O valor do atributo modifica diretamente o limite de sucesso da jogada.

**Regra de cálculo:**

Cada ponto positivo ou negativo no atributo corresponde a uma alteração de 10 pontos percentuais no valor-base de sucesso.

**Fórmula:**

`Valor de corte = Valor-base de sucesso + (Atributo × 10)`

Exemplos:

| Dificuldade | Atributo | Valor-base | Valor de corte final |
|---|---:|---:|---:|
| Difícil | Força +1 | 20 | 30 |
| Difícil | Força -1 | 20 | 10 |
| Média | Destreza +2 | 50 | 70 |
| Média | Inteligência -2 | 50 | 30 |
| Muito difícil | Sorte +1 | 5 | 15 |
| Fácil | Carisma -1 | 80 | 70 |

O valor de corte final determina o limite utilizado para avaliar o resultado do D100.

### 3.3. Execução da Jogada

Após determinar o valor de corte final, um resultado aleatório entre 1 e 100 deve ser gerado.

A ação será considerada bem-sucedida quando o resultado do dado for menor ou igual ao valor de corte final.

Caso contrário, a ação será considerada uma falha.

**Exemplo:**

Um personagem precisa empurrar uma pedra pesada.

1. O LLM determina que a ação exige um teste de Força.
2. A dificuldade é classificada como **Difícil**, cujo valor-base é 20.
3. O personagem possui Força +1.
4. O valor de corte é calculado: `20 + (1 × 10) = 30`.
5. O D100 é lançado.

Resultados possíveis:
- Resultado 25: sucesso.
- Resultado 30: sucesso.
- Resultado 31: falha.
- Resultado 95: falha.

---

## 4. Limites de Sucesso e Falha

Independentemente da dificuldade ou dos modificadores de atributos, nenhuma jogada poderá ter uma chance de sucesso de 100%.

Os resultados **99 e 100 devem sempre representar uma falha**.

Portanto, o valor de corte final nunca poderá ultrapassar 98.

**Regra obrigatória:**

`Valor de corte final = mínimo(98, Valor-base + (Atributo × 10))`

Essa regra garante que sempre exista uma possibilidade de falha, mesmo em ações extremamente simples ou quando o personagem possui atributos elevados.

---

## 5. Natureza do Personagem

Além dos atributos, cada personagem possui uma característica chamada **Natureza**, que representa sua inclinação moral e comportamental.

Existem três naturezas possíveis:

| Natureza | Descrição |
|---|---|
| Boa | O personagem tende a agir de maneira altruísta, compassiva e prestativa. |
| Neutra | O personagem tende a agir de maneira imparcial, pragmática ou indiferente às circunstâncias. |
| Maldosa | O personagem tende a agir de maneira egoísta, cruel ou mal-intencionada. |

### 5.1. Influência da Natureza nas Escolhas

A natureza do personagem deve influenciar as opções de ações apresentadas pelo LLM durante a narrativa.

As escolhas oferecidas devem ser coerentes com a personalidade e a inclinação moral do personagem.

**Exemplo:**

O personagem encontra um indivíduo ferido e caído à beira de uma estrada.

As opções apresentadas pelo LLM devem considerar a natureza do personagem:

- **Natureza Boa:** ajudar o indivíduo ferido, oferecer suprimentos ou procurar ajuda.
- **Natureza Neutra:** ignorar o indivíduo, seguir viagem ou avaliar se vale a pena ajudá-lo.
- **Natureza Maldosa:** roubar os pertences do indivíduo, aproveitar-se de sua vulnerabilidade ou abandoná-lo em uma situação ainda pior.

### 5.2. Diretrizes para o LLM

- A natureza deve influenciar as opções de ação apresentadas ao jogador.
- As escolhas devem refletir a inclinação moral correspondente.
- A natureza não deve ser utilizada como modificador numérico nos testes de D100.
- A natureza não deve substituir os atributos na determinação do sucesso ou fracasso de uma ação.

---

## 6. Diretrizes Gerais de Implementação

Para garantir a consistência do sistema, o LLM deve respeitar as seguintes diretrizes:

1. **Uso criterioso dos testes:** nem toda ação precisa gerar uma jogada de dados. O sistema deve ser utilizado quando existir incerteza relevante sobre o resultado.
2. **Escolha coerente dos atributos:** o atributo utilizado deve corresponder à principal capacidade exigida pela ação.
3. **Dificuldade contextual:** a dificuldade deve considerar as circunstâncias da narrativa, e não apenas a ação isoladamente.
4. **Aplicação dos modificadores:** os atributos devem modificar o valor de corte antes da execução do D100.
5. **Limite de sucesso:** o valor de corte nunca poderá ultrapassar 98.
6. **Consistência narrativa:** o resultado da jogada deve ser incorporado à história de maneira coerente, considerando o contexto e as consequências da ação.
7. **Respeito à natureza:** as opções apresentadas ao jogador devem considerar a natureza do personagem, sem transformar essa característica em um modificador numérico.

---

## 7. Resumo das Mecânicas

| Mecânica | Regra |
|---|---|
| Sistema de dados | D100 |
| Atributos físicos e mentais | -2 a +3 |
| Carisma e Sorte | -1 a +1 |
| Categorias de dificuldade | Muito difícil, difícil, média, fácil e muito fácil |
| Modificador por ponto de atributo | ±10 pontos percentuais |
| Fórmula | Valor-base + (Atributo × 10) |
| Valor máximo de corte | 98 |
| Resultados 99 e 100 | Sempre falha |
| Naturezas disponíveis | Boa, Neutra e Maldosa |
| Natureza nos testes | Não possui modificador numérico |
| Natureza nas escolhas | Influencia as opções apresentadas pelo LLM |

**Objetivo principal:** fornecer uma estrutura de regras simples, previsível e suficientemente flexível para que o LLM conduza aventuras narrativas, determine resultados de ações e apresente escolhas coerentes com as características do personagem.