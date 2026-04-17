function salud() {
  return { status: 'ok' };
}

function saludo(nombre) {
  return { mensaje: `Hola, ${nombre || 'mundo'}!` };
}

module.exports = { salud, saludo };
