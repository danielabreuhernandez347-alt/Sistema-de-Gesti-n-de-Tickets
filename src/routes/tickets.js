// CRUD de tickets de soporte
const express = require('express');
const db = require('../db');
const { requireLogin, requireRole, esStaff } = require('../auth');

const router = express.Router();
router.use(requireLogin);

const ESTADOS = ['abierto', 'en_proceso', 'resuelto', 'cerrado'];
const PRIORIDADES = ['baja', 'media', 'alta', 'critica'];

// Preguntas rápidas que se responden al crear un ticket (se guardan en la tabla "preguntas").
const PREGUNTAS = [
  { clave: 'p1', texto: '¿Puede seguir trabajando mientras se resuelve?', opciones: ['Sí, con dificultad', 'No, estoy bloqueado/a'] },
  { clave: 'p2', texto: '¿A cuántas personas afecta el problema?', opciones: ['Solo a mí', 'A mi área', 'A toda la empresa'] },
];

const CONSULTA_BASE = `
  SELECT t.*, s.nombre AS solicitante, s.correo AS correo_solicitante,
         a.nombre AS agente, c.nombre_categoria AS categoria
  FROM ticket t
  JOIN usuarios s ON s.idusuarios = t.id_solicitante
  LEFT JOIN usuarios a ON a.idusuarios = t.id_agente
  JOIN categoria c ON c.idcategoria = t.id_categoria`;

async function cargarCatalogos() {
  const categorias = await db.query('SELECT * FROM categoria ORDER BY nombre_categoria');
  const agentes = await db.query("SELECT idusuarios, nombre FROM usuarios WHERE rol IN ('agente','admin') ORDER BY nombre");
  const solicitantes = await db.query('SELECT idusuarios, nombre FROM usuarios ORDER BY nombre');
  return { categorias, agentes, solicitantes };
}

async function obtenerTicket(id) {
  const [ticket] = await db.query(`${CONSULTA_BASE} WHERE t.idticket = ?`, [id]);
  return ticket;
}

function puedeVer(usuario, ticket) {
  return esStaff(usuario) || ticket.id_solicitante === usuario.id;
}

function leerFormulario(body, usuario) {
  const datos = {
    titulo: String(body.titulo || '').trim(),
    descripcion: String(body.descripcion || '').trim(),
    id_categoria: Number(body.id_categoria) || null,
    prioridad: PRIORIDADES.includes(body.prioridad) ? body.prioridad : 'media',
    estado: ESTADOS.includes(body.estado) ? body.estado : 'abierto',
    id_solicitante: usuario.id,
    id_agente: null,
    respuestas: {},
  };
  if (esStaff(usuario)) {
    if (Number(body.id_solicitante)) datos.id_solicitante = Number(body.id_solicitante);
    datos.id_agente = Number(body.id_agente) || null;
  }
  PREGUNTAS.forEach((p) => { datos.respuestas[p.clave] = String(body[p.clave] || '').trim(); });
  return datos;
}

function validar(datos) {
  const errores = [];
  if (!datos.titulo) errores.push('El título es obligatorio.');
  if (datos.titulo.length > 150) errores.push('El título debe tener máximo 150 caracteres.');
  if (!datos.descripcion) errores.push('Describe el problema.');
  if (!datos.id_categoria) errores.push('Selecciona una categoría.');
  return errores;
}

function datosVista(extra) {
  return { ESTADOS, PRIORIDADES, PREGUNTAS, ...extra };
}

// Listar con búsqueda y filtros
router.get('/', async (req, res) => {
  const u = req.session.usuario;
  const q = String(req.query.q || '').trim();
  const estado = ESTADOS.includes(req.query.estado) ? req.query.estado : '';
  const prioridad = PRIORIDADES.includes(req.query.prioridad) ? req.query.prioridad : '';

  const condiciones = [];
  const params = [];
  if (!esStaff(u)) { condiciones.push('t.id_solicitante = ?'); params.push(u.id); }
  if (q) { condiciones.push('(t.titulo LIKE ? OR t.descripcion LIKE ? OR s.nombre LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (estado) { condiciones.push('t.estado = ?'); params.push(estado); }
  if (prioridad) { condiciones.push('t.prioridad = ?'); params.push(prioridad); }
  const where = condiciones.length ? ` WHERE ${condiciones.join(' AND ')}` : '';

  const tickets = await db.query(`${CONSULTA_BASE}${where} ORDER BY t.fecha_creacion DESC`, params);
  res.render('tickets/index', datosVista({ titulo: 'Tickets', tickets, q, estado, prioridad }));
});

// Crear
router.get('/nuevo', async (req, res) => {
  const catalogos = await cargarCatalogos();
  const item = { prioridad: 'media', estado: 'abierto', id_solicitante: req.session.usuario.id, respuestas: {} };
  res.render('tickets/form', datosVista({ titulo: 'Nuevo ticket', item, errores: [], esNuevo: true, ...catalogos }));
});

router.post('/', async (req, res) => {
  const u = req.session.usuario;
  const datos = leerFormulario(req.body, u);
  const errores = validar(datos);
  if (errores.length) {
    const catalogos = await cargarCatalogos();
    return res.status(400).render('tickets/form', datosVista({ titulo: 'Nuevo ticket', item: datos, errores, esNuevo: true, ...catalogos }));
  }
  const resultado = await db.query(
    `INSERT INTO ticket (titulo, descripcion, estado, prioridad, id_solicitante, id_agente, id_categoria)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [datos.titulo, datos.descripcion, datos.estado, datos.prioridad, datos.id_solicitante, datos.id_agente, datos.id_categoria]);
  const idTicket = resultado.insertId;
  for (const p of PREGUNTAS) {
    if (datos.respuestas[p.clave]) {
      await db.query('INSERT INTO preguntas (id_ticket, pregunta, opcion_seleccionada) VALUES (?, ?, ?)',
        [idTicket, p.texto, datos.respuestas[p.clave]]);
    }
  }
  req.session.flash = { tipo: 'ok', texto: `Ticket #${idTicket} creado correctamente.` };
  res.redirect(`/tickets/${idTicket}`);
});

// Ver detalle
router.get('/:id', async (req, res) => {
  const ticket = await obtenerTicket(req.params.id);
  if (!ticket) return res.status(404).render('error', { titulo: 'No encontrado', mensaje: 'El ticket no existe.' });
  if (!puedeVer(req.session.usuario, ticket)) {
    return res.status(403).render('error', { titulo: 'Acceso denegado', mensaje: 'Solo puedes ver tus propios tickets.' });
  }
  const comentarios = await db.query(
    `SELECT c.*, u.nombre AS autor, u.rol AS rol_autor
     FROM comentarios c JOIN usuarios u ON u.idusuarios = c.id_usuario
     WHERE c.id_ticket = ? ORDER BY c.fecha ASC`, [ticket.idticket]);
  const preguntas = await db.query('SELECT * FROM preguntas WHERE id_ticket = ?', [ticket.idticket]);
  const agentes = await db.query("SELECT idusuarios, nombre FROM usuarios WHERE rol IN ('agente','admin') ORDER BY nombre");
  res.render('tickets/detalle', datosVista({ titulo: `Ticket #${ticket.idticket}`, ticket, comentarios, preguntas, agentes }));
});

// Editar
router.get('/:id/editar', async (req, res) => {
  const ticket = await obtenerTicket(req.params.id);
  if (!ticket) return res.status(404).render('error', { titulo: 'No encontrado', mensaje: 'El ticket no existe.' });
  if (!puedeVer(req.session.usuario, ticket)) {
    return res.status(403).render('error', { titulo: 'Acceso denegado', mensaje: 'Solo puedes editar tus propios tickets.' });
  }
  const catalogos = await cargarCatalogos();
  res.render('tickets/form', datosVista({ titulo: `Editar ticket #${ticket.idticket}`, item: { ...ticket, respuestas: {} }, errores: [], esNuevo: false, ...catalogos }));
});

router.post('/:id', async (req, res) => {
  const u = req.session.usuario;
  const ticket = await obtenerTicket(req.params.id);
  if (!ticket) return res.status(404).render('error', { titulo: 'No encontrado', mensaje: 'El ticket no existe.' });
  if (!puedeVer(u, ticket)) {
    return res.status(403).render('error', { titulo: 'Acceso denegado', mensaje: 'Solo puedes editar tus propios tickets.' });
  }
  const datos = leerFormulario(req.body, u);
  const errores = validar(datos);
  if (errores.length) {
    const catalogos = await cargarCatalogos();
    return res.status(400).render('tickets/form', datosVista({ titulo: `Editar ticket #${ticket.idticket}`, item: { ...datos, idticket: ticket.idticket }, errores, esNuevo: false, ...catalogos }));
  }
  if (esStaff(u)) {
    await db.query(
      `UPDATE ticket SET titulo = ?, descripcion = ?, id_categoria = ?, prioridad = ?, estado = ?, id_solicitante = ?, id_agente = ?
       WHERE idticket = ?`,
      [datos.titulo, datos.descripcion, datos.id_categoria, datos.prioridad, datos.estado, datos.id_solicitante, datos.id_agente, ticket.idticket]);
  } else {
    // El solicitante solo puede corregir la descripción de su propio ticket.
    await db.query('UPDATE ticket SET titulo = ?, descripcion = ?, id_categoria = ?, prioridad = ? WHERE idticket = ?',
      [datos.titulo, datos.descripcion, datos.id_categoria, datos.prioridad, ticket.idticket]);
  }
  req.session.flash = { tipo: 'ok', texto: 'Ticket actualizado.' };
  res.redirect(`/tickets/${ticket.idticket}`);
});

// Cambiar estado / asignar agente (acción rápida desde el detalle; solo personal de soporte)
router.post('/:id/estado', requireRole('admin', 'agente'), async (req, res) => {
  const ticket = await obtenerTicket(req.params.id);
  if (!ticket) return res.status(404).render('error', { titulo: 'No encontrado', mensaje: 'El ticket no existe.' });
  const estado = ESTADOS.includes(req.body.estado) ? req.body.estado : ticket.estado;
  const idAgente = req.body.id_agente === undefined ? ticket.id_agente : (Number(req.body.id_agente) || null);
  // El trigger de la BD actualiza fecha_cierre automáticamente según el estado.
  await db.query('UPDATE ticket SET estado = ?, id_agente = ? WHERE idticket = ?', [estado, idAgente, ticket.idticket]);
  req.session.flash = { tipo: 'ok', texto: 'Estado del ticket actualizado.' };
  res.redirect(`/tickets/${ticket.idticket}`);
});

// Eliminar (solo personal de soporte). Los comentarios y preguntas se borran en cascada.
router.post('/:id/eliminar', requireRole('admin', 'agente'), async (req, res) => {
  await db.query('DELETE FROM ticket WHERE idticket = ?', [req.params.id]);
  req.session.flash = { tipo: 'ok', texto: 'Ticket eliminado.' };
  res.redirect('/tickets');
});

module.exports = router;
