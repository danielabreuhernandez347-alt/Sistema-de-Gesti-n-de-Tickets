// CRUD de usuarios (solo administrador)
const express = require('express');
const db = require('../db');
const { requireLogin, requireRole, hashPassword } = require('../auth');

const router = express.Router();
router.use(requireLogin, requireRole('admin'));

const ROLES = ['solicitante', 'agente', 'admin'];

function leerFormulario(body) {
  return {
    nombre: String(body.nombre || '').trim(),
    correo: String(body.correo || '').trim().toLowerCase(),
    rol: ROLES.includes(body.rol) ? body.rol : 'solicitante',
    password: String(body.password || ''),
  };
}

function validar(datos, esNuevo) {
  const errores = [];
  if (!datos.nombre) errores.push('El nombre es obligatorio.');
  if (!datos.correo || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(datos.correo)) errores.push('El correo no es válido.');
  if (datos.nombre.length > 45 || datos.correo.length > 45) errores.push('Nombre y correo deben tener máximo 45 caracteres.');
  if (esNuevo && datos.password.length < 6) errores.push('La contraseña debe tener al menos 6 caracteres.');
  if (!esNuevo && datos.password && datos.password.length < 6) errores.push('La nueva contraseña debe tener al menos 6 caracteres.');
  return errores;
}

// Listar
router.get('/', async (req, res) => {
  const usuarios = await db.query(
    `SELECT u.*,
            (SELECT COUNT(*) FROM ticket t WHERE t.id_solicitante = u.idusuarios) AS tickets_creados,
            (SELECT COUNT(*) FROM ticket t WHERE t.id_agente = u.idusuarios) AS tickets_asignados
     FROM usuarios u ORDER BY u.nombre`);
  res.render('usuarios/index', { titulo: 'Usuarios', usuarios });
});

// Crear
router.get('/nuevo', (req, res) => {
  res.render('usuarios/form', { titulo: 'Nuevo usuario', item: { rol: 'solicitante' }, errores: [], roles: ROLES, esNuevo: true });
});

router.post('/', async (req, res) => {
  const datos = leerFormulario(req.body);
  const errores = validar(datos, true);
  if (errores.length) {
    return res.status(400).render('usuarios/form', { titulo: 'Nuevo usuario', item: datos, errores, roles: ROLES, esNuevo: true });
  }
  try {
    await db.query('INSERT INTO usuarios (nombre, correo, password_has, rol) VALUES (?, ?, ?, ?)',
      [datos.nombre, datos.correo, hashPassword(datos.password), datos.rol]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).render('usuarios/form', { titulo: 'Nuevo usuario', item: datos, errores: ['Ya existe un usuario con ese correo.'], roles: ROLES, esNuevo: true });
    }
    throw err;
  }
  req.session.flash = { tipo: 'ok', texto: 'Usuario creado correctamente.' };
  res.redirect('/usuarios');
});

// Editar
router.get('/:id/editar', async (req, res) => {
  const [item] = await db.query('SELECT * FROM usuarios WHERE idusuarios = ?', [req.params.id]);
  if (!item) return res.status(404).render('error', { titulo: 'No encontrado', mensaje: 'El usuario no existe.' });
  res.render('usuarios/form', { titulo: 'Editar usuario', item, errores: [], roles: ROLES, esNuevo: false });
});

router.post('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const datos = leerFormulario(req.body);
  const errores = validar(datos, false);
  const item = { ...datos, idusuarios: id };
  if (errores.length) {
    return res.status(400).render('usuarios/form', { titulo: 'Editar usuario', item, errores, roles: ROLES, esNuevo: false });
  }
  try {
    if (datos.password) {
      await db.query('UPDATE usuarios SET nombre = ?, correo = ?, rol = ?, password_has = ? WHERE idusuarios = ?',
        [datos.nombre, datos.correo, datos.rol, hashPassword(datos.password), id]);
    } else {
      await db.query('UPDATE usuarios SET nombre = ?, correo = ?, rol = ? WHERE idusuarios = ?',
        [datos.nombre, datos.correo, datos.rol, id]);
    }
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).render('usuarios/form', { titulo: 'Editar usuario', item, errores: ['Ya existe otro usuario con ese correo.'], roles: ROLES, esNuevo: false });
    }
    throw err;
  }
  if (id === req.session.usuario.id) {
    req.session.usuario = { ...req.session.usuario, nombre: datos.nombre, correo: datos.correo, rol: datos.rol };
  }
  req.session.flash = { tipo: 'ok', texto: 'Usuario actualizado.' };
  res.redirect('/usuarios');
});

// Eliminar
router.post('/:id/eliminar', async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.session.usuario.id) {
    req.session.flash = { tipo: 'error', texto: 'No puedes eliminar tu propio usuario.' };
    return res.redirect('/usuarios');
  }
  try {
    await db.query('DELETE FROM usuarios WHERE idusuarios = ?', [id]);
    req.session.flash = { tipo: 'ok', texto: 'Usuario eliminado.' };
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.errno === 1451) {
      req.session.flash = { tipo: 'error', texto: 'No se puede eliminar: el usuario tiene tickets o comentarios asociados.' };
    } else {
      throw err;
    }
  }
  res.redirect('/usuarios');
});

module.exports = router;
