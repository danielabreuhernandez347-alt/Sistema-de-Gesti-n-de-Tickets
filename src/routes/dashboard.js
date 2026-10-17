const express = require('express');
const db = require('../db');
const { requireLogin, esStaff } = require('../auth');

const router = express.Router();

router.get('/', requireLogin, async (req, res) => {
  const u = req.session.usuario;
  // El solicitante solo ve números de sus propios tickets.
  const filtro = esStaff(u) ? '' : 'WHERE t.id_solicitante = ?';
  const params = esStaff(u) ? [] : [u.id];

  const porEstado = await db.query(
    `SELECT estado, COUNT(*) AS total FROM ticket t ${filtro} GROUP BY estado`, params);
  const porPrioridad = await db.query(
    `SELECT prioridad, COUNT(*) AS total FROM ticket t ${filtro} GROUP BY prioridad`, params);
  const [mes] = await db.query(
    `SELECT
       SUM(YEAR(fecha_creacion) = YEAR(CURDATE()) AND MONTH(fecha_creacion) = MONTH(CURDATE())) AS creados_mes,
       SUM(fecha_cierre IS NOT NULL AND YEAR(fecha_cierre) = YEAR(CURDATE()) AND MONTH(fecha_cierre) = MONTH(CURDATE())) AS cerrados_mes,
       COUNT(*) AS total
     FROM ticket t ${filtro}`, params);
  const recientes = await db.query(
    `SELECT t.idticket, t.titulo, t.estado, t.prioridad, t.fecha_creacion,
            s.nombre AS solicitante, a.nombre AS agente, c.nombre_categoria AS categoria
     FROM ticket t
     JOIN usuarios s ON s.idusuarios = t.id_solicitante
     LEFT JOIN usuarios a ON a.idusuarios = t.id_agente
     JOIN categoria c ON c.idcategoria = t.id_categoria
     ${filtro}
     ORDER BY t.fecha_creacion DESC LIMIT 5`, params);

  const estados = { abierto: 0, en_proceso: 0, resuelto: 0, cerrado: 0 };
  porEstado.forEach((r) => { estados[r.estado] = r.total; });
  const prioridades = { baja: 0, media: 0, alta: 0, critica: 0 };
  porPrioridad.forEach((r) => { prioridades[r.prioridad] = r.total; });

  res.render('dashboard', {
    titulo: 'Inicio',
    estados,
    prioridades,
    total: mes.total || 0,
    creadosMes: Number(mes.creados_mes || 0),
    cerradosMes: Number(mes.cerrados_mes || 0),
    recientes,
  });
});

module.exports = router;
