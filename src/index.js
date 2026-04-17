const express = require('express');

function createApp() {
  const app = express();
  app.use(express.json());

  const { salud, saludo } = require('./lib/ejemplo');

  app.get('/health', (req, res) => {
    res.json(salud());
  });

  app.get('/api/saludo', (req, res) => {
    res.json(saludo(req.query.nombre));
  });

  app.post('/api/echo', (req, res) => {
    res.status(201).json(req.body);
  });

  return app;
}

if (require.main === module) {
  const app = createApp();
  app.listen(3000, () => {
    console.log('API escuchando en http://0.0.0.0:3000');
  });
}

module.exports = { createApp };
