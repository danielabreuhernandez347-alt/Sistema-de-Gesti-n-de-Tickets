const path = require('path');
const express = require('express');
const session = require('express-session');

const app = express();

// Motor de vistas
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

// Middlewares básicos
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'helpdesk-secreto',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 8 * 60 * 60 * 1000 }, // 8 horas (jornada de oficina)
}));

// Datos disponibles en todas las vistas
const ETIQUETAS_ESTADO = { abierto: 'Abierto', en_proceso: 'En proceso', resuelto: 'Resuelto', cerrado: 'Cerrado' };
const ETIQUETAS_PRIORIDAD = { baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica' };
const ETIQUETAS_ROL = { solicitante: 'Solicitante', agente: 'Agente', admin: 'Administrador' };

app.use((req, res, next) => {
  res.locals.usuario = req.session.usuario || null;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  res.locals.rutaActual = req.path;
  res.locals.ETIQUETAS_ESTADO = ETIQUETAS_ESTADO;
  res.locals.ETIQUETAS_PRIORIDAD = ETIQUETAS_PRIORIDAD;
  res.locals.ETIQUETAS_ROL = ETIQUETAS_ROL;
  res.locals.etiquetaEstado = (v) => ETIQUETAS_ESTADO[v] || v;
  res.locals.etiquetaPrioridad = (v) => ETIQUETAS_PRIORIDAD[v] || v;
  res.locals.etiquetaRol = (v) => ETIQUETAS_ROL[v] || v;
  res.locals.fmtFecha = (v) => (v ? String(v).slice(0, 16) : '—');
  next();
});

// Rutas
app.use('/', require('./routes/auth'));
app.use('/', require('./routes/dashboard'));
app.use('/usuarios', require('./routes/usuarios'));
app.use('/categorias', require('./routes/categorias'));
app.use('/tickets', require('./routes/tickets'));
app.use('/', require('./routes/comentarios'));

// 404
app.use((req, res) => {
  res.status(404).render('error', { titulo: 'Página no encontrada', mensaje: 'La dirección solicitada no existe.' });
});

// Errores no controlados
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).render('error', { titulo: 'Error interno', mensaje: 'Ocurrió un error inesperado. Intenta de nuevo.' });
});

module.exports = app;
