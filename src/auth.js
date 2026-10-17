// Utilidades de autenticación y control de acceso por rol.
const crypto = require('crypto');

/**
 * Hash de contraseña: SHA-256 en base64 (44 caracteres).
 * Se eligió este formato porque la columna usuarios.password_has es VARCHAR(45)
 * y no se quiso modificar el esquema entregado en la Actividad 2.
 */
function hashPassword(texto) {
  return crypto.createHash('sha256').update(String(texto), 'utf8').digest('base64');
}

/** Exige que haya una sesión iniciada. */
function requireLogin(req, res, next) {
  if (req.session && req.session.usuario) return next();
  req.session.flash = { tipo: 'error', texto: 'Debes iniciar sesión para continuar.' };
  return res.redirect('/login');
}

/** Exige que el usuario tenga alguno de los roles indicados. */
function requireRole(...roles) {
  return (req, res, next) => {
    const u = req.session && req.session.usuario;
    if (u && roles.includes(u.rol)) return next();
    return res.status(403).render('error', {
      titulo: 'Acceso denegado',
      mensaje: 'No tienes permiso para entrar a esta sección.',
    });
  };
}

/** Un agente o admin es "personal de soporte". */
function esStaff(usuario) {
  return !!usuario && (usuario.rol === 'admin' || usuario.rol === 'agente');
}

module.exports = { hashPassword, requireLogin, requireRole, esStaff };
