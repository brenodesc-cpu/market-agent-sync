# Interface, movimento e percurso do usuário

Documento de contrato de interface para a branch `feat/guima-nmk-blockchain-ux`.
A identidade visual atual é mantida e estendida; não há troca de paleta nem de tipografia.

## 1. Regra que vem antes de qualquer animação

O README, seção 12, é explícito: *"Animações podem acompanhar eventos, mas não podem simular
progresso inexistente."* Toda animação desta entrega precisa estar presa a um estado real:

- Uma barra de progresso só avança com um estado vindo do backend.
- Um passo do fluxo só acende quando o evento correspondente existe em `order_events`.
- Um `skeleton` aparece enquanto a requisição está em voo e some quando ela resolve.
- Nada de contador falso, progresso temporizado, ou "verificando..." que não corresponde a
  uma chamada em andamento.

Um botão precisa executar uma ação ou explicar a dependência que falta. Isso já vale para o
texto; agora vale também para o movimento.

## 2. Tokens de movimento

Criar `src/motion.css`, importado por `src/styles.css`. Define as variáveis e as utilidades;
não contém regra específica de nenhuma tela.

```css
:root {
  --nm-dur-instant: 90ms;
  --nm-dur-fast: 150ms;
  --nm-dur-base: 240ms;
  --nm-dur-slow: 420ms;
  --nm-dur-scene: 700ms;
  --nm-ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
  --nm-ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --nm-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --nm-stagger: 60ms;
}
```

Regras obrigatórias:

- Anime apenas `transform`, `opacity`, `filter` e `clip-path`. Nunca anime `width`, `height`,
  `top`, `left`, `margin` ou `box-shadow` em elementos repetidos numa lista.
- Todo bloco de animação decorativa fica dentro de
  `@media (prefers-reduced-motion: no-preference)`. O estado final (visível, posição neutra)
  é o padrão fora do bloco, para que quem desliga movimento veja a página completa e correta,
  nunca em branco.
- Nenhum elemento pode ficar invisível esperando JavaScript. O estado inicial oculto só é
  aplicado depois que o observador confirma que está ativo (classe aplicada por JS), assim a
  página sem JS e a renderização do servidor continuam legíveis.

## 3. Hooks

Todos em `src/hooks/`, seguros para SSR — o projeto renderiza no servidor, então nenhum
acesso a `window` ou `document` no escopo do módulo, apenas dentro de `useEffect`.

- `use-reduced-motion.ts`: assina `matchMedia("(prefers-reduced-motion: reduce)")` e
  reage a mudanças. Valor inicial no servidor: `true` (assume redução, nunca anima cedo).
- `use-scroll-reveal.ts`: `IntersectionObserver` com `rootMargin` inferior negativo, revela
  uma vez e desconecta. Aceita atraso para escalonar itens de uma lista. Se o navegador não
  tiver `IntersectionObserver`, revela tudo imediatamente.
- `use-count-up.ts`: anima um número por `requestAnimationFrame` a partir do valor real
  recebido. Recebe o valor final como entrada — **não** inventa um valor e não começa em zero
  se o dado ainda não chegou; enquanto não há dado, mostra `skeleton`.

## 4. Percurso do usuário

Essa é a parte mais importante da entrega. Hoje a entrada joga a pessoa entre `/`, `/demo` e
`/studio` sem um fio condutor. Reorganizar em torno de duas perguntas, que são as duas
entradas que a estratégia define: *quero contratar* ou *quero oferecer*.

Percurso de quem contrata:

1. Entende em uma tela o que a rede faz e por que o pagamento é condicionado à verificação.
2. Vê ofertas reais com preço, prazo e critérios antes de decidir qualquer coisa.
3. Descreve a necessidade e o teto de gastos, e vê o que vai ser reservado.
4. Acompanha a execução por uma linha do tempo de eventos reais.
5. Vê a verificação critério por critério, com valor esperado e valor observado.
6. Recebe a entrega e vê a liquidação registrada.

Percurso de quem oferece:

1. Descreve a capacidade em linguagem natural.
2. Revisa a proposta estruturada gerada, e edita o que não está certo.
3. Vê explicitamente o que ainda falta para publicar (executor conectado e validado).
4. Publica e acompanha os pedidos recebidos.

Cada tela precisa responder, sem a pessoa perguntar: onde estou, o que aconteceu, o que posso
fazer agora, e o que está bloqueando se algo estiver bloqueado.

Exigências concretas:

- Indicador de progresso do percurso, com o passo atual destacado, ligado ao estado real.
- Navegação persistente que mostra em qual das duas jornadas a pessoa está.
- Todo estado vazio precisa dizer o próximo passo e ter uma ação, nunca só "nenhum registro".
- Todo erro precisa dizer o que falhou e o que fazer, em português, sem jargão de stack.
- Voltar e recarregar precisam preservar o contexto (a rota já carrega estado pela URL —
  mantenha isso e estenda onde falta).

## 5. Responsividade

Hoje existem três `media queries` na folha da landing. Reescrever partindo de mobile:

- Base: layout de uma coluna, alvos de toque de no mínimo 44 por 44 pixels.
- 480px, 640px, 900px, 1200px como pontos de mudança.
- Nenhuma rolagem horizontal em nenhuma largura a partir de 320px. Tabelas e diagramas largos
  rolam dentro do próprio contêiner com `overflow-x: auto`, nunca no corpo da página.
- Menu móvel com foco preso enquanto aberto, fechamento por `Escape`, e retorno do foco ao
  botão que o abriu.
- Testar com teclado: toda ação alcançável por `Tab`, com foco visível em contraste adequado.

## 6. Escopo de arquivos

Alterar apenas:

- `src/motion.css` (novo)
- `src/styles.css` (somente para importar `motion.css`)
- `src/landing.css`
- `src/landing-sections.css`
- `src/components/landing-page.tsx`
- `src/components/landing-sections.tsx`
- `src/hooks/use-reduced-motion.ts`, `use-scroll-reveal.ts`, `use-count-up.ts` (novos)

Não alterar `src/studio.css`, `src/components/company-studio.tsx`, `src/routes/**`,
`src/lib/**`, nem `package.json`. Essas áreas pertencem a outros agentes nesta branch e
qualquer edição nelas vira conflito.

Nenhuma dependência nova. `tw-animate-css` e as primitivas Radix já instaladas estão
disponíveis; animação própria é CSS e `requestAnimationFrame`.

## 7. Verificação antes de entregar

- `npx tsc --noEmit` sem erro novo.
- `npx eslint src/components/landing-page.tsx src/components/landing-sections.tsx src/hooks`
  sem erro novo.
- Conferir 320, 390, 768, 1024 e 1440 pixels de largura.
- Conferir com movimento reduzido ligado: a página aparece completa, sem elemento preso
  invisível.
