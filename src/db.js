// Conexión persistente a MariaDB mediante un pool de conexiones (mysql2).
// El pool mantiene las conexiones abiertas y las reutiliza entre peticiones,
// evitando abrir/cerrar una conexión por cada consulta.
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');

const config = {
  user: process.env.DB_USER || 'app_helpdesk',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'helpdesk_db',
  waitForConnections: true,                       // si el pool está lleno, la petición espera su turno
  connectionLimit: Number(process.env.DB_POOL || 10), // conexiones persistentes máximas
  queueLimit: 0,
  enableKeepAlive: true,                          // evita que el servidor cierre conexiones inactivas
  keepAliveInitialDelay: 10000,
  charset: 'utf8mb4',
  dateStrings: true,                              // fechas como texto 'YYYY-MM-DD HH:MM:SS'
  namedPlaceholders: false,
};

if (process.env.DB_SOCKET) {
  config.socketPath = process.env.DB_SOCKET;      // conexión local por socket Unix (servidor)
} else {
  config.host = process.env.DB_HOST || '127.0.0.1';
  config.port = Number(process.env.DB_PORT || 3306);
}

const pool = mysql.createPool(config);

/** Ejecuta una consulta y devuelve solo las filas (o el resultado del INSERT/UPDATE). */
async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/** Comprueba la conexión al arrancar la aplicación. */
async function verificarConexion() {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
    const [[info]] = await conn.query('SELECT DATABASE() AS bd, VERSION() AS version');
    return info;
  } finally {
    conn.release(); // la conexión vuelve al pool, no se cierra
  }
}

module.exports = { pool, query, verificarConexion };
