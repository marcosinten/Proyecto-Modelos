# Anexo de IA del carro RC

Cuaderno reproducible para generar tablas y figuras del informe del Grupo 11. Desde la raíz del proyecto, ejecutar:

```bash
~/.venvs/grupo11/bin/jupyter nbconvert --to notebook --execute --inplace anexos/Anexo_IA_Carro_RC_Grupo11.ipynb
```

Los datos físicos proceden de la hoja Repeticiones y de la base SQLite del servidor, abierta en modo de solo lectura; se guarda una instantánea CSV en `datos/`. La calibración proviene de `datos/calibracion_angulo.csv` y los datos de entrenamiento son sintéticos.

La numeración del informe corresponde a las figuras 26–29 y a las tablas 19–23 del cuaderno. La comprobación angular sin numerar reproduce la Tabla 18 del informe. La Figura 25 muestra el ajuste del ángulo en el capítulo 12. Los PNG se exportan a `anexos/figuras/` y los CSV numerados a `anexos/datos/`.

Para comprobar el cuaderno desde la raíz sin iniciar un kernel ni reescribir las instantáneas de las mediciones físicas:

```bash
~/.venvs/grupo11/bin/jupyter nbconvert --to script --output-dir=/tmp anexos/Anexo_IA_Carro_RC_Grupo11.ipynb
GRUPO11_USAR_INSTANTANEA=1 MPLBACKEND=Agg ~/.venvs/grupo11/bin/python /tmp/Anexo_IA_Carro_RC_Grupo11.py
```
