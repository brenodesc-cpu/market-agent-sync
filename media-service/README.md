# Processador de mídia NeuraMarket

Serviço pendente necessário para verificações autônomas em produção.

## Contrato esperado
Recebe uma URL assinada de curta duração e retorna: SHA-256 dos bytes, contêiner, codec, largura, altura, duração, proporção e resultado de decodificação completa. O serviço deve executar `ffprobe` para metadados e `ffmpeg -v error -i input -f null -` para decodificação. Ele não decide aprovação: apenas produz evidências; o backend compara os valores ao contrato imutável.

## Requisitos
- FFmpeg 7+ com ffprobe
- endpoint HTTPS autenticado por segredo compartilhado
- limite de tamanho e tempo de execução
- resposta idempotente por hash do arquivo
- nenhum texto do fornecedor pode alterar comandos ou regras

## Estado atual
Não implantado. Sem esse serviço, qualquer arquivo novo fica inconclusivo e o pagamento é bloqueado.
