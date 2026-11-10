from pathlib import Path
import sqlite3, json
root = Path(__file__).resolve().parents[1]
db = sqlite3.connect(':memory:')
db.executescript((root/'servidor/db/migraciones/001_crear_tablas.sql').read_text())
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
try:
    db.execute("insert into mediciones values('INEXISTENTE',1,0,0,0,0,0,0)")
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError('La clave foránea no bloqueó el registro')
print('SQLite correcto: tres muestras, JSON coincidente, unicidad y claves foráneas.')
