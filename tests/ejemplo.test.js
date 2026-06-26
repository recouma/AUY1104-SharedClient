const { salud, saludo } = require('../src/lib/ejemplo');

test('salud retorna status ok', () => {
  expect(salud()).toEqual({ status: 'FALLO_INTENCIONAL' });
});

test('saludo sin nombre retorna hola mundo', () => {
  expect(saludo()).toEqual({ mensaje: 'Hola, mundo!' });
});

test('saludo con nombre retorna hola nombre', () => {
  expect(saludo('Daniel')).toEqual({ mensaje: 'Hola, Daniel!' });
});
