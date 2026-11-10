// Copiar al frontend Vite. La clave se proporciona en tiempo de ejecución si se activa.
export function crearClienteApi({ base = 'http://127.0.0.1:3000/api/v1', apiKey = '' } = {}) {
  base = base.replace(/\/$/, '');
  async function pedir(ruta, cuerpo) {
    const r = await fetch(base + ruta, {
      method: cuerpo === undefined ? 'GET' : 'POST',
      signal: AbortSignal.timeout(10000),
      headers: { ...(apiKey ? { 'X-API-Key': apiKey } : {}), ...(cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
    });
    if (!r.ok) {
      const error = await r.json().catch(() => ({}));
      throw new Error(error.error?.mensaje || `Error HTTP ${r.status}`);
    }
    return r;
  }
  return {
    async obtenerEvento(id) { return (await pedir(`/eventos/${encodeURIComponent(id)}`)).json(); },
    async obtenerMediciones(id, despuesNumero = 0) {
      return (await pedir(`/sesiones/${encodeURIComponent(id)}/mediciones?despues_numero=${despuesNumero}`)).json();
    },
    async crearSesion(sesion) { return (await pedir('/sesiones', { version: 1, sesion })).json(); },
    async enviarMediciones(id, mediciones) { return (await pedir(`/sesiones/${encodeURIComponent(id)}/mediciones`, { version: 1, mediciones })).json(); },
    async guardarEvento(evento) { return (await pedir('/eventos', { version: 1, evento })).json(); },
    async descargarExcel(id) {
      const r = await pedir(`/eventos/${encodeURIComponent(id)}/excel`);
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url; a.download = `${id}.xlsx`; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };
}
