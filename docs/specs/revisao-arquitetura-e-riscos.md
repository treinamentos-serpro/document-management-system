# Revisão de arquitetura, qualidade e riscos do DMS

**Data da análise:** 26/10/2026  
**Escopo:** backend e frontend, incluindo rotas, camadas de aplicação, armazenamento,
componentes React, comunicação com a API e testes.

Este documento registra os achados da análise do estado atual do repositório.
As prioridades indicam impacto potencial, não significam que todos os itens
sejam defeitos em relação ao escopo atual do protótipo.

## Resumo executivo

A implementação segue o fluxo principal previsto (`routes → controllers →
services → repositories`) e tem controles úteis no upload: limita o tamanho,
gera um nome interno no servidor, separa metadados públicos de dados internos
de armazenamento e remove arquivos quando o registro do upload falha.

Os principais riscos para uma implantação com dados reais são a identidade
compartilhada, a ausência de limites para o consumo total de disco e a falta de
persistência/reconciliação dos metadados com os arquivos. A especificação
define autenticação e persistência como fora do escopo inicial; portanto, esses
itens são limites conhecidos do protótipo, mas precisam ser resolvidos antes
de disponibilizar o sistema para uso real.

**Path traversal:** a análise não encontrou um caminho explorável pela API
atual. O nome do arquivo salvo é gerado pelo servidor e o download resolve o
caminho a partir dos metadados internos. Ainda assim, o repositório não valida
explicitamente que o nome recebido para resolver o caminho permanece dentro
da pasta de armazenamento, o que merece defesa preventiva.

## Achados priorizados

### P1 — Identidade compartilhada permite acesso cruzado a documentos

**Categoria:** segurança / arquitetura  
**Situação:** limite conhecido do protótipo; bloqueador para dados reais.

Todos os uploads recebem o proprietário fixo `demo-user`. A listagem consulta
esse mesmo proprietário e o download verifica apenas o proprietário armazenado
contra o valor fixo. Não há autenticação ou identidade de requisição que
separe clientes; consequentemente, qualquer cliente com acesso à API pode
listar e baixar documentos enviados por outros clientes.

Isso está alinhado com a especificação atual, que exclui autenticação e seleção
de identidade. O risco surge se a aplicação for exposta ou utilizada com
documentos que não devam ser compartilhados.

**Melhoria proposta:** antes do uso com dados reais, autenticar o usuário,
derivar a identidade de uma fonte confiável no servidor e aplicá-la de forma
consistente ao upload, à listagem e à autorização do download. Não aceitar
identidade ou proprietário informados pelo cliente como prova de autorização.

**Referências:** [documents.service.js](../../backend/src/services/documents.service.js#L4),
[documents.routes.js](../../backend/src/routes/documents.routes.js#L6),
[dms-spec.md](./dms-spec.md#L21).

### P1 — Uploads ilimitados no agregado podem consumir todo o disco

**Categoria:** segurança / disponibilidade  
**Situação:** risco presente se a API puder ser alcançada por clientes não confiáveis.

O limite de 10 MiB é por arquivo. Não há quota total por usuário, limite de
frequência, limite explícito de uploads concorrentes ou política de retenção.
Como qualquer upload concluído grava um arquivo no filesystem local, requisições
repetidas podem consumir o espaço disponível e prejudicar a própria aplicação
ou outros serviços no mesmo ambiente.

**Melhoria proposta:** definir quotas e limites de frequência/concorrência,
monitorar espaço livre e estabelecer retenção/limpeza. Se houver exposição
externa, aplicar também limites no proxy ou na infraestrutura de entrada.
Esses controles devem complementar, não substituir, a validação do backend.

**Referências:** [documents.controller.js](../../backend/src/controllers/documents.controller.js#L5),
[documents.repository.js](../../backend/src/repositories/documents.repository.js#L4).

### P2 — Reinícios deixam arquivos sem metadados e impedem múltiplas instâncias

**Categoria:** arquitetura / confiabilidade  
**Situação:** comportamento documentado e intencional no protótipo.

Os metadados são guardados em um `Map` na memória do processo, enquanto os
arquivos são gravados em disco. Após reinício, os registros deixam de existir,
mas os arquivos permanecem. Não há índice persistente nem rotina de
reconciliação para encontrar e remover arquivos órfãos. Além disso, processos
separados têm mapas independentes, de modo que uma instância não reconhece
documentos registrados por outra.

A perda dos metadados após reinício está prevista na especificação. O acúmulo
de arquivos e a incompatibilidade com execução horizontal são consequências
que precisam ser consideradas na operação.

**Melhoria proposta:** para evolução além do protótipo, persistir metadados em
banco e criar uma rotina de reconciliação entre registros e arquivos. Enquanto
a persistência em memória for requisito, documentar a execução como instância
única e definir como o armazenamento local será limpo.

**Referências:** [documents.repository.js](../../backend/src/repositories/documents.repository.js#L5),
[dms-spec.md](./dms-spec.md#L51),
[README.md](../../README.md).

### P2 — Resolução de caminho depende de invariantes internas não verificadas

**Categoria:** segurança / endurecimento preventivo  
**Situação:** não foi identificado path traversal explorável pelo fluxo HTTP atual.

O upload atribui ao arquivo um nome interno UUID gerado no servidor; o nome
original não é usado como caminho. No download, o identificador da rota busca
os metadados e o caminho é derivado do `storageFilename` interno. O teste de
upload também envia campos `id`, `owner` e `storageFilename` adulterados e
verifica que esses valores não controlam o registro.

Apesar dessas proteções, `getStoragePath` simplesmente junta o diretório de
armazenamento ao argumento recebido. A segurança atual depende de que todos os
chamadores e dados persistidos respeitem a origem e o formato esperados desse
argumento. Uma mudança futura, corrupção de metadados ou novo chamador pode
quebrar essa premissa.

**Melhoria proposta:** validar o nome interno no repositório conforme o formato
esperado (UUID) e verificar que o caminho resolvido permanece sob a pasta de
armazenamento. Continuar sem aceitar caminhos ou nomes internos fornecidos
diretamente pelo cliente.

**Referências:** [documents.controller.js](../../backend/src/controllers/documents.controller.js#L11),
[documents.service.js](../../backend/src/services/documents.service.js#L53),
[documents.repository.js](../../backend/src/repositories/documents.repository.js#L12),
[documents.test.js](../../backend/test/documents.test.js#L49).

### P2 — Listagem sem paginação cresce em memória e custo de renderização

**Categoria:** escalabilidade / desempenho.

O repositório filtra todos os registros em memória; o serviço ordena a coleção
completa e a API devolve todos os metadados numa resposta. O frontend renderiza
uma linha por documento. O custo de memória, ordenação, transferência e
renderização cresce com o número de documentos.

**Melhoria proposta:** introduzir paginação ou cursor e limitar o número de
itens por resposta. Com persistência, executar filtro e ordenação na camada de
persistência. No frontend, carregar páginas em vez de montar a lista completa.

**Referências:** [documents.repository.js](../../backend/src/repositories/documents.repository.js#L31),
[documents.service.js](../../backend/src/services/documents.service.js#L38),
[DocumentList.jsx](../../frontend/src/components/DocumentList.jsx#L34).

### P2 — Contrato da API de sucesso não é validado pelo frontend

**Categoria:** robustez / integração.

O serviço frontend confia que uma resposta HTTP bem-sucedida contém JSON no
formato esperado. Ele desestrutura `documents` e `document` sem validar presença
ou tipo dos campos. Uma resposta incompatível pode causar erro posterior em
componentes, em vez de produzir uma falha de integração clara e controlada.

**Melhoria proposta:** validar os campos essenciais na fronteira do cliente e
reportar erro de contrato com mensagem compreensível. Manter os contratos da
API documentados e cobertos por testes.

**Referências:** [api.js](../../frontend/src/services/api.js#L16),
[DocumentList.jsx](../../frontend/src/components/DocumentList.jsx#L34).

### P3 — Serviço atua como pass-through para preparação do filesystem

**Categoria:** arquitetura / separação de responsabilidades.

O controller configura o Multer e usa `service.prepareStorage()` como destino.
O serviço, por sua vez, reexporta essa função do repositório. Assim, uma
operação de infraestrutura atravessa a camada de serviço sem regra de negócio
e o controller conhece detalhes de armazenamento.

**Melhoria proposta:** manter a configuração multipart na borda HTTP, mas
encapsular a configuração e as regras de armazenamento num componente adequado.
Evitar que o serviço de domínio funcione apenas como pass-through do
repositório.

**Referências:** [documents.controller.js](../../backend/src/controllers/documents.controller.js#L5),
[documents.service.js](../../backend/src/services/documents.service.js#L58).

### P3 — Limite de upload duplicado entre frontend e backend

**Categoria:** duplicação / consistência.

O valor de 10 MiB é declarado tanto no serviço backend quanto no componente
frontend. A validação do servidor é a proteção efetiva; a verificação no
frontend serve principalmente para antecipar feedback. Como os valores são
mantidos separadamente, uma mudança pode deixar a interface e a API com limites
divergentes.

**Melhoria proposta:** manter o backend como autoridade e centralizar o valor
compartilhável quando a estrutura do projeto permitir, ou adicionar uma
verificação automatizada que assegure a igualdade dos limites. Não depender da
validação do navegador para segurança.

**Referências:** [documents.service.js](../../backend/src/services/documents.service.js#L5),
[UploadComponent.jsx](../../frontend/src/components/UploadComponent.jsx#L4).

### P3 — Cobertura de testes frontend enfatiza marcação estática, não interações

**Categoria:** qualidade / testabilidade.

Os testes de componentes verificam principalmente a saída de renderização
estática. Não exercitam o fluxo assíncrono de envio, estados durante a
requisição, retry, erros de download ou o ciclo de criação/liberação do Blob.
O teste geral do app backend verifica apenas que o Express foi exportado; os
fluxos de documentos, por outro lado, têm cobertura mais ampla em outro arquivo
de teste.

**Melhoria proposta:** adicionar testes de interação para os estados de sucesso
e erro de upload e download, retry e chamadas assíncronas. Manter os testes de
integração da API para comportamentos de armazenamento e autorização.

**Referências:** [components.test.js](../../frontend/test/components.test.js#L1),
[app.test.js](../../backend/test/app.test.js#L1),
[documents.test.js](../../backend/test/documents.test.js#L1).

## Riscos analisados sem evidência de exploração direta

- **Path traversal via nome original:** não observado. O nome original é
  metadado e nome de anexo; o arquivo salvo usa nome interno gerado pelo servidor.
- **Path traversal via parâmetro de download:** não observado. O parâmetro
  seleciona um registro e não é usado diretamente como caminho do filesystem.
- **Tipo de arquivo:** o sistema aceita qualquer tipo, conforme a especificação.
  O download é enviado como anexo `application/octet-stream`; não foi identificado
  um fluxo que sirva o conteúdo enviado como página executável pelo DMS.
  Arquivos maliciosos ainda podem representar risco quando baixados e abertos
  fora do sistema, conforme o contexto de uso.

## Sequência recomendada de evolução

1. Não expor o protótipo a documentos reais sem resolver identidade e autorização.
2. Definir quotas, limites de frequência/concorrência e monitoramento do disco.
3. Endurecer a resolução do caminho interno e adicionar testes de rejeição de
   nomes inválidos e caminhos fora da pasta de armazenamento.
4. Definir estratégia de persistência/reconciliação antes de operar com
   reinícios frequentes ou mais de uma instância.
5. Adicionar paginação e validar contratos de sucesso no frontend.
6. Cobrir interações assíncronas do frontend e manter sob teste os limites e
   contratos compartilhados.

## Limites da análise

Esta revisão foi baseada no código e nos testes presentes no repositório no
momento indicado. Não inclui análise dinâmica em ambiente de produção,
configuração de infraestrutura/proxy, dependências transitivas, modelo de
ameaças formal ou requisitos regulatórios. Os achados devem ser reavaliados
quando o escopo de autenticação, persistência e exposição da aplicação mudar.
