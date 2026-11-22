# 1 Problemática y contexto
## 1.1 Descripción del problema
### 1.1.1 Accidentes de tránsito y tiempo de respuesta
Una persona que presencia un siniestro puede tardar en advertirlo, comunicarlo y describir la posición del vehículo. Aslam et al. (2024) identifican la falta de información visual inicial como dificultad para los equipos de respuesta. En este proyecto se estudia el primer eslabón de esa cadena. Interesa medir cuánto tarda un dispositivo a bordo en reconocer una condición anómala y ordenar un aviso. El tiempo de llegada de los servicios de emergencia queda fuera del experimento.
[COMPLETAR (opcional): una cifra reciente sobre siniestralidad vial, por ejemplo de la OMS, con su cita APA]
### 1.1.2 Detección automática de accidentes
Un pico de aceleración puede corresponder tanto a un choque como al paso por un desnivel. Una frenada modifica además la dirección aparente de la gravedad. El problema experimental consiste en distinguir estas maniobras con las señales disponibles y conservar suficientes muestras para explicar cada decisión.
## 1.2 Justificación
### 1.2.1 Relación con la Ingeniería de Software
El sistema distribuye tareas con plazos distintos. La placa debe actuar en milisegundos, mientras que el servidor puede recibir las muestras después. Un contrato de datos común permite reproducir un episodio en la web y probar cada parte por separado. Los identificadores de sesión y de muestra permiten rastrear un aviso desde el dispositivo hasta el registro.
### 1.2.2 Relación con Modelos y Simulación
Al especificar el periodo de muestreo y la duración mínima de un evento se obtiene una predicción cuantitativa del tiempo de detección. La simulación permite variar un umbral con el mismo movimiento de entrada. En la maqueta se puede comprobar si la predicción se mantiene cuando cambian la superficie, el montaje y la forma de mover el carro.
## 1.3 Alcance del proyecto
### 1.3.1 Componentes y funciones del prototipo
Se instrumentó un carro de juguete movido a mano. El ESP32 lee la unidad inercial, clasifica golpes, inclinaciones y vuelcos, y activa una alarma visual, sonora y mecánica. La rueda instrumentada aporta pulsos. Una aplicación web permite observar la postura, revisar eventos, registrar pruebas y exportar mediciones.
### 1.3.2 Exclusiones del alcance (ubicación por GPS)
El prototipo carece de receptor GPS. El campo de ubicación se guarda como nulo y la carretera del visor sirve como referencia de postura. Las pruebas se limitan a una maqueta y a maniobras controladas. No se ensayaron vehículos de carretera ni se despacharon servicios de rescate.
# 2 Objetivos
## 2.1 Objetivo general
Modelizar, construir y evaluar un sistema embebido que detecte eventos de movimiento en un carro RC, active una alarma local y permita contrastar sus decisiones y tiempos con los de una simulación.
## 2.2 Objetivos específicos
1. Formular las reglas de detección y predecir sus latencias a partir de la frecuencia de adquisición y la permanencia.
2. Integrar los sensores y actuadores con un registro de telemetría que permita seguir cada prueba desde el ESP32 hasta el historial.
3. Calibrar las mediciones y contrastar las predicciones con seis escenarios físicos, atendiendo a la clase detectada, los tiempos y las falsas alarmas.
4. Evaluar fuera de línea si un árbol entrenado con datos sintéticos aporta información adicional sobre las maniobras físicas.
# 3 Marco teórico
## 3.1 Sistemas embebidos e Internet de las cosas
### 3.1.1 Microcontrolador ESP32
Un sistema embebido integra adquisición, cálculo y actuación en un dispositivo dedicado. El ESP32 combina interfaces digitales, temporizadores y conectividad inalámbrica (Espressif Systems, s. f.). En el carro, el bus I²C permite leer el sensor inercial, una interrupción registra los flancos de la rueda y las salidas digitales controlan la alarma.
### 3.1.2 Control local y comunicación con un servidor
La decisión con plazo breve se ejecuta junto al sensor. El almacenamiento y la visualización admiten más demora. Esta distribución permite conservar una respuesta local al perder la conexión. Los registros almacenados en memoria durante una interrupción están limitados por la capacidad de las colas.
## 3.2 Sensores inerciales MEMS
### 3.2.1 Acelerómetro y giroscopio
Un acelerómetro microelectromecánico mide fuerza específica por eje. Quieto sobre una mesa registra una magnitud próxima a g, porque la mesa sostiene el sensor. El giroscopio mide velocidad angular. Integrarla en el tiempo permite seguir un giro rápido, aunque un pequeño error de cero se acumula en el ángulo.
### 3.2.2 Módulo MPU6050
El MPU6050 reúne tres ejes de aceleración y tres de velocidad angular en un mismo marco de referencia (InvenSense, 2013). En la configuración del carro se leen los registros en un bloque de 14 bytes. Con rangos de ±16 g y ±2000 °/s, los factores nominales son 2048 cuentas/g y 16,4 cuentas/(°/s).
### 3.2.3 Error de cero y calibración
El desplazamiento de cero suma una componente aun cuando la entrada esperada es nula. Frente a dos orientaciones opuestas de un mismo eje, el promedio de las lecturas estima ese desplazamiento y la semidiferencia estima la respuesta a g. Para el giroscopio se promedian lecturas sin rotación y se resta ese promedio durante la marcha.
## 3.3 Estimación de la orientación
### 3.3.1 Ángulos roll y pitch por proyección de la gravedad
En reposo, la proyección del vector de referencia en los ejes permite calcular la inclinación (Fisher, 2010). En el montaje, roll describe el giro lateral y aumenta al subir el lado izquierdo. Pitch aumenta al levantar la trompa. La función atan2 conserva el cuadrante, necesario para distinguir el carro derecho del invertido.
### 3.3.2 Efecto de la aceleración dinámica
Al frenar en horizontal, la componente longitudinal cambia aunque el carro apenas gire. Si el cálculo atribuye toda la señal a la gravedad, estima una inclinación ficticia. Con −7 m/s² en X y 9,81 m/s² en Z se obtienen unos −35,5°. Este efecto motivó una prueba específica del filtro.
### 3.3.3 Filtro complementario y constante de tiempo
Se predice el ángulo con la velocidad angular y se corrige una fracción del error mediante la referencia gravitatoria. La constante de tiempo expresa la rapidez con la que el acelerómetro modifica esa predicción. Una corrección lenta atenúa aceleraciones breves y hace más importante medir bien el cero del giroscopio.
## 3.4 Sensor de efecto Hall
Un interruptor Hall cambia su salida cuando el campo magnético atraviesa su umbral. La salida de colector abierto del A3144 necesita una resistencia de elevación (Allegro MicroSystems, s. f.). Una pasada del imán produce un flanco contable. Con un único sensor el conteo permite estimar vueltas y frecuencia, pero deja indeterminado el sentido de giro.
## 3.5 Detección de eventos
### 3.5.1 Umbrales y tiempo de permanencia
El umbral fija la amplitud mínima de interés. La permanencia exige que la condición siga presente en lecturas sucesivas. Al interrumpirse la condición comienza una nueva cuenta. Así se evita que dos picos aislados confirmen juntos un golpe.
### 3.5.2 Frecuencia de muestreo
El intervalo entre lecturas es el inverso de la frecuencia. A 250 Hz transcurren 4 ms entre dos muestras consecutivas. El primer instante observable de cruce depende de la fase del movimiento respecto del reloj. Medir desde ese cruce reduce la incertidumbre al comparar el dispositivo con el modelo.
### 3.5.3 Máquinas de estados finitos
Una máquina de estados describe cómo cambian las salidas según la entrada actual y el estado previo. En este detector, una misma lectura puede iniciar un candidato, prolongar un evento abierto o posponer el rearme. Registrar el estado permite interpretar esas diferencias en la telemetría.
## 3.6 Modelación y simulación
### 3.6.1 Modelo determinista y simulación de escenarios
Un modelo determinista produce la misma trayectoria para las mismas entradas. El simulador prescribe velocidad y orientación en el tiempo, proyecta g y añade aceleración longitudinal. Se puede incorporar ruido con semilla fija para repetir exactamente una perturbación.
### 3.6.2 Verificación y validación de modelos
La verificación contrasta una implementación con sus reglas previstas. La validación contrasta las predicciones con observaciones del fenómeno de interés. Una prueba nativa puede verificar el contador de dos lecturas. Para evaluar si el umbral distingue una colisión de un desnivel se requiere una maniobra física etiquetada.
## 3.7 Ajuste de curvas por mínimos cuadrados
Se elige la función que minimiza la suma de los residuos al cuadrado, tomando como residuo la referencia menos la predicción. R² resume la proporción de variación explicada. El error absoluto medio expresa el desacuerdo típico en grados y la raíz del error cuadrático medio (RMSE) da mayor peso a residuos grandes. El R² ajustado penaliza el aumento del número de parámetros.
## 3.8 Métricas de evaluación de un detector
La diagonal de una matriz multiclase cuenta los tipos correctamente asignados. Para evaluar la presencia de una alarma, se agrupan golpe, inclinación y vuelco como positivos. La sensibilidad indica qué fracción de los accidentes se advirtió. La precisión indica qué fracción de las alarmas correspondió a un accidente. La tasa de falsas alarmas usa como denominador los ensayos sin accidente.
## 3.9 Árboles de decisión
Un árbol clasifica cada observación mediante una secuencia de comparaciones. Cada rama selecciona un subconjunto de ventanas y la hoja asigna la clase. La implementación de scikit-learn permite limitar la profundidad y examinar la ruta seguida (Pedregosa et al., 2011). Las ventanas de una misma corrida comparten señal y deben permanecer juntas al separar entrenamiento y prueba.
## 3.10 Arquitectura cliente-servidor y API REST
El cliente identifica un recurso mediante su ruta HTTP y envía o solicita una representación. Express gestiona las rutas y SQLite almacena los registros en una base local (Express, s. f.; SQLite, s. f.). En una red con reintentos, reconocer una escritura repetida evita que una misma maniobra se contabilice dos veces.
## 3.11 Trabajos relacionados
Aslam et al. (2024) evaluaron en un carro a escala la detección y representación de accidentes mediante sensores, GPS y visualización en Unity. En el presente prototipo se retoma la posibilidad de reconstruir la postura desde mediciones. El MPU6050 aporta aceleración y giro, Three.js dibuja el vehículo y el ESP32 conserva la decisión local. El contraste experimental se centra en el tiempo desde el cruce del umbral, la clase asignada y la respuesta ante maniobras sin accidente.
# 4 Metodología y proceso de desarrollo
## 4.1 Organización del trabajo
### 4.1.1 Distribución de tareas en el equipo
Se distinguen tres frentes documentados: montaje y adquisición, integración de software y evaluación experimental. El historial identifica cambios técnicos, pero resulta insuficiente para atribuir el trabajo de montaje o de prueba a una persona.
[COMPLETAR: identificar a los tres integrantes y especificar qué construyó, probó y documentó cada uno.]
### 4.1.2 Control de versiones con GitHub
La primera versión de telemetría consta el 10 de noviembre de 2026. El 15 se incorporaron circuito, escenarios y evidencias en wokwi-carro-rc. El 16 se integraron la revisión del 12, los materiales reales y el visor. Entre el 19 y el 20, ajustes-prototipo-real y firmware-circuito-real recogieron cambios de montaje, lectura de rueda y reconexión. El rediseño continuó en rediseno-ux y detalle-sesion. La rama entrega-cp2 partió de detalle-sesion e incorporó las mediciones, la calibración y la revisión del giroscopio los días 21 y 22.
### 4.1.3 Herramientas de apoyo utilizadas
Se emplearon Wokwi para el circuito, PlatformIO para compilar, GitHub para integrar cambios y un cuaderno Python para el análisis fuera de línea. Claude Code y Codex se utilizaron como asistentes de código y revisión. La interpretación de las maniobras físicas se apoya en las notas del equipo.
[COMPLETAR: confirmar las herramientas utilizadas por cada integrante y redactar la declaración de uso de asistentes de IA conforme a la política del curso.]
## 4.2 Fases del proyecto
### 4.2.1 Análisis de la ficha y selección de componentes
La ficha exigía integrar modelización, detección y respuesta automática. Se eligió un dispositivo programable con Wi-Fi, un módulo inercial que pudiera medir tanto traslación como giro y tres actuadores observables en la sustentación. El sensor de rueda se reservó para contextualizar el movimiento.
### 4.2.2 Diseño del contrato de datos y del software
Se definieron primero los identificadores de sesión, las unidades, el origen real o simulado y los intervalos de un evento. Así se pudo desarrollar el visor con datos de demostración y conectarlo después al circuito sin cambiar el significado de los campos.
### 4.2.3 Circuito virtual en Wokwi
Se prepararon secuencias reproducibles de entradas y verificaciones de pines. Durante las primeras pruebas, iniciar Wi-Fi provocaba pérdida de ciclos. El historial del 15 de noviembre recoge la corrección. El circuito virtual permitió revisar esa interacción antes de llevar el sistema a la maqueta (Wokwi, s. f.).
@F wokwi | La {n} muestra el circuito virtual y sus conexiones.
### 4.2.4 Banco de pruebas nativo
Se ejecutó el mismo programa de detección en la computadora con sustitutos del reloj, los sensores y las salidas. Al repetir señales idénticas se pudo localizar qué lectura confirmaba el evento. El banco también permitió revisar reintentos de red y cambiar el filtro manteniendo la frenada de entrada.
### 4.2.5 Montaje en protoboard
Se separaron los rieles de alimentación, se unieron las tierras y se probaron por etapas el bus I²C y las salidas. La documentación de conexiones se corrigió el 22 de noviembre para reflejar la resistencia de 330 Ω efectivamente montada en serie con el buzzer.
### 4.2.6 Montaje en el carro
Se reubicó el MPU en el carro y se comprobó la convención de ejes levantando por separado la trompa y el lado izquierdo. En la sesión de ejes se observaron +13,7° de pitch y +18,9° de roll, respectivamente. Esto permitió interpretar los signos negativos de dos pruebas como movimientos en sentido contrario.
[COMPLETAR: precisar la posición inicial y final del MPU y la observación que motivó su reubicación.]
### 4.2.7 Pruebas físicas y calibración
El 21 se registraron tres repeticiones por escenario. Los intentos interrumpidos, sin registro o con un choque ajeno a la maniobra se documentaron aparte. Después se probó el Hall con el imán y se obtuvieron medidas estáticas en seis posiciones. Dos medidas angulares adicionales completaron el conjunto de calibración.
### 4.2.8 Ajustes del modelo a partir de las pruebas
El equipo fijó la inclinación en 10° y alineó el código que todavía usaba 20°. En el banco apareció inclinación durante una frenada sin giro, lo que llevó a ensayar el filtro complementario antes de las 18 pruebas. Más tarde, un arranque con calibración fallida dejó una desviación de 13,8° en reposo. El firmware revisado recupera el cero por separado. La vibración vertical del imán pesado justificó proponer un imán menor para una prueba posterior.
# 5 Arquitectura de la solución
## 5.1 Visión general
El flujo comienza en la maqueta. El ESP32 decide y ordena la alarma. El servidor conserva la sesión y el navegador representa las muestras recibidas. Esta distribución permite distinguir la latencia de actuación del retraso con el que una persona ve el aviso en pantalla.
@F bloques | En la {n} se puede seguir por separado el camino de la alarma y el del registro remoto.
## 5.2 Capa física: sensores y actuadores
El MPU aporta las señales de decisión. El Hall y el pulsador dan entradas digitales independientes. El LED y el buzzer reproducen un patrón temporal según el tipo de evento, y la banderita del servo hace visible la alarma incluso en una fotografía.
## 5.3 Capa embebida: firmware del ESP32
La adquisición conserva el instante de lectura y aplica las reglas antes de publicar (Grupo 11, 2026). Un anillo guarda telemetría y una cola conserva los eventos cerrados para la tarea de red. Si se llena una cola, el registro serie permite identificar la pérdida. La capacidad de recuperación depende de cuánto dure la desconexión.
## 5.4 Capa de servidor: API y base de datos
El adaptador HTTP valida el contrato v1, el repositorio escribe en SQLite y las consultas reconstruyen sesiones con sus muestras y eventos. Cada prueba física añade un tramo temporal con el resultado que esperaba el equipo.
@T 8 | La {n} especifica las claves que permiten reunir los datos de cada sesión.
@F 6 | Las relaciones de la {n} explican por qué una sesión puede conservar mediciones incluso cuando no contiene ningún evento.
## 5.5 Capa de presentación: aplicación web
Vite sirve la aplicación y reenvía las consultas de la API durante el desarrollo. Three.js representa el modelo del carro y Chart.js dibuja las mediciones. Al seleccionar un evento guardado se pueden revisar sus muestras aunque el dispositivo ya esté desconectado.
## 5.6 Flujo de datos de extremo a extremo
Tras el arranque se registra una sesión. El ESP32 envía lotes de hasta 50 muestras, aproximadamente cada 0,5 s, y coloca en la cola el evento al cerrarlo. El navegador consulta las novedades cada 200 ms. Las marcas del reloj de sesión permiten ordenar la secuencia aunque el envío se retrase.
@F 5 | La {n} sitúa los intercambios HTTP respecto de la decisión local.
# 6 Modelización del sistema
## 6.1 Variables, parámetros, entradas y salidas
### 6.1.1 Variables de entrada
En cada lectura se observan las componentes de aceleración y giro en los ejes del carro. El tiempo de la lectura permite asociar una duración a una sucesión de condiciones verdaderas. Los pulsos del Hall y la pulsación de D33 se adquieren por separado.
@T 3 | La {n} relaciona las magnitudes físicas con los nombres que se observan en el código.
### 6.1.2 Parámetros del modelo
Durante una prueba permanecen fijos los umbrales, los tiempos de permanencia, el coeficiente del filtro y los periodos de adquisición y publicación. La distinción importa para el análisis de sensibilidad, donde se modifica un solo umbral por serie.
@T 4 | Los valores de la {n} constituyen la configuración de referencia.
### 6.1.3 Variables de salida
Se obtiene un estado del detector en cada lectura y una etiqueta al cerrar un episodio. Se transmiten muestras con aceleración, ángulos filtrados y, cuando están disponibles, datos de la rueda. Las órdenes a LED, buzzer y servo se emiten al confirmar la condición.
## 6.2 Modelo matemático
### 6.2.1 Magnitud de la aceleración y desviación de la gravedad
Se calcula la norma del vector medido. La regla de golpe compara directamente esa norma con 16 m/s². Su distancia a g describe la intensidad de una perturbación y se utiliza como característica en el análisis por ventanas.
= ‖a‖ = √(aₓ² + aᵧ² + a_z²),     d = |‖a‖ − g|     (1)
### 6.2.2 Ángulos a partir del acelerómetro
Con X hacia delante, Y hacia la izquierda y Z hacia arriba, la proyección estática es proporcional a (sen θ, sen φ cos θ, cos φ cos θ). En la simulación se suma la aceleración longitudinal a X. Se expresan en grados los ángulos obtenidos con las ecuaciones siguientes.
= φₐ = atan2(aᵧ, a_z) · 180/π     (2)
= θₐ = atan2(aₓ, √(aᵧ² + a_z²)) · 180/π     (3)
### 6.2.3 Filtro complementario (α = 0,999 y τ ≈ 4 s)
En el paso k se parte del ángulo anterior y se integra el giro con el intervalo medido en segundos. El signo negativo de la velocidad angular en Y respeta la convención de pitch. En roll se envuelve la diferencia a ±180° para atravesar el límite angular sin saltos.
= φₖ = α(φₖ₋₁ + ωₓ Δt) + (1 − α)φₐ     (4)
= θₖ = α(θₖ₋₁ − ωᵧ Δt) + (1 − α)θₐ     (5)
= τ = α Δt / (1 − α) = 3,996 s     (6)
### 6.2.4 Reglas de detección y tiempos de permanencia
Se confirma un golpe con ‖a‖ ≥ 16 m/s² en dos lecturas consecutivas. La inclinación exige |φ| o |θ| ≥ 10° durante 150 ms con el ángulo filtrado. El vuelco exige |φₐ| ≥ 90° durante 150 ms con el acelerómetro. Cada condición conserva su propio historial. Dentro de un episodio puede aumentar la gravedad cuando se confirma otra regla.
### 6.2.5 Latencias de detección y de activación
Desde la primera lectura válida hasta la segunda transcurre un intervalo. Para orientación, el primer múltiplo de 4 ms que alcanza los 150 ms es 152 ms. La activación se cronometra desde la confirmación hasta las órdenes de salida. El recorrido mecánico del servo requeriría una medición externa.
= Lgolpe = (2 − 1) Δt = 4 ms     (7)
= Langular = ⌈150/4⌉ · 4 ms = 152 ms     (8)
### 6.2.6 Nivel de gravedad del evento
Se asigna gravedad media a la inclinación y alta al golpe o al vuelco. Si varias reglas se cumplen, prevalece vuelco, seguido de golpe e inclinación. La etiqueta sirve para interpretar la alarma de la maqueta. El modelo carece de variables de masa, energía disipada o lesión.
## 6.3 Máquina de estados del detector
### 6.3.1 Estados y transiciones
Desde NORMAL, un cruce inicia ALERTA. Si desaparece, se descarta el candidato. Una condición confirmada abre EMERGENCIA. Al cerrarse el episodio se encola el registro y se entra en REARME. El retorno a NORMAL requiere 1 s sin condición. Un vuelco puede abrir una nueva emergencia durante el rearme si el episodio anterior no fue un vuelco.
@T 5 | La {n} detalla cuándo se descarta un candidato y cuándo se conserva como episodio.
@F estados | La {n} reúne las transiciones, incluida la escalada desde el rearme.
### 6.3.2 Respuesta de los actuadores en cada estado
Antes de la primera confirmación, NORMAL y ALERTA mantienen la alarma apagada. EMERGENCIA la enclava. REARME y el posterior regreso a NORMAL permiten preparar el siguiente evento mientras las salidas conservan su último patrón hasta el reconocimiento manual. Una pulsación corta apaga la alarma en cualquier estado.
@T 6 | La {n} permite identificar la clase de evento a partir del patrón de las salidas.
## 6.4 Modelo de la rueda con el sensor Hall
Con P pulsos y n imanes, las vueltas son P/n. Para un intervalo Δtₚ en segundos entre flancos aceptados, la frecuencia es 1/(n Δtₚ). Se usa n = 1 y un filtro mínimo de 3000 µs entre flancos. Tras 750 ms sin pulsos se informa cero, de modo que a giro lento pueden alternarse lecturas positivas y cero aunque el contador avance. El diámetro de la rueda física queda sin medir, por lo que no se calcula distancia a partir del radio ilustrativo de la simulación.
# 7 Simulación
## 7.1 Herramientas de simulación
### 7.1.1 Wokwi
El archivo diagram.json define el cableado virtual y los escenarios controlan aceleración, giro, flancos y pulsaciones. Las expectativas de pines permiten examinar salidas digitales junto con el registro serie. Para comunicar Wokwi con la API local se contempla la pasarela de red descrita en la guía del proyecto.
### 7.1.2 Banco de pruebas nativo
El programa ejecutar_pruebas.py compila el firmware con sustitutos de los periféricos y reproduce secuencias sin una placa. El reloj simulado hace repetible el orden de lecturas. Esta prueba valida lógica y temporización programada, mientras que la latencia de la electrónica física se mide en la maqueta.
### 7.1.3 Simulador de la aplicación web
La función generarEscenario produce señales con un paso de 4 ms y guarda por separado el ángulo real prescrito y el ángulo reconstruido. El usuario puede cambiar el rango del acelerómetro, el ruido y la duración del impacto. El evento de resumen conserva el tipo de mayor prioridad entre las reglas confirmadas.
## 7.2 Escenarios simulados
### 7.2.1 Parámetros de cada escenario
En la web, reposo mantiene velocidad nula. Marcha acelera suavemente hasta 2 m/s y reduce la velocidad desde los 8 s. Frenada comienza a detenerse a los 4,5 s durante 0,7 s. Golpe inicia la parada a los 4,9 s y la concentra en 100 ms. Inclinación prescribe una oscilación lateral de hasta 42°. Vuelco gira 180° en 2 s desde los 3,5 s. El radio de 0,03 m solo caracteriza la rueda simulada.
### 7.2.2 Señales sintéticas generadas
La transición s(u) = 3u² − 2u³, con u entre 0 y 1, enlaza los tramos con pendiente nula en sus extremos. La derivada de la velocidad produce la aceleración longitudinal y las derivadas de la postura producen el giro. El banco tiene estímulos propios: por ejemplo, su frenada llega a −7 m/s² sin giro. Por ello los máximos del banco y de la web pueden diferir.
## 7.3 Resultados de la simulación
### 7.3.1 Comprobaciones del firmware
En la revisión vigente, el banco nativo superó 57 de 57 comprobaciones, incluidas la presencia de picos entre publicaciones, la alarma sin Wi-Fi y los reintentos con el mismo contenido. Las evidencias de Wokwi pertenecen al firmware del 16 de noviembre. Sus pruebas de pines corresponden a los parámetros de aquella versión. Repetirlas con el firmware actual requiere un token de Wokwi.
### 7.3.2 Sensibilidad a los umbrales
Se ejecutaron dos barridos independientes sobre los seis escenarios ideales, con α = 0,999, ruido nulo y permanencias fijas. Se varió el umbral de golpe entre 12 y 24 m/s² en pasos de 2 y se añadió 32 m/s². Para inclinación se probaron 5° a 30° en pasos de 5° y se añadió 45°. Los extremos adicionales comprueban qué ocurre al exceder el pico. El CSV conserva las 90 corridas, incluidas las de referencia repetidas en ambos barridos.
@T sensibilidad | En la {n} se distingue el instante de confirmación de la espera posterior al cruce.
Al pasar de 5° a 30°, el primer cruce sostenido del escenario de inclinación se desplazó de 1124 a 3208 ms desde el inicio. La confirmación se desplazó de 1276 a 3360 ms. La diferencia permaneció en 152 ms porque la regla exige la misma permanencia después del cruce. A 45° el escenario de 42° quedó sin alarma. En impacto la latencia fue 4 ms entre 12 y 24 m/s², y a 32 m/s² desapareció la detección. El experimento físico utilizó un único juego de umbrales, por lo que estas curvas describen la simulación.
## 7.4 Aportes de la simulación al diseño
### 7.4.1 Inclinación aparente durante la frenada
En la web, el pitch real del escenario alcanzó 3,4° y su estimación con el acelerómetro llegó a 26,5°. En el banco, la aceleración longitudinal sin giro produjo 36,0° aparentes. Con el umbral de 10°, ambos escenarios podían activar una alarma de inclinación sin que la postura justificara ese aviso.
### 7.4.2 Selección del coeficiente α
Con α = 0,98 la corrección hacia el acelerómetro seguía siendo rápida comparada con la frenada. Con α = 0,999 el máximo bajó a 7,7° en el banco y a 4,1° en la web. El giro de una inclinación real siguió entrando por el giroscopio y conservó la respuesta prevista desde el cruce.
@T 13 | La {n} contrasta las tres configuraciones del filtro sobre cada una de las dos frenadas sintéticas.
@F 8 | La {n} muestra en qué configuraciones el máximo de pitch queda por debajo del umbral.
# 8 Diseño y construcción del prototipo
## 8.1 Materiales y componentes
Se eligieron materiales que permitieran desplazar el carro sin un cable a la computadora y observar su respuesta local. El módulo inercial aporta seis ejes en una sola placa y los tres actuadores permiten comprobar una misma decisión por medios distintos.
@T 1 | La {n} identifica los materiales y la función que cumple cada uno.
## 8.2 Esquema eléctrico y asignación de pines
El MPU6050 recibe 3,3 V. SDA va a GPIO21, SCL a GPIO22 y AD0 a tierra selecciona 0x68. El LED usa GPIO25 con 330 Ω. GPIO27 alimenta el buzzer activo TMB12A05 a través de 330 Ω y cuenta con una resistencia de 4,7 kΩ a tierra, sin transistor. El SG90 recibe señal en GPIO26. El Hall usa GPIO32 y el pulsador une GPIO33 a tierra con elevación interna. El Anexo A recoge las posiciones de protoboard.
@F 1 | En la {n} puede seguirse cada señal desde el ESP32 hasta el módulo correspondiente.
## 8.3 Alimentación del sistema
Un power bank de 5 V alimenta el ESP32 por USB. El riel de VIN alimenta el servo y el A3144. La salida del Hall se eleva a 3,3 V con 4,7 kΩ para que la tensión lógica sea compatible con el ESP32. Los rieles comparten tierra. Un condensador de 100 nF y otro de 470 µF están conectados entre 5 V y tierra.
## 8.4 Proceso de montaje
### 8.4.1 Montaje en protoboard
La distribución separa el bus I²C de las conexiones de los actuadores y deja accesible el pulsador de reconocimiento. Al verificar el montaje se siguió el trayecto de cada señal desde el GPIO hasta la fila correspondiente de la protoboard.
@F protoboard | La {n} documenta la ubicación física de los puentes y las resistencias.
### 8.4.2 Montaje en el carro
Se fijó el sensor al chasis para que acompañara el movimiento que se pretendía medir. Las pruebas de signo y nivel permitieron distinguir un cambio de orientación real de una desviación de montaje. Se mantuvo acceso al USB y al pulsador para iniciar otra sesión.
@F prototipo | La {n} sitúa la instrumentación y la alimentación en el chasis.
@F ejes | La {n} relaciona los ejes del sensor con la trompa y los costados del vehículo.
### 8.4.3 Instalación del sensor Hall y del imán
Se instaló el A3144 frente a la trayectoria del imán de una rueda trasera. La separación debe permitir una transición definida en cada pasada. Acercar lentamente el imán al punto de conmutación produjo una ráfaga espuria, aun con el filtro temporal de flancos.
@F hall | La {n} muestra la posición relativa del imán y el sensor.
## 8.5 Funcionamiento del prototipo
Se enciende el carro en una superficie quieta y se espera la calibración. Tras la confirmación de un evento, el LED, el buzzer y la banderita indican la alarma. Una pulsación corta de D33 reconoce el aviso y devuelve el servo a 0°. Mantener D33 durante 3 s reinicia el ESP32 y da lugar a una sesión nueva.
# 9 Desarrollo de software
## 9.1 Firmware del ESP32
### 9.1.1 Adquisición a 250 Hz y publicación a 50 Hz
La decisión se ejecuta en cada lectura de 4 ms. De cada grupo de cinco se conserva la muestra de mayor norma y su propia marca temporal. Así se representa el pico de la ventana de 20 ms. El registro publicado por sí solo no permite reconstruir las cinco muestras ni demostrar que un umbral se mantuvo en dos lecturas consecutivas.
### 9.1.2 Calibración en el arranque
Con el módulo quieto y boca arriba se toman hasta 500 lecturas por intento. La dispersión del giro en X e Y permite aceptar su cero independientemente de la calibración de aceleración. Sin un cero válido, se usa la postura derivada del acelerómetro hasta poder estimar el sesgo durante dos segundos de quietud.
### 9.1.3 Lógica de detección y control de actuadores
La rutina de decisión actualiza los contadores antes de confirmar la clase. Se mide con micros() la diferencia entre la primera lectura candidata y la confirmación, y entre la confirmación y las órdenes a las salidas. Un episodio conserva su identidad si escala de inclinación a golpe o vuelco antes del cierre.
@F flujo | La {n} ordena las decisiones que se toman en cada lectura y al cerrar el episodio.
### 9.1.4 Envío de datos a la API y reintentos
La tarea de red crea la sesión, envía las mediciones pendientes y reintenta con el mismo JSON ante una respuesta incierta. Al recibir un 404 de sesión, el firmware puede recrearla y reenviar lo pendiente. El anillo de 1000 muestras limita cuánto tiempo puede conservarse la telemetría sin conexión.
## 9.2 Contrato de datos v1
Cada petición de escritura incluye version = 1. Las unidades y tipos están definidos en contratos/v1. El par sesión y número identifica la muestra, y un identificador propio distingue cada evento. La ubicación admite coordenadas o nulo. Los campos opcionales de estado y latencia permiten leer mediciones y eventos previos a su incorporación.
## 9.3 Servidor
### 9.3.1 API REST con Express
La API recibe lotes por POST /api/v1/sesiones/:id/mediciones y el evento cerrado por POST /api/v1/eventos. Una lectura histórica recupera los datos asociados al intervalo. Los tramos de prueba añaden una referencia independiente para evaluar el detector.
@T 7 | La {n} identifica qué recurso consulta o actualiza cada cliente.
### 9.3.2 Base de datos SQLite y migraciones
Las seis migraciones crean el esquema y añaden latencias de evento, registro de pruebas, estado de medición, fin de prueba y múltiples tramos por sesión. La última conserva los registros anteriores con inicio cero y su fin disponible. Las consultas usan los límites inclusivos de cada tramo para evitar atribuir movimientos posteriores a una prueba terminada.
## 9.4 Pruebas automáticas del software
La revisión del 22 de noviembre documenta pruebas de contrato, persistencia, representación y coherencia entre los parámetros compartidos y el firmware. La compilación con PlatformIO verifica que el programa cabe en el ESP32 (PlatformIO, s. f.). El consumo de memoria compilada y la prueba del detector responden a preguntas diferentes.
@T 19 | La {n} recoge los resultados registrados para cada herramienta y versión.
# 10 Aplicación web
## 10.1 Monitor en vivo
### 10.1.1 Visor 3D del carro
Al conectar una sesión activa, el visor orienta el carro con roll y pitch y lo apoya sobre una carretera de referencia. El giro visible de la rueda está asociado a los pulsos recibidos. La escena muestra postura sin atribuir una posición geográfica a la maqueta.
@F monitor | La {n} muestra cómo se identifica la sesión a la que pertenece la postura visible.
### 10.1.2 Gráficas, estados y avisos
Las gráficas sitúan las señales respecto de sus umbrales y marcan el instante de los eventos. El estado recibido ayuda a distinguir un primer cruce de una emergencia confirmada. Los avisos de nueva sesión y de evento guardado permiten seguir una prueba sin mirar el monitor serie.
## 10.2 Simulador de escenarios
La pantalla permite elegir la maniobra, ajustar parámetros y comparar el ángulo verdadero del modelo con la estimación. La selección del origen simulado conserva la procedencia de la corrida cuando se guarda y se consulta después junto a registros reales.
@F simulador | La {n} sitúa los controles que determinan la maniobra sintética.
## 10.3 Historial y explicación de eventos
Desde el historial se selecciona una sesión o un evento. El detalle reúne tipo, gravedad, postura, mediciones y marcas de tiempo. La pantalla de explicación vincula el aviso con las señales guardadas, de modo que una falsa alarma pueda revisarse con la nota de la maniobra.
@F historial | La {n} muestra la relación entre el registro guardado y su explicación.
## 10.4 Pantalla de resultados y métricas
Resultados agrupa las repeticiones por escenario, contrasta medias y dispersión con la simulación y presenta la matriz de confusión. Un escenario sin eventos conserva su registro y forma parte del denominador. De otro modo, se perderían los verdaderos negativos.
@F 17 | La {n} reproduce la pantalla desde la que se consultaron los resultados.
## 10.5 Exportación a Excel
En Exportar, el navegador arma el libro con ExcelJS para la sesión o el evento seleccionado, en formato resumen o técnico. El servidor también expone GET /api/v1/eventos/:id/excel. El libro específico de Resultados reúne la comparación experimental, las repeticiones y las métricas utilizadas en este informe.
@F exportar | La {n} muestra la selección de contenido previa a la descarga.
# 11 Pruebas de funcionamiento
## 11.1 Protocolo de pruebas físicas
### 11.1.1 Escenarios y repeticiones
Se registraron 18 repeticiones el 21 de noviembre de 2026. En reposo se dejó el carro quieto sobre una mesa y se alimentó por USB. Con power bank se ensayaron marcha recta, frenada a mano, choque frontal contra un libro o caja firme, inclinación sostenida y vuelco. Se hicieron tres repeticiones por escenario. Durante esta serie faltaba el imán de la rueda. La prueba del Hall se hizo después.
### 11.1.2 Registro del resultado esperado
A cada tramo se asoció el escenario realizado, su repetición y una nota del operador. Reposo, marcha y frenada esperaban ausencia de alarma. Los otros tres escenarios esperaban la clase correspondiente. Se limitó el análisis al intervalo registrado hasta el «hecho» del operador. Al coexistir eventos se eligió el tipo de mayor prioridad para la clasificación y se tomó la latencia del primer evento del tipo esperado, si lo había, o del tipo detectado en su defecto.
## 11.2 Calibración
### 11.2.1 Calibración del acelerómetro en seis posiciones
Se dejó el carro inmóvil sobre cada cara. Orientar sucesivamente los ejes hacia arriba y hacia abajo permitió estimar desplazamiento y escala respecto de g = 9,80665 m/s². La norma medida varió de 9,39 a 10,42 m/s² según la posición. Las componentes transversales ayudan a reconocer desalineación del módulo respecto del chasis.
@T 14 | La {n} conserva las tres componentes por orientación, incluida su dispersión en la norma.
@T 15 | Al emparejar las caras opuestas se obtienen los desplazamientos y escalas de la {n}.
### 11.2.2 Calibración del ángulo con una aplicación de nivel
Se apoyó el carro y se comparó el ángulo obtenido del acelerómetro con la lectura de una aplicación de nivel del celular. Se conservaron 11 pares de roll y dos de pitch. Se excluyó la fila de ejemplo del CSV. La referencia tiene una incertidumbre aproximada de 0,5° a 1° y se anotó el intervalo observado cuando la lectura oscilaba.
@T 16 | La {n} permite localizar los residuos mayores y comprobar qué eje cuenta con más observaciones.
### 11.2.3 Cero del giroscopio
En la sesión de calibración se midieron −3,46, −1,57 y −1,82 °/s en X, Y y Z en reposo. Dejar sin restar el sesgo de X durante el filtrado produce una desviación de unos 3,46 × 4 = 13,84°, compatible con los 13,8° observados. La versión 2026.11.22-cp2-giro acepta el cero si la desviación estándar del giro en X e Y es menor de 0,5 °/s. Tras la corrección, la diferencia entre el ángulo filtrado y el del acelerómetro en reposo quedó por debajo de 0,2°.
## 11.3 Prueba del sensor Hall
Primero se pasó el imán frente al sensor sin la rueda. Después se comparó el aumento del contador con diez vueltas marcadas a mano. La prueba confirmó un pulso por vuelta. Al manipular lentamente el imán apareció ruido, y el peso del imán instalado introdujo vibración vertical que activó la regla de golpe.
@T 18 | La {n} distingue las pruebas de conmutación, conteo y velocidad de rueda.
## 11.4 Prueba de los actuadores
Se contrastó el patrón previsto para cada clase con la salida local de la maqueta. El registro mide el momento en que el ESP32 ordena encender LED y buzzer y mover el SG90. La pulsación corta permite comprobar el apagado y el retorno de la banderita al reposo. La evidencia disponible cuantifica la demora de las órdenes. Para cronometrar todo el recorrido del servo se necesitaría una referencia visual sincronizada.
# 12 Resultados y análisis
## 12.1 Comparación entre la simulación y el prototipo
### 12.1.1 Tiempos de detección
El golpe se confirmó en 4,029 ± 0,005 ms frente a 4 ms previstos. En inclinación se midieron 151,90 ± 0,32 ms y en las repeticiones de vuelco 152,15 ± 0,22 ms frente a 152 ms. Se informa media ± desviación estándar muestral por escenario esperado. El grupo de vuelco incluye la repetición de costado cuya alarma se abrió como inclinación. Por ello esta última media caracteriza las maniobras ensayadas, no tres confirmaciones de la regla de 90°.
@T 9 | La {n} reúne las predicciones y los valores observados con su dispersión.
@F 13 | En la {n} se aprecia la diferencia de escala temporal entre golpe y orientación.
La traza de golpe permite localizar el pico dentro del registro publicado. En la inclinación interesa la duración del cruce sostenido. El intervalo de confirmación de 4 ms del golpe es más breve que un periodo de publicación, por lo que se usó el reloj interno para medirlo.
@F 9 | La {n} permite examinar la aceleración publicada durante el tercer golpe.
@F 10 | En la {n} se distingue la permanencia de la inclinación antes de la confirmación.
### 12.1.2 Latencias de activación
Las órdenes a los actuadores se emitieron aproximadamente entre 0,5 y 1,05 ms después de confirmar el evento, según las notas y el registro de eventos. La latencia más alta entre los eventos principales de las repeticiones fue 1,048 ms en Golpe 1. Las diferencias entre escenarios en el tiempo total se explican principalmente por la permanencia exigida.
@F 16 | La {n} compara ambas latencias en cada repetición que produjo alarma.
### 12.1.3 Picos de aceleración y ángulos máximos
El pico medio de los tres golpes fue 28,57 m/s² frente a 31,51 m/s² simulados, una diferencia aproximada del 9,3 % respecto de la simulación. El mayor contraste en vuelco fue la dispersión: 24,52 ± 17,69 m/s² en la maqueta frente a 10,26 m/s² en el modelo. Apoyar el carro y voltearlo a mano introduce contactos que la trayectoria ideal omite. De igual manera, los 42° del escenario de inclinación representan su amplitud prescrita.
@F 14 | La {n} muestra cuánto varió el pico de aceleración entre maniobras.
@F 15 | La {n} compara los máximos de roll y permite apreciar la variabilidad de los vuelcos manuales.
## 12.2 Desempeño del detector
### 12.2.1 Matriz de confusión
La unidad de evaluación fue la repetición física. Aunque dos maniobras sin accidente produjeron varios eventos, cada una ocupa una sola celda. Los tres golpes esperados y las tres inclinaciones se clasificaron correctamente. De tres vuelcos esperados, dos se clasificaron como vuelco y uno como inclinación.
@T 11 | Cada fila de la {n} corresponde a la clase esperada y cada columna al resultado del firmware.
### 12.2.2 Exactitud, sensibilidad, precisión y tasa de falsas alarmas
La diagonal suma 15 de 18 aciertos de tipo (83,3 %). Al agrupar las tres clases de accidente hubo 9 verdaderos positivos, 7 verdaderos negativos, 2 falsos positivos y 0 falsos negativos. La sensibilidad fue 9/9 = 100 %, la precisión 9/11 = 81,8 % y la tasa de falsas alarmas 2/9 = 22,2 %. La alarma del vuelco de costado cuenta como verdadera positiva en esta evaluación binaria y como error de tipo en la exactitud.
@T 12 | La {n} explicita el denominador de cada métrica.
### 12.2.3 Análisis de las falsas alarmas y del error de clasificación
Marcha 3 pasó por un desnivel y produjo dos eventos de golpe. Frenada 2 incluyó paradas muy duras con la mano y produjo tres. Son dos repeticiones con falsa alarma, cinco eventos en total. En Vuelco 1 la geometría del carro dejó el roll del acelerómetro en 81,4° de costado. Se sostuvo la inclinación y sonó la alarma, pero faltaron 8,6° para alcanzar el umbral de vuelco.
## 12.3 Frenada: ángulo del acelerómetro frente al ángulo filtrado
En Frenada 2, el máximo absoluto del pitch calculado a partir del acelerómetro fue 54,9°. El filtrado alcanzó 2,35° y permaneció dentro de la banda de ±10°. El tramo continuo observado por encima de 10° con el acelerómetro duró como máximo 124 ms en las muestras publicadas. La falsa alarma que sí ocurrió se explica por la aceleración de golpe. Reducir el pitch aparente resuelve un problema distinto al de las paradas bruscas.
@F 11 | La {n} superpone ambas estimaciones de pitch durante la maniobra.
## 12.4 Ajuste de curvas
### 12.4.1 Ajuste lineal frente a ajuste cuadrático
Con x igual al ángulo del MPU e y igual al de la aplicación, la recta estimada fue y = 1,0085x − 0,7064. Dio R² = 0,9977, error absoluto medio de 1,259° y RMSE de 1,604°. El término cuadrático elevó R² a 0,9980 y redujo el error absoluto medio en 0,042°. Se eligió la recta porque con 13 medidas la ganancia del término adicional es pequeña frente a la incertidumbre de referencia.
@T 17 | La {n} compara ambos modelos con las mismas 13 observaciones.
@F 12 | La {n} permite examinar por separado la tendencia y los residuos respecto de la recta.
### 12.4.2 Interpretación de la calibración
En el intervalo ensayado, aplicar la recta cambia la lectura menos de 1,5°. La corrección angular permanece disponible y desactivada. Ese cambio es la diferencia entre ángulo corregido y original. El residuo respecto del celular puede ser mayor, como ocurre en la posición de roll de referencia +10°, donde el MPU midió +13,48°.
## 12.5 Discusión de resultados
El modelo reproduce mejor los tiempos de decisión que las amplitudes físicas. Los tiempos están gobernados por contadores y un reloj conocidos. Los picos dependen del contacto, la vibración y la rapidez con que una persona mueve el carro. Las tres repeticiones por escenario permitieron identificar mecanismos concretos de fallo, pero ofrecen poca información sobre su frecuencia en otras superficies o montajes.
# 13 Ampliación: clasificador con árbol de decisión
## 13.1 Propósito y alcance
Se examinó si un clasificador entrenado con maniobras sintéticas podía reconocer patrones en las señales ya registradas. El árbol se ejecuta fuera de línea en Python. El firmware sigue tomando todas las decisiones de alarma en el ESP32.
## 13.2 Datos y características de las ventanas
El cuaderno reúne 78 corridas sintéticas y una instantánea de las 18 pruebas físicas con 58 229 mediciones y 17 eventos dentro de los intervalos registrados. Se extraen ventanas de 0,5 s cada 0,1 s. Las cinco características resumen la intensidad y variación de la aceleración, la componente longitudinal y el tamaño y duración de la inclinación.
@T 20 | La {n} distingue las corridas generadas de los intervalos medidos en la maqueta.
@T 21 | La {n} especifica qué representa cada variable y en qué unidad se expresa.
## 13.3 Entrenamiento del modelo
Con semilla 42 se separaron las corridas por escenario antes de ajustar el árbol. Se usaron 55 corridas para entrenar y 23 para prueba, con 5280 y 2208 ventanas respectivamente. El estimador empleó profundidad máxima cuatro, mínimo cinco muestras por hoja y pesos equilibrados por clase. Las clases fueron normal, frenada, impacto y vuelco.
## 13.4 Evaluación con datos sintéticos reservados
El árbol cometió tres errores en 2208 ventanas reservadas y las reglas simples cometieron cuatro. La clase normal aportó 1909 ventanas y la frenada solo 31, por lo que se presentan también precisión, sensibilidad y F1 por clase. Las corridas reservadas son diferentes de las de entrenamiento, aunque proceden del mismo generador. El resultado es optimista como predicción para la maqueta.
@F 18 | La {n} permite localizar las clases a las que se asignaron las ventanas discrepantes.
@T 22 | La {n} muestra por qué los pocos errores se reflejan con mayor intensidad en la precisión de frenada.
## 13.5 Aplicación a las pruebas físicas
Ninguna ventana física se clasificó como frenada. El árbol marcó 57 ventanas de impacto en Marcha 3 y 15 en Frenada 2, precisamente donde el firmware produjo falsas alarmas de golpe. En Vuelco 1 predominó normal. El solapamiento hace que varias ventanas puedan representar una sola maniobra, por lo que su número no es un conteo de accidentes.
@F 19 | En la {n}, cada fila representa una repetición y cada celda cuenta ventanas solapadas.
@T 23 | La {n} contrasta la clase no normal dominante con la etiqueta de cada maniobra.
## 13.6 Seguimiento de una decisión del árbol
En Frenada 2 se eligió la ventana de 7,82 a 8,32 s cuyo centro queda más próximo a la primera detección del firmware. Su desviación máxima de g fue 6,54 m/s², inferior al corte de 7,00. El tiempo por encima del umbral de vuelco fue cero y el mínimo longitudinal suavizado fue −1,89 m/s², mayor que el corte de −4,81. La ruta termina en normal. Otras ventanas de esta repetición sí se etiquetaron como impacto.
@F 20 | La {n} localiza la ventana seleccionada sobre la señal de la frenada.
@F 21 | La {n} permite seguir las tres ramas que conducen a la hoja seleccionada.
@T 24 | La {n} detalla el valor observado y el umbral de cada corte.
## 13.7 Comparación con las reglas del firmware
Las reglas simples del cuaderno constituyen un comparador por ventanas. El firmware evalúa cada 4 ms y exige permanencia. El árbol carece de clase inclinación y el resumen del cuaderno utiliza una regla independiente de 60°, distinta del umbral embebido de 10°. En el vuelco de costado, el firmware activó la alarma de inclinación y el árbol clasificó todas las ventanas como normales. Además, ambos confundieron el desnivel de Marcha 3 y las paradas bruscas de Frenada 2 con impactos. En estas pruebas, el árbol no mejoró la distinción entre choques y maniobras sin accidente.
# 14 Conclusiones y mejoras
## 14.1 Conclusiones
En esta maqueta se confirmó un golpe aproximadamente 4 ms después del primer cruce y una condición angular unos 152 ms después. La coincidencia con el modelo se explica por el intervalo de lectura y la permanencia. La separación de detección, actuación y envío permitió medir esos tiempos sin incorporar el retardo de la red.
El filtro complementario conservó el pitch de las frenadas en un máximo absoluto de 2,35° al redondear a dos decimales. Aun así, las falsas alarmas de dos repeticiones evidencian que una norma elevada puede provenir de un desnivel o de la mano que detiene el carro.
## 14.2 Cumplimiento de los objetivos
Las reglas formuladas permitieron predecir las latencias y el banco verificó su implementación. La cadena desde el sensor hasta el historial conservó las sesiones, sus muestras y los eventos cerrados. Las seis maniobras, la calibración y las 18 repeticiones permitieron cuantificar el desempeño y explicar los tres desacuerdos de clase. La evaluación fuera de línea mostró dónde el árbol reproduce los errores del detector y dónde pierde una maniobra que sí genera alarma local.
## 14.3 Limitaciones identificadas
El ensayo empleó un solo carro y movimiento manual, con tres repeticiones por condición. La rueda carecía de imán durante los ensayos principales. Solo dos puntos de calibración correspondieron a pitch. La incertidumbre del nivel del celular, la geometría del apoyo lateral y las vibraciones del montaje limitan la interpretación de las diferencias angulares y de los picos.
## 14.4 Mejoras futuras
Se propone repetir inclinaciones con distintos umbrales y más orientaciones de pitch. Para estudiar las falsas alarmas conviene registrar desniveles y paradas de distinta intensidad con etiquetas temporales independientes. Un imán más pequeño permitiría repetir la prueba de rueda y comprobar si disminuye la vibración. La medición externa del recorrido del servo y una nueva ejecución de Wokwi completarían la verificación. Un futuro GPS requeriría ensayar recepción y registro de coordenadas. Para reevaluar el árbol se necesitan sesiones físicas independientes con frenadas y vuelcos de costado etiquetados.
# Referencias
@REF
# Anexos
## A. Tabla de pines y conexiones
Las posiciones corresponden al montaje real documentado por el equipo. Las etiquetas D de la placa identifican los GPIO del esquema y las referencias alfanuméricas identifican orificios de la protoboard.
@T 2 | La {n} permite reconstruir el cableado a partir de las posiciones reales.
## B. Cuaderno de inteligencia artificial (Anexo_IA_Carro_RC_Grupo11.ipynb)
El archivo anexos/Anexo_IA_Carro_RC_Grupo11.ipynb contiene la extracción de características, el entrenamiento y la evaluación del capítulo 13. Se conserva la numeración del cuerpo: Figuras 26 a 29 y Tablas 19 a 23. La instantánea de entrada y las exportaciones se encuentran en anexos/datos y anexos/figuras. El procedimiento de ejecución consta en anexos/LEEME.md.
## C. Contrato de datos v1
Los esquemas JSON están en contratos/v1. Cada medición contiene numero, t_ms, ax, ay, az, roll_deg y pitch_deg. Los campos opcionales de rueda y estado pueden faltar en sesiones antiguas. En un evento se cumple t_inicio_ms ≤ t_deteccion_ms ≤ t_fin_ms. Si existe t_activacion_ms, queda entre detección y fin. Los cuatro instantes usan el reloj de sesión. El inicio del intervalo de muestras puede incluir una preventana anterior al primer cruce.
Una escritura nueva se reconoce con HTTP 201 y un reintento idéntico con 200. Reutilizar un identificador con datos incompatibles genera un conflicto. Las muestras del lote se aceptan o se rechazan en una sola transacción. El evento físico emplea ubicacion = null.
## D. Registro de las pruebas físicas
Se conserva una fila por ensayo válido. Las latencias corresponden al evento seleccionado dentro del intervalo registrado. El libro resultados-simulacion-vs-prototipo.xlsx identifica la sesión y las notas de campo documentan intentos descartados y circunstancias de cada maniobra.
@T 10 | La {n} conserva los valores por repetición que sustentan las medias del capítulo 12.
## E. Repositorio y estructura del archivo RAR
El repositorio del equipo es https://github.com/marcosinten/Proyecto-Modelos. La rama utilizada para la revisión es entrega-cp2. El script scripts/preparar_entrega.mjs arma la carpeta Comp_Practico2_Grupo11_MyS con codigo, simulacion, evidencias, informe y presentacion. Copia el código versionado, los archivos del circuito y las pruebas. El equipo incorpora el informe final y la presentación antes de comprimir la carpeta en RAR. La base local y la configuración con credenciales quedan excluidas del paquete.
## F. Instrucciones de ejecución del sistema
1. Desde la raíz del repositorio, con Node.js 24 instalado, ejecutar npm ci. Para usar la maqueta en la red local, crear servidor/.env a partir de servidor/.env.example, configurar HOST=0.0.0.0 y una API_KEY de al menos 24 caracteres.
2. Ejecutar npm run dev. Abrir http://127.0.0.1:5173 y comprobar http://127.0.0.1:3000/api/v1/salud. Para ensayar sin hardware, abrir Simulación, elegir un escenario y revisar sus señales.
3. Para operar la placa, crear firmware/carro_rc/config_local.h a partir del archivo .example del mismo directorio. Indicar la red, la IP de la computadora en API_BASE_REAL y la misma clave de la API. En PlatformIO, compilar con pio run -d firmware/carro_rc y cargar con pio run -d firmware/carro_rc -t upload, seleccionando el puerto de la placa.
4. Encender con el carro quieto y nivelado. En Monitor → En vivo, seleccionar el identificador RC del arranque. Registrar escenario y repetición, ejecutar la maniobra y marcar el fin. Abrir Resultados para comparar y exportar el libro. Para reproducir el barrido de umbrales, ejecutar node informe/analisis/sensibilidad.mjs desde la raíz.
