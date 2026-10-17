# Helpdesk · Sistema de tickets de soporte técnico

Aplicación web desarrollada para la asignatura **Desarrollo de Proyecto con Software Libre** (Grupo 6, UAPA).
Actividad IV: módulos CRUD con **JavaScript / Node.js + Express** y conexión persistente a **MariaDB**
(base de datos `helpdesk_db` creada en la Actividad 2 y servidor configurado en la Actividad 3).

## Funciones

| Módulo | Operaciones | Quién puede |
|---|---|---|
| Inicio | Resumen de tickets por estado y prioridad, números del mes | Todos (el solicitante solo ve los suyos) |
| Tickets | Crear, listar/buscar/filtrar, ver, editar, cambiar estado, asignar agente, eliminar | Solicitante: solo sus tickets. Agente/Admin: todos |
| Comentarios | Agregar y eliminar comentarios dentro del ticket | Participantes del ticket; admin borra cualquiera |
| Categorías | Crear, listar, editar, eliminar | Agente y Admin |
| Usuarios | Crear, listar, editar (incl. contraseña), eliminar | Admin |

El trigger `trg_actualizar_fecha_cierre` de la base de datos llena `fecha_cierre` automáticamente cuando un
ticket pasa a *resuelto* o *cerrado*, y la limpia si se reabre.

## Usuarios de prueba (después de cargar `sql/seed_app.sql`)

| Correo | Contraseña | Rol |
|---|---|---|
| admin@email.com | admin123 | Administrador |
| soporte@email.com | agente123 | Agente |
| soylaura@email.com | laura123 | Solicitante |

## Estructura

```
src/server.js        Arranque: verifica la conexión y levanta el servidor
src/app.js           Configuración de Express (vistas EJS, sesión, rutas, errores)
src/db.js            Pool de conexiones persistentes a MariaDB (mysql2)
src/auth.js          Hash de contraseñas y middlewares de login/rol
src/routes/*.js      Módulos: auth, dashboard, usuarios, categorias, tickets, comentarios
views/               Plantillas EJS (interfaz en español)
public/css/          Estilos propios (sin dependencias externas)
sql/seed_app.sql     Datos iniciales (admin, contraseñas demo, categorías)
deploy/              Script de instalación, unidad systemd y VirtualHost de Apache
```

## Ejecutar en una PC de desarrollo

Requisitos: Node.js 18 o superior y acceso a la base de datos.

```bash
npm install
cp .env.example .env     # ajustar DB_HOST / DB_USER / DB_PASSWORD si hace falta
npm start                # http://localhost:3000
```

Si la base de datos está en la VM Debian (solo escucha en 127.0.0.1), abre un túnel SSH en otra terminal y
deja `DB_HOST=127.0.0.1` en `.env`:

```bash
ssh -N -L 3306:127.0.0.1:3306 debian@100.107.121.57
```

## Desplegar en el servidor Debian (VM)

1. Copiar el proyecto a la VM:
   ```bash
   scp -r helpdesk-app debian@100.107.121.57:~/
   ```
2. Ejecutar el instalador (instala Node.js, copia a `/opt/helpdesk-app`, carga el seed, crea el servicio
   `helpdesk` y configura Apache como proxy inverso en el puerto 80):
   ```bash
   ssh -t debian@100.107.121.57 'sudo bash ~/helpdesk-app/deploy/instalar.sh'
   ```
3. Abrir en el navegador: `http://100.107.121.57/` (Tailscale) o la IP de la red local.

Comandos útiles en el servidor:

```bash
sudo systemctl status helpdesk      # estado del servicio
sudo journalctl -u helpdesk -f      # registro en vivo
sudo systemctl restart helpdesk     # reiniciar tras cambios
```

## Conexión persistente

`src/db.js` crea un **pool** con `mysql2`: las conexiones se abren una vez, se mantienen vivas
(`enableKeepAlive`) y se reutilizan en cada petición (`connectionLimit: 10`). En el servidor la app se conecta
por el socket Unix de MariaDB (`DB_SOCKET=/run/mysqld/mysqld.sock`) con el usuario `app_helpdesk`, que solo
tiene privilegios sobre `helpdesk_db`.

## Nota sobre contraseñas

La columna `usuarios.password_has` es `VARCHAR(45)`. Para no modificar el esquema entregado, la app guarda
el hash **SHA‑256 en base64** (44 caracteres). Para un entorno real se recomienda ampliar la columna y usar
bcrypt/argon2.
