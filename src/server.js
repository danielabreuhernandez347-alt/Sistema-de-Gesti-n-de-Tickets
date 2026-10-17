require('dotenv').config({ quiet: true });
const app = require('./app');
const db = require('./db');

const PORT = Number(process.env.PORT || 3000);

(async () => {
  try {
    const info = await db.verificarConexion();
    console.log(`Conexión persistente establecida con la base de datos "${info.bd}" (MariaDB ${info.version}).`);
  } catch (err) {
    console.error('No se pudo conectar a la base de datos:', err.message);
    console.error('Revisa el archivo .env (DB_HOST/DB_SOCKET, DB_USER, DB_PASSWORD, DB_NAME).');
    process.exit(1);
  }
  app.listen(PORT, () => console.log(`Helpdesk escuchando en http://localhost:${PORT}`));
})();
