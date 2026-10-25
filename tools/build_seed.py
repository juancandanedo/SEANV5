"""Convierte los xlsx de AppSheet en seed/seed.json (colecciones normalizadas).
Uso: python3 tools/build_seed.py <carpeta_con_xlsx>"""
import sys, glob, json, re, os
import pandas as pd

src = sys.argv[1] if len(sys.argv) > 1 else "."
def load(name):
    f = [p for p in glob.glob(os.path.join(src, "*.xlsx")) if p.endswith("_" + name + ".xlsx") or p.endswith("/" + name + ".xlsx")][0]
    return pd.read_excel(f)

def clean(v):
    if pd.isna(v): return None
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return v

est = load("ESTUDIANTES").dropna(axis=1, how="all")
tut = load("TUTORES"); sal = load("SALONES"); niv = load("NIVELES")
cur = load("CURSOS_TOMADOS"); cal = load("Calificaciones"); cob = load("COBROS")

# niveles: unifica el duplicado Libro 6 (81879993 -> f401b8bd)
niv_alias = {"81879993": "f401b8bd"}
niveles = [dict(id=r.ID, nivel=int(r.NIVEL), libro=int(r.LIBRO), nombre=r.NOMBRE_DEL_LIBRO.strip().upper())
           for r in niv.itertuples() if r.ID not in niv_alias]

estudiantes = [dict(id=r.ID, nombre=clean(r.NOMBRE_ESTUDIANTE), email=clean(r.EMAIL),
                    telefono=str(int(r.TELEFONO)) if pd.notna(r.TELEFONO) else None, sede=clean(r.SEDE))
               for r in est.itertuples()]
tutores = [dict(id=r.ID_TUTOR, nombre=r.NOMBRE.strip(), nivel=int(r.NIVEL)) for r in tut.itertuples()]
salones = [dict(id=str(r['ID_SALONES']), ubicacion=clean(r['UBICACIÓN']), sede=clean(r['SEDE'])) for r in sal.to_dict('records')]

tipos_pago = [dict(id="BL-JCC", nombre="BL-JCC", descripcion="Transferencia / depósito a JCC"),
              dict(id="BL-Iglesia", nombre="BL-Iglesia", descripcion="Transferencia / depósito a la Iglesia"),
              dict(id="EF-Iglesia", nombre="EF-Iglesia", descripcion="Efectivo entregado en la Iglesia"),
              dict(id="BecaDFP", nombre="BecaDFP", descripcion="Beca DFP")]

cursos = []
for r in cur.itertuples():
    m = re.match(r"^(\d{4})(N\dL\d)-(\d+)-(\d+)$", r.GRUPO)
    cursos.append(dict(id=r.ID_Reg, estudiante_id=r.ID_EST, grupo=r.GRUPO, curso=r.CURSO,
                       anio=int(m.group(1)), tutor_id="PAN-" + m.group(3), descripcion=clean(r.DESCRIPCION)))

notas = []
for r in cal.to_dict('records'):
    fe = r['FECHA EXAMEN']
    notas.append(dict(id=r['ID_NOTAS'], curso_reg_id=r['ID_CURSO'], estudiante_id=r['ID_ESTUDIANTE'],
                      nota=float(r['NOTA']), total=float(r['TOTAL PUNTOS']), modalidad=clean(r['MODALIDAD']),
                      fecha_examen=fe.strftime("%Y-%m-%d") if pd.notna(fe) else None,
                      tipo_pase=clean(r['TIPO_PASE']) if isinstance(r['TIPO_PASE'], str) else None))

lib_by_niv = {n["id"]: n["libro"] for n in niveles}
cobros = []
for r in cob.itertuples():
    nid = niv_alias.get(r.NIVEL, r.NIVEL)
    libro = int(re.sub(r"\D", "", r.LIBRO)) if isinstance(r.LIBRO, str) else lib_by_niv.get(nid)
    img = clean(r.IMAGEN)
    cobros.append(dict(id=str(r.ID).replace(".0", "") if not isinstance(r.ID, str) else r.ID,
                       fecha=r.FECHA.strftime("%Y-%m-%d"), estudiante_id=r.ID_NUMBER, libro=libro, nivel_id=nid,
                       debe=float(r.DEBE) if pd.notna(r.DEBE) else 0.0,
                       pago=float(r.PAGO) if pd.notna(r.PAGO) else 0.0,
                       tipo_pago=clean(r.TIPO_PAGO), notas=clean(r.NOTAS),
                       imagen=None if img in (None, "XXX") else img))

# grupos: se deducen del código (año + curso + tutor); salón y horario se asignan luego en la app
gmap = {}
for c in cursos:
    gmap.setdefault(c["grupo"], dict(id=c["grupo"], anio=c["anio"], curso=c["curso"], tutor_id=c["tutor_id"],
                                     salon_id=None, horario=None, estado="FINALIZADO" if c["anio"] < 2026 else "ACTIVO"))
grupos = list(gmap.values())

out = dict(grupos=grupos, estudiantes=estudiantes, tutores=tutores, salones=salones, niveles=niveles, tipos_pago=tipos_pago,
           cursos=cursos, notas=notas, cobros=cobros)
os.makedirs("seed", exist_ok=True)
json.dump(out, open("seed/seed.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print({k: len(v) for k, v in out.items()})
