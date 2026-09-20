# Pitch público

`/pitch` apresenta a NeuraMarket em doze slides. A abertura separa a chegada dos agentes da pergunta sobre quem atenderá esse mercado. Depois apresenta a infraestrutura de transações, o problema, a solução, a contratação e o modelo de negócio. Antes do caso fintech, explica o acesso direto por API/MCP e a entrada humana por chat e voz com Agora. Fecha com confiança, os desafios e a conexão do agente.

O desenho segue `virte-app/public/pitch/index.html`: Space Grotesk, JetBrains Mono, roxo, alternância entre fundos claros e escuros, navegação por teclado e modo de apresentação. As fontes e suas licenças OFL ficam em `public/pitch-assets/`.

## Apresentar

- Abra `/pitch` sem login. Use as setas, os botões ou o índice. No celular, deslize para os lados.
- Cada capítulo tem um endereço direto, como `/pitch#receita` e `/pitch#fluxo`.
- O último slide oferece o comando MCP, a conexão do agente, a demonstração existente, o PDF do modelo de negócio e um QR Code para o site publicado.
- A página inicial contém um link para a apresentação.

## Limites do conteúdo

Os percentuais de 8% para o fornecedor e 2% para o comprador vêm do deck fornecido e são uma proposta comercial em validação. Não alteram as taxas do simulador.

O cenário fintech com 230 análises é hipotético e depende de dados autorizados. A instituição continua responsável pela decisão de crédito. O slide de confiança é uma ilustração interativa; não cria pedidos nem movimenta saldo. A conexão Agora ainda requer validação de uma sessão real.

A apresentação não depende de migração ou banco de dados. A publicação exige que o Lovable publique a versão sincronizada do GitHub.

## Tela financeira para acompanhar a fala

`/demo` abre a tesouraria do aplicativo em `/studio?view=fx`. O painel mostra ofertas, contratos, comprovantes e saldos recebidos do servidor. As visões Fluxo, Ofertas e Recibo pertencem à operação, com opção de tela cheia. A encenação separada foi removida a pedido do Breno.

Escolha Agente + revisão humana, defina US$ 1.000, limite de R$ 5.600 e uma hora, autorize os valores fictícios e execute. O servidor escolhe o fornecedor e corrige o comprovante de teste, conservando a reserva. Aprovar conversão simulada envia o aceite autenticado ao servidor. O recibo só aparece após a liquidação persistida.

O modo usa os contratos com revisão humana já suportados pela migração 0019, sem uma nova migração. Instituições e dinheiro continuam fictícios. O fluxo autônomo do MCP permanece disponível. Os 12 testes de banco incluem a correção, o bloqueio de pagamento e a repetição sem cobrança duplicada. A consulta ao servidor público confirmou a carteira de teste com R$ 10.000, sem operações. A versão local está sem servidor configurado; a execução da nova tela no domínio público depende de publicar o código no Lovable e entrar na conta.
