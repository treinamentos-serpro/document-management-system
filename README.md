# Document Management System com GitHub Copilot

<img src="https://octodex.github.com/images/Professortocat_v2.png" align="right" height="200px" />

Hey rafael-vital-serpro!

Mona here. I'm done preparing your exercise. Hope you enjoy! 💚

Remember, it's self-paced so feel free to take a break! ☕️

[![](https://img.shields.io/badge/Go%20to%20Exercise-%E2%86%92-1f883d?style=for-the-badge&logo=github&labelColor=197935)](https://github.com/treinamentos-serpro/document-management-system/issues/1)

---

## Backend

Na pasta `backend`, execute `npm install` e `npm start`. O servidor usa a porta
3000 por padrão; a variável de ambiente `PORT` permite alterá-la.
Execute `npm test` para rodar os testes com o runner nativo do Node.js.

Endpoints disponíveis:

- `GET /health`: verifica a saúde do servidor.
- `POST /upload`: recebe um arquivo multipart no campo `file`, de qualquer tipo,
  com tamanho máximo de 10 MiB. Retorna `201` com `{ document }`.
- `GET /documents`: retorna `{ documents }`, ordenados do mais recente para o
  mais antigo.
- `GET /documents/:id/download`: baixa o arquivo como anexo com seu nome original.

Todas as requisições usam o proprietário fixo `demo-user`, definido pelo servidor.
Os arquivos ficam em `backend/storage`, com nomes internos gerados pela aplicação,
e os metadados ficam apenas em memória: reiniciar o backend perde os registros,
mas não remove os arquivos. As respostas públicas não expõem nomes internos nem
caminhos locais. Erros retornam JSON com `{ error: { code, message } }`.
No frontend, use o prefixo `/api` para acessar essas rotas pelo proxy do Vite.

### Operação do protótipo

- Execute apenas uma instância do backend. Os metadados em memória não são
  compartilhados entre processos e não são recuperados após reiniciar.
- Use somente documentos de demonstração, sem dados reais ou confidenciais.
  Todos os clientes compartilham a identidade `demo-user` e podem acessar os
  mesmos documentos; não há autenticação nem isolamento entre clientes.
- Não exponha a API a clientes não confiáveis. O limite de 10 MiB é por arquivo,
  não uma quota de disco: não há limites agregados de armazenamento, frequência
  ou concorrência. Monitore o espaço livre no volume de `backend/storage`.
- Planeje a limpeza do armazenamento entre sessões de demonstração. Pare o
  backend e interrompa uploads e downloads antes de inspecionar
  `backend/storage`. Com o processo encerrado, os metadados daquela sessão se
  perdem; os arquivos restantes não serão recuperados pela próxima execução.
  Se houver algo a preservar, faça uma cópia antes da limpeza.
- Remova manualmente apenas os arquivos de demonstração identificados na pasta
  de armazenamento. Preserve `.gitkeep`, a própria pasta e quaisquer arquivos
  cuja origem não seja conhecida. Não execute limpeza com o backend ativo,
  pois isso pode remover arquivos ainda referenciados por documentos da sessão.

Autenticação, quotas e persistência/reconciliação precisam de uma evolução
específica antes do uso com dados reais ou de uma implantação com múltiplas
instâncias. A limpeza operacional não substitui esses controles.

## Frontend

Na pasta `frontend`, execute `npm install` e `npm run dev`. Com o backend
rodando na porta 3000, acesse `http://localhost:5173`. O proxy do Vite encaminha
as requisições `/api` para o backend.

A interface permite enviar um arquivo de qualquer tipo até 10 MiB, listar os
documentos e baixá-los com o nome original. A listagem é atualizada após cada
envio. Carregamento, sucesso e erros são apresentados na interface; se a
listagem falhar, use **Tentar novamente**.

O cliente em `frontend/src/services/api.js` centraliza as chamadas via `fetch`.
As respostas JSON de sucesso são validadas antes de chegar aos componentes;
metadados ausentes ou inválidos geram uma mensagem de erro na interface.
Execute `npm test` para testar o cliente, a renderização e as interações
assíncronas em DOM de teste (JSDOM), incluindo a igualdade do limite de upload
com o backend. Execute `npm run build` para gerar o frontend.

---

&copy; 2025 GitHub &bull; [Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/code_of_conduct.md) &bull; [MIT License](https://gh.io/mit)
