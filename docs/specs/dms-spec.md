# Especificação - Document Management System

Esta especificação descreve o comportamento esperado para a primeira versão
do sistema. Os requisitos e contratos abaixo orientam implementação futura; não
significam que os endpoints já estejam implementados.

## 1. Objetivo

Permitir que um usuário envie, liste e baixe seus documentos por meio de uma
aplicação web que armazena arquivos localmente e mantém seus metadados em
memória.

## 2. Escopo

### Dentro do escopo

- Enviar um documento por requisição, usando multipart/form-data.
- Listar os documentos pertencentes ao usuário atual.
- Baixar um documento pertencente ao usuário atual pelo identificador.
- Armazenar arquivos no filesystem local em `backend/storage`.
- Usar um usuário fixo de demonstração como identidade inicial.
- Acessar a API pelo prefixo `/api` no frontend, encaminhado pelo proxy do Vite.

### Fora do escopo

- Autenticação, cadastro de usuários ou seleção de identidade pelo cliente.
- Armazenamento externo ou em nuvem.
- Persistência dos metadados em banco de dados ou entre reinícios.
- Versionamento de documentos.
- Restrições por tipo MIME ou extensão do arquivo.
- Exclusão, atualização ou compartilhamento de documentos.

### Restrições operacionais do protótipo

O backend deve operar como instância única: processos separados não compartilham
os metadados. A identidade de demonstração é compartilhada por todos os clientes,
portanto a aplicação não deve receber documentos reais ou confidenciais nem ser
exposta a clientes não confiáveis.

O limite por arquivo não limita o consumo total de disco. A operação deve
monitorar o espaço disponível e prever limpeza manual dos arquivos de
demonstração, com o backend parado e cópia prévia do que precisar ser preservado.
Após encerrar o processo, os arquivos restantes não têm metadados recuperáveis.
Não há limpeza automática nem suporte a múltiplas instâncias nesta fase.
O procedimento de limpeza está descrito no [README](../../README.md#operação-do-protótipo).

## 3. Requisitos funcionais

| ID    | Requisito |
| ----- | --------- |
| RF-01 | O usuário pode enviar um arquivo pelo campo multipart `file`. |
| RF-02 | O upload aceita qualquer tipo de arquivo e limita o tamanho a 10 MiB (10.485.760 bytes). |
| RF-03 | Após um upload bem-sucedido, o sistema registra os metadados e associa o documento ao usuário fixo de demonstração. |
| RF-04 | O usuário pode listar os metadados de seus documentos, ordenados por data de upload decrescente. |
| RF-05 | O usuário pode baixar um documento pelo seu identificador; a resposta deve ser um anexo com o nome original do arquivo. |
| RF-06 | Um identificador inexistente ou um documento pertencente a outro usuário resulta em `404 Not Found`. |
| RF-07 | A API não aceita do cliente a definição do proprietário nem expõe o identificador interno do arquivo ou seu caminho local. |
| RF-08 | Se o upload falhar depois de gravar o arquivo, o arquivo parcial ou não registrado deve ser removido quando possível, e o erro deve ser comunicado ao cliente. |

## 4. Requisitos não funcionais

| ID     | Requisito |
| ------ | --------- |
| RNF-01 | Os arquivos devem ser gravados no filesystem local em `backend/storage`, usando Multer com `diskStorage`. |
| RNF-02 | Os metadados dos documentos devem permanecer em memória nesta fase. Após reiniciar o backend, os registros deixam de estar disponíveis, ainda que arquivos possam permanecer no disco. |
| RNF-03 | O backend deve seguir o fluxo `routes -> controllers -> services -> repositories`; as camadas internas não devem depender das externas. |
| RNF-04 | O frontend deve consumir a API usando `fetch` pelo prefixo `/api`, com encaminhamento pelo proxy do Vite. |
| RNF-05 | `PORT` é a única variável de ambiente de configuração prevista nesta especificação. |
| RNF-06 | O limite do upload é 10 MiB por arquivo. Arquivos de qualquer tipo são aceitos dentro desse limite. |
| RNF-07 | Respostas de erro da API devem usar JSON, exceto em uma resposta de download bem-sucedida, que contém o arquivo binário. |
| RNF-08 | Respostas da API não devem revelar caminhos do filesystem, detalhes internos de exceções ou nomes internos de armazenamento. |

## 5. Modelo de dados (metadados do documento)

| Campo        | Tipo   | Descrição |
| ------------ | ------ | --------- |
| `id`         | string | Identificador público e único do documento, opaco para o cliente. |
| `originalName` | string | Nome original do arquivo enviado, usado como nome do anexo no download. |
| `size`       | number | Tamanho do arquivo em bytes. |
| `uploadedAt` | string | Data e hora do upload em formato ISO 8601. |
| `owner`      | string | Identificador do usuário fixo de demonstração que enviou o arquivo. |
| `storageFilename` | string | Identificador interno gerado para localizar o arquivo em `backend/storage`; nunca deve ser incluído nas respostas da API. |

`storageFilename` deve ser gerado pela aplicação, sem depender do nome original
fornecido pelo cliente. O caminho local completo é resolvido internamente a
partir da pasta de armazenamento e desse identificador; não é um campo da API.
O cliente não pode escolher `id`, `owner` ou `storageFilename`.

## 6. Contratos de API

Os caminhos nesta seção são relativos à API do backend. No frontend, devem ser
solicitados com o prefixo `/api` (por exemplo, `/api/documents`), encaminhado
pelo proxy do Vite.

### Formato de erro comum

Erros retornados pela API usam `application/json` com a forma:

```json
{
  "error": {
    "code": "FILE_REQUIRED",
    "message": "Envie um arquivo no campo file."
  }
}
```

`code` é estável e adequado para tratamento pelo cliente. `message` é uma
mensagem legível em português. A resposta não inclui stack trace nem caminhos
locais.

### POST /upload

- Entrada: `multipart/form-data` com um arquivo no campo obrigatório `file`.
- Regras: aceita qualquer tipo de arquivo até 10 MiB; o proprietário é sempre
  o usuário fixo de demonstração, não um valor recebido do cliente.
- Sucesso: `201 Created`, `application/json`, com os metadados públicos:

  ```json
  {
    "document": {
      "id": "identificador-opaco",
      "originalName": "relatorio.pdf",
      "size": 12345,
      "uploadedAt": "2026-01-15T10:30:00.000Z",
      "owner": "demo-user"
    }
  }
  ```

- Erros:
  - `400 Bad Request`, código `FILE_REQUIRED`, se o campo `file` estiver
    ausente.
  - `413 Payload Too Large`, código `FILE_TOO_LARGE`, se o arquivo exceder
    10 MiB.
  - `500 Internal Server Error`, código `UPLOAD_FAILED`, se não for possível
    armazenar o arquivo ou registrar os metadados.

### GET /documents

- Entrada: sem corpo. A identidade é o usuário fixo de demonstração.
- Sucesso: `200 OK`, `application/json`, com uma lista de metadados públicos
  ordenada por `uploadedAt` decrescente:

  ```json
  {
    "documents": [
      {
        "id": "identificador-opaco",
        "originalName": "relatorio.pdf",
        "size": 12345,
        "uploadedAt": "2026-01-15T10:30:00.000Z",
        "owner": "demo-user"
      }
    ]
  }
  ```

- Se não houver documentos, `documents` é uma lista vazia.
- Erro: `500 Internal Server Error`, código `DOCUMENT_LIST_FAILED`, se não for
  possível obter os metadados.

### GET /documents/:id/download

- Entrada: identificador público do documento no parâmetro `id`.
- Sucesso: `200 OK`, conteúdo binário do arquivo, com
  `Content-Disposition: attachment` e o nome original do arquivo. O tipo da
  resposta pode ser `application/octet-stream`, pois qualquer tipo de arquivo
  é aceito.
- Erro: `404 Not Found`, código `DOCUMENT_NOT_FOUND`, tanto para identificador
  inexistente quanto para documento que não pertença ao usuário atual.
- Erro: `500 Internal Server Error`, código `DOWNLOAD_FAILED`, se o arquivo
  registrado não puder ser lido por uma falha diferente de ausência do
  documento.

## 7. Decisões arquiteturais

- O backend usa Node.js e Express em CommonJS, organizado nas camadas
  `routes`, `controllers`, `services` e `repositories`, nessa direção de
  dependência.
- As rotas declaram os endpoints e delegam aos controllers; controllers
  tratam entrada, saída HTTP e validação básica; services concentram as regras
  de negócio; repositories gerenciam os metadados em memória e o acesso aos
  arquivos locais.
- Multer com `diskStorage` grava os arquivos em `backend/storage`. A aplicação
  gera um nome interno de armazenamento e não usa diretamente o nome original
  como caminho no disco.
- Os metadados são mantidos em memória. Essa escolha é temporária e implica
  perda dos registros em cada reinício; persistência não faz parte desta
  versão.
- Sem autenticação, todas as requisições usam o mesmo usuário fixo de
  demonstração. O servidor define o proprietário; o cliente não pode
  impersoná-lo enviando um campo `owner`.
- O frontend usa React com componentes funcionais e Hooks; as chamadas ao
  backend usam `fetch` pelo prefixo `/api` e o proxy configurado no Vite.
- Não são introduzidas variáveis de ambiente além de `PORT`.

## 8. Plano de execução

As etapas abaixo são um roadmap futuro; não fazem parte da implementação desta
especificação.

1. Implementar o armazenamento local com Multer `diskStorage`, limite de
   10 MiB, nome interno gerado e metadados em memória.
2. Implementar `POST /upload`, validando o campo `file`, associando o usuário
   de demonstração e limpando o arquivo caso o registro falhe.
3. Implementar `GET /documents` com filtro por proprietário e ordenação por
   data decrescente.
4. Implementar `GET /documents/:id/download` com verificação de existência e
   ownership, resposta como anexo e tratamento de erros.
5. Implementar no frontend os fluxos de envio, listagem e download via
   `/api`, com apresentação de estados de sucesso e erro.
6. Integrar e validar os fluxos completos, incluindo arquivo ausente, limite
   excedido, documento não encontrado e falhas de leitura ou gravação.
