// CRUD de categorías (administrador y agentes)
const express = require('express');
const db = require('../db');
const { requireLogin, requireRole } = require('../auth');

const router = express.Router();
router.use(requireLogin, requireRole('admin', 'agente'));

function leerFormulario(body) {
  return {
    nombre_categoria: String(body.nombre_categoria || '').trim(),
    descripcion: String(body.descripcion || '').trim(),
  };
}

function validar(datos) {
  const errores = [];
  if (!datos.nombre_categoria) errores.push('El nombre de la categoría es obligatorio.');
  if (datos.nombre_categoria.length > 45) errores.push('El nombre debe tener máximo 45 caracteres.');
  return errores;
}

router.get('/', async (req, res) => {
  const categorias = await db.query(
    `SELECT c.*, (SELECT COUNT(*) FROM ticket t WHERE t.id_categoria = c.idcategoria) AS tickets
     FROM categoria c ORDER BY c.nombre_categoria`);
  res.render('categorias/index', { titulo: 'Categorías', categorias });
});

router.get('/nuevo', (req, res) => {
  res.render('categorias/form', { titulo: 'Nueva categoría', item: {}, errores: [] });
});

router.post('/', async (req, res) => {
  const datos = leerFormulario(req.body);
  const errores = validar(datos);
  if (errores.length) return res.status(400).render('categorias/form', { titulo: 'Nueva categoría', item: datos, errores });
  await db.query('INSERT INTO categoria (nombre_categoria, descripcion) VALUES (?, ?)',
    [datos.nombre_categoria, datos.descripcion || null]);
  req.session.flash = { tipo: 'ok', texto: 'Categoría creada.' };
  res.redirect('/categorias');
});

router.get('/:id/editar', async (req, res) => {
  const [item] = await db.query('SELECT * FROM categoria WHERE idcategoria = ?', [req.params.id]);
  if (!item) return res.status(404).render('error', { titulo: 'No encontrado', mensaje: 'La categoría no existe.' });
  res.render('categorias/form', { titulo: 'Editar categoría', item, errores: [] });
});

router.post('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const datos = leerFormulario(req.body);
  const errores = validar(datos);
  if (errores.length) {
    return res.status(400).render('categorias/form', { titulo: 'Editar categoría', item: { ...datos, idcategoria: id }, errores });
  }
  await db.query('UPDATE categoria SET nombre_categoria = ?, descripcion = ? WHERE idcategoria = ?',
    [datos.nombre_categoria, datos.descripcion || null, id]);
  req.session.flash = { tipo: 'ok', texto: 'Categoría actualizada.' };
  res.redirect('/categorias');
});

router.post('/:id/eliminar', async (req, res) => {
  try {
    await db.query('DELETE FROM categoria WHERE idcategoria = ?', [req.params.id]);
    req.session.flash = { tipo: 'ok', texto: 'Categoría eliminada.' };
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.errno === 1451) {
      req.session.flash = { tipo: 'error', texto: 'No se puede eliminar: hay tickets que usan esta categoría.' };
    } else {
      throw err;
    }
  }
  res.redirect('/categorias');
});

module.exports = router;
