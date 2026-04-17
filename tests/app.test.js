const request = require('supertest');
const { createApp } = require('../src/index');

const app = createApp();

test('GET /health responde 200', async () => {
  const res = await request(app).get('/health');
  expect(res.statusCode).toBe(200);
  expect(res.body).toEqual({ status: 'ok' });
});

test('GET /api/saludo responde con mensaje', async () => {
  const res = await request(app).get('/api/saludo?nombre=Daniel');
  expect(res.statusCode).toBe(200);
  expect(res.body.mensaje).toBe('Hola, Daniel!');
});

test('POST /api/echo devuelve el body enviado', async () => {
  const res = await request(app)
    .post('/api/echo')
    .send({ curso: 'AUY1104' });
  expect(res.statusCode).toBe(201);
  expect(res.body).toEqual({ curso: 'AUY1104' });
});
