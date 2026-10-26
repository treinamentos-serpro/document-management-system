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

---

&copy; 2025 GitHub &bull; [Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/code_of_conduct.md) &bull; [MIT License](https://gh.io/mit)
