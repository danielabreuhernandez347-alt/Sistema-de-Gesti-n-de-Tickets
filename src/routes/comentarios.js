// Comentarios dentro de un ticket (conversación entre solicitante y técnico)
const express = require('express');
const db = require('../db');
const { requireLogin, esStaff } = require('../auth');

const router = express.Router();

router.post('/tickets/:id/comentarios', requireLogin, async (req, res) => {
  const u = req.session.usuario;
  const [ticket] = await db.query('SELECT idticket, id_solicitante FROM ticket WHERE idticket = ?', [req.params.id]);
  if (!ticket) return res.status(404).render('error', { titulo: 'No encontrado', mensaje: 'El ticket no existe.' });
  if (!esStaff(u) && ticket.id_solicitante !== u.id) {
    return res.status(403).render('error', { titulo: 'Acceso denegado', mensaje: 'Solo puedes comentar en tus propios tickets.' });
  }
  const mensaje = String(req.body.mensaje || '').trim();
  if (!mensaje) {
    req.session.flash = { tipo: 'error', texto: 'El comentario no puede estar vacío.' };
    return res.redirect(`/tickets/${ticket.idticket}`);
  }
  await db.query('INSERT INTO comentarios (id_ticket, id_usuario, mensaje) VALUES (?, ?, ?)', [ticket.idticket, u.id, mensaje]);
  req.session.flash = { tipo: 'ok', texto: 'Comentario agregado.' };
  res.redirect(`/tickets/${ticket.idticket}#comentarios`);
});

router.post('/comentarios/:id/eliminar', requireLogin, async (req, res) => {
  const u = req.session.usuario;
  const [comentario] = await db.query('SELECT * FROM comentarios WHERE id_comentarios = ?', [req.params.id]);
  if (!comentario) return res.status(404).render('error', { titulo: 'No encontrado', mensaje: 'El comentario no existe.' });
  if (u.rol !== 'admin' && comentario.id_usuario !== u.id) {
    return res.status(403).render('error', { titulo: 'Acceso denegado', mensaje: 'Solo puedes eliminar tus propios comentarios.' });
  }
  await db.query('DELETE FROM comentarios WHERE id_comentarios = ?', [comentario.id_comentarios]);
  req.session.flash = { tipo: 'ok', texto: 'Comentario eliminado.' };
  res.redirect(`/tickets/${comentario.id_ticket}#comentarios`);
});

module.exports = router;
