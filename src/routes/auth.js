const express = require('express');
const db = require('../db');
const { hashPassword } = require('../auth');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.usuario) return res.redirect('/');
  res.render('login', { titulo: 'Iniciar sesión', correo: '' });
});

router.post('/login', async (req, res) => {
  const correo = String(req.body.correo || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const [usuario] = await db.query('SELECT * FROM usuarios WHERE correo = ? LIMIT 1', [correo]);
  if (!usuario || usuario.password_has !== hashPassword(password)) {
    res.locals.flash = { tipo: 'error', texto: 'Correo o contraseña incorrectos.' };
    return res.status(401).render('login', { titulo: 'Iniciar sesión', correo });
  }
  req.session.usuario = { id: usuario.idusuarios, nombre: usuario.nombre, correo: usuario.correo, rol: usuario.rol };
  req.session.flash = { tipo: 'ok', texto: `Bienvenido/a, ${usuario.nombre}.` };
  res.redirect('/');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
