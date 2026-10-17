#!/usr/bin/env bash
# Instala o actualiza la aplicación Helpdesk en el servidor Debian.
# Uso (como root):  sudo bash ~/helpdesk-app/deploy/instalar.sh
# Es idempotente: se puede ejecutar varias veces para actualizar la app.
set -euo pipefail

ORIGEN="$(cd "$(dirname "$0")/.." && pwd)"
DESTINO=/opt/helpdesk-app
USUARIO_APP=debian

echo "==> 1/6 Instalando Node.js, npm y rsync"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nodejs npm rsync > /dev/null
echo "    Node $(node --version), npm $(npm --version)"

echo "==> 2/6 Copiando la aplicación a $DESTINO"
mkdir -p "$DESTINO"
rsync -a --delete --exclude node_modules --exclude .env "$ORIGEN/" "$DESTINO/"
if [ ! -f "$DESTINO/.env" ]; then
  cp "$DESTINO/deploy/env.produccion" "$DESTINO/.env"
  SECRETO="$(head -c 32 /dev/urandom | base64 | tr -d '/+=')"
  sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$SECRETO|" "$DESTINO/.env"
  echo "    Archivo .env creado con clave de sesión aleatoria"
fi
chown -R "$USUARIO_APP:$USUARIO_APP" "$DESTINO"

echo "==> 3/6 Instalando dependencias de Node"
cd "$DESTINO"
sudo -u "$USUARIO_APP" npm install --omit=dev --no-audit --no-fund --loglevel=error

echo "==> 4/6 Cargando datos iniciales en helpdesk_db (usuario admin, contraseñas demo, categorías)"
mysql helpdesk_db < "$DESTINO/sql/seed_app.sql"

echo "==> 5/6 Registrando el servicio systemd 'helpdesk'"
install -m 644 "$DESTINO/deploy/helpdesk.service" /etc/systemd/system/helpdesk.service
systemctl daemon-reload
systemctl enable helpdesk > /dev/null 2>&1
systemctl restart helpdesk
sleep 2
systemctl --no-pager --lines=5 status helpdesk || true

echo "==> 6/6 Configurando Apache como proxy inverso (puerto 80 -> 3000)"
a2enmod -q proxy proxy_http
install -m 644 "$DESTINO/deploy/helpdesk.conf" /etc/apache2/sites-available/helpdesk.conf
a2dissite -q 000-default || true
a2ensite -q helpdesk
systemctl reload apache2

echo
echo "Listo. La aplicación responde en:"
echo "  http://$(hostname -I | awk '{print $1}')/      (red local)"
echo "  http://$(tailscale ip -4 2>/dev/null || echo '<ip-tailscale>')/      (Tailscale)"
echo "Usuarios demo: admin@email.com / admin123 · soporte@email.com / agente123 · soylaura@email.com / laura123"
