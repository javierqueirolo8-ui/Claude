# Soluciones simples para pymes

Herramientas pequeñas para problemas **comunes** de las pymes que tienen un remedio **simple**.
Cada una nace de buscar el problema, comprobar los datos en su fuente y construir solo lo
necesario, con pruebas.

| Herramienta | Sector | Problema | Estado |
|---|---|---|---|
| [`recordacitas/`](recordacitas/) | Negocios con cita previa o reserva | Citas y reservas a las que el cliente no se presenta | Hecha y verificada |

---

## Cómo se eligió el problema

Se buscaron problemas frecuentes de las pymes españolas y se descartó lo que no cumpliera las
cuatro condiciones:

1. **Frecuente y con coste medible**, con datos de fuentes localizables.
2. **Remedio simple** y con evidencia de que funciona.
3. **Resoluble con un fichero** que el negocio use solo: sin servidor, sin suscripción, sin
   integraciones y sin tocar datos que no deba.
4. **Verificable** de forma automática.

### Problemas evaluados

**1. Citas y reservas no atendidas (no-shows) → resuelto con RecordaCitas.**
Cumple las cuatro. Hay medición en restauración (3,3 % de reservas fantasma en 2025 según
TheFork; en 9.500 restaurantes, 1,92 % sin protección frente a 1,52 % con reconfirmación por
SMS), evidencia clínica de que el recordatorio mejora la asistencia (revisión Cochrane
CD007458) y una solución que cabe en un fichero. Las cifras, con sus salvedades, están en el
[README de la herramienta](recordacitas/README.md#el-problema).

**2. Facturas cobradas tarde (morosidad) → no desarrollado.**
Problema real: el período medio de pago de las empresas en España fue de **80,5 días** en el
segundo semestre de 2025 frente a un máximo legal de 60, y solo el **30,4 %** de los importes
facturados se cobró puntualmente o por anticipado (Observatorio de la Morosidad de CEPYME,
publicado en abril de 2026). Un recordatorio escalonado de facturas vencidas sería igual de
simple, pero reclamar intereses de demora tiene implicaciones legales que piden más cuidado que
un aviso de cita. Queda como siguiente candidato.

---

## Fuentes y cómo se comprobaron

Todas se abrieron y leyeron el 29-sep-2026; no se cita ninguna cifra que no se haya podido
contrastar en su página.

- Cochrane, [CD007458](https://www.cochrane.org/evidence/CD007458_mobile-phone-messaging-reminders-attendance-healthcare-appointments):
  8 ensayos, 6.615 participantes, RR 1,14 (IC 95 % 1,03–1,26) frente a no recordar y RR 0,99
  (0,95–1,02) frente a la llamada; calidad de la evidencia baja a moderada; **citas sanitarias**.
- [InfoHoreca, 8-jul-2026](https://www.infohoreca.com/noticias/20260708/reservas-fantasma-hosteleria):
  TheFork (3,3 % en 2025; 3,6 % en 2024) y CoverManager (9.500 restaurantes, Día del Padre de
  2025). Los 15.500 € anuales por restaurante que circulan por la prensa son **un cálculo de
  ejemplo** (500 reservas al mes × 3,3 % × 78,30 €), no un dato medido. El artículo equivalente
  de El Economista devolvió un error 403 y no se pudo abrir.
- [El Independiente, 29-sep-2025](https://www.elindependiente.com/sociedad/2025/09/29/las-ausencias-a-citas-medicas-cuestan-hasta-7-500-euros-al-mes-a-las-clinicas-privadas/)
  y [Salud a Diario, 26-may-2026](https://www.saludadiario.es/vademecum/las-cancelaciones-de-ultima-hora-cuestan-a-las-clinicas-y-centros-de-bienestar-espanoles-miles-de-euros-al-ano-como-evitarlo/):
  12–19 % de citas sin atender y 2.500–7.500 € al mes por centro. **Sin metodología ni estudio
  citado**; uno atribuye las cifras de forma genérica a «estudios» y a un proveedor de software.
  Se usan como orden de magnitud y así se dice.
- [Autónomos y Emprendedor, abril de 2026](https://www.autonomosyemprendedor.es/articulo/pymes/pymes-solo-cobran-cada-tres-facturas-tiempo-ultimo-observatorio-morosidad/20260410165245053056.html):
  cifras del Observatorio de la Morosidad de CEPYME.
- Formato de los enlaces de WhatsApp: se probó contra el servicio real; ver *Por qué
  `api.whatsapp.com` y no `wa.me`* en el README de la herramienta.
