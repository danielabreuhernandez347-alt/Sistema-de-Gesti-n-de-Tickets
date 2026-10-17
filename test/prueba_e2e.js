// Uso: con la app corriendo (npm start), ejecutar: npm test   (o BASE=http://servidor:puerto npm test)
// Prueba de extremo a extremo contra la app en http://localhost:3000
const BASE = process.env.BASE || `http://127.0.0.1:${process.env.PORT || 3000}`;
let fallos = 0;

function cliente() {
  let cookie = '';
  async function pedir(metodo, ruta, datos) {
    const opts = { method: metodo, redirect: 'manual', headers: { cookie } };
    if (datos) {
      opts.headers['content-type'] = 'application/x-www-form-urlencoded';
      opts.body = new URLSearchParams(datos).toString();
    }
    const r = await fetch(BASE + ruta, opts);
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const cuerpo = await r.text();
    return { status: r.status, location: r.headers.get('location'), cuerpo };
  }
  return { get: (r) => pedir('GET', r), post: (r, d) => pedir('POST', r, d || {}) };
}

function ok(cond, msg, extra) {
  if (cond) console.log('  ✔', msg);
  else { fallos++; console.log('  ✘', msg, extra ? '\n     ' + String(extra).slice(0, 300) : ''); }
}

async function esperarServidor() {
  for (let i = 0; i < 30; i++) {
    try { await fetch(BASE + '/login'); return; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  throw new Error('El servidor no respondió');
}

(async () => {
  await esperarServidor();

  console.log('Sin sesión');
  const anon = cliente();
  let r = await anon.get('/');
  ok(r.status === 302 && r.location === '/login', 'GET / redirige a /login sin sesión');
  r = await anon.get('/login');
  ok(r.status === 200 && r.cuerpo.includes('Iniciar sesión'), 'GET /login muestra el formulario');
  r = await anon.post('/login', { correo: 'admin@email.com', password: 'incorrecta' });
  ok(r.status === 401 && r.cuerpo.includes('incorrectos'), 'Login con clave incorrecta devuelve 401');

  console.log('Admin');
  const admin = cliente();
  r = await admin.post('/login', { correo: 'admin@email.com', password: 'admin123' });
  ok(r.status === 302 && r.location === '/', 'Login admin correcto');
  r = await admin.get('/');
  ok(r.status === 200 && r.cuerpo.includes('Hola, Administrador') && r.cuerpo.includes('Usuarios'), 'Dashboard admin con menú Usuarios');

  // CRUD categorías
  r = await admin.post('/categorias', { nombre_categoria: 'Prueba E2E', descripcion: 'Categoría temporal' });
  ok(r.status === 302, 'Crear categoría');
  r = await admin.get('/categorias');
  ok(r.cuerpo.includes('Prueba E2E'), 'Categoría aparece en el listado');
  const idCat = Number((r.cuerpo.match(/\/categorias\/(\d+)\/editar">Editar<\/a>\s*<form method="post" action="\/categorias\/\d+\/eliminar" onsubmit="return confirm\('¿Eliminar la categoría Prueba E2E/) || [])[1]);
  ok(idCat > 0, 'Se obtuvo el id de la categoría', r.cuerpo.slice(0, 100));
  r = await admin.post(`/categorias/${idCat}`, { nombre_categoria: 'Prueba E2E editada', descripcion: '' });
  r = await admin.get('/categorias');
  ok(r.cuerpo.includes('Prueba E2E editada'), 'Editar categoría');
  r = await admin.post('/categorias', { nombre_categoria: '' });
  ok(r.status === 400 && r.cuerpo.includes('obligatorio'), 'Validación de categoría vacía');

  // CRUD usuarios
  r = await admin.post('/usuarios', { nombre: 'Pedro Prueba', correo: 'pedro@email.com', rol: 'solicitante', password: 'pedro123' });
  ok(r.status === 302, 'Crear usuario');
  r = await admin.post('/usuarios', { nombre: 'Pedro Dup', correo: 'pedro@email.com', rol: 'solicitante', password: 'pedro123' });
  ok(r.status === 400 && r.cuerpo.includes('Ya existe'), 'Correo duplicado rechazado');
  r = await admin.get('/usuarios');
  ok(r.cuerpo.includes('pedro@email.com'), 'Usuario aparece en el listado');
  const idPedro = Number((r.cuerpo.match(/<td>(\d+)<\/td>\s*<td>Pedro Prueba<\/td>/) || [])[1]);
  ok(idPedro > 0, 'Se obtuvo el id del usuario');
  r = await admin.post(`/usuarios/${idPedro}`, { nombre: 'Pedro Prueba R.', correo: 'pedro@email.com', rol: 'solicitante', password: '' });
  r = await admin.get('/usuarios');
  ok(r.cuerpo.includes('Pedro Prueba R.'), 'Editar usuario sin cambiar contraseña');
  r = await admin.post('/usuarios/3/eliminar');
  r = await admin.get('/usuarios');
  ok(r.cuerpo.includes('No puedes eliminar tu propio usuario'), 'No se puede autoeliminar');

  // Ticket creado por el admin a nombre de Pedro
  r = await admin.post('/tickets', { titulo: 'Impresora no imprime', descripcion: 'La impresora del 2do piso no responde', id_categoria: idCat, prioridad: 'alta', id_solicitante: idPedro, id_agente: 2, p1: 'Sí, con dificultad', p2: 'A mi área' });
  ok(r.status === 302 && /\/tickets\/\d+$/.test(r.location || ''), 'Crear ticket (admin)');
  const idTicket = Number((r.location || '').split('/').pop());
  r = await admin.get(`/tickets/${idTicket}`);
  ok(r.cuerpo.includes('Impresora no imprime') && r.cuerpo.includes('A mi área') && r.cuerpo.includes('Soporte Técnico'), 'Detalle del ticket con preguntas y agente');
  r = await admin.post('/tickets', { titulo: '', descripcion: '', id_categoria: '' });
  ok(r.status === 400 && r.cuerpo.includes('obligatorio'), 'Validación de ticket vacío');

  console.log('Solicitante (Pedro)');
  const pedro = cliente();
  r = await pedro.post('/login', { correo: 'pedro@email.com', password: 'pedro123' });
  ok(r.status === 302, 'Login de Pedro con la contraseña creada por el admin');
  r = await pedro.get('/usuarios');
  ok(r.status === 403, 'Pedro no puede entrar a /usuarios');
  r = await pedro.get('/categorias');
  ok(r.status === 403, 'Pedro no puede entrar a /categorias');
  r = await pedro.get(`/tickets/${idTicket}`);
  ok(r.status === 200 && !r.cuerpo.includes('Gestionar'), 'Pedro ve su ticket sin panel de gestión');
  r = await pedro.get('/tickets/1');
  ok(r.status === 403, 'Pedro no ve el ticket de Laura');
  r = await pedro.get('/tickets');
  ok(r.cuerpo.includes('Impresora no imprime') && !r.cuerpo.includes('Falla de Internet'), 'Listado de Pedro solo con sus tickets');
  r = await pedro.post(`/tickets/${idTicket}/comentarios`, { mensaje: 'Sigue sin funcionar hoy' });
  ok(r.status === 302, 'Pedro comenta en su ticket');
  r = await pedro.post(`/tickets/1/comentarios`, { mensaje: 'intruso' });
  ok(r.status === 403, 'Pedro no puede comentar en ticket ajeno');
  r = await pedro.post(`/tickets/${idTicket}/estado`, { estado: 'cerrado' });
  ok(r.status === 403, 'Pedro no puede cambiar el estado');
  r = await pedro.post('/tickets', { titulo: 'No abre el correo', descripcion: 'Outlook se cierra solo', id_categoria: 3, prioridad: 'media', id_solicitante: 1, id_agente: 2 });
  const idTicket2 = Number((r.location || '').split('/').pop());
  r = await pedro.get(`/tickets/${idTicket2}`);
  ok(r.status === 200 && r.cuerpo.includes('Pedro Prueba R.') && r.cuerpo.includes('Sin asignar'), 'Ticket de Pedro queda a su nombre (ignora solicitante/agente del form)');

  console.log('Agente');
  const agente = cliente();
  r = await agente.post('/login', { correo: 'soporte@email.com', password: 'agente123' });
  ok(r.status === 302, 'Login agente');
  r = await agente.get('/tickets?q=impresora&estado=abierto&prioridad=alta');
  ok(r.cuerpo.includes('Impresora no imprime') && r.cuerpo.includes('1 ticket(s)'), 'Búsqueda y filtros');
  r = await agente.get('/tickets?q=impresora&estado=cerrado');
  ok(r.cuerpo.includes('No se encontraron tickets'), 'Filtro sin resultados');
  r = await agente.post(`/tickets/${idTicket}/estado`, { estado: 'resuelto', id_agente: 2 });
  ok(r.status === 302, 'Agente marca el ticket como resuelto');
  r = await agente.get(`/tickets/${idTicket}`);
  const cierre = (r.cuerpo.match(/<td>Cierre<\/td><td>([^<]+)<\/td>/) || [])[1];
  ok(cierre && cierre !== '—', 'El trigger llenó fecha_cierre: ' + cierre);
  r = await agente.post(`/tickets/${idTicket}/estado`, { estado: 'en_proceso', id_agente: 2 });
  r = await agente.get(`/tickets/${idTicket}`);
  const cierre2 = (r.cuerpo.match(/<td>Cierre<\/td><td>([^<]+)<\/td>/) || [])[1];
  ok(cierre2 === '—', 'Al reabrir, fecha_cierre vuelve a vacío');
  r = await agente.post(`/tickets/${idTicket}/comentarios`, { mensaje: 'Revisando la impresora' });
  r = await agente.get(`/tickets/${idTicket}`);
  ok(r.cuerpo.includes('Comentarios (2)') && r.cuerpo.includes('comentario-staff'), 'Dos comentarios, el del agente resaltado');
  r = await agente.post(`/tickets/${idTicket}`, { titulo: 'Impresora no imprime (2do piso)', descripcion: 'Actualizado', id_categoria: idCat, prioridad: 'critica', estado: 'en_proceso', id_solicitante: idPedro, id_agente: 2 });
  r = await agente.get(`/tickets/${idTicket}`);
  ok(r.cuerpo.includes('(2do piso)') && r.cuerpo.includes('Crítica'), 'Editar ticket completo (agente)');
  r = await agente.get('/');
  ok(r.cuerpo.includes('Tickets creados') && r.cuerpo.includes('Impresora'), 'Dashboard del agente');
  r = await agente.get('/usuarios');
  ok(r.status === 403, 'Agente no entra a /usuarios');
  r = await agente.get('/categorias');
  ok(r.status === 200, 'Agente sí entra a /categorias');

  console.log('Limpieza y borrados');
  r = await admin.post(`/categorias/${idCat}/eliminar`);
  r = await admin.get('/categorias');
  ok(r.cuerpo.includes('hay tickets que usan esta categoría'), 'No borra categoría con tickets (FK amigable)');
  r = await admin.post(`/usuarios/${idPedro}/eliminar`);
  r = await admin.get('/usuarios');
  ok(r.cuerpo.includes('tiene tickets o comentarios'), 'No borra usuario con tickets (FK amigable)');
  r = await admin.post(`/tickets/${idTicket}/eliminar`);
  r = await admin.post(`/tickets/${idTicket2}/eliminar`);
  r = await admin.get(`/tickets/${idTicket}`);
  ok(r.status === 404, 'Ticket eliminado devuelve 404');
  r = await admin.post(`/categorias/${idCat}/eliminar`);
  r = await admin.get('/categorias');
  ok(!r.cuerpo.includes('Prueba E2E'), 'Categoría eliminada');
  r = await admin.post(`/usuarios/${idPedro}/eliminar`);
  r = await admin.get('/usuarios');
  ok(!r.cuerpo.includes('pedro@email.com'), 'Usuario eliminado');
  r = await admin.post('/logout');
  r = await admin.get('/');
  ok(r.status === 302, 'Logout cierra la sesión');
  r = await admin.get('/no-existe');
  ok(r.status === 404, '404 para rutas inexistentes');

  console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
