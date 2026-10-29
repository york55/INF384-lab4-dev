const Database = require('better-sqlite3');

const RUTA_POR_DEFECTO = '/tmp/wallet.db';

const SEMILLA = [
  ['ana', 100000],
  ['beto', 50000],
  ['carla', 75000],
  ['diego', 30000],
  ['elena', 120000],
];

let abierta = null;

function abrir(ruta) {
  const db = new Database(ruta);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id    TEXT PRIMARY KEY,
      saldo INTEGER NOT NULL CHECK (saldo >= 0)
    );
    CREATE TABLE IF NOT EXISTS movimientos (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      origen  TEXT NOT NULL REFERENCES usuarios(id),
      destino TEXT NOT NULL REFERENCES usuarios(id),
      monto   INTEGER NOT NULL CHECK (monto > 0),
      fecha   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);
  const { total } = db.prepare('SELECT COUNT(*) AS total FROM usuarios').get();
  if (total === 0) {
    const insertar = db.prepare('INSERT INTO usuarios (id, saldo) VALUES (?, ?)');
    db.transaction(() => SEMILLA.forEach((fila) => insertar.run(...fila)))();
  }
  return db;
}

function crearStore(db) {
  const leerUsuario = db.prepare('SELECT id, saldo FROM usuarios WHERE id = ?');
  const leerMovimientos = db.prepare(`
    SELECT id, origen, destino, monto, fecha
    FROM movimientos
    WHERE origen = ? OR destino = ?
    ORDER BY id DESC
    LIMIT 50
  `);
  const debitar = db.prepare('UPDATE usuarios SET saldo = saldo - ? WHERE id = ?');
  const acreditar = db.prepare('UPDATE usuarios SET saldo = saldo + ? WHERE id = ?');
  const registrar = db.prepare('INSERT INTO movimientos (origen, destino, monto) VALUES (?, ?, ?)');

  const transferir = db.transaction((origen, destino, monto) => {
    debitar.run(monto, origen);
    //acreditar.run(monto, destino);
    return Number(registrar.run(origen, destino, monto).lastInsertRowid);
  });

  return {
    usuario: (id) => leerUsuario.get(id),
    movimientos: (id) => leerMovimientos.all(id, id),
    transferir,
  };
}

function obtenerStore() {
  const ruta = process.env.DB_PATH || RUTA_POR_DEFECTO;
  if (!abierta || abierta.ruta !== ruta) {
    if (abierta) {
      abierta.db.close();
    }
    const db = abrir(ruta);
    abierta = { ruta, db, store: crearStore(db) };
  }
  return abierta.store;
}

module.exports = { obtenerStore };
