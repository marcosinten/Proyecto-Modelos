export function generarEscenario(tipo, aceleracion = 16, angulo = 60, permanencia = 150) {
  const mediciones = [];
  for(let n=0;n<=100;n++) {
    const t = n*100;
    const roll = tipo==='vuelco' ? Math.min(180,Math.max(0,(t-3500)/20)) : tipo==='inclinacion' ? 42*Math.sin(Math.PI*n/100)**2 : 2*Math.sin(n/10);
    const ax = tipo==='impacto' ? 30*Math.exp(-(((t-5000)/160)**2)) : tipo==='frenada' ? -7*Math.exp(-(((t-5000)/550)**2)) : .2*Math.sin(n/4);
    mediciones.push({numero:n+1,t_ms:t,ax,ay:9.81*Math.sin(roll*Math.PI/180),az:9.81*Math.cos(roll*Math.PI/180),roll_deg:roll,pitch_deg:tipo==='frenada'?ax:0});
  }
  let inicio=null, deteccion=null, causa=null;
  for(const m of mediciones) {
    const golpe = Math.hypot(m.ax,m.ay,m.az)>=aceleracion;
    const inclinado = Math.abs(m.roll_deg)>=angulo || Math.abs(m.pitch_deg)>=angulo;
    if(golpe||inclinado) {
      inicio ??= m.t_ms;
      if(m.t_ms-inicio>=permanencia){deteccion=m.t_ms;causa=golpe?'golpe':Math.abs(m.roll_deg)>=90?'vuelco':'inclinacion';break;}
    } else inicio=null;
  }
  const id = crypto.randomUUID();
  const sesion={id:'SIM-'+id,origen:'simulado'};
  return {version:1,sesion,mediciones,
    parametros:{escenario:tipo,aceleracion,angulo,permanencia},
    evento:deteccion===null?null:{id:'EV-'+id,sesion_id:sesion.id,tipo:causa,gravedad:causa==='golpe'||causa==='vuelco'?'alta':'media',estado:'confirmado',t_inicio_ms:0,t_fin_ms:10000,t_deteccion_ms:deteccion,t_activacion_ms:null,ubicacion:null}
  };
}
