"""Genera el DOCX y sus dos registros desde la carpeta del informe.

Uso: ~/.venvs/grupo11/bin/python informe/generar_informe.py
El texto y las llamadas a tablas/figuras están en contenido.md. Los identificadores
de esas llamadas son provisionales: la numeración visible depende del orden de lectura.
"""
import csv
import json
import re
from collections import Counter
from pathlib import Path

from docx import Document
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_COLOR_INDEX, WD_TAB_ALIGNMENT, WD_TAB_LEADER
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

BASE = Path(__file__).resolve().parent
ROOT = BASE.parent
DATA = BASE / 'fuentes_tablas'
ARCHIVO = 'Informe_CP2_Grupo11.docx'
EXCEL = 'evidencias/fisico/resultados/resultados-simulacion-vs-prototipo.xlsx'
FUENTE_JS = 'informe/fuentes_tablas/generar_documento.js'
CAL_ANGULO = 'datos/calibracion_angulo.csv'
CAL_SEIS = 'evidencias/fisico/calibracion_seis_posiciones.csv'
NOTAS = 'evidencias/fisico/notas-pruebas.txt'
COMPLETAR_PORTADA = '[COMPLETAR: portada con la plantilla UNEMI, nombres de los integrantes, docente, paralelo y fecha]'
VERIFICAR = '[VERIFICAR URL y fecha de consulta]'

# Título, instrucción de inserción, nota que debe acompañar la evidencia y número anterior.
ESPACIOS = {
 'wokwi': ('Circuito virtual en Wokwi', 'Pega aquí una captura del circuito en Wokwi donde se lean los componentes y sus conexiones.', 'Circuito virtual del proyecto. Indicar la versión del firmware de la captura. Elaboración propia.', None),
 'bloques': ('Arquitectura del sistema de detección y telemetría', 'Pega aquí el diagrama de bloques de la arquitectura elaborado por el equipo.', 'El ESP32 decide localmente y envía hasta 50 muestras por lote, aproximadamente cada 0,5 s. La web consulta la API cada 200 ms. Elaboración propia.', 2),
 'estados': ('Estados del detector y condiciones de transición', 'Pega aquí el diagrama de estados elaborado por el equipo.', 'EMERGENCIA activa LED, buzzer y servo a 90°. Se cierra y encola el episodio tras 500 ms sin condición o 5 s desde la detección. REARME vuelve a NORMAL tras 1 s sin condición y admite escalada por vuelco. D33 corto solo apaga la alarma. Elaboración propia.', 3),
 'flujo': ('Flujo de adquisición, decisión y envío de eventos', 'Pega aquí el diagrama de flujo de detección elaborado por el equipo.', 'Cada 4 ms se evalúan golpe (16 m/s² en dos lecturas), inclinación filtrada (10°, 150 ms) y vuelco por acelerómetro (90°, 150 ms). Se actúa al confirmar y se envía al cerrar. D33 corto reconoce la alarma y sostenido 3 s reinicia la placa. Elaboración propia.', 4),
 'protoboard': ('Montaje del circuito en protoboard', 'Pega aquí una foto que muestre el ESP32, los rieles de alimentación y las conexiones en la protoboard.', 'Montaje físico con tierra común y rieles de 3,3 y 5 V. Elaboración propia.', None),
 'prototipo': ('Prototipo completo instalado en el carro', 'Pega aquí una foto del carro completo con la placa, la alimentación y los actuadores visibles.', 'Maqueta empleada en las pruebas físicas. Elaboración propia.', None),
 'ejes': ('Orientación de los ejes del MPU6050 sobre el carro', 'Toma una foto del MPU6050 montado y dibuja los ejes X, Y y Z sobre el carro.', 'X apunta hacia la trompa, Y a la izquierda y Z hacia arriba. Roll positivo eleva el lado izquierdo y pitch positivo eleva la trompa. Elaboración propia.', 7),
 'hall': ('Sensor Hall e imán en la rueda trasera', 'Pega aquí una foto de la rueda con el imán frente al A3144.', 'Se cuenta una pasada por vuelta. La prueba del imán fue posterior a las 18 repeticiones. Elaboración propia.', None),
 'monitor': ('Monitor en vivo con el carro en tres dimensiones', 'Pega aquí una captura del monitor en vivo con la sesión conectada y el carro 3D.', 'La postura corresponde a los ángulos recibidos desde la maqueta. Elaboración propia.', None),
 'simulador': ('Simulador web de escenarios', 'Pega aquí una captura del simulador con el escenario, sus parámetros y las curvas de ángulo.', 'La referencia de postura del modelo permite interpretar la señal estimada. Elaboración propia.', None),
 'historial': ('Consulta y explicación de un evento guardado', 'Pega aquí una captura del historial con el detalle o la explicación de un evento.', 'Identificar la sesión, el tipo y la marca de detección del evento mostrado. Elaboración propia.', None),
 'exportar': ('Exportación de una sesión o evento a Excel', 'Pega aquí una captura de la pantalla Exportar donde se vea la selección de alcance y formato.', 'El navegador genera el libro mediante ExcelJS. Elaboración propia.', None)
}
# En las referencias, los asteriscos delimitan títulos en cursiva.
REFERENCIAS = [
 ('Allegro MicroSystems. (s. f.). *3141 thru 3144: Sensitive Hall-effect switches for high-temperature operation* (Data Sheet 2762.6B). https://www.allegromicro.com/~/media/Files/Datasheets/A3141-2-3-4-Datasheet.ashx?la=en', True),
 ('Aslam, S., Islam, S., Nigar, N., Ajagbe, S. A., & Adigun, M. O. (2024). An IoT-based automatic vehicle accident detection and visual situation reporting system. *Journal of Advanced Transportation, 2024*(1), artículo 4719669. https://doi.org/10.1155/2024/4719669', False),
 ('Espressif Systems. (s. f.). *ESP32 series datasheet*. https://www.espressif.com/sites/default/files/documentation/esp32_datasheet_en.pdf', True),
 ('Express. (s. f.). *Routing*. https://expressjs.com/en/guide/routing/', True),
 ('Fisher, C. J. (2010). *Using an accelerometer for inclination sensing* (Application Note AN-1057). Analog Devices. https://www.analog.com/en/resources/app-notes/an-1057.html', False),
 ('Grupo 11. (2026). *Proyecto Modelos: telemetría RC* [Código fuente, documentación y evidencias del Componente Práctico 2]. GitHub. https://github.com/marcosinten/Proyecto-Modelos', False),
 ('InvenSense. (2013). *MPU-6000/MPU-6050 product specification* (revisión 3.4). https://invensense.tdk.com/wp-www.invensense.com/wp-content/uploads/2015/02/MPU-6000-Datasheet1.pdf', True),
 ('Pedregosa, F., Varoquaux, G., Gramfort, A., Michel, V., Thirion, B., Grisel, O., Blondel, M., Prettenhofer, P., Weiss, R., Dubourg, V., Vanderplas, J., Passos, A., Cournapeau, D., Brucher, M., Perrot, M., & Duchesnay, É. (2011). Scikit-learn: Machine learning in Python. *Journal of Machine Learning Research, 12*, 2825–2830. https://jmlr.org/papers/v12/pedregosa11a.html', True),
 ('PlatformIO. (s. f.). *PlatformIO Core (CLI)*. https://docs.platformio.org/en/latest/core/index.html', True),
 ('SQLite. (s. f.). *About SQLite*. https://sqlite.org/about.html', True),
 ('Wokwi. (s. f.). *Welcome to Wokwi!* https://docs.wokwi.com/', True)
]

def leer_json(path):
    return json.loads(path.read_text(encoding='utf-8'))

def elemento(tag, **atributos):
    el = OxmlElement('w:' + tag)
    for key, val in atributos.items():
        el.set(qn('w:' + key), str(val))
    return el

def campo(p, instruccion, resultado):
    p.add_run()._r.append(elemento('fldChar', fldCharType='begin'))
    instr = elemento('instrText')
    instr.text = ' ' + instruccion + ' '
    instr.set(qn('xml:space'), 'preserve')
    p.add_run()._r.append(instr)
    p.add_run()._r.append(elemento('fldChar', fldCharType='separate'))
    p.add_run(resultado)
    p.add_run()._r.append(elemento('fldChar', fldCharType='end'))

def estilo(doc, nombre, interlinea=1, tam=12):
    styles = doc.styles
    s = styles[nombre] if nombre in styles else styles.add_style(nombre, WD_STYLE_TYPE.PARAGRAPH)
    s.base_style = styles['Normal'] if nombre != 'Normal' else None
    s.font.name, s.font.size, s.font.color.rgb = 'Times New Roman', Pt(tam), RGBColor(0,0,0)
    fuentes = s.element.get_or_add_rPr().rFonts
    for atr in ('asciiTheme','hAnsiTheme','eastAsiaTheme','cstheme'):
        fuentes.attrib.pop(qn('w:'+atr), None)
    formato = s.paragraph_format
    formato.line_spacing = interlinea
    formato.space_after, formato.space_before, formato.first_line_indent = Pt(0), Pt(0), Cm(0)
    return s

def base_documento():
    doc = Document()
    seccion = doc.sections[0]
    seccion.page_width, seccion.page_height = Cm(21), Cm(29.7)
    seccion.top_margin = seccion.bottom_margin = seccion.left_margin = seccion.right_margin = Cm(2.54)
    seccion.header_distance = Cm(1.27)
    normal = estilo(doc,'Normal',2)
    normal.paragraph_format.first_line_indent = Cm(1.27)
    normal.element.get_or_add_rPr().append(elemento('lang',val='es-EC'))
    for nivel in range(1,4):
        s = estilo(doc,f'Heading {nivel}',1.4)
        s.font.bold, s.font.italic = True, nivel == 3
        fmt = s.paragraph_format
        fmt.space_before, fmt.space_after, fmt.keep_with_next = Pt(10), Pt(4), True
        if nivel == 1:
            fmt.alignment, fmt.page_break_before = WD_ALIGN_PARAGRAPH.CENTER, True
    for nombre in ['Title','Preliminar','LeyendaFigura','LeyendaTabla','TituloLeyenda','Imagen','Nota','Celda','Indice','Referencia','Ecuacion','CitaVisual']:
        estilo(doc,nombre)
    for borde in doc.styles['Title'].element.xpath('./w:pPr/w:pBdr'):
        borde.getparent().remove(borde)
    for nombre in ['Title','Preliminar']:
        s = doc.styles[nombre]
        s.font.bold = True
        s.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
        s.paragraph_format.space_after = Pt(14)
    for nombre in ['LeyendaFigura','LeyendaTabla','TituloLeyenda','Imagen']:
        doc.styles[nombre].paragraph_format.keep_with_next = True
    for nombre in ['LeyendaFigura','LeyendaTabla']:
        doc.styles[nombre].font.bold = True
        doc.styles[nombre].paragraph_format.space_before = Pt(6)
    doc.styles['TituloLeyenda'].font.italic = True
    doc.styles['TituloLeyenda'].paragraph_format.space_after = Pt(5)
    doc.styles['Nota'].font.size = Pt(10.5)
    doc.styles['Nota'].paragraph_format.space_after = Pt(8)
    doc.styles['CitaVisual'].paragraph_format.line_spacing = 2
    doc.styles['CitaVisual'].paragraph_format.first_line_indent = Cm(1.27)
    doc.styles['Celda'].font.size = Pt(10)
    doc.styles['Indice'].paragraph_format.space_after = Pt(2)
    doc.styles['Indice'].paragraph_format.tab_stops.add_tab_stop(Cm(15.9), WD_TAB_ALIGNMENT.RIGHT, WD_TAB_LEADER.DOTS)
    doc.styles['Referencia'].paragraph_format.line_spacing = 2
    doc.styles['Referencia'].paragraph_format.left_indent = Cm(1.27)
    doc.styles['Referencia'].paragraph_format.first_line_indent = Cm(-1.27)
    doc.styles['Ecuacion'].font.name = 'Cambria Math'
    doc.styles['Ecuacion'].paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
    header = seccion.header.paragraphs[0]
    header.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    campo(header,'PAGE','1')
    doc.settings.element.append(elemento('updateFields',val='true'))
    doc.core_properties.author = 'Grupo 11 · UNEMI'
    doc.core_properties.title = 'Detección de accidentes y telemetría en un carro RC'
    return doc

def sobremuestreo():
    with (BASE/'analisis/sensibilidad.csv').open() as f:
        datos = list(csv.DictReader(f))
    assert len(datos)==90
    filas=[]
    for d in datos:
        if (d['escenario'], d['regla_variada']) not in [('impacto','golpe'),('inclinacion','inclinacion')]:
            continue
        golpe = d['escenario']=='impacto'
        umbral = d['umbral_golpe_ms2']+' m/s²' if golpe else d['umbral_inclinacion_deg']+'°'
        filas.append(['Impacto' if golpe else 'Inclinación',umbral,d['regla_detecta'],
                      d['primer_cruce_sostenido_ms'] or '—', d['confirmacion_regla_ms'] or '—', d['latencia_regla_ms'] or '—'])
    return dict(titulo='Detección simulada al variar un umbral por vez', cab=['Escenario','Umbral','Detecta','Cruce (ms)','Confirmación (ms)','Latencia (ms)'],filas=filas,
                nota='Se muestran los dos escenarios objetivo. Cruce y confirmación se miden desde el inicio de la corrida. Una raya indica que la regla no se cumplió. Elaboración propia a partir de las 90 corridas del barrido.',anchos=[1.5,1.3,1,1.2,1.6,1.2])

def catalogo():
    base = leer_json(DATA/'datos_informe.json')
    ia = leer_json(DATA/'anexo_ia.json')
    tablas={str(i):t for i,t in enumerate(base['tablas'],1)}
    fuentes={8:'servidor/src/adaptadores/sqlite/repositorio.js', 9:EXCEL,10:EXCEL,11:EXCEL,12:EXCEL,
             13:EXCEL+' y evidencias/frenada/comparacion_filtro.md',14:CAL_SEIS,15:CAL_SEIS,16:CAL_ANGULO,
             17:'evidencias/ajuste_curvas/RESUMEN.md',18:NOTAS,19:'docs/REVISION-DOCENTE.md'}
    for n,t in tablas.items():
        t.update(origen=fuentes.get(int(n),FUENTE_JS), anterior=n)
    tablas['sensibilidad'] = dict(sobremuestreo(), origen='informe/analisis/sensibilidad.csv', anterior=None)
    for t in ia['tablas']:
        n=t['n']
        if n == 25:  # El cuaderno reproduce la Tabla 18 como comprobación sin número.
            continue
        origen=next((ROOT/'anexos/datos').glob(f'tabla{n-1}_*.csv'))
        tablas[str(n)] = dict(t,origen=str(origen.relative_to(ROOT)), anterior=n)
    tablas['4']['filas'][12][-1]='°/s (dispersión máxima del giro en X e Y para aceptar el cero)'
    tablas['5']['filas'][-1][-1]='Vuelco confirmado y condición de escalada mantenida 150 ms adicionales, si el último evento no fue vuelco'
    tablas['7']['filas'][0][1]='/salud'
    tablas['7']['filas'][-1:]=[
        ['GET / POST','/sesiones/:id/pruebas','Consultar los tramos de una sesión o iniciar una prueba real'],
        ['POST','/pruebas/:id','Actualizar o cerrar el tramo de prueba identificado'],
        ['GET','/pruebas','Consultar pruebas con sus resultados dentro de los límites registrados']]
    tablas['23']['cab']=['Escenario','Rep.','Sesión','Esperado','Firmware','Imp.','Fren.','Vuel.','Dominante','Acuerdo']
    tablas['23']['nota']+=' Imp., Fren. y Vuel. son conteos de ventanas de impacto, frenada y vuelco.'
    tablas['9']['filas'][3][3]='4,029 ± 0,005'
    tablas['13']['nota']='Banco nativo: frenada sin giro de hasta −7 m/s². Web: desaceleración y cabeceo real de hasta 3,4°. La última columna indica el instante desde el inicio de la corrida web. Elaboración propia a partir del banco y del Excel de Resultados.'
    tablas['15']['nota']='Desplazamiento = semisuma de las lecturas opuestas. Escala = semidiferencia dividida por 9,80665 m/s². La ligera inclinación del montaje puede contribuir a las lecturas transversales. Elaboración propia.'
    tablas['19']['nota']='Resultados documentados en la revisión del 22 de noviembre y en las evidencias del banco nativo. Elaboración propia.'
    for clave,anchos in {'10':[1.6,.6,1.4,1.25,1.3,1.05,1.05,1.3,1.3],'5':[2.1,3.5,2.1,3.5],'4':[.9,3.5,.9,2.5],'20':[2,1,3],'21':[2.1,3,1],'23':[1.42,.61,2.2,1.4,1.45,.65,.7,.7,1.4,1.1],'24':[.7,2,1.5,.85,1,1,1.4]}.items():
        tablas[clave]['anchos']=anchos
    figuras={}
    for f in base['figuras']+ia['figuras']:
        n=f['n']
        ruta= BASE/'figuras_entrada'/f['archivo'] if n<18 else ROOT/'anexos/figuras'/f['archivo'].replace(f'figura{n}',f'figura{n+8}')
        assert ruta.is_file()
        figuras[str(n)]=dict(f,origen=str(ruta.relative_to(ROOT)),anterior=n)
    for clave,(titulo,instruccion,nota,ant) in ESPACIOS.items():
        figuras[clave]=dict(titulo=titulo,instruccion=instruccion,nota=nota,origen='marcador',anterior=ant)
    return {'Figura':figuras,'Tabla':tablas}

def poner_tabla(doc,datos):
    cab=datos['cab']
    tabla=doc.add_table(rows=0,cols=len(cab))
    tabla.autofit=False
    pesos=datos.get('anchos',[1]*len(cab))
    for col,peso in zip(tabla.columns,pesos):
        col.width=Cm(15.92*peso/sum(pesos))
    bordes=elemento('tblBorders')
    for lado in ['top','bottom','insideH']:
        bordes.append(elemento(lado,val='single',sz=4,color='B8B8B8'))
    tabla._tbl.tblPr.append(bordes)
    margenes = elemento('tblCellMar')
    for lado in ('left','right'):
        margenes.append(elemento(lado,w=42,type='dxa'))
    tabla._tbl.tblPr.append(margenes)
    for i,fila in enumerate([cab,*datos['filas']]):
        row=tabla.add_row()
        pr=row._tr.get_or_add_trPr()
        pr.append(elemento('cantSplit'))
        if i==0: pr.append(elemento('tblHeader',val='true'))
        for j,(c,v) in enumerate(zip(row.cells,fila)):
            c.width=tabla.columns[j].width
            p=c.paragraphs[0]
            p.style='Celda'
            p.paragraph_format.space_before=p.paragraph_format.space_after=Pt(2)
            p.paragraph_format.keep_with_next=i in (0,len(datos['filas']))
            # Word puede partir un identificador largo en un guion bajo.
            valor=str(v).replace('_','_\u200b')
            r=p.add_run(valor)
            r.bold = i==0
            if len(cab)>7: r.font.size=Pt(9)
            if i==0: c._tc.get_or_add_tcPr().append(elemento('shd',fill='E8EDF2'))

def resaltar(p,texto):
    p.add_run(texto).font.highlight_color=WD_COLOR_INDEX.YELLOW

def generar():
    datos=catalogo()
    doc=base_documento()
    leyendas=[]
    marcadores=[]
    entradas=[]
    usados=Counter()
    def preliminar(t):
        p=doc.add_paragraph(t,'Preliminar')
        p.paragraph_format.page_break_before=True
    p=doc.add_paragraph('Detección de accidentes y telemetría en un carro RC','Title')
    p.paragraph_format.space_before=Cm(4)
    for linea in ['Componente Práctico 2','Grupo 11','Modelos y Simulación','Universidad Estatal de Milagro']:
        p=doc.add_paragraph(linea,'Preliminar')
        p.runs[0].bold=False
    resaltar(doc.add_paragraph(style='Preliminar'),COMPLETAR_PORTADA)
    marcadores.append(('Portada',COMPLETAR_PORTADA))
    indices={}
    for tipo,titulo in [('general','Índice general'),('Figura','Índice de figuras'),('Tabla','Índice de tablas')]:
        preliminar(titulo)
        indices[tipo]=doc.add_paragraph(style='Indice')
    preliminar('Resumen')
    doc.add_paragraph('Se modelizó y evaluó un detector de golpes, inclinaciones y vuelcos en un carro RC movido a mano. El ESP32 tomó decisiones a 250 Hz, activó una alarma local y envió telemetría para reconstruir cada maniobra. En 18 repeticiones, 15 coincidieron con la clase esperada y las nueve maniobras con accidente activaron la alarma. Un desnivel y una frenada brusca produjeron falsos golpes. Un vuelco de costado se clasificó como inclinación. Los tiempos medios de detección se aproximaron a 4 ms para el golpe y 152 ms para las maniobras angulares. El filtro complementario redujo el pitch aparente durante la frenada. Un árbol entrenado con señales sintéticas reprodujo varias confusiones en las pruebas físicas. Los resultados describen la maqueta, su montaje y las condiciones ensayadas.')
    for linea in (BASE/'contenido.md').read_text().splitlines():
        if not linea: continue
        if linea.startswith('#'):
            nivel=len(linea)-len(linea.lstrip('#'))
            seccion=linea[nivel:].strip()
            doc.add_heading(seccion,level=nivel)
            entradas.append((seccion,nivel))
        elif linea=='@REF':
            for texto,verificar in REFERENCIAS:
                p=doc.add_paragraph(style='Referencia')
                for i,t in enumerate(texto.split('*')): p.add_run(t).italic=bool(i%2)
                if verificar:
                    p.add_run(' ')
                    resaltar(p,VERIFICAR)
                    marcadores.append((seccion+' · '+texto.split('.')[0],VERIFICAR))
        elif linea.startswith('@'):
            llamada, cita = linea.split(' | ', 1)
            sigla,clave=llamada.split()
            tipo={'@F':'Figura','@T':'Tabla'}[sigla]
            d=datos[tipo][clave]
            usados[tipo]+=1
            etiqueta=f'{tipo} {usados[tipo]}'
            leyendas.append((tipo,etiqueta,d['titulo'],seccion,d['origen'],d['anterior']))
            anterior = doc.paragraphs[-1]
            if anterior.style.name == 'Normal':
                anterior.add_run(' ' + cita.format(n=etiqueta))
            else:
                doc.add_paragraph(cita.format(n=etiqueta),'CitaVisual')
            # Se incluyen número y título en la misma leyenda para que Word indexe ambos.
            p=doc.add_paragraph(style='Leyenda'+tipo)
            p.add_run(etiqueta).bold=True
            p.add_run().add_break()
            r=p.add_run(d['titulo']);r.italic=True;r.bold=False
            p.paragraph_format.space_after=Pt(5)
            if tipo=='Tabla': poner_tabla(doc,d)
            else:
                p=doc.add_paragraph(style='Imagen')
                p.alignment=WD_ALIGN_PARAGRAPH.CENTER
                if d['origen']=='marcador':
                    instruccion='('+d['instruccion']+')'
                    resaltar(p,instruccion)
                    marcadores.append((seccion+' · '+etiqueta,instruccion))
                else:
                    p.add_run().add_picture(str(ROOT/d['origen']),width=Cm(16))
            p=doc.add_paragraph(style='Nota')
            p.add_run('Nota. ').italic=True
            p.add_run(d['nota'])
        elif linea.startswith('= '):
            doc.add_paragraph(linea[2:],'Ecuacion')
        elif linea.startswith('[COMPLETAR'):
            resaltar(doc.add_paragraph(),linea)
            marcadores.append((seccion,linea))
        else:
            doc.add_paragraph(linea)

    # Los resultados en caché hacen legibles los índices también en visores sin Word.
    paginacion=DATA/'paginas.json'
    paginas=leer_json(paginacion) if paginacion.exists() else {}
    for tipo,p in indices.items():
        instr = r'TOC \o "1-3" \h \z' if tipo=='general' else f'TOC \\t "Leyenda{tipo},1" \\h \\z'
        campo(p,instr,'')
        cierre=p._p[-1]
        p._p.remove(cierre)
        items=[(t,t,n) for t,n in entradas] if tipo=='general' else [(et,et+'. '+t,1) for k,et,t,*rest in leyendas if k==tipo]
        for i,(clave,titulo,nivel) in enumerate(items):
            if i:
                nuevo=doc.add_paragraph(style='Indice')
                p._p.addnext(nuevo._p)
                p=nuevo
            p.paragraph_format.left_indent=Cm((nivel-1)*.4)
            p.paragraph_format.right_indent=Cm(.6)
            p.add_run(titulo+'\t'+str(paginas.get(clave,'—')))
        p._p.append(cierre)
    doc.save(BASE/ARCHIVO)
    mapa=['# Mapa de figuras y tablas','','| Número final | Título | Sección | Archivo de origen | Número provisional |','|---|---|---|---|---|']
    for _,et,t,sec,src,ant in leyendas:
        mapa.append(f'| {et} | {t} | {sec} | {src} | {ant or "—"} |')
    (BASE/'MAPA_FIGURAS_TABLAS.md').write_text('\n'.join(mapa)+'\n')
    pend=['# Pendientes del informe','','| Sección | Marcador o espacio reservado |','|---|---|']
    pend.extend(f'| {sec} | {texto} |' for sec,texto in marcadores)
    pend+=['','## Contraste entre fuentes','',
           '- El resumen automático del ajuste llama «transportador» a la referencia. Las notas del CSV identifican la aplicación de nivel del celular. Se excluyó la fila EJEMPLO.',
           '- La revisión docente deja en blanco las latencias de marcha y frenada. El Excel sí registra tiempos en Marcha 3 y Frenada 2 porque hubo falsas alarmas. Dos repeticiones produjeron cinco eventos de golpe.',
           '- La hoja Repeticiones da 0,606–1,048 ms para los eventos principales de los nueve ensayos positivos. El intervalo aproximado de 0,5–1,05 ms incluye eventos adicionales documentados en las notas.',
           '- En Golpe 2 y las pruebas de inclinación se conservan la ventana y el escenario del Excel. Las notas incluyen movimientos posteriores al cierre y una comprobación posterior de los signos de los ejes.',
           '- El umbral de quietud del giroscopio es la desviación estándar por eje en X e Y, según el firmware. Puede medirse un sesgo medio de mayor magnitud. La escalada desde REARME tiene su propio temporizador tras confirmarse el vuelco.',
           '- El banco y la web implementan frenadas distintas. El valor −7 m/s² sin giro corresponde al banco. En la web el cabeceo real alcanza 3,4°. Los tiempos absolutos de la hoja Frenada y filtro se cuentan desde el inicio de la simulación.',
           '- En Wokwi la evidencia es del 16 de noviembre. Falta repetirla con el firmware vigente y token. El resultado vigente 57/57 corresponde al banco nativo.',
           '- No hay una serie física con varios umbrales. El CSV del apartado 7.3.2 corresponde únicamente al simulador.',
           '- El imán faltaba durante la serie de 18 repeticiones. Los conteos y el máximo de 3,99 vueltas/s proceden de una prueba específica posterior.',
           '- Los archivos de figuras del directorio de entrada y las fuentes de tablas conservan sus números provisionales por trazabilidad. El documento y los archivos generados del cuaderno usan los números finales.']
    (BASE/'PENDIENTES.md').write_text('\n'.join(pend)+'\n')
    assert usados=={'Figura':29,'Tabla':25}
    return usados,len(marcadores)

if __name__=='__main__':
    print(generar())
