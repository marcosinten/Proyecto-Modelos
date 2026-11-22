# Anexo de IA del carro RC

Cuaderno reproducible para generar tablas y figuras del informe del Grupo 11. Desde la raíz del proyecto, ejecutar:

```bash
~/.venvs/grupo11/bin/jupyter nbconvert --to notebook --execute --inplace anexos/Anexo_IA_Carro_RC_Grupo11.ipynb
```

Los datos físicos proceden de la hoja Repeticiones y de la base SQLite del servidor, abierta en modo de solo lectura; se guarda una instantánea CSV en `datos/`. La calibración proviene de `datos/calibracion_angulo.csv` y los datos de entrenamiento son sintéticos.
