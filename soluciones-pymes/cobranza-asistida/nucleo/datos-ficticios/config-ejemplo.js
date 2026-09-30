'use strict';
/* Configuración de un cliente INVENTADO, con la forma que tendrá la configuración real (doc 03, §6).
   Todo es ficticio: la empresa no existe, las direcciones usan el dominio reservado «.example»
   (RFC 2606: no puede resolver a un buzón real) y la cuenta de pago es un ejemplo. */

function configEjemplo() {
  return {
    cliente_id: 'demo-01',
    empresa: {
      nombre: 'Ferretería Ficticia S.R.L.',
      medios_pago: 'Pueden abonarla por transferencia a la cuenta ficticia 000-000000-0.',
      firma: 'Administración\nFerretería Ficticia S.R.L.'
    },
    destinatarios_permitidos: ['administracion@ferreteria-ficticia.example'],
    remitente_prueba: 'bandeja.de.pruebas@ejemplo.example',
    entrega: 'enlace_salida',
    modo: 'dry_run',
    zona_horaria: 'America/Montevideo',
    patron_nombre_archivo: '*',
    antiguedad_maxima_archivo_dias: 8,
    umbral_rechazo: 20,
    ignorar_filas_de_total: true,
    formato_importe: { decimal: ',', miles: '.' },
    monedas_admitidas: ['UYU', 'USD'],
    mapeo_columnas: {
      factura: ['Nro Factura'], deudor: ['Cliente'], importe: ['Saldo'], moneda: ['Moneda'],
      emision: ['Fecha Emisión'], vencimiento: ['Vencimiento'], telefono: ['Teléfono'], correo: ['Email'], en_disputa: ['En disputa']
    }
  };
}

module.exports = { configEjemplo };
