from pathlib import Path
import sqlite3, json
root = Path(__file__).resolve().parents[1]
db = sqlite3.connect(':memory:')
# Esquema base y migraciones nuevas (002, 003…) en orden, como hace servidor/src/adaptadores/sqlite/repositorio.js.
migraciones = sorted((root/'servidor/db/migraciones').glob('[0-9][0-9][0-9]_*.sql'))
for archivo in migraciones:
    db.executescript(archivo.read_text(encoding='utf-8'))
sql = (root/'servidor/db/datos-prueba/002_vuelco.sql').read_text()
db.executescript(sql)
db.executescript(sql)
assert db.execute('select count(*) from eventos').fetchone()[0] == 1
p = json.loads((root/'ejemplos/vuelco-002.json').read_text())
rows = db.execute('select numero,t_ms,ax,ay,az,roll_deg,pitch_deg from mediciones where sesion_id=? order by t_ms,numero',('SES-002',)).fetchall()
assert len(rows) == 3
for row,m in zip(rows,p['mediciones']):
    assert row == tuple(m[k] for k in ['numero','t_ms','ax','ay','az','roll_deg','pitch_deg'])
assert db.execute('pragma foreign_key_check').fetchall() == []
# Los datos viejos siguen siendo válidos: sin latencias medidas (NULL = «sin medir»).
assert db.execute("select latencia_deteccion_ms, latencia_activacion_ms from eventos where id='EV-002'").fetchone() == (None, None)
try:
    db.execute("insert into mediciones values('INEXISTENTE',1,0,0,0,0,0,0)")
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError('La clave foránea no bloqueó el registro')
print(f'SQLite correcto ({len(migraciones)} migraciones): tres muestras, JSON coincidente, unicidad, claves foráneas y EV-002 sin latencias.')
