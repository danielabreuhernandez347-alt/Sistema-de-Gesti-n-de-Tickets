-- Datos iniciales para la aplicación Helpdesk (Actividad IV).
-- No modifica el esquema creado en la Actividad 2; solo ajusta datos.
-- Las contraseñas se guardan como SHA-256 en base64 (44 caracteres), igual que hace la app (src/auth.js).
-- Ejecutar: sudo mysql helpdesk_db < sql/seed_app.sql
USE helpdesk_db;

-- Contraseñas de los usuarios de prueba creados en la Actividad 2
UPDATE usuarios SET password_has = TO_BASE64(UNHEX(SHA2('laura123', 256)))  WHERE correo = 'soylaura@email.com';
UPDATE usuarios SET password_has = TO_BASE64(UNHEX(SHA2('agente123', 256))) WHERE correo = 'soporte@email.com';

-- Usuario administrador (si no existe)
INSERT IGNORE INTO usuarios (nombre, correo, password_has, rol)
VALUES ('Administrador', 'admin@email.com', TO_BASE64(UNHEX(SHA2('admin123', 256))), 'admin');

-- Categorías adicionales (si no existen)
INSERT INTO categoria (nombre_categoria, descripcion)
SELECT 'Correo y Software', 'Problemas con correo electrónico, Office u otros programas'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM categoria WHERE nombre_categoria = 'Correo y Software');

INSERT INTO categoria (nombre_categoria, descripcion)
SELECT 'Accesos y Contraseñas', 'Creación de cuentas, permisos y restablecimiento de contraseñas'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM categoria WHERE nombre_categoria = 'Accesos y Contraseñas');

INSERT INTO categoria (nombre_categoria, descripcion)
SELECT 'Impresoras', 'Fallas de impresión, tóner y configuración de impresoras'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM categoria WHERE nombre_categoria = 'Impresoras');
