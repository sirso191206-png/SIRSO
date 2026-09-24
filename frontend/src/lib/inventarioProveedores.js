// Inventario REAL — verificado por inspección directa: package.json,
// supabase/functions/ (qué Edge Functions existen y qué llaman), y la
// guía de despliegue del proyecto. No declarar aquí ningún proveedor
// que no esté efectivamente en uso.

export const INVENTARIO_PROVEEDORES = [
  {
    proveedor: 'Supabase',
    servicio: 'Base de datos (PostgreSQL), autenticación, almacenamiento de archivos, funciones de servidor (Edge Functions)',
    finalidad: 'Es la infraestructura central de SIRO — aloja el expediente clínico, la autenticación de usuarios, las fotografías/radiografías y la lógica de servidor.',
    datos: 'Todos los datos personales y clínicos que SIRO administra.',
    transferencia: 'Sí, es indispensable para el funcionamiento del servicio.',
    enlace: 'https://supabase.com/privacy',
    estado: 'En uso'
  },
  {
    proveedor: 'Vercel (u otro hosting compatible)',
    servicio: 'Hospedaje del sitio web de SIRO',
    finalidad: 'Sirve la aplicación al navegador del usuario.',
    datos: 'Metadatos técnicos de la solicitud (dirección IP, navegador) — no accede al contenido clínico, que se comunica directamente con Supabase.',
    transferencia: 'Sí, es indispensable para el funcionamiento del servicio.',
    enlace: 'https://vercel.com/legal/privacy-policy',
    estado: 'En uso'
  },
  {
    proveedor: 'Resend',
    servicio: 'Envío de correo transaccional',
    finalidad: 'Envía el correo generado por el formulario de contacto (/contacto) al equipo de soporte.',
    datos: 'Nombre, correo y mensaje que la persona escribe en el formulario de contacto — no datos clínicos.',
    transferencia: 'Sí, solo para los mensajes de contacto.',
    enlace: 'https://resend.com/legal/privacy-policy',
    estado: 'En uso'
  }
]
