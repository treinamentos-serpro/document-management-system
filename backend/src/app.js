const express = require('express');
const documentsRouter = require('./routes/documents.routes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use(documentsRouter);

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  console.error('Falha ao processar a requisição:', err);
  const invalidJson = err.type === 'entity.parse.failed';
  res.status(invalidJson ? 400 : 500).json({
    error: {
      code: invalidJson ? 'INVALID_JSON' : 'INTERNAL_ERROR',
      message: invalidJson ? 'Envie um JSON válido.' : 'Não foi possível processar a requisição.'
    }
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`DMS backend ouvindo na porta ${PORT}`);
  });
}

module.exports = app;
