/**
 * Configuración de entorno del cliente.
 *
 * Si `SUPABASE.url` está vacío, la app lee los precios de `data/prices.json`
 * y funciona igual. Al llenarlo, prefiere la base de datos y deja el archivo
 * como respaldo offline. No hace falta ningún paso de build.
 *
 * La llave publicable es PÚBLICA por diseño: solo permite leer, y lo que
 * protege los datos es RLS en la base. La `service_role` key NUNCA va aquí.
 */
export const SUPABASE = {
  url: '',
  publishableKey: ''
};

export function isSupabaseConfigured() {
  return Boolean(SUPABASE.url && SUPABASE.publishableKey);
}
