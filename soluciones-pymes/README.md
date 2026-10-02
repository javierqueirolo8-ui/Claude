# Soluciones simples para pymes

Herramientas pequeñas para problemas **comunes** de las pymes que tienen un remedio **simple**.
Cada una nace de buscar el problema, comprobar los datos en su fuente y construir solo lo
necesario, con pruebas.

| Carpeta | Sector | Problema | Estado |
|---|---|---|---|
| [`cobranza-asistida/`](cobranza-asistida/) | Pymes uruguayas que facturan a crédito a otras empresas | Facturas vencidas que nadie reclama a tiempo | **Etapas 1 y 2 hechas** ([`nucleo/`](cobranza-asistida/nucleo/)): plan de entrevistas, criterios de la lista objetivo, arquitectura en n8n, el núcleo de código con sus pruebas y, en tu n8n, un banco de pruebas `[COB-DEV]` con datos ficticios (nada activo ni publicado, sin credenciales). Falta la serie de roturas a propósito. |
| [`biblioteca-tecnica/recordacitas/`](biblioteca-tecnica/recordacitas/) | Negocios con cita previa o reserva | Citas a las que el cliente no se presenta | **Archivada** como biblioteca técnica, no como producto. Sigue verificada. |

Ver [`biblioteca-tecnica/`](biblioteca-tecnica/) para qué piezas se reutilizan.

---

## Cómo se eligió el problema

Se buscaron problemas frecuentes de las pymes y se compararon tres nichos con sus datos y su
riesgo. Se descartó lo que no cumpliera estas condiciones:

1. **Frecuente y con coste medible**, con datos de fuentes localizables.
2. **Remedio viable** para una persona sola, con evidencia de que alguien paga por resolverlo.
3. **Estable y de bajo riesgo:** primera versión de solo lectura, con aprobación humana, sin
   interrumpir la operativa del cliente ni exponer datos.
4. **Verificable** de forma automática.

### Problemas evaluados

**1. Facturas cobradas tarde (cobranza asistida) → elegido; núcleo de código hecho, validación pendiente.**
El período medio de pago de las empresas en España fue de **80,5 días** en el segundo semestre de
2025 frente a un máximo legal de 60, y solo el **30,4 %** de los importes facturados se cobró
puntualmente o por anticipado (Observatorio de la Morosidad de CEPYME, publicado en abril de 2026).
Para Uruguay no hay un dato verificable, por lo que el siguiente paso son entrevistas. Detalle en
[`cobranza-asistida/`](cobranza-asistida/).

**2. Pedidos y documentos entrantes en distribuidoras pequeñas → no elegido.**
Evidencia débil (sobre todo afirmaciones de proveedores de software) y riesgo medio por la
precisión de la extracción.

**3. Presupuestos y seguimiento en oficios → plan B.**
Riesgo bajo y técnica más simple; se activa si las entrevistas de cobranza muestran reticencia a
compartir la «foto de facturación».

**Descartados:** alertas de licitaciones (al menos seis servicios ya existen; uno con plan gratis y
otros desde 19 o 29 € al mes) y recordatorios de cita (nicho saturado; ver más abajo).

**Recordatorios de cita (no-shows) → RecordaCitas, archivado.**
Cumplía las condiciones técnicas y tenía evidencia: 3,3 % de reservas fantasma en 2025 según
TheFork; en 9.500 restaurantes, 1,92 % sin protección frente a 1,52 % con reconfirmación por SMS;
y evidencia clínica de que el recordatorio mejora la asistencia (revisión Cochrane CD007458). Pero
es un nicho saturado, así que **no se ofrece**. Las cifras, con sus salvedades, están en el
[README de la herramienta](biblioteca-tecnica/recordacitas/README.md#el-problema).

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
