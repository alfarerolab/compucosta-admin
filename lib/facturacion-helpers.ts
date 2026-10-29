import { createRequire } from 'module';
const requireC = createRequire(typeof __filename !== 'undefined' ? __filename : import.meta.url);
const { prisma } = requireC('./prisma');

// ======= Config / constantes =======
const ERP_API_URL = process.env.ERP_API_URL || 'https://ws.dsnube.co/api/v1';
const ERP_USERNAME = process.env.EXTERNAL_API_USERNAME || '';
const ERP_PASSWORD = process.env.EXTERNAL_API_PASSWORD || '';
const ERP_PREFIJO_FACTURA = process.env.ERP_PREFIJO_FACTURA || 'FEF';
const ERP_IDSUC = parseInt(process.env.ERP_IDSUC || '1');
const ERP_IDBODEGA = process.env.ERP_IDBODEGA || '1';
const ERP_EMISOR = parseInt(process.env.ERP_EMISOR || '800253616');
const NIT_CONSUMIDOR_FINAL = process.env.NIT_CONSUMIDOR_FINAL || '222222222';

// ======= Tipos =======
export interface FacturaResult {
  success: boolean;
  pending?: boolean;
  reason?: string;
  error?: string;
  erp_doc_ref?: string;
  erp_numero?: number;
  erp_nit_cliente?: bigint;
  cufe?: string;
  dian_valido?: boolean;
  forma_pago?: number;
  productos_no_encontrados?: string[];
}

// ======= Util / mapeos =======
export function mapearFormaPagoShopify(metodoPago: string | null): number {
  const mapeo: Record<string, number> = {
    visa: 1,
    mastercard: 1,
    american_express: 1,
    diners_club: 1,
    codensa: 1,
    pse: 1,
    wallet: 1,
    efecty: 1,
    daviplata: 1,
    safetypay: 1,
    efectivo: 1,
    manual: 1,
  };
  const metodoStr = metodoPago ? String(metodoPago) : 'shopify_payments';
  const metodoNorm = metodoStr.toLowerCase().replace(/\s+/g, '_');
  if (mapeo[metodoNorm]) return mapeo[metodoNorm];
  for (const [key, value] of Object.entries(mapeo)) {
    if (metodoNorm.includes(key) || key.includes(metodoNorm)) return value;
  }
  return 1; // 1 = Efectivo/Default (El ERP DSNube rechaza el 2)
}

export function obtenerCodigoImpuestoDetalle(porcIva: number | null): string {
  if (!porcIva || porcIva === 0) return '0000';
  return '1103';
}

export function obtenerCodigoDepartamento(provincia: string): string {
  const mapa: Record<string, string> = {
    Amazonas: '91', Antioquia: '05', Arauca: '81', 'Atlántico': '08', Bolívar: '13', Boyacá: '15', Caldas: '17', Caquetá: '18', Casanare: '85', Cauca: '19', Cesar: '20', 'Chocó': '27', Córdoba: '23', Cundinamarca: '25', Bogotá: '11', 'Guainía': '94', Guaviare: '95', Huila: '41', 'La Guajira': '44', Magdalena: '47', Meta: '50', Nariño: '52', 'Norte de Santander': '54', Putumayo: '86', 'Quindío': '63', Risaralda: '66', 'San Andrés': '88', Santander: '68', Sucre: '70', Tolima: '73', 'Valle del Cauca': '76', Vaupés: '97', Vichada: '99',
  };
  const provinciaNorm = (provincia || '').trim();
  for (const [nombre, codigo] of Object.entries(mapa)) {
    if (nombre.toLowerCase().includes(provinciaNorm.toLowerCase()) || provinciaNorm.toLowerCase().includes(nombre.toLowerCase())) return codigo;
  }
  return '11';
}

export function obtenerCodigoMunicipio(ciudad: string, dpto: string): string {
  const capitales: Record<string, string> = { '11': '001', '05': '001', '76': '001', '08': '001', '13': '001', '70': '001', '23': '001', '66': '001', '68': '001', '73': '001' };
  return capitales[dpto] || '001';
}

// ======= NIT extraction & validation =======
export function extraerNitDelPedido(order: any): string {
  if (!order) return NIT_CONSUMIDOR_FINAL;
  const tryValues: Array<string | undefined> = [
    order.shipping_address?.company,
    order.billing_address?.company,
    order.customer?.default_address?.company,
  ];
  for (const v of tryValues) {
    if (v) {
      const n = limpiarNit(v);
      if (validarNit(n)) return n;
    }
  }
  if (Array.isArray(order.note_attributes)) {
    const nitAttr = order.note_attributes.find((a: any) => (a.name || '').toLowerCase().match(/nit|documento|cedula|identificacion/));
    if (nitAttr?.value) {
      const n = limpiarNit(nitAttr.value);
      if (validarNit(n)) return n;
    }
  }
  if (Array.isArray(order.custom_attributes)) {
    const nitAttr = order.custom_attributes.find((a: any) => (a.key || '').toLowerCase().match(/nit|documento|cedula|identificacion/));
    if (nitAttr?.value) {
      const n = limpiarNit(nitAttr.value);
      if (validarNit(n)) return n;
    }
  }
  return NIT_CONSUMIDOR_FINAL;
}

function limpiarNit(nit: string | number): string {
  if (typeof nit === 'number') return nit.toString();
  return String(nit).replace(/[^0-9]/g, '');
}

function validarNit(nit: string): boolean {
  if (!nit || typeof nit !== 'string') return false;
  if (!/^\d+$/.test(nit)) return false;
  return nit.length >= 6 && nit.length <= 12;
}

// ======= Numeración correlativa =======
export async function obtenerSiguienteNumero(): Promise<number> {
  const credentials = Buffer.from(`${ERP_USERNAME}:${ERP_PASSWORD}`).toString('base64');
  let ultimoNumeroERP = 0;
  try {
    const sqlQuery = `SELECT MAX(numero) AS numero FROM trfacturas WHERE idsuc = ${ERP_IDSUC} AND prefijo = '${ERP_PREFIJO_FACTURA}'`;
    const encoded = encodeURIComponent(sqlQuery);
    const res = await fetch(`${ERP_API_URL}/consultasql?consulta=${encoded}`, { method: 'GET', headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      if (data && data.result && data.result.length) ultimoNumeroERP = Number(data.result[0].numero || 0);
    }
  } catch (e) {
    // fallback to local consecutivo
  }

  const numero = await prisma.$transaction(async (tx: any) => {
    const rows: any[] = await tx.$queryRaw`SELECT * FROM consecutivo_factura WHERE prefijo = ${ERP_PREFIJO_FACTURA} FOR UPDATE`;
    let registro: any;
    if (rows.length === 0) {
      registro = await tx.consecutivo_factura.create({ data: { prefijo: ERP_PREFIJO_FACTURA, ultimo_numero: ultimoNumeroERP } });
    } else {
      registro = rows[0];
    }
    const base = Math.max(Number(registro.ultimo_numero || 0), ultimoNumeroERP);
    const nuevo = base + 1;
    await tx.consecutivo_factura.update({ where: { id: registro.id }, data: { ultimo_numero: nuevo, updated_at: new Date() } });
    return nuevo;
  }, { isolationLevel: 'Serializable' });

  return numero;
}

async function obtenerConsecutivoLocal(): Promise<number> {
  const reg = await prisma.consecutivo_factura.findFirst({ where: { prefijo: ERP_PREFIJO_FACTURA }, orderBy: { id: 'desc' } });
  const nuevo = reg ? reg.ultimo_numero + 1 : 1;
  if (reg) await prisma.consecutivo_factura.update({ where: { id: reg.id }, data: { ultimo_numero: nuevo, updated_at: new Date() } });
  else await prisma.consecutivo_factura.create({ data: { prefijo: ERP_PREFIJO_FACTURA, ultimo_numero: nuevo } });
  return nuevo;
}

async function sincronizarConsecutivoLocal(numeroERP: number): Promise<void> {
  const reg = await prisma.consecutivo_factura.findFirst({ where: { prefijo: ERP_PREFIJO_FACTURA } });
  if (reg) {
    if (numeroERP > reg.ultimo_numero) await prisma.consecutivo_factura.update({ where: { id: reg.id }, data: { ultimo_numero: numeroERP, updated_at: new Date() } });
  } else {
    await prisma.consecutivo_factura.create({ data: { prefijo: ERP_PREFIJO_FACTURA, ultimo_numero: numeroERP } });
  }
}

// ======= Cliente / ERP helpers =======
async function verificarClienteEnERP(nit: string): Promise<boolean> {
  try {
    const credentials = Buffer.from(`${ERP_USERNAME}:${ERP_PASSWORD}`).toString('base64');
    const res = await fetch(`${ERP_API_URL}/tercero/${nit}`, { method: 'GET', headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json' } });
    return res.ok;
  } catch (e) { return false; }
}

async function crearClienteEnERP(customer: any, shippingAddress: any, nitCliente: string): Promise<any> {
  const credentials = Buffer.from(`${ERP_USERNAME}:${ERP_PASSWORD}`).toString('base64');
  const firstName = customer?.first_name || shippingAddress?.first_name || 'Cliente';
  const lastName = customer?.last_name || shippingAddress?.last_name || 'Shopify';
  const email = customer?.email || 'noemail@shopify.com';
  const phone = customer?.phone || shippingAddress?.phone || '3000000000';
  const direccion = shippingAddress?.address1 || 'Dirección no especificada';
  const ciudad = shippingAddress?.city || 'SINCELEJO';
  const provincia = shippingAddress?.province || 'Sucre';
  const codigoDpto = obtenerCodigoDepartamento(provincia);
  const codigoMun = obtenerCodigoMunicipio(ciudad, codigoDpto);
  const nitNumerico = parseInt(nitCliente);
  const terceroData = {
    tercero: { nit: nitNumerico, identificacion: nitNumerico, razonsocial: `${firstName} ${lastName}`.trim().toUpperCase(), apli1: lastName.toUpperCase(), apl2: '', nom1: firstName.toUpperCase(), nom2: '', tdoc: 13, tipopersona: 'N', idtipoempresa: 4, obligacionfiscal: 'R-99-PN', tributoreceptor: 'ZZ' },
    sucursal: { idsuc: 0, nit: nitNumerico, razonsocial: `${firstName} ${lastName}`.trim().toUpperCase(), direccion1: direccion, ciudad: ciudad.toUpperCase(), departamento: provincia, dpto: codigoDpto, mun: codigoMun, telefono1: phone, movil: phone, email: email, emailfe: email }
  };
  const res = await fetch(`${ERP_API_URL}/tercero`, { method: 'POST', headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json' }, body: JSON.stringify(terceroData) });
  if (!res.ok) throw new Error(`Error creando cliente: ${res.status}`);
  return await res.json();
}

// ======= Buscar factura en ERP (guardia remota) =======
async function buscarFacturaEnERP(numeroFactura: number): Promise<boolean> {
  try {
    const credentials = Buffer.from(`${ERP_USERNAME}:${ERP_PASSWORD}`).toString('base64');
    const sql = `SELECT * FROM trfacturas WHERE numero = ${numeroFactura} AND prefijo = '${ERP_PREFIJO_FACTURA}' AND idsuc = ${ERP_IDSUC}`;
    const res = await fetch(`${ERP_API_URL}/consultasql?consulta=${encodeURIComponent(sql)}`, { method: 'GET', headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json' } });
    if (!res.ok) return false;
    const data = await res.json();
    return Array.isArray(data.result) && data.result.length > 0;
  } catch (e) { return false; }
}

// ======= Construcción de payload =======
async function construirPayloadShopify(orden: any): Promise<any> {
  return {
    ...orden,
    order_number: orden.shopify_order_number || orden.id,
    id: orden.shopify_order_id || orden.id,
    line_items: orden.items?.map((item: any) => ({ id: item.id, title: item.product_name, sku: item.product_sku, variant_id: item.shopify_variant_id ? parseInt(item.shopify_variant_id) : 0, price: item.unit_price.toString(), quantity: item.quantity, tax_lines: item.tax ? [{ price: item.tax.toString() }] : [] })) || [],
    customer: { email: orden.customer_email, first_name: orden.customer_name?.split(' ')[0] || 'Cliente', last_name: orden.customer_name?.split(' ').slice(1).join(' ') || 'Shopify', phone: orden.customer_phone || '3000000000' },
    shipping_address: orden.shipping_address,
    billing_address: orden.billing_address,
    subtotal_price: orden.subtotal?.toString(),
    total_price: orden.total?.toString(),
    total_tax: orden.tax?.toString(),
    financial_status: 'paid',
    fulfillment_status: orden.fulfillment_status,
    gateway: orden.payment_method || 'manual',
    currency: orden.currency || 'COP',
    note: orden.notes,
  };
}

// ======= Crear factura en el ERP =======
export async function crearFacturaElectronicaERP(order: any): Promise<FacturaResult> {
  try {
    // Early dry-run guard: do not perform any HTTP calls to the ERP when testing.
    if (process.env.ERP_DRY_RUN === 'true') {
      const numeroFactura = order.numero || await obtenerConsecutivoLocal();
      const payload = await construirPayloadShopify(order);
      try {
        console.log('[DRY_RUN] Simulando POST a ERP /fav. Payload:', JSON.stringify(payload));
      } catch (e) {
        console.log('[DRY_RUN] Simulando POST a ERP (payload too large to stringify)');
      }
      return {
        success: true,
        erp_doc_ref: `${ERP_PREFIJO_FACTURA}-${numeroFactura}`,
        erp_numero: numeroFactura,
        erp_nit_cliente: BigInt(extraerNitDelPedido(order)),
        cufe: 'DRYRUN',
        dian_valido: false,
        forma_pago: mapearFormaPagoShopify(order.gateway),
        productos_no_encontrados: []
      };
    }

    const credentials = Buffer.from(`${ERP_USERNAME}:${ERP_PASSWORD}`).toString('base64');
    const nitCliente = extraerNitDelPedido(order);
    const customer = order.customer;
    const shippingAddress = order.shipping_address;
    const clienteExiste = await verificarClienteEnERP(nitCliente);
    if (!clienteExiste) {
      await crearClienteEnERP(customer, shippingAddress, nitCliente);
    }
    const numeroFactura = order.numero || await obtenerSiguienteNumero();
    const detalles: any[] = [];
    const productosNoEncontrados: string[] = [];
    let pos = 1;
    // IMPORTANTE: la factura identifica cada línea SOLO por idproducto (código ERP, vía SKU).
    // Nunca usar item.title ni producto.nombre_comercial aquí: el título de Shopify es el
    // nombre comercial generado por IA y no debe llegar a documentos fiscales.
    for (const item of order.line_items || []) {
      const producto = await prisma.producto.findFirst({ where: { OR: [{ idproducto: item.sku }, { shopify_variant_id: item.variant_id?.toString() }] } });
      if (!producto) { productosNoEncontrados.push(item.sku); continue; }
      const precioUnitario = parseFloat(item.price);
      const cantidad = item.quantity;
      const porcIva = producto.porciva ? Number(producto.porciva) : 19;
      const subtotalItem = precioUnitario * cantidad;
      const ivaItem = (subtotalItem * porcIva) / 100;
      const netoItem = subtotalItem + ivaItem;
      detalles.push({ pos: pos++, idproducto: producto.idproducto, idbodega: ERP_IDBODEGA, cantidad, precio: precioUnitario, factor: 1, porciva: porcIva, codimp: obtenerCodigoImpuestoDetalle(porcIva), subtotal: subtotalItem, iva: ivaItem, neto: netoItem, operacion: 'SA', idunidad: 'Und' });
    }
    if (detalles.length === 0) return { success: false, error: 'No hay productos válidos para facturar', productos_no_encontrados: productosNoEncontrados };
    const subtotal = detalles.reduce((s, d) => s + d.subtotal, 0);
    const totalIva = detalles.reduce((s, d) => s + d.iva, 0);
    const total = detalles.reduce((s, d) => s + d.neto, 0);
    const impuestos = [{ codimp: '1103', base_calculo: subtotal, valor: totalIva, liquida: 'S' }];
    const formaPago = mapearFormaPagoShopify(order.gateway);
    const fechaActual = new Date();
    const fechaVencimiento = new Date(); fechaVencimiento.setDate(fechaVencimiento.getDate() + 1);
    const pagos = [{ idformapago: formaPago, fvence: fechaVencimiento.toISOString().split('T')[0], valor: total, plazo: 1, ref_doc: ERP_PREFIJO_FACTURA }];
    const firstName = customer?.first_name || shippingAddress?.first_name || 'Cliente';
    const lastName = customer?.last_name || shippingAddress?.last_name || 'Shopify';
    const tercero = { nit: parseInt(extraerNitDelPedido(order)), identificacion: parseInt(extraerNitDelPedido(order)), razonsocial: `${firstName} ${lastName}`.trim().toUpperCase(), apli1: (lastName.split(' ')[0] || '').toUpperCase(), apl2: '', nom1: (firstName.split(' ')[0] || '').toUpperCase(), nom2: '', tdoc: 13, tipopersona: 'N', idtipoempresa: 4, escliente: 'S', cliente_credito: 'S', fechacreacion: new Date().toISOString(), frevision: new Date().toISOString(), obligacionfiscal: 'R-99-PN', tributoreceptor: 'ZZ', regimentributacion: '49' };
    const sucursal = { idsuc: 0, nit: parseInt(extraerNitDelPedido(order)), razonsocial: `${firstName} ${lastName}`.trim().toUpperCase(), direccion1: shippingAddress?.address1 || 'Dirección no especificada', ciudad: (shippingAddress?.city || 'SINCELEJO').toUpperCase(), departamento: shippingAddress?.province || 'Sucre', dpto: obtenerCodigoDepartamento(shippingAddress?.province || 'Sucre'), mun: obtenerCodigoMunicipio(shippingAddress?.city || 'SINCELEJO', obtenerCodigoDepartamento(shippingAddress?.province || 'Sucre')), telefono1: shippingAddress?.phone || '3000000000', movil: shippingAddress?.phone || '3000000000', email: customer?.email || 'noemail@shopify.com', emailfe: customer?.email || 'noemail@shopify.com' };
    const facturaData = { documento: { encabezado: { idsuc: ERP_IDSUC, emisor: ERP_EMISOR, nit: parseInt(extraerNitDelPedido(order)), prefijo: ERP_PREFIJO_FACTURA, numero: numeroFactura, anulado: 'N', fecha: fechaActual.toISOString().split('T')[0], usuario: 'ERP', subtotal, iva: totalIva, total, sucursal: 0, comentarios: `Orden #${order.order_number}${order.note ? ` - ${order.note}` : ''}`, totalDet: detalles.length, totalImp: impuestos.length, totalPag: pagos.length, emitirdocfe: false, generarpdf: false }, detalle: detalles, impuesto: impuestos, pago: pagos, tercero, sucursal } };
    // Dry run mode: do not POST to ERP, just log payload and return simulated success
    if (process.env.ERP_DRY_RUN === 'true') {
      try {
        console.log('[DRY_RUN] Simulando POST a ERP /fav. Payload:', JSON.stringify(facturaData));
      } catch (e) {
        console.log('[DRY_RUN] Simulando POST a ERP (payload too large to stringify)');
      }
      return {
        success: true,
        erp_doc_ref: `${ERP_PREFIJO_FACTURA}-${numeroFactura}`,
        erp_numero: numeroFactura,
        erp_nit_cliente: BigInt(extraerNitDelPedido(order)),
        cufe: 'DRYRUN',
        dian_valido: false,
        forma_pago: formaPago,
        productos_no_encontrados: productosNoEncontrados
      };
    }

    const res = await fetch(`${ERP_API_URL}/fav`, { method: 'POST', headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json' }, body: JSON.stringify(facturaData) });
    if (!res.ok) {
      const txt = await res.text();
      return { success: false, error: `Error ERP ${res.status}: ${txt}`, productos_no_encontrados: productosNoEncontrados };
    }
    const data = await res.json();
    
    // El ERP de DSNube puede devolver 200 OK pero con un array "error" dentro del JSON si falló la creación
    if (data.error && data.error.length > 0) {
      return { success: false, error: `Error interno ERP: ${JSON.stringify(data.error)}`, productos_no_encontrados: productosNoEncontrados };
    }
    
    return { success: true, erp_doc_ref: `${ERP_PREFIJO_FACTURA}-${numeroFactura}`, erp_numero: numeroFactura, erp_nit_cliente: BigInt(extraerNitDelPedido(order)), cufe: data.cufe, dian_valido: data.dian_valido || false, forma_pago: formaPago, productos_no_encontrados: productosNoEncontrados };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Error desconocido', productos_no_encontrados: [] };
  }
}

// ======= Facturar (doble guardia, idempotente) =======
export async function facturar(ordenId: number): Promise<FacturaResult> {
  const orden = await prisma.orden.findUnique({ where: { id: ordenId }, include: { items: true } });
  if (!orden) return { success: false, error: 'Orden no encontrada' };
  if ((orden as any).billing_status === 'billed') return { success: true, erp_doc_ref: orden.erp_doc_ref };
  if (orden.erp_numero) {
    const existe = await buscarFacturaEnERP(orden.erp_numero);
    if (existe) {
      await prisma.orden.update({ where: { id: ordenId }, data: { billing_status: 'billed', erp_synced: true, erp_doc_ref: `${ERP_PREFIJO_FACTURA}-${orden.erp_numero}` } });
      return { success: true, erp_doc_ref: `${ERP_PREFIJO_FACTURA}-${orden.erp_numero}` };
    }
  }
  const numeroFactura = await obtenerSiguienteNumero();
  await prisma.orden.update({ where: { id: ordenId }, data: { erp_numero: numeroFactura } });
  const payload = await construirPayloadShopify(orden);
  const resultado = await crearFacturaElectronicaERP({ ...payload, numero: numeroFactura });
  await prisma.orden.update({ where: { id: ordenId }, data: { billing_status: resultado.success ? 'billed' : 'error', erp_synced: resultado.success, erp_doc_ref: resultado.erp_doc_ref ?? null, erp_sync_error: resultado.success ? null : resultado.error } });
  return resultado;
}
