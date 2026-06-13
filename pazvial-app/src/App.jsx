import { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, onSnapshot, collection } from "firebase/firestore";

// ── Firebase Config ───────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDiCG0Q1ODsAIRtxuTm0aQFamHYhmC7D9Y",
  authDomain: "pazvial-rrhh.firebaseapp.com",
  projectId: "pazvial-rrhh",
  storageBucket: "pazvial-rrhh.firebasestorage.app",
  messagingSenderId: "963899279162",
  appId: "1:963899279162:web:f88802ede80baec38c3203"
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// ── Helpers Firebase ──────────────────────────────────────────────────────
const DB_DOC = "pazvial/datos";

async function guardarEnFirebase(datos) {
  try {
    const [col, docId] = DB_DOC.split("/");
    await setDoc(doc(db, col, docId), datos);
  } catch(e) {
    console.error("Error guardando en Firebase:", e);
  }
}

// ═══════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════
const ADMIN_PASS = "Negra2026";
const FERIADOS = new Set([
  "2025-01-01","2025-04-18","2025-04-19","2025-05-01","2025-05-21","2025-06-20",
  "2025-06-29","2025-07-16","2025-08-15","2025-09-18","2025-09-19","2025-10-12",
  "2025-10-31","2025-11-01","2025-12-08","2025-12-25",
  "2026-01-01","2026-04-03","2026-04-04","2026-05-01","2026-05-21","2026-06-19",
  "2026-06-29","2026-07-16","2026-08-15","2026-09-18","2026-09-19","2026-10-12",
  "2026-10-31","2026-11-01","2026-12-08","2026-12-25",
]);

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════
const esDomingo  = d => new Date(d+"T12:00:00").getDay() === 0;
const esViernes  = d => new Date(d+"T12:00:00").getDay() === 5;
const esSabado   = d => new Date(d+"T12:00:00").getDay() === 6;
const esFeriado  = d => FERIADOS.has(d);
const esEspecial = d => esDomingo(d) || esFeriado(d);
const esHabilVacaciones = d => !esSabado(d) && !esDomingo(d) && !esFeriado(d);

function calcularHoras(entrada, salida, fecha) {
  if (!entrada || !salida) return { normales: 0, extra: 0 };
  const toMin = t => { const [h,m] = t.split(":").map(Number); return h*60+m; };
  const total = toMin(salida) - toMin(entrada);
  if (total <= 0) return { normales: 0, extra: 0 };
  if (esEspecial(fecha)) return { normales: 0, extra: +(total/60).toFixed(2) };
  const fin = esViernes(fecha) ? 840 : 1080; // 14:00 o 18:00
  const norm = Math.max(0, Math.min(toMin(salida), fin) - Math.max(toMin(entrada), 480));
  return { normales: +(norm/60).toFixed(2), extra: +((total-norm)/60).toFixed(2) };
}

function generarCodigo(apellido, lista) {
  const ini = (apellido.trim().toUpperCase()[0]) || "X";
  const n = lista.filter(t => (t.apellido.trim().toUpperCase()[0]||"X") === ini).length + 1;
  return `P${ini}${String(n).padStart(2,"0")}`;
}

function fmtRut(r) {
  const c = r.replace(/[^0-9kK]/g,"");
  if (c.length < 2) return c;
  return c.slice(0,-1).replace(/\B(?=(\d{3})+(?!\d))/g,".") + "-" + c.slice(-1).toUpperCase();
}

// Formatea el RUT mientras el usuario escribe (solo acepta números y K)
function autoFmtRut(raw) {
  // Extraer solo dígitos y K/k
  const clean = raw.replace(/[^0-9kK]/g,"").toUpperCase();
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean;
  // Separar cuerpo y dígito verificador
  const body = clean.slice(0, -1);
  const dv   = clean.slice(-1);
  // Agregar puntos al cuerpo
  const bodyFmt = body.replace(/\B(?=(\d{3})+(?!\d))/g,".");
  return `${bodyFmt}-${dv}`;
}

// Handler para inputs de RUT: filtra caracteres y formatea en tiempo real
// Excepción: permite la palabra "Pruebas" para el perfil de prueba
function handleRutInput(value, setter) {
  // Si está escribiendo "Pruebas" (perfil de prueba), permitirlo tal cual
  if ("Pruebas".toLowerCase().startsWith(value.toLowerCase()) || value.toLowerCase() === "pruebas") {
    setter(value);
    return;
  }
  // Solo permitir números y K para RUTs normales
  const clean = value.replace(/[^0-9kK]/g,"").toUpperCase();
  setter(autoFmtRut(clean));
}

function mesNombre(m) {
  return ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"][m]||"";
}

function nombreCompleto(t) {
  if(!t) return "—";
  return [t.nombre, t.apellido, t.apellidoM].filter(Boolean).join(" ");
}

function hoy() { return new Date().toISOString().split("T")[0]; }
function horaActual() { return new Date().toTimeString().slice(0,5); }
function nowId() { return Date.now() + Math.random(); }

// Tasas AFP 2026
const TASAS_AFP = {CAPITAL:0.1144,PROVIDA:0.1145,HABITAT:0.1127,CUPRUM:0.1144,PLANVITAL:0.1116,UNO:0.1046,MODELO:0.0058};

function getRemuneracionVigente(ficha, mes, anio) {
  // Busca el registro del historial vigente para el período dado
  const fechaPeriodo = `${anio}-${String(mes+1).padStart(2,"0")}-01`;
  const historial = (ficha.historialRemuneraciones||[])
    .filter(h => h.desde <= fechaPeriodo)
    .sort((a,b) => b.desde.localeCompare(a.desde));
  if (historial.length > 0) {
    return {
      sueldoPactado: historial[0].sueldo,
      colacion:      historial[0].colacion,
      movilizacion:  historial[0].movilizacion,
      gratificacion: historial[0].gratificacion,
    };
  }
  // Fallback: datos actuales de la ficha
  return {
    sueldoPactado: Number(ficha.sueldoPactado)||0,
    colacion:      Number(ficha.colacion)||0,
    movilizacion:  Number(ficha.movilizacion)||0,
    gratificacion: ficha.gratificacion||false,
  };
}

function calcularLiquidacion(trab, registros, anticipos, mes, anio) {
  const ficha = trab.ficha || {};
  const remVigente = getRemuneracionVigente(ficha, mes, anio);
  const sueldoBase = remVigente.sueldoPactado;
  const pctAFP = TASAS_AFP[ficha.afp?.toUpperCase()] || 0.1144;
  const pctSalud = 0.07;
  const colacion = remVigente.colacion;
  const movilizacion = remVigente.movilizacion;

  // Días trabajados del mes
  const regs = registros.filter(r => {
    const d = new Date(r.fecha+"T12:00:00");
    return r.tId===trab.id && d.getMonth()===mes && d.getFullYear()===anio && r.salida;
  });
  const diasTrab = regs.filter(r=>!esEspecial(r.fecha)).length;

  // Horas extra aprobadas del mes → valor
  const diasMes = new Date(anio, mes+1, 0).getDate();
  const horasJornadaDia = 45/5; // 9h/día promedio
  const valorHoraBase = sueldoBase > 0 ? sueldoBase/(diasMes*horasJornadaDia) : 0;
  let totalMinExtra = 0;
  regs.forEach(r => {
    if(r.estado==="aprobado") totalMinExtra += calcularHoras(r.entrada,r.salida,r.fecha).extra * 60;
  });
  const horasExtra = +(totalMinExtra/60).toFixed(2);
  const valorHHExtra = Math.round(horasExtra * valorHoraBase * 1.5);

  // Gratificación legal mensual (25% sueldo base / 12, tope 4.75 IMM)
  const IMM = 500000; // Ingreso Mínimo Mensual referencial
  const gratif = remVigente.gratificacion ? Math.min(Math.round(sueldoBase*0.25/12), Math.round(IMM*4.75/12)) : 0;

  // Haberes
  const totalImponible = sueldoBase + valorHHExtra + gratif;
  const totalNoImponible = colacion + movilizacion;
  const totalHaberes = totalImponible + totalNoImponible;

  // Descuentos
  const prevision = Math.round(totalImponible * pctAFP);
  const salud = Math.round(totalImponible * pctSalud);
  const segCesantia = 0;
  const totalDescLegales = prevision + salud + segCesantia;

  // Anticipo aprobado del mes
  const anticMes = anticipos.filter(a =>
    a.tId===trab.id && a.estado==="aprobado" && a.mes===mes && a.anio===anio
  ).reduce((s,a)=>s+Number(a.monto),0);

  const totalOtrosDesc = anticMes;
  const totalDescuentos = totalDescLegales + totalOtrosDesc;
  const alcanceLiquido = totalHaberes - totalDescuentos;

  // Tributable
  const tributable = totalImponible - prevision - salud;

  return {
    tId:trab.id, nombre:nombreCompleto(trab), rut:trab.rut, codigo:trab.codigo,
    afp:ficha.afp||"", prevision:ficha.prevision||"FONASA", pctAFP:(pctAFP*100).toFixed(2),
    diasTrab, horasExtra, mes, anio,
    sueldoBase, valorHHExtra, gratif,
    totalImponible, colacion, movilizacion, totalNoImponible, totalHaberes,
    prevision_monto:prevision, salud_monto:salud, segCesantia, totalDescLegales,
    anticipo:anticMes, totalOtrosDesc, totalDescuentos, alcanceLiquido, tributable,
    cc:"001",
  };
}

function diasHabilesEnMes(anio, mes) {
  let c = 0;
  const dias = new Date(anio, mes+1, 0).getDate();
  for (let d=1; d<=dias; d++) {
    const f = `${anio}-${String(mes+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    if (esHabilVacaciones(f)) c++;
  }
  return c;
}

// ═══════════════════════════════════════════════════════════
// DATOS INICIALES
// ═══════════════════════════════════════════════════════════
const fichaVacia = () => ({
  direccion:"", telefono:"", correo:"", cargo:"",
  contactoEmergencia:"", telefonoEmergencia:"",
  prevision:"FONASA", afp:"", sueldoPactado:"",
  gratificacion:true,
  colacion:0, movilizacion:0,
  fechaIngreso:"", fechaSalida:"", motivoSalida:"",
  observaciones:"",
  historialRemuneraciones:[], // [{id,desde,sueldo,colacion,movilizacion,gratificacion,motivo,registradoPor,registradoEn}]
});

const IDS_PRUEBA = new Set([1, 2, 3]); // IDs de trabajadores de ejemplo

const T0 = [
  { id:1, nombre:"Juan",   apellido:"Pérez",  apellidoM:"González", rut:"12.345.678-9", codigo:"PP01", activo:true, esDePrueba:true, ficha:{ ...fichaVacia(), afp:"CAPITAL", prevision:"FONASA", sueldoPactado:"485100", colacion:44726, movilizacion:44726, gratificacion:false,
    historialRemuneraciones:[
      {id:1001,desde:"2025-01-01",sueldo:450000,colacion:40000,movilizacion:40000,gratificacion:false,motivo:"Sueldo inicial",registradoPor:"Administrador",registradoEn:"2025-01-01 08:00"},
      {id:1002,desde:"2026-01-01",sueldo:485100,colacion:44726,movilizacion:44726,gratificacion:false,motivo:"Ajuste anual",registradoPor:"Administrador",registradoEn:"2026-01-01 09:00"},
    ]
  } },
  { id:2, nombre:"María",  apellido:"Pinto",  apellidoM:"Sánchez", rut:"13.456.789-0", codigo:"PP02", activo:true, esDePrueba:true, ficha:{ ...fichaVacia(), afp:"HABITAT", prevision:"FONASA" } },
  { id:3, nombre:"Carlos", apellido:"Rojas",  apellidoM:"Vega",    rut:"14.567.890-1", codigo:"PR01", activo:true, esDePrueba:true, ficha:{ ...fichaVacia(), afp:"PROVIDA", prevision:"FONASA", sueldoPactado:"800000", colacion:87300, movilizacion:87300, gratificacion:true,
    historialRemuneraciones:[
      {id:1003,desde:"2024-03-01",sueldo:720000,colacion:80000,movilizacion:80000,gratificacion:true,motivo:"Sueldo inicial",registradoPor:"Administrador",registradoEn:"2024-03-01 08:00"},
      {id:1004,desde:"2025-06-01",sueldo:760000,colacion:85000,movilizacion:85000,gratificacion:true,motivo:"Promoción a supervisor",registradoPor:"Administrador",registradoEn:"2025-06-01 10:30"},
      {id:1005,desde:"2026-01-01",sueldo:800000,colacion:87300,movilizacion:87300,gratificacion:true,motivo:"Ajuste anual",registradoPor:"Administrador",registradoEn:"2026-01-01 09:00"},
    ]
  } },
  // Perfil de prueba
  { id:999, nombre:"Administrador", apellido:"Pruebas", apellidoM:"", rut:"Pruebas", codigo:"Administrador", activo:true, esDePrueba:true, ficha:fichaVacia() },
];
const R0 = [
  { id:1, tId:1, fecha:"2026-06-02", entrada:"08:05", salida:"18:30", estado:"aprobado",  motivoRechazo:"", esDePrueba:true },
  { id:2, tId:2, fecha:"2026-06-02", entrada:"08:00", salida:"14:00", estado:"pendiente", motivoRechazo:"", esDePrueba:true },
  { id:3, tId:3, fecha:"2026-05-01", entrada:"09:00", salida:"17:00", estado:"aprobado",  motivoRechazo:"", esDePrueba:true },
  { id:4, tId:1, fecha:"2026-06-01", entrada:"09:00", salida:"15:00", estado:"aprobado",  motivoRechazo:"", esDePrueba:true },
];


// ═══════════════════════════════════════════════════════════
// COMPONENTE FICHA FORM — separado para evitar pérdida de foco
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// SUB-COMPONENTES DE FICHA — definidos GLOBALMENTE
// para que React no los re-monte en cada render
// ═══════════════════════════════════════════════════════════
const FichaLBL = ({children}) => (
  <div style={{fontSize:10,color:"#FF6B00",fontWeight:"bold",letterSpacing:1.5,
    textTransform:"uppercase",marginBottom:5}}>{children}</div>
);

const FichaSCard = ({children, style={}}) => (
  <div style={{background:"rgba(8,6,3,0.5)",border:"1px solid rgba(255,255,255,0.08)",
    borderRadius:12,padding:"18px 20px",marginBottom:14,...style}}>
    {children}
  </div>
);

const FichaSecHdr = ({icono, titulo, color="#FF6B00"}) => (
  <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",marginBottom:16,
    background:"linear-gradient(90deg,rgba(255,107,0,0.18) 0%,transparent 100%)",
    borderLeft:`3px solid ${color}`,borderRadius:"0 8px 8px 0"}}>
    <span style={{fontSize:18}}>{icono}</span>
    <span style={{color,fontWeight:"bold",fontSize:12,letterSpacing:2,textTransform:"uppercase"}}>{titulo}</span>
  </div>
);

const FichaRow = ({children, cols="1fr 1fr"}) => (
  <div style={{display:"grid",gridTemplateColumns:cols,gap:14,marginBottom:14}}>{children}</div>
);

// Estilos de input globales — no cambian entre renders
const FI_EDIT = {
  background:"rgba(30,26,15,0.8)",
  border:"1px solid rgba(255,107,0,0.6)",
  borderRadius:7, padding:"9px 13px", color:"#ffffff", fontSize:13,
  fontFamily:"Georgia,serif", outline:"none", width:"100%", boxSizing:"border-box",
  cursor:"text", caretColor:"#FF6B00",
};
const FI_READ = {
  background:"rgba(0,0,0,0.25)",
  border:"1px solid rgba(255,255,255,0.1)",
  borderRadius:7, padding:"9px 13px", color:"#ffffff", fontSize:13,
  fontFamily:"Georgia,serif", outline:"none", width:"100%", boxSizing:"border-box",
  cursor:"default", caretColor:"#FF6B00",
};
const FS_EDIT = {
  background:"rgba(30,26,15,0.8)",
  border:"1px solid rgba(255,107,0,0.6)",
  borderRadius:7, padding:"9px 13px", color:"#ffffff", fontSize:13,
  fontFamily:"Georgia,serif", width:"100%", cursor:"pointer",
};
const FS_READ = {
  background:"rgba(0,0,0,0.25)",
  border:"1px solid rgba(255,255,255,0.1)",
  borderRadius:7, padding:"9px 13px", color:"#ffffff", fontSize:13,
  fontFamily:"Georgia,serif", width:"100%", cursor:"default",
};

// ═══════════════════════════════════════════════════════════
// COMPONENTE FICHA FORM — con estado interno propio
// ═══════════════════════════════════════════════════════════
function FichaForm({
  fichaMode, fichaDraft, trabReal, fichaSelId,
  setFichaMode, setFichaDraft, setFichaSelId,
  fichaGuardMsg, setFichaGuardMsg,
  trabajadores, setTrabajadores,
  histNuevo, setHistNuevo, histMsg, setHistMsg,
  grabarNuevoTrabajador, grabarEdicionFicha, grabarNuevaRemuneracion,
  generarCodigo, S,
}) {
  const enEdicion = fichaMode === "nuevo" || fichaMode === "editar";

  // Leer valor: del draft si edita, de la ficha real si ve
  const val = (campo) => {
    if (enEdicion) return fichaDraft?.[campo] ?? "";
    if (campo === "nombre") return trabReal?.nombre ?? "";
    if (campo === "apellido") return trabReal?.apellido ?? "";
    if (campo === "apellidoM") return trabReal?.apellidoM ?? "";
    if (campo === "rut") return trabReal?.rut ?? "";
    return trabReal?.ficha?.[campo] ?? "";
  };

  const setD = (campo, valor) => setFichaDraft(p => ({...p, [campo]: valor}));

  const fi = enEdicion ? FI_EDIT : FI_READ;
  const fs = enEdicion ? FS_EDIT : FS_READ;

  const cancelar = () => {
    setFichaMode("ver");
    setFichaDraft(null);
    setFichaGuardMsg({tipo:"",txt:""});
    if (!fichaSelId) {
      const p = trabajadores.filter(x => x.activo && x.id !== 999)[0];
      if (p) setFichaSelId(p.id);
    }
  };

  const btnGrabar = {
    background:"linear-gradient(135deg,#27ae60,#1e8449)",color:"#fff",
    border:"none",borderRadius:8,padding:"12px 28px",cursor:"pointer",
    fontWeight:"bold",fontSize:14,fontFamily:"Georgia,serif",
    boxShadow:"0 3px 12px rgba(39,174,96,0.4)",
  };
  const btnCancel = {
    background:"rgba(20,18,10,0.85)",color:"#9A8A6A",
    border:"1px solid rgba(255,255,255,0.15)",borderRadius:8,
    padding:"12px 18px",cursor:"pointer",fontSize:13,fontFamily:"Georgia,serif",
  };

  if (fichaMode === "ver" && !trabReal) return (
    <div style={{background:"rgba(8,6,3,0.5)",border:"1px solid rgba(255,255,255,0.08)",
      borderRadius:14,padding:60,textAlign:"center",color:"#9A8A6A"}}>
      <div style={{fontSize:48,marginBottom:16}}>🪪</div>
      <div style={{fontSize:16,marginBottom:8}}>Selecciona un trabajador</div>
      <div style={{fontSize:13}}>o presiona <strong style={{color:"#FF6B00"}}>➕ Nueva Ficha</strong></div>
    </div>
  );

  if (!enEdicion && !trabReal) return null;

  return (
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>

      {/* ── Columna Izquierda ── */}
      <div>
        <FichaSCard>
          <FichaSecHdr icono="👤" titulo="Identificación Personal"/>

          <FichaRow cols="1fr">
            <div>
              <FichaLBL>Nombres</FichaLBL>
              <input type="text" readOnly={!enEdicion} style={fi}
                value={val("nombre")}
                onChange={e => enEdicion && setD("nombre", e.target.value)}
                placeholder={enEdicion ? "Juan Carlos" : ""}/>
            </div>
          </FichaRow>

          <FichaRow cols="1fr 1fr">
            <div>
              <FichaLBL>Apellido Paterno</FichaLBL>
              <input type="text" readOnly={!enEdicion} style={fi}
                value={val("apellido")}
                onChange={e => enEdicion && setD("apellido", e.target.value)}
                placeholder={enEdicion ? "Pérez" : ""}/>
            </div>
            <div>
              <FichaLBL>Apellido Materno</FichaLBL>
              <input type="text" readOnly={!enEdicion} style={fi}
                value={val("apellidoM")}
                onChange={e => enEdicion && setD("apellidoM", e.target.value)}
                placeholder={enEdicion ? "González" : ""}/>
            </div>
          </FichaRow>

          <FichaRow cols="1fr 1fr">
            <div>
              <FichaLBL>RUT</FichaLBL>
              <input type="text" readOnly={!enEdicion} style={fi}
                value={val("rut")}
                onChange={e => {
                  if (!enEdicion) return;
                  const clean = e.target.value.replace(/[^0-9kK]/g,"").toUpperCase();
                  setD("rut", autoFmtRut(clean));
                }}
                placeholder={enEdicion ? "Escribe solo números y K" : ""}
                maxLength={12}/>
            </div>
            <div>
              <FichaLBL>Cargo / Función</FichaLBL>
              <input type="text" readOnly={!enEdicion} style={fi}
                value={val("cargo")}
                onChange={e => enEdicion && setD("cargo", e.target.value)}
                placeholder={enEdicion ? "Ej: Operador Vial" : ""}/>
            </div>
          </FichaRow>

          <FichaRow cols="1fr">
            <div>
              <FichaLBL>Dirección</FichaLBL>
              <input type="text" readOnly={!enEdicion} style={fi}
                value={val("direccion")}
                onChange={e => enEdicion && setD("direccion", e.target.value)}
                placeholder={enEdicion ? "Calle, número, ciudad" : ""}/>
            </div>
          </FichaRow>

          <FichaRow cols="1fr 1fr">
            <div>
              <FichaLBL>Teléfono</FichaLBL>
              <input type="text" readOnly={!enEdicion} style={fi}
                value={val("telefono")}
                onChange={e => enEdicion && setD("telefono", e.target.value)}
                placeholder={enEdicion ? "+56 9 xxxx xxxx" : ""}/>
            </div>
            <div>
              <FichaLBL>Correo Electrónico</FichaLBL>
              <input type="email" readOnly={!enEdicion} style={fi}
                value={val("correo")}
                onChange={e => enEdicion && setD("correo", e.target.value)}
                placeholder={enEdicion ? "correo@dominio.cl" : ""}/>
            </div>
          </FichaRow>

          {enEdicion && (
            <div style={{display:"flex",gap:10,marginTop:4}}>
              <button onClick={fichaMode==="nuevo" ? grabarNuevoTrabajador : grabarEdicionFicha} style={btnGrabar}>💾 Grabar</button>
              <button onClick={cancelar} style={btnCancel}>✗ Cancelar</button>
            </div>
          )}
        </FichaSCard>

        <FichaSCard>
          <FichaSecHdr icono="🚨" titulo="Contacto de Emergencia" color="#e74c3c"/>
          <FichaRow cols="1fr">
            <div>
              <FichaLBL>Nombre del Contacto</FichaLBL>
              <input type="text" readOnly={!enEdicion} style={fi}
                value={val("contactoEmergencia")}
                onChange={e => enEdicion && setD("contactoEmergencia", e.target.value)}
                placeholder={enEdicion ? "Nombre completo" : ""}/>
            </div>
          </FichaRow>
          <FichaRow cols="1fr">
            <div>
              <FichaLBL>Teléfono de Emergencia</FichaLBL>
              <input type="text" readOnly={!enEdicion} style={fi}
                value={val("telefonoEmergencia")}
                onChange={e => enEdicion && setD("telefonoEmergencia", e.target.value)}
                placeholder={enEdicion ? "+56 9 xxxx xxxx" : ""}/>
            </div>
          </FichaRow>
        </FichaSCard>
      </div>

      {/* ── Columna Derecha ── */}
      <div>
        <FichaSCard>
          <FichaSecHdr icono="🏥" titulo="Datos Previsionales" color="#3498db"/>
          <FichaRow cols="1fr 1fr">
            <div>
              <FichaLBL>Previsión de Salud</FichaLBL>
              <select disabled={!enEdicion} style={fs}
                value={val("prevision")}
                onChange={e => enEdicion && setD("prevision", e.target.value)}>
                <option value="">— Seleccionar —</option>
                {["FONASA","ISAPRE Banmédica","ISAPRE Cruz Blanca","ISAPRE Consalud","ISAPRE Colmena","ISAPRE Vida Tres","ISAPRE Esencial","Otra ISAPRE"].map(o=>(
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
            <div>
              <FichaLBL>AFP</FichaLBL>
              <select disabled={!enEdicion} style={fs}
                value={val("afp")}
                onChange={e => enEdicion && setD("afp", e.target.value)}>
                <option value="">— Seleccionar —</option>
                {["CAPITAL","PROVIDA","HABITAT","CUPRUM","PLANVITAL","UNO","MODELO"].map(o=>(
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
          </FichaRow>
        </FichaSCard>

        <FichaSCard>
          <FichaSecHdr icono="💼" titulo="Datos Contractuales" color="#27ae60"/>

          <FichaRow cols="1fr">
            <div>
              <FichaLBL>Sueldo Pactado (bruto mensual)</FichaLBL>
              <input type="text" readOnly={!enEdicion} style={fi}
                value={val("sueldoPactado")}
                onChange={e => enEdicion && setD("sueldoPactado", e.target.value.replace(/\D/g,""))}
                placeholder={enEdicion ? "Ej: 500000" : ""}/>
              {val("sueldoPactado") && (
                <div style={{color:"#27ae60",fontSize:12,marginTop:4,fontWeight:"bold"}}>
                  {new Intl.NumberFormat("es-CL",{style:"currency",currency:"CLP"}).format(val("sueldoPactado"))}
                </div>
              )}
            </div>
          </FichaRow>

          <FichaRow cols="1fr 1fr 1fr">
            <div>
              <FichaLBL>Colación ($)</FichaLBL>
              <input type="number" readOnly={!enEdicion} style={fi}
                value={val("colacion")}
                onChange={e => enEdicion && setD("colacion", e.target.value)}
                placeholder="0"/>
            </div>
            <div>
              <FichaLBL>Movilización ($)</FichaLBL>
              <input type="number" readOnly={!enEdicion} style={fi}
                value={val("movilizacion")}
                onChange={e => enEdicion && setD("movilizacion", e.target.value)}
                placeholder="0"/>
            </div>
            <div>
              <FichaLBL>Gratif. Legal</FichaLBL>
              <div style={{display:"flex",alignItems:"center",gap:8,
                background:enEdicion?"rgba(255,255,255,0.1)":"rgba(0,0,0,0.25)",
                border:"1px solid rgba(255,255,255,0.1)",borderRadius:7,
                padding:"9px 13px",height:41,boxSizing:"border-box"}}>
                <input type="checkbox" disabled={!enEdicion}
                  checked={enEdicion ? !!fichaDraft?.gratificacion : !!trabReal?.ficha?.gratificacion}
                  onChange={e => enEdicion && setD("gratificacion", e.target.checked)}
                  style={{width:15,height:15,accentColor:"#FF6B00",cursor:enEdicion?"pointer":"default"}}/>
                <span style={{color:"#fff",fontSize:12}}>Mensual</span>
              </div>
            </div>
          </FichaRow>

          <FichaRow cols="1fr 1fr">
            <div>
              <FichaLBL>Fecha de Ingreso</FichaLBL>
              <input type="date" readOnly={!enEdicion} style={fi}
                value={val("fechaIngreso")}
                onChange={e => enEdicion && setD("fechaIngreso", e.target.value)}/>
            </div>
            <div>
              <FichaLBL>Fecha de Salida</FichaLBL>
              <input type="date" readOnly={!enEdicion} style={fi}
                value={val("fechaSalida")}
                onChange={e => enEdicion && setD("fechaSalida", e.target.value)}/>
            </div>
          </FichaRow>

          <FichaRow cols="1fr">
            <div>
              <FichaLBL>Motivo de Salida</FichaLBL>
              <select disabled={!enEdicion} style={fs}
                value={val("motivoSalida")}
                onChange={e => enEdicion && setD("motivoSalida", e.target.value)}>
                <option value="">— Seleccionar —</option>
                {["Renuncia voluntaria","Desvinculación","Término de contrato","Jubilación","Fallecimiento","Otro"].map(o=>(
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
          </FichaRow>

          {val("fechaIngreso") && (
            <div style={{background:"rgba(255,215,0,0.06)",border:"1px solid rgba(255,215,0,0.2)",
              borderRadius:8,padding:"10px 14px",fontSize:12,color:"#9A8A6A"}}>
              ⏱ Antigüedad: <strong style={{color:"#C9A84C"}}>{(()=>{
                const ini = new Date(val("fechaIngreso"));
                const fin = val("fechaSalida") ? new Date(val("fechaSalida")) : new Date();
                const m = (fin.getFullYear()-ini.getFullYear())*12+(fin.getMonth()-ini.getMonth());
                return `${Math.floor(m/12)} año(s) y ${m%12} mes(es)`;
              })()}</strong>
            </div>
          )}
        </FichaSCard>

        <FichaSCard>
          <FichaSecHdr icono="📝" titulo="Observaciones" color="#8e44ad"/>
          <textarea readOnly={!enEdicion}
            style={{...fi,minHeight:80,resize:"vertical",lineHeight:1.6}}
            value={val("observaciones")}
            onChange={e => enEdicion && setD("observaciones", e.target.value)}
            placeholder={enEdicion ? "Notas adicionales..." : ""}/>
        </FichaSCard>

        {/* Historial Remuneraciones — solo modo ver */}
        {fichaMode==="ver" && trabReal && (
          <FichaSCard style={{border:"1px solid rgba(255,215,0,0.2)"}}>
            <FichaSecHdr icono="💰" titulo="Historial de Remuneraciones" color="#FFD700"/>
            {(trabReal.ficha?.historialRemuneraciones||[]).length===0 ? (
              <div style={{color:"#9A8A6A",fontSize:13,textAlign:"center",padding:"12px 0"}}>
                Sin registros. Agrega el primero abajo.
              </div>
            ) : (
              <div style={{overflowX:"auto",marginBottom:14}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead>
                    <tr>
                      {["Desde","Sueldo","Colación","Moviliz.","Gratif.","Motivo","Registrado"].map(h=>(
                        <th key={h} style={{background:"rgba(5,4,2,0.6)",padding:"7px 9px",
                          textAlign:"left",color:"#C9A84C",fontSize:10,textTransform:"uppercase",
                          letterSpacing:1,borderBottom:"1px solid rgba(255,215,0,0.2)"}}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...(trabReal.ficha?.historialRemuneraciones||[])]
                      .sort((a,b)=>b.desde.localeCompare(a.desde))
                      .map((h,idx)=>(
                        <tr key={h.id} style={{
                          background:idx===0?"rgba(255,215,0,0.07)":"transparent",
                          borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                          <td style={{padding:"7px 9px",fontWeight:idx===0?"bold":"normal",whiteSpace:"nowrap"}}>
                            {h.desde}
                            {idx===0&&<span style={{background:"rgba(255,215,0,0.25)",color:"#C9A84C",
                              fontSize:9,fontWeight:"bold",padding:"1px 5px",borderRadius:4,marginLeft:5}}>
                              VIGENTE
                            </span>}
                          </td>
                          <td style={{padding:"7px 9px",color:idx===0?"#FFD700":"#fff",fontWeight:idx===0?"bold":"normal"}}>
                            ${Number(h.sueldo).toLocaleString("es-CL")}
                          </td>
                          <td style={{padding:"7px 9px",color:"#9A8A6A"}}>${Number(h.colacion).toLocaleString("es-CL")}</td>
                          <td style={{padding:"7px 9px",color:"#9A8A6A"}}>${Number(h.movilizacion).toLocaleString("es-CL")}</td>
                          <td style={{padding:"7px 9px",textAlign:"center",color:h.gratificacion?"#27ae60":"#aaa"}}>{h.gratificacion?"✓":"—"}</td>
                          <td style={{padding:"7px 9px",color:"#d0e0ff"}}>{h.motivo}</td>
                          <td style={{padding:"7px 9px",color:"#7A6A4A",fontSize:10}}>{h.registradoEn}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{background:"rgba(255,215,0,0.05)",border:"1px solid rgba(255,215,0,0.2)",borderRadius:10,padding:"14px 16px"}}>
              <div style={{color:"#C9A84C",fontWeight:"bold",fontSize:12,marginBottom:12,textTransform:"uppercase",letterSpacing:1}}>
                ➕ Registrar Incremento / Ajuste
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <div>
                  <FichaLBL>Vigente desde</FichaLBL>
                  <input type="date" style={FI_EDIT}
                    value={histNuevo.desde}
                    onChange={e=>setHistNuevo(p=>({...p,desde:e.target.value}))}/>
                </div>
                <div>
                  <FichaLBL>Nuevo Sueldo Base ($)</FichaLBL>
                  <input type="number" style={FI_EDIT}
                    value={histNuevo.sueldo}
                    onChange={e=>setHistNuevo(p=>({...p,sueldo:e.target.value}))}
                    placeholder="Ej: 550000"/>
                  {histNuevo.sueldo&&Number(histNuevo.sueldo)>0&&(
                    <div style={{color:"#27ae60",fontSize:11,marginTop:3}}>
                      {new Intl.NumberFormat("es-CL",{style:"currency",currency:"CLP"}).format(histNuevo.sueldo)}
                    </div>
                  )}
                </div>
                <div>
                  <FichaLBL>Colación ($)</FichaLBL>
                  <input type="number" style={FI_EDIT}
                    value={histNuevo.colacion}
                    onChange={e=>setHistNuevo(p=>({...p,colacion:e.target.value}))}/>
                </div>
                <div>
                  <FichaLBL>Movilización ($)</FichaLBL>
                  <input type="number" style={FI_EDIT}
                    value={histNuevo.movilizacion}
                    onChange={e=>setHistNuevo(p=>({...p,movilizacion:e.target.value}))}/>
                </div>
                <div style={{gridColumn:"1/-1"}}>
                  <FichaLBL>Motivo del Cambio</FichaLBL>
                  <select style={FS_EDIT}
                    value={histNuevo.motivo}
                    onChange={e=>setHistNuevo(p=>({...p,motivo:e.target.value}))}>
                    <option value="">— Seleccionar —</option>
                    {["Sueldo inicial","Ajuste anual","Incremento por mérito","Promoción","Cambio de cargo","Negociación colectiva","Corrección","Otro"].map(o=>(
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
                <div style={{gridColumn:"1/-1",display:"flex",alignItems:"center",gap:8}}>
                  <input type="checkbox"
                    checked={histNuevo.gratificacion}
                    onChange={e=>setHistNuevo(p=>({...p,gratificacion:e.target.checked}))}
                    style={{width:15,height:15,accentColor:"#FF6B00"}}/>
                  <span style={{color:"#fff",fontSize:13}}>Incluye Gratificación Legal Mensual</span>
                </div>
              </div>
              <button onClick={()=>grabarNuevaRemuneracion(trabReal.id)}
                style={{background:"linear-gradient(135deg,#FFD700,#e6c200)",color:"#001a4d",
                  border:"none",borderRadius:8,padding:"10px 22px",cursor:"pointer",
                  fontWeight:"bold",fontSize:13,fontFamily:"Georgia,serif",
                  boxShadow:"0 3px 10px rgba(255,215,0,0.3)"}}>
                💰 Registrar Cambio de Remuneración
              </button>
              {histMsg.txt&&(
                <div style={{...histMsg.tipo==="err"
                  ?{background:"rgba(192,57,43,0.3)",border:"1px solid #c0392b",color:"#ffaaaa"}
                  :{background:"rgba(39,174,96,0.3)",border:"1px solid #27ae60",color:"#aaffcc"},
                  borderRadius:8,padding:"9px 14px",marginTop:10,fontSize:13}}>
                  {histMsg.txt}
                </div>
              )}
            </div>
          </FichaSCard>
        )}

        {/* Botones pie */}
        {fichaMode==="ver" && trabReal && (
          <div style={{display:"flex",gap:10}}>
            <button
              onClick={()=>{
                setFichaMode("editar");
                setFichaDraft({nombre:trabReal.nombre,apellido:trabReal.apellido,apellidoM:trabReal.apellidoM||"",rut:trabReal.rut,...trabReal.ficha});
                setFichaGuardMsg({tipo:"",txt:""});
              }}
              style={{flex:1,background:"linear-gradient(135deg,rgba(41,128,185,0.3),rgba(41,128,185,0.15))",
                color:"#3498db",border:"1px solid rgba(41,128,185,0.5)",borderRadius:8,
                padding:"12px 0",cursor:"pointer",fontWeight:"bold",fontSize:13,fontFamily:"Georgia,serif"}}>
              ✏️ Editar Ficha
            </button>
            <button
              onClick={()=>setTrabajadores(p=>p.map(x=>x.id===trabReal.id?{...x,activo:!x.activo}:x))}
              style={{background:"rgba(20,18,10,0.85)",color:"#9A8A6A",
                border:"1px solid rgba(255,255,255,0.15)",borderRadius:8,
                padding:"12px 20px",cursor:"pointer",fontSize:12,fontFamily:"Georgia,serif"}}>
              {trabReal.activo?"Desactivar":"Activar"}
            </button>
          </div>
        )}
        {enEdicion && (
          <div style={{display:"flex",gap:10}}>
            <button onClick={fichaMode==="nuevo"?grabarNuevoTrabajador:grabarEdicionFicha}
              style={{flex:1,background:"linear-gradient(135deg,#27ae60,#1e8449)",color:"#fff",
                border:"none",borderRadius:8,padding:"13px 0",cursor:"pointer",
                fontWeight:"bold",fontSize:15,fontFamily:"Georgia,serif",
                boxShadow:"0 3px 12px rgba(39,174,96,0.4)"}}>
              💾 Grabar
            </button>
            <button onClick={cancelar}
              style={{background:"rgba(20,18,10,0.85)",color:"#9A8A6A",
                border:"1px solid rgba(255,255,255,0.15)",borderRadius:8,
                padding:"13px 20px",cursor:"pointer",fontSize:13,fontFamily:"Georgia,serif"}}>
              ✗ Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
// LOGO
// ═══════════════════════════════════════════════════════════
const LOGO_SRC = "data:image/jpeg;base64,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nEvPo39eIjr08++cOfsZiSuN88pum9ge/IAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH/2gAMAwEAAgADAAAAIfPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPOPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPOs8zQ5eF9ePPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPLPPPPPPPPPPO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zhdbz2HB30xjr7zzzzzzzzzX0xxvzzzzxzzzzzzz1X1BXRzzzyhzzzEx3WL/AM88nLghA8888888888888Il5jzjRDDDFscs888888888DrDU88888088888oE4k4k88888o888Ntd+f88888/f5988888888888884V5dxN1J5h9h0888o88885BY1dxd98888888x9xtA5pRtNx88o8880l5tVpxx55l5xd08888888888885h9L5BbhFltfd888o888o7Hrntr/Dc888884RxV/RnR7lBj88o888trZhHRFtLpltbpN8888888888884tfnjprtTtPb1888o88888s3D3U808888888BPpHjHnDT/AB8fLPPPPPATU2QQycwwc9PPPPPPPPPPPPPPHLHDDDHPDDPPPPPPPPPPPPDLLHPPPPPPPPLDDHHPDLDLPDPPPPPPPPPPLLPLHPPHLPPPPPPPPPPPPNdvdNtdetu9d9utdf8AP/LjTDPPf3n3D77jXkTXn7rDTzn3nPPbjTzLb/PHXXP7Lnnbjn/LXrnzzzzzzzzwwwwxzzzzzzwx749+82wxw7830zx78/2y45847520/wDue8sctf8AzvDHDT7z/jHPPPPPDDDLPPPPPPPPPPPPPPPPPPPPPPPNefNOfdfMMPfMMfNOMPaVMPMYefMcccNMcOcfOPc8fv8ATPffzzzzzzzzzyzzzzzzzzzzzzzzzzzzzzzyyfm18FHG8n/uWSmnNf2dE0GD8Xl0/XX311+OnSVCR/iRuEQvfzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzyzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzyDyCDyBxxzzzzzzzzzzzzxzyDxzzzzzyDyBzzzzzzzzyDzzxyDzyDzzzzyDzzzzzzzzzzzyDzxyDz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";
function Logo({ size=48 }) {
  return (
    <div style={{ width:size, height:size, background:"#fff", borderRadius: size > 60 ? 16 : 10, padding: size > 60 ? 6 : 3, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, boxShadow:"0 2px 12px rgba(0,0,0,0.3)" }}>
      <img src={LOGO_SRC} alt="Paz Vial" style={{ width:"100%", height:"100%", objectFit:"contain" }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ESTILOS GLOBALES
// ═══════════════════════════════════════════════════════════
// ── Paleta Negro y Dorado ────────────────────────────────────────────────
const ORO     = "#C9A84C";   // dorado elegante
const ORO_L   = "#E8C97A";   // dorado claro
const ORO_D   = "#8B6914";   // dorado oscuro
const NEGRO   = "#0A0A0A";   // negro profundo
const NEGRO2  = "#141414";   // negro suave
const NEGRO3  = "#1C1C1C";   // negro card
const GRIS1   = "#2A2A2A";   // gris oscuro
const GRIS2   = "#3D3D3D";   // gris medio
const BLANCO  = "#F5F0E8";   // blanco cálido

const S = {
  app:   { minHeight:"100vh", background:`linear-gradient(160deg,${NEGRO} 0%,#0F0F0F 40%,#161208 100%)`, fontFamily:"'Georgia',serif", color:BLANCO },
  hdr:   { background:"rgba(5,5,5,0.95)", backdropFilter:"blur(20px)", borderBottom:`1px solid ${ORO}`, padding:"10px 24px", display:"flex", alignItems:"center", gap:12, justifyContent:"space-between", boxShadow:`0 2px 20px rgba(201,168,76,0.15)` },
  card:  { background:`rgba(20,18,10,0.85)`, backdropFilter:"blur(12px)", border:`1px solid rgba(201,168,76,0.18)`, borderRadius:14, padding:20, marginBottom:16, boxShadow:"0 4px 24px rgba(0,0,0,0.4)" },
  input: { background:"rgba(18,15,8,0.7)", border:`1px solid rgba(201,168,76,0.35)`, borderRadius:8, padding:"9px 13px", color:BLANCO, fontSize:14, fontFamily:"Georgia,serif", outline:"none", width:"100%", boxSizing:"border-box" },
  sel:   { background:NEGRO2, border:`1px solid rgba(201,168,76,0.35)`, borderRadius:8, padding:"8px 12px", color:BLANCO, fontSize:13, fontFamily:"Georgia,serif", cursor:"pointer" },
  lbl:   { fontSize:11, color:"#9A8A6A", marginBottom:4, display:"block", textTransform:"uppercase", letterSpacing:1.5 },
  btn:   { background:`linear-gradient(135deg,${ORO},${ORO_D})`, color:NEGRO, border:"none", borderRadius:8, padding:"10px 20px", fontWeight:"bold", cursor:"pointer", fontSize:13, fontFamily:"Georgia,serif", boxShadow:`0 2px 12px rgba(201,168,76,0.3)` },
  btnS:  { background:"rgba(18,15,8,0.7)", color:BLANCO, border:`1px solid rgba(201,168,76,0.25)`, borderRadius:8, padding:"8px 14px", cursor:"pointer", fontSize:12, fontFamily:"Georgia,serif" },
  btnD:  { background:"#7B1F1F", color:"#FFCCCC", border:"1px solid #c0392b", borderRadius:7, padding:"6px 13px", cursor:"pointer", fontSize:12, fontFamily:"Georgia,serif" },
  btnG:  { background:"#1A4A2A", color:"#AAFFCC", border:"1px solid #27ae60", borderRadius:7, padding:"6px 13px", cursor:"pointer", fontSize:12, fontFamily:"Georgia,serif" },
  btnB:  { background:"#1A2E4A", color:"#AAD4FF", border:"1px solid #2980b9", borderRadius:7, padding:"6px 13px", cursor:"pointer", fontSize:12, fontFamily:"Georgia,serif" },
  tab:   a => ({ background:a?`linear-gradient(135deg,${ORO},${ORO_D})`:NEGRO2, color:a?NEGRO:"#9A8A6A", border:a?"none":`1px solid rgba(201,168,76,0.15)`, borderRadius:"8px 8px 0 0", padding:"9px 16px", cursor:"pointer", fontWeight:a?"bold":"normal", fontFamily:"Georgia,serif", fontSize:12, boxShadow:a?`0 -2px 8px rgba(201,168,76,0.2)`:"none" }),
  bdg:   c => ({ background:c, borderRadius:10, padding:"2px 9px", fontSize:11, fontWeight:"bold", display:"inline-block" }),
  th:    { background:NEGRO2, padding:"9px 11px", textAlign:"left", color:ORO, fontSize:11, textTransform:"uppercase", letterSpacing:1.5, borderBottom:`1px solid rgba(201,168,76,0.25)` },
  td:    { padding:"9px 11px", borderBottom:`1px solid rgba(201,168,76,0.08)`, verticalAlign:"middle", fontSize:13, color:BLANCO },
  err:   { background:"rgba(120,30,30,0.4)", border:"1px solid #c0392b", borderRadius:8, padding:"9px 14px", marginTop:8, fontSize:13, color:"#FFAAAA" },
  ok:    { background:"rgba(20,60,35,0.5)", border:"1px solid #27ae60", borderRadius:8, padding:"9px 14px", marginTop:8, fontSize:13, color:"#AAFFCC" },
  notif: { background:"rgba(100,70,10,0.3)", border:`1px solid ${ORO_D}`, borderRadius:8, padding:"10px 14px", marginBottom:8, fontSize:13 },
  tbl:   { width:"100%", borderCollapse:"collapse", fontSize:13 },
};

// ═══════════════════════════════════════════════════════════
// MODAL MOTIVO RECHAZO — definido GLOBALMENTE para que React
// no lo re-monte en cada render (evita pérdida de foco)
// ═══════════════════════════════════════════════════════════
function ModalMotivo({ motivoModal, setMotivoModal, onConfirmar }) {
  if (!motivoModal) return null;
  const mot = motivoModal.motivo || "";
  const setMot = (v) => setMotivoModal(p => ({...p, motivo: v}));
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:999, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ ...S.card, maxWidth:440, width:"100%", border:"2px solid #e74c3c" }}>
        <h3 style={{ color:"#e74c3c", marginTop:0 }}>❌ Motivo del Rechazo</h3>
        <label style={S.lbl}>Indica el motivo (requerido)</label>
        <textarea
          style={{ ...S.input, minHeight:90, resize:"vertical" }}
          value={mot}
          onChange={e => setMot(e.target.value)}
          placeholder="Escribe el motivo del rechazo..."
          autoFocus
        />
        <div style={{ display:"flex", gap:10, marginTop:14 }}>
          <button
            onClick={() => onConfirmar(mot)}
            style={S.btnD}
            disabled={!mot.trim()}
          >
            Confirmar Rechazo
          </button>
          <button onClick={() => setMotivoModal(null)} style={S.btnS}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// APP PRINCIPAL
// ═══════════════════════════════════════════════════════════
export default function App() {
  // ── Estado global ──────────────────────────────────────
  const [trabajadores, setTrabajadores] = useState(T0);
  const [registros,    setRegistros]    = useState(R0);
  const [compensatorios, setComps]      = useState([]);
  const [solicitudes,  setSolicitudes]  = useState([]); // permisos + vacaciones
  const [notificaciones, setNotifs]     = useState([]); // {id, tId, msg, leida}

  // ── Navegación ─────────────────────────────────────────
  const [vista, setVista]       = useState("portada"); // portada | adminLogin | admin | trabLogin | trab
  const [trabActivo, setTrabActivo] = useState(null);
  const [tabAdmin,   setTabAdmin]   = useState("registros");
  const [tabTrab,    setTabTrab]    = useState("marcar");

  // ── Login trabajador ───────────────────────────────────
  const [lCodigo, setLCodigo] = useState("");
  const [lRut,    setLRut]    = useState("");
  const [lError,  setLError]  = useState("");

  // ── Login admin ────────────────────────────────────────
  const [aPass,  setAPass]  = useState("");
  const [aError, setAError] = useState("");

  // ── Marca asistencia ───────────────────────────────────
  const [tipoMarca,   setTipoMarca]   = useState("entrada");
  const [marcaMsg,    setMarcaMsg]    = useState({ tipo:"", txt:"" });

  // ── Admin: nuevo trabajador ────────────────────────────
  const [nNombre,   setNNombre]   = useState("");
  const [nApellido, setNApellido] = useState("");
  const [nApellidoM,setNApellidoM] = useState("");
  const [nRut,      setNRut]      = useState("");
  const [nFormErr,  setNFormErr]  = useState("");

  // ── Admin: aprobar/rechazar ────────────────────────────
  const [motivoModal, setMotivoModal] = useState(null); // {tipo:"extra"|"solicitud", id, accion:"rechazar"}

  // ── Dashboard filtros ──────────────────────────────────
  const [dMes,  setDMes]  = useState(new Date().getMonth());
  const [dAnio, setDAnio] = useState(new Date().getFullYear());

  // ── Calendario ─────────────────────────────────────────
  const [calMes,  setCalMes]  = useState(new Date().getMonth());
  const [calAnio, setCalAnio] = useState(new Date().getFullYear());

  // ── Solicitud trabajador ───────────────────────────────
  const [solTipo,       setSolTipo]       = useState("permiso");
  const [solFechaDesde, setSolFechaDesde] = useState("");
  const [solFechaHasta, setSolFechaHasta] = useState("");
  const [solMotivo,     setSolMotivo]     = useState("");
  const [solMsg,        setSolMsg]        = useState({ tipo:"", txt:"" });

  // ── Export/Import ──────────────────────────────────────
  const importRef = useRef();
  const [importMsg, setImportMsg] = useState({ tipo:"", txt:"" });

  // ── Fichas de trabajadores ─────────────────────────────
  const [fichaSelId, setFichaSelId] = useState(null);

  // ── SubTabs admin ──────────────────────────────────────
  const [subTabAsist,  setSubTabAsist]  = useState("ver");
  const [subTabNomina, setSubTabNomina] = useState("lista");

  // ── Filtros registro asistencia ───────────────────────
  const [filtroRegTrab, setFiltroRegTrab] = useState("");
  const [filtroRegMes,  setFiltroRegMes]  = useState("");
  const [filtroRegAnio, setFiltroRegAnio] = useState(String(new Date().getFullYear()));

  // ── Hoja de asistencia mensual ─────────────────────────
  const [hojaAsistMes,    setHojaAsistMes]    = useState(new Date().getMonth());
  const [hojaAsistAnio,   setHojaAsistAnio]   = useState(new Date().getFullYear());
  const [hojaAsistTrabId, setHojaAsistTrabId] = useState("");

  // ── Historial de remuneraciones ──────────────────────
  const [histModalTrabId, setHistModalTrabId] = useState(null);
  const [histNuevo,       setHistNuevo]       = useState({desde:"",sueldo:"",colacion:"",movilizacion:"",gratificacion:false,motivo:""});
  const [histMsg,         setHistMsg]         = useState({tipo:"",txt:""});

  // ── Nuevo trabajador (ficha borrador) ─────────────────
  const fichaBorrador = () => ({
    nombre:"", apellido:"", apellidoM:"", rut:"",
    direccion:"", telefono:"", correo:"", cargo:"",
    contactoEmergencia:"", telefonoEmergencia:"",
    prevision:"FONASA", afp:"", sueldoPactado:"",
    gratificacion:false, colacion:0, movilizacion:0,
    fechaIngreso:"", fechaSalida:"", motivoSalida:"",
    observaciones:"",
    historialRemuneraciones:[],
  });
  const [fichaMode,    setFichaMode]    = useState("ver");   // "ver" | "nuevo" | "editar"
  const [fichaDraft,   setFichaDraft]   = useState(null);    // datos del borrador
  const [fichaGuardMsg,setFichaGuardMsg]= useState({tipo:"",txt:""});

  // ── Validación entrada anticipada ─────────────────────
  const [entradaAnticModal, setEntradaAnticModal] = useState(null);

  // ── Registro manual de asistencia ─────────────────────
  const [regManTrabId,  setRegManTrabId]  = useState("");
  const [regManFecha,   setRegManFecha]   = useState(hoy());
  const [regManEntrada, setRegManEntrada] = useState("08:00");
  const [regManSalida,  setRegManSalida]  = useState("18:00");
  const [regManMsg,     setRegManMsg]     = useState({tipo:"",txt:""});

  // ── Edición de registro ────────────────────────────────
  const [regEditando,   setRegEditando]   = useState(null); // id del registro en edición
  const [regEditFecha,  setRegEditFecha]  = useState("");
  const [regEditEnt,    setRegEditEnt]    = useState("");
  const [regEditSal,    setRegEditSal]    = useState("");
  const [regEditMsg,    setRegEditMsg]    = useState({tipo:"",txt:""});

  // ── Confirmar limpiar datos ficticios ──────────────────
  const [confirmarLimpiar, setConfirmarLimpiar] = useState(false);

  // ── Modal confirmación de marca (entrada/salida) ───────
  const [marcaConfirm,   setMarcaConfirm]   = useState(null);   // {tipo, hora, fecha} | null
  const [marcaGuardando, setMarcaGuardando] = useState(false);  // true mientras se guarda en Firebase
  const [syncEstado,     setSyncEstado]     = useState("ok");   // "ok" | "guardando" | "error"

  // ── Liquidaciones ──────────────────────────────────────
  const [liquidaciones, setLiquidaciones] = useState([]);
  // {id, tId, mes, anio, datos:{...}, estado:"borrador"|"enviada"|"firmada",
  //  firmadaPor:"", firmadaFecha:"", firmadaHora:""}

  // ── Anticipos ──────────────────────────────────────────
  const [anticipos, setAnticipos] = useState([]);
  // {id, tId, monto, motivo, estado:"pendiente"|"aprobado"|"rechazado",
  //  motivoRechazo:"", mes, anio, creado}

  // ── UI liquidaciones admin ─────────────────────────────
  const [liqTrabId,  setLiqTrabId]  = useState("");
  const [liqMes,     setLiqMes]     = useState(new Date().getMonth());
  const [liqAnio,    setLiqAnio]    = useState(new Date().getFullYear());
  const [liqPreview, setLiqPreview] = useState(null);
  const [liqMsg,     setLiqMsg]     = useState({tipo:"",txt:""});

  // ── UI firma trabajador ────────────────────────────────
  const [firmaLiqId,  setFirmaLiqId]  = useState(null);
  const [firmaRut,    setFirmaRut]    = useState("");
  const [firmaCodigo, setFirmaCodigo] = useState("");
  const [firmaMsg,    setFirmaMsg]    = useState({tipo:"",txt:""});

  // ── UI anticipo trabajador ─────────────────────────────
  const [anticMonto,  setAnticMonto]  = useState("");
  const [anticMotivo, setAnticMotivo] = useState("");
  const [anticMsg,    setAnticMsg]    = useState({tipo:"",txt:""});

  // ── Firebase: estado de carga ─────────────────────────
  const firebaseListo = useRef(false);
  const cargandoDesdeFirebase = useRef(false);

  // ── Estilos globales: forzar formato 24h en inputs de tiempo ─────────
  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'pazvial-time-fix';
    style.textContent = `
      input[type="time"]::-webkit-datetime-edit-ampm-field { display: none; }
      input[type="time"] { -webkit-appearance: none; }
      input[type="time"]::-webkit-calendar-picker-indicator { filter: invert(0.8); }
    `;
    if (!document.getElementById('pazvial-time-fix')) {
      document.head.appendChild(style);
    }
    return () => {
      const el = document.getElementById('pazvial-time-fix');
      if (el) el.remove();
    };
  }, []);

  // Cargar datos UNA sola vez al iniciar
  useEffect(() => {
    const [col, docId] = DB_DOC.split("/");
    cargandoDesdeFirebase.current = true;
    getDoc(doc(db, col, docId)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        // Solo cargar si Firebase tiene datos reales (más trabajadores que los de prueba)
        const tFirebase = data.trabajadores || [];
        const tieneReales = tFirebase.some(t => !t.esDePrueba || t.id === 999);
        if (tieneReales) {
          setTrabajadores(tFirebase);
          setRegistros(data.registros || []);
          setComps(data.compensatorios || []);
          setSolicitudes(data.solicitudes || []);
          setNotifs(data.notificaciones || []);
          setLiquidaciones(data.liquidaciones || []);
          setAnticipos(data.anticipos || []);
        }
      }
    }).finally(() => {
      cargandoDesdeFirebase.current = false;
      firebaseListo.current = true;
    });
  }, []);

  // ── Firebase: guardar cuando cambian los datos ────────
  const renderCount = useRef(0);
  useEffect(() => {
    renderCount.current += 1;
    // Ignorar los primeros renders (carga inicial)
    if (renderCount.current <= 2) return;
    // No guardar si estamos cargando desde Firebase
    if (cargandoDesdeFirebase.current) return;
    // No guardar si Firebase no está listo
    if (!firebaseListo.current) return;

    const timeout = setTimeout(() => {
      guardarEnFirebase({
        trabajadores, registros,
        compensatorios, solicitudes,
        notificaciones, liquidaciones, anticipos,
        ultimaActualizacion: new Date().toISOString(),
      });
    }, 2000);
    return () => clearTimeout(timeout);
  }, [trabajadores, registros, compensatorios, solicitudes, notificaciones, liquidaciones, anticipos]);

  // ── Compensatorios: auto-generar ───────────────────────
  useEffect(() => {
    const ids = new Set(compensatorios.map(c => c.registroId));
    const nuevos = [];
    registros.forEach(r => {
      if (!ids.has(r.id) && esEspecial(r.fecha) && r.salida) {
        nuevos.push({ id:nowId(), registroId:r.id, tId:r.tId, fecha:r.fecha, estado:"pendiente", fechaTomado:"" });
      }
    });
    if (nuevos.length) setComps(p => [...p, ...nuevos]);
  }, [registros]);

  // ── Re-sincronizar trabActivo cuando Firebase actualiza la lista ──────
  // Evita que un trabajador con sesión abierta quede con un ID desactualizado
  useEffect(() => {
    if (!trabActivo) return;
    // Buscar por ID exacto primero
    const mismoId = trabajadores.find(x => x.id === trabActivo.id && x.activo);
    if (mismoId) {
      // Actualizar datos (nombre, cargo, etc.) sin cambiar la sesión
      if (JSON.stringify(mismoId) !== JSON.stringify(trabActivo)) {
        setTrabActivo({ ...mismoId });
      }
      return;
    }
    // Si no existe el ID, buscar por código (el trabajador fue recreado)
    const porCodigo = trabajadores.find(x =>
      x.codigo.toUpperCase() === trabActivo.codigo.toUpperCase() && x.activo
    );
    if (porCodigo) {
      // Sesión recuperada con el ID correcto — el trabajador no notará nada
      setTrabActivo({ ...porCodigo });
    }
    // Si tampoco existe por código, la sesión quedará inválida y confirmarMarca lo detectará
  }, [trabajadores]);

  // ── Notif helper ──────────────────────────────────────
  function pushNotif(tId, msg) {
    setNotifs(p => [...p, { id:nowId(), tId, msg, leida:false, fecha: hoy() }]);
  }
  function marcarLeidas(tId) {
    setNotifs(p => p.map(n => n.tId===tId ? {...n, leida:true} : n));
  }
  const notifsNoLeidas = tId => notificaciones.filter(n => n.tId===tId && !n.leida).length;

  // ═══════════════════════════════════════════════════════
  // ACCIONES
  // ═══════════════════════════════════════════════════════

  function loginTrabajador() {
    setLError("");
    const codigoOk = (t) => t.codigo.toUpperCase() === lCodigo.trim().toUpperCase();
    const rutOk = (t) => {
      if (t.rut.toLowerCase() === "pruebas") return lRut.trim().toLowerCase() === "pruebas";
      return t.rut.replace(/[^0-9kK]/g,"").toLowerCase() === lRut.replace(/[^0-9kK]/g,"").toLowerCase();
    };
    // Buscar siempre desde la lista vigente en memoria (ya sincronizada con Firebase)
    const t = trabajadores.find(x => codigoOk(x) && rutOk(x) && x.activo);
    if (!t) { setLError("Código o RUT incorrecto."); return; }
    // Guardar snapshot actualizado del trabajador al momento del login
    setTrabActivo({ ...t });
    setVista("trab");
    setTabTrab("marcar");
    setLCodigo(""); setLRut("");
    marcarLeidas(t.id);
  }

  function loginAdmin() {
    if (aPass === ADMIN_PASS) { setVista("admin"); setAError(""); setAPass(""); }
    else setAError("Contraseña incorrecta.");
  }

  // Paso 1: mostrar modal de confirmación
  function solicitarConfirmacionMarca() {
    setMarcaMsg({ tipo:"", txt:"" });
    const fechaHoy = hoy();
    const hora     = horaActual();

    // Verificar que el trabajador logueado sigue siendo válido en el sistema actual
    const trabVigente = trabajadores.find(x => x.id === trabActivo.id && x.activo);
    const idReal = trabVigente ? trabVigente.id
      : trabajadores.find(x =>
          x.codigo.toUpperCase() === trabActivo.codigo.toUpperCase() && x.activo
        )?.id;

    const regHoy = registros.find(r => r.tId === (idReal ?? trabActivo.id) && r.fecha === fechaHoy);

    // Validaciones previas
    if (tipoMarca === "entrada") {
      if (regHoy) { setMarcaMsg({ tipo:"err", txt:"Ya tiene registro de entrada hoy." }); return; }
    } else {
      if (!regHoy)       { setMarcaMsg({ tipo:"err", txt:"No tiene entrada registrada hoy." }); return; }
      if (regHoy.salida) { setMarcaMsg({ tipo:"err", txt:"Ya tiene salida registrada hoy." }); return; }
    }
    // Mostrar modal de confirmación con hora actual
    setMarcaConfirm({ tipo: tipoMarca, hora, fecha: fechaHoy });
  }

  // Paso 2: confirmar y registrar
  function confirmarMarca() {
    if (!marcaConfirm) return;
    const { tipo, hora, fecha } = marcaConfirm;

    // ── Validación de identidad: verificar que trabActivo.id sigue vigente ──
    // Evita el bug donde el trabajador tiene una sesión con un ID antiguo
    // (puede ocurrir si se importó un backup o se recreó el trabajador)
    const trabVigente = trabajadores.find(x => x.id === trabActivo.id && x.activo);
    if (!trabVigente) {
      // Intentar recuperar por código+rut (el trabajador existe pero con otro ID)
      const trabPorCodigo = trabajadores.find(x =>
        x.codigo.toUpperCase() === trabActivo.codigo.toUpperCase() &&
        x.rut.replace(/[^0-9kK]/g,"").toLowerCase() === (trabActivo.rut||"").replace(/[^0-9kK]/g,"").toLowerCase() &&
        x.activo
      );
      if (trabPorCodigo) {
        // El trabajador existe con un ID distinto — actualizar sesión automáticamente
        setTrabActivo({ ...trabPorCodigo });
        setMarcaConfirm(null);
        setMarcaMsg({ tipo:"err", txt:"⚠️ Tu sesión fue actualizada automáticamente. Por favor intenta marcar de nuevo." });
      } else {
        setMarcaConfirm(null);
        setMarcaMsg({ tipo:"err", txt:"❌ No se encontró tu perfil en el sistema. Cierra sesión e ingresa nuevamente." });
      }
      return;
    }

    const regHoy = registros.find(r => r.tId === trabVigente.id && r.fecha === fecha);
    const [hh] = hora.split(":").map(Number);
    const esAnticipada = hh < 8;

    setMarcaConfirm(null);
    setMarcaGuardando(true);
    setSyncEstado("guardando");

    let nuevosRegistros;
    if (tipo === "entrada") {
      const estadoInicial = esAnticipada ? "pendiente_entrada" : "pendiente";
      // Usar trabVigente.id (ID real y actual del trabajador en Firebase)
      const nuevoReg = { id:nowId(), tId:trabVigente.id, fecha, entrada:hora, salida:null, estado:estadoInicial, motivoRechazo:"", entradaAnticipada: esAnticipada };
      nuevosRegistros = [...registros, nuevoReg];
    } else {
      nuevosRegistros = registros.map(r => r.id===regHoy.id ? {...r, salida:hora} : r);
    }

    setRegistros(nuevosRegistros);

    // Guardar inmediatamente en Firebase con reintento
    const intentarGuardar = async (intentos = 0) => {
      try {
        await guardarEnFirebase({
          trabajadores, registros: nuevosRegistros,
          compensatorios, solicitudes,
          notificaciones, liquidaciones, anticipos,
          ultimaActualizacion: new Date().toISOString(),
        });
        setSyncEstado("ok");
        setMarcaGuardando(false);
        if (tipo === "entrada") {
          setMarcaMsg({ tipo:"ok", txt: esAnticipada
            ? `⚠️ Entrada registrada a las ${hora}. Pendiente de validación por el administrador.`
            : `✅ Entrada registrada y guardada a las ${hora}` });
        } else {
          setMarcaMsg({ tipo:"ok", txt:`✅ Salida registrada y guardada a las ${hora}` });
        }
      } catch(e) {
        if (intentos < 3) {
          setTimeout(() => intentarGuardar(intentos + 1), 3000);
        } else {
          setSyncEstado("error");
          setMarcaGuardando(false);
          setMarcaMsg({ tipo:"err", txt:"⚠️ Registro guardado localmente. Hubo un problema de conexión — se sincronizará automáticamente." });
        }
      }
    };
    intentarGuardar();
  }

  // ── Solicitud permiso/vacaciones ──────────────────────
  function enviarSolicitud() {
    setSolMsg({ tipo:"", txt:"" });
    if (!solFechaDesde) { setSolMsg({ tipo:"err", txt:"Selecciona la fecha de inicio." }); return; }
    if (solTipo==="vacaciones" && !solFechaHasta) { setSolMsg({ tipo:"err", txt:"Indica fecha de término." }); return; }
    if (solTipo==="vacaciones" && !esHabilVacaciones(solFechaDesde)) {
      setSolMsg({ tipo:"err", txt:"Las vacaciones solo se pueden iniciar en día hábil (lunes a viernes)." }); return;
    }
    const nueva = {
      id: nowId(),
      tId: trabActivo.id,
      tipo: solTipo,
      fechaDesde: solFechaDesde,
      fechaHasta: solTipo==="vacaciones" ? solFechaHasta : solFechaDesde,
      motivo: solMotivo,
      estado: "pendiente",
      motivoRechazo: "",
      creada: hoy(),
    };
    setSolicitudes(p => [...p, nueva]);
    setSolMsg({ tipo:"ok", txt:"✅ Solicitud enviada. Pendiente de aprobación." });
    setSolFechaDesde(""); setSolFechaHasta(""); setSolMotivo("");
  }

  // ── Admin: aprobar/rechazar extra ─────────────────────
  function aprobarExtra(id) {
    setRegistros(p => p.map(r => r.id===id ? {...r, estado:"aprobado"} : r));
    const r = registros.find(x => x.id===id);
    if (r) pushNotif(r.tId, "✅ Tus horas extraordinarias del " + r.fecha + " fueron aprobadas.");
  }
  function abrirRechazoExtra(id) {
    setMotivoModal({ tipo:"extra", id, accion:"rechazar", motivo:"" });
  }
  function confirmarRechazoExtra() {
    const { id, motivo } = motivoModal;
    setRegistros(p => p.map(r => r.id===id ? {...r, estado:"rechazado", motivoRechazo:motivo} : r));
    const r = registros.find(x => x.id===id);
    if (r) pushNotif(r.tId, `❌ Tus horas extraordinarias del ${r.fecha} fueron rechazadas. Motivo: ${motivo||"Sin motivo especificado"}`);
    setMotivoModal(null);
  }

  // ── Admin: aprobar/rechazar solicitud ─────────────────
  function aprobarSolicitud(id) {
    setSolicitudes(p => p.map(s => s.id===id ? {...s, estado:"aprobado"} : s));
    const s = solicitudes.find(x => x.id===id);
    if (s) {
      const tipo = s.tipo==="permiso" ? "Permiso" : "Vacaciones";
      pushNotif(s.tId, `✅ Tu solicitud de ${tipo} para el ${s.fechaDesde}${s.tipo==="vacaciones"?" al "+s.fechaHasta:""} fue aprobada.`);
    }
  }
  function abrirRechazoSolicitud(id) {
    setMotivoModal({ tipo:"solicitud", id, accion:"rechazar", motivo:"" });
  }
  function confirmarRechazoSolicitud() {
    const { id, motivo } = motivoModal;
    setSolicitudes(p => p.map(s => s.id===id ? {...s, estado:"rechazado", motivoRechazo:motivo} : s));
    const s = solicitudes.find(x => x.id===id);
    if (s) {
      const tipo = s.tipo==="permiso" ? "Permiso" : "Vacaciones";
      pushNotif(s.tId, `❌ Tu solicitud de ${tipo} para el ${s.fechaDesde} fue rechazada. Motivo: ${motivo||"Sin motivo especificado"}`);
    }
    setMotivoModal(null);
  }

  // ── Admin: CRUD trabajadores ──────────────────────────
  function agregarTrabajador() {
    setNFormErr("");
    if (!nNombre.trim()||!nApellido.trim()||!nRut.trim()) { setNFormErr("Completa todos los campos."); return; }
    const codigo = generarCodigo(nApellido, trabajadores);
    setTrabajadores(p => [...p, { id:nowId(), nombre:nNombre.trim(), apellido:nApellido.trim(), apellidoM:nApellidoM.trim(), rut:fmtRut(nRut), codigo, activo:true, ficha:fichaVacia() }]);
    setNNombre(""); setNApellido(""); setNRut("");
  }

  // ── Export / Import ───────────────────────────────────
  // ── LIQUIDACIONES ────────────────────────────────────
  function generarPreviewLiq() {
    setLiqMsg({tipo:"",txt:""});
    if(!liqTrabId){ setLiqMsg({tipo:"err",txt:"Selecciona un trabajador."}); return; }
    const t = trabajadores.find(x=>x.id===Number(liqTrabId));
    if(!t){ setLiqMsg({tipo:"err",txt:"Trabajador no encontrado."}); return; }
    if(!t.ficha?.sueldoPactado){ setLiqMsg({tipo:"err",txt:"El trabajador no tiene sueldo pactado en su ficha."}); return; }
    const datos = calcularLiquidacion(t, registros, anticipos, liqMes, liqAnio);
    setLiqPreview(datos);
  }

  function enviarLiquidacion() {
    if(!liqPreview) return;
    const existe = liquidaciones.find(l=>l.tId===liqPreview.tId&&l.mes===liqPreview.mes&&l.anio===liqPreview.anio);
    if(existe){ setLiqMsg({tipo:"err",txt:"Ya existe una liquidación para este trabajador en ese período."}); return; }
    const ahora = new Date();
    const nueva = { id:nowId(), tId:liqPreview.tId, mes:liqPreview.mes, anio:liqPreview.anio,
      datos:liqPreview, estado:"enviada", firmadaPor:"", firmadaFecha:"", firmadaHora:"",
      enviadaFecha: ahora.toLocaleDateString("es-CL"),
      enviadaHora:  ahora.toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"}) };
    setLiquidaciones(p=>[...p,nueva]);
    pushNotif(liqPreview.tId, `💰 Tienes una nueva liquidación de sueldo: ${mesNombre(liqPreview.mes)} ${liqPreview.anio}. Revísala en tu perfil.`);
    setLiqMsg({tipo:"ok",txt:`✅ Liquidación de ${mesNombre(liqPreview.mes)} ${liqPreview.anio} enviada correctamente.`});
    setLiqPreview(null); setLiqTrabId("");
  }

  function firmarLiquidacion(liqId) {
    setFirmaMsg({tipo:"",txt:""});
    const liq = liquidaciones.find(l=>l.id===liqId);
    if(!liq){ setFirmaMsg({tipo:"err",txt:"Liquidación no encontrada."}); return; }
    const t = trabajadores.find(x=>x.id===trabActivo.id);
    const rutOk = t.rut.replace(/[^0-9kK]/g,"").toLowerCase()===firmaRut.replace(/[^0-9kK]/g,"").toLowerCase();
    const codOk = t.codigo.toUpperCase()===firmaCodigo.trim().toUpperCase();
    if(!rutOk||!codOk){ setFirmaMsg({tipo:"err",txt:"RUT o código incorrecto. Verifica tus datos."}); return; }
    const ahora = new Date();
    setLiquidaciones(p=>p.map(l=>l.id===liqId ? {
      ...l, estado:"firmada",
      firmadaPor:nombreCompleto(t),
      firmadaFecha: ahora.toLocaleDateString("es-CL"),
      firmadaHora: ahora.toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"})
    } : l));
    setFirmaLiqId(null); setFirmaRut(""); setFirmaCodigo("");
    setFirmaMsg({tipo:"ok",txt:"✅ Liquidación firmada electrónicamente."});
  }

  // ── ANTICIPOS ────────────────────────────────────────
  function solicitarAnticipo() {
    setAnticMsg({tipo:"",txt:""});
    if(!anticMonto||isNaN(Number(anticMonto))||Number(anticMonto)<=0){
      setAnticMsg({tipo:"err",txt:"Ingresa un monto válido."}); return; }
    const mes = new Date().getMonth(); const anio = new Date().getFullYear();
    const ya = anticipos.find(a=>a.tId===trabActivo.id&&a.mes===mes&&a.anio===anio&&a.estado!=="rechazado");
    if(ya){ setAnticMsg({tipo:"err",txt:"Ya tienes una solicitud de anticipo para este mes."}); return; }
    const nuevo = { id:nowId(), tId:trabActivo.id, monto:Number(anticMonto), motivo:anticMotivo,
      estado:"pendiente", motivoRechazo:"", mes, anio, creado:hoy() };
    setAnticipos(p=>[...p,nuevo]);
    setAnticMsg({tipo:"ok",txt:"✅ Solicitud de anticipo enviada. Pendiente de aprobación."});
    setAnticMonto(""); setAnticMotivo("");
  }

  function aprobarAnticipo(id) {
    setAnticipos(p=>p.map(a=>a.id===id?{...a,estado:"aprobado"}:a));
    const a = anticipos.find(x=>x.id===id);
    if(a) pushNotif(a.tId,`✅ Tu solicitud de anticipo por $${Number(a.monto).toLocaleString("es-CL")} fue aprobada y se descontará en tu liquidación.`);
  }
  function rechazarAnticipo(id, motivo) {
    setAnticipos(p=>p.map(a=>a.id===id?{...a,estado:"rechazado",motivoRechazo:motivo}:a));
    const a = anticipos.find(x=>x.id===id);
    if(a) pushNotif(a.tId,`❌ Tu solicitud de anticipo fue rechazada. Motivo: ${motivo||"Sin motivo especificado"}`);
  }

  // ── IMPRIMIR / PDF liquidación ────────────────────────
  function imprimirLiquidacion(liq) {
    const d = liq.datos;
    const firmaEmpleador = `
      <div style="margin-top:6px;padding:10px 14px;background:#f0f4ff;border:1.5px solid #2D2D2D;border-radius:6px;font-size:11px;color:#1a1a2e;">
        ✅ <strong>Firmado Electrónicamente por María Paz Espinoza</strong><br/>
        Paz Vial SpA — RUT: 78.351.313-7<br/>
        Fecha: ${liq.enviadaFecha||new Date().toLocaleDateString("es-CL")} &nbsp;|&nbsp; Hora: ${liq.enviadaHora||new Date().toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"})}
      </div>`;
    const firmaTrabajador = liq.estado==="firmada"
      ? `<div style="margin-top:6px;padding:10px 14px;background:#e8f5e9;border:1.5px solid #27ae60;border-radius:6px;font-size:11px;color:#1b5e20;">
          ✅ <strong>Firmada electrónicamente por ${liq.firmadaPor}</strong><br/>
          Fecha: ${liq.firmadaFecha} &nbsp;|&nbsp; Hora: ${liq.firmadaHora}
         </div>` : `<div style="margin-top:6px;padding:10px 14px;background:#fff8e1;border:1.5px dashed #f39c12;border-radius:6px;font-size:11px;color:#7d5a00;">
          ⏳ Pendiente de firma del trabajador
         </div>`;
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Liquidación ${mesNombre(d.mes)} ${d.anio} — ${d.nombre}</title>
    <style>
      *{box-sizing:border-box;}
      body{font-family:Arial,sans-serif;font-size:11px;color:#222;margin:0;padding:24px;max-width:780px;margin:0 auto;}
      .top-bar{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding-bottom:10px;border-bottom:3px solid #FF6B00;}
      .logo-box{background:#fff;border-radius:10px;padding:4px;border:1px solid #eee;}
      .logo-box img{width:120px;height:auto;display:block;}
      .empresa-info{text-align:right;font-size:11px;color:#444;}
      .empresa-info strong{font-size:14px;color:#2D2D2D;display:block;}
      h2{text-align:center;font-size:15px;margin:6px 0 2px;color:#2D2D2D;}
      h3{text-align:center;font-size:12px;margin:0 0 10px;color:#FF6B00;letter-spacing:2px;}
      .row{display:flex;gap:16px;background:#f2f2f2;padding:5px 12px;margin-bottom:2px;border-radius:3px;flex-wrap:wrap;}
      .row span{font-weight:bold;}
      table{width:100%;border-collapse:collapse;margin-top:8px;}
      th{background:#2D2D2D;color:#fff;padding:6px 10px;font-size:10px;text-align:left;}
      td{padding:5px 10px;border-bottom:1px solid #eee;font-size:11px;}
      .tot{background:#f2f2f2;font-weight:bold;}
      .totbar{display:flex;justify-content:space-between;background:#2D2D2D;color:#fff;padding:7px 12px;margin-top:6px;border-radius:4px;}
      .alc{background:#1E6B2E;color:#fff;font-size:15px;font-weight:bold;text-align:center;padding:12px;margin-top:8px;border-radius:5px;}
      .firmas{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px;}
      .firma-box{border:1px solid #ccc;border-radius:6px;padding:10px;font-size:10px;}
      .firma-box strong{display:block;margin-bottom:6px;font-size:11px;color:#2D2D2D;}
      @media print{body{padding:10px;} .no-print{display:none;}}
    </style></head><body>
    <div class="no-print" style="text-align:center;margin-bottom:16px;">
      <button onclick="window.print()" style="background:#FF6B00;color:#fff;border:none;padding:10px 28px;font-size:13px;border-radius:6px;cursor:pointer;font-weight:bold;">🖨 Imprimir / Guardar como PDF</button>
    </div>
    <div class="top-bar">
      <div class="logo-box">
        <img src="${LOGO_SRC}" alt="Paz Vial SpA" />
      </div>
      <div class="empresa-info">
        <strong>PAZ VIAL SpA</strong>
        RUT Empresa: 78.351.313-7<br/>
        Gestión de Personas
      </div>
    </div>
    <h2>LIQUIDACIÓN DE SUELDO</h2>
    <h3>REMUNERACIONES MES DE: ${mesNombre(d.mes).toUpperCase()} ${d.anio}</h3>
    <div class="row"><span>Trabajador:</span><span>${d.nombre}</span></div>
    <div class="row"><span>RUT:</span><span>${d.rut}</span><span>Código:</span><span>${d.codigo}</span><span>C.C.:</span><span>${d.cc}</span></div>
    <div class="row"><span>AFP:</span><span>${d.afp} (${d.pctAFP}%)</span><span>Previsión Salud:</span><span>${d.prevision} (7%)</span></div>
    <div class="row">
      <span>Días trabajados: <strong>${d.diasTrab}</strong></span>
      <span>HH Extras: <strong>${d.horasExtra}h</strong></span>
      <span>Imponible: <strong>$${d.totalImponible.toLocaleString("es-CL")}</strong></span>
      <span>Tributable: <strong>$${d.tributable.toLocaleString("es-CL")}</strong></span>
    </div>
    <table>
      <tr><th>HABERES</th><th style="text-align:right">MONTO</th><th>DESCUENTOS</th><th style="text-align:right">MONTO</th></tr>
      <tr><td>Sueldo Base</td><td style="text-align:right">$${d.sueldoBase.toLocaleString("es-CL")}</td><td>Previsión AFP (${d.pctAFP}%)</td><td style="text-align:right">$${d.prevision_monto.toLocaleString("es-CL")}</td></tr>
      ${d.valorHHExtra>0?`<tr><td>Horas Extra 50% <span style="color:#888;font-size:10px">(${d.horasExtra}h)</span></td><td style="text-align:right">$${d.valorHHExtra.toLocaleString("es-CL")}</td><td></td><td></td></tr>`:""}
      ${d.gratif>0?`<tr><td>Gratificación Legal</td><td style="text-align:right">$${d.gratif.toLocaleString("es-CL")}</td><td>Salud (7%)</td><td style="text-align:right">$${d.salud_monto.toLocaleString("es-CL")}</td></tr>`:`<tr><td></td><td></td><td>Salud (7%)</td><td style="text-align:right">$${d.salud_monto.toLocaleString("es-CL")}</td></tr>`}
      <tr class="tot"><td>TOTAL IMPONIBLE</td><td style="text-align:right">$${d.totalImponible.toLocaleString("es-CL")}</td><td>Seguro Cesantía</td><td style="text-align:right">$${d.segCesantia.toLocaleString("es-CL")}</td></tr>
      <tr><td>Asig. Colación</td><td style="text-align:right">$${d.colacion.toLocaleString("es-CL")}</td><td class="tot">TOTAL DESC. LEGALES</td><td class="tot" style="text-align:right">$${d.totalDescLegales.toLocaleString("es-CL")}</td></tr>
      <tr><td>Asig. Movilización</td><td style="text-align:right">$${d.movilizacion.toLocaleString("es-CL")}</td>${d.anticipo>0?`<td>Anticipo de Remuneración</td><td style="text-align:right;color:#c0392b">$${d.anticipo.toLocaleString("es-CL")}</td>`:"<td></td><td></td>"}</tr>
      <tr class="tot"><td>TOTAL NO IMPONIBLE</td><td style="text-align:right">$${d.totalNoImponible.toLocaleString("es-CL")}</td><td>TOTAL OTROS DESC.</td><td style="text-align:right">$${d.totalOtrosDesc.toLocaleString("es-CL")}</td></tr>
    </table>
    <div class="totbar">
      <span>TOTAL HABERES: <strong>$${d.totalHaberes.toLocaleString("es-CL")}</strong></span>
      <span>TOTAL DESCUENTOS: <strong>$${d.totalDescuentos.toLocaleString("es-CL")}</strong></span>
    </div>
    <div class="alc">ALCANCE LÍQUIDO: $${d.alcanceLiquido.toLocaleString("es-CL")}</div>
    <div class="firmas">
      <div class="firma-box"><strong>FIRMA DEL EMPLEADOR</strong>${firmaEmpleador}</div>
      <div class="firma-box"><strong>FIRMA DEL TRABAJADOR</strong>${firmaTrabajador}</div>
    </div>
    <p style="text-align:center;font-size:9px;color:#aaa;margin-top:16px;">Gestión de Personas Paz Vial SpA — Documento generado el ${new Date().toLocaleDateString("es-CL")} ${new Date().toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"})}</p>
    </body></html>`;
    const blob = new Blob([html], { type:"text/html;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.target   = "_blank";
    a.rel      = "noopener";
    a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 10000);
  }

  // ── REGISTRO MANUAL ──────────────────────────────────
  function guardarRegistroManual() {
    setRegManMsg({tipo:"",txt:""});
    if(!regManTrabId){ setRegManMsg({tipo:"err",txt:"Selecciona un trabajador."}); return; }
    if(!regManFecha){ setRegManMsg({tipo:"err",txt:"Ingresa la fecha."}); return; }
    if(!regManEntrada){ setRegManMsg({tipo:"err",txt:"Ingresa hora de entrada."}); return; }
    const yaExiste = registros.find(r=>r.tId===Number(regManTrabId)&&r.fecha===regManFecha);
    if(yaExiste){ setRegManMsg({tipo:"err",txt:"Ya existe un registro para ese trabajador en esa fecha. Usa la opción Editar."}); return; }
    const nuevo = {
      id:nowId(), tId:Number(regManTrabId), fecha:regManFecha,
      entrada:regManEntrada, salida:regManSalida||null,
      estado:"pendiente", motivoRechazo:"", manual:true
    };
    setRegistros(p=>[...p,nuevo]);
    setRegManMsg({tipo:"ok",txt:`✅ Registro ingresado manualmente para ${regManFecha}.`});
    setRegManTrabId(""); setRegManFecha(hoy()); setRegManEntrada("08:00"); setRegManSalida("18:00");
  }

  function iniciarEdicion(reg) {
    setRegEditando(reg.id);
    setRegEditFecha(reg.fecha);
    setRegEditEnt(reg.entrada);
    setRegEditSal(reg.salida||"");
    setRegEditMsg({tipo:"",txt:""});
  }

  function guardarEdicion() {
    setRegEditMsg({tipo:"",txt:""});
    if(!regEditFecha||!regEditEnt){ setRegEditMsg({tipo:"err",txt:"Fecha y entrada son obligatorias."}); return; }
    setRegistros(p=>p.map(r=>r.id===regEditando
      ? {...r, fecha:regEditFecha, entrada:regEditEnt, salida:regEditSal||null}
      : r
    ));
    setRegEditando(null);
    setRegEditMsg({tipo:"ok",txt:"✅ Registro actualizado."});
  }

  function cancelarEdicion() { setRegEditando(null); setRegEditMsg({tipo:"",txt:""}); }

  // ── LIMPIAR DATOS FICTICIOS ──────────────────────────
  function limpiarDatosFicticios() {
    // Conservar trabajadores reales (no marcados como prueba)
    // y el perfil de prueba id=999
    setTrabajadores(p => {
      const reales = p.filter(t => !t.esDePrueba || t.id === 999);
      // Si no quedan reales, dejar solo el perfil de prueba
      return reales.length > 0 ? reales :
        [{ id:999, nombre:"Administrador", apellido:"Pruebas", apellidoM:"", rut:"Pruebas", codigo:"Administrador", activo:true, esDePrueba:true, ficha:fichaVacia() }];
    });
    // Borrar solo registros de asistencia de trabajadores de prueba
    setRegistros(p => p.filter(r => !r.esDePrueba && !IDS_PRUEBA.has(r.tId)));
    // Borrar compensatorios de trabajadores de prueba
    setComps(p => p.filter(c => !IDS_PRUEBA.has(c.tId)));
    // Borrar solicitudes de trabajadores de prueba
    setSolicitudes(p => p.filter(s => !IDS_PRUEBA.has(s.tId)));
    // Borrar notificaciones de trabajadores de prueba
    setNotifs(p => p.filter(n => !IDS_PRUEBA.has(n.tId)));
    // Borrar liquidaciones de trabajadores de prueba
    setLiquidaciones(p => p.filter(l => !IDS_PRUEBA.has(l.tId)));
    // Borrar anticipos de trabajadores de prueba
    setAnticipos(p => p.filter(a => !IDS_PRUEBA.has(a.tId)));
    setConfirmarLimpiar(false);
  }

  // ── ENTRADAS ANTICIPADAS ────────────────────────────
  function aprobarEntradaAnticipada(id) {
    setRegistros(p => p.map(r => r.id===id ? {...r, estado:"pendiente", entradaAnticipada:false} : r));
    const r = registros.find(x=>x.id===id);
    if(r) pushNotif(r.tId, `✅ Tu entrada anticipada del ${r.fecha} a las ${r.entrada} fue aprobada.`);
    setEntradaAnticModal(null);
  }

  function corregirEntradaAnticipada(id, horaCorregida) {
    if(!horaCorregida){ return; }
    setRegistros(p => p.map(r => r.id===id ? {...r, entrada:horaCorregida, estado:"pendiente", entradaAnticipada:false} : r));
    const r = registros.find(x=>x.id===id);
    if(r) pushNotif(r.tId, `⚠️ Tu entrada del ${r.fecha} fue corregida por administración. Hora registrada: ${horaCorregida}.`);
    setEntradaAnticModal(null);
  }

  // ── HOJA DE ASISTENCIA MENSUAL PDF ──────────────────
  function generarHojaAsistenciaPDF(tId, mes, anio) {
    const trab = tId ? trabajadores.find(t=>t.id===Number(tId)) : null;
    const titulo = trab
      ? `Hoja de Asistencia — ${nombreCompleto(trab)} — ${mesNombre(mes)} ${anio}`
      : `Hoja de Asistencia General — ${mesNombre(mes)} ${anio}`;

    const listaTrabajadores = trab
      ? [trab]
      : trabajadores.filter(t=>t.activo && t.id!==999);

    // Generar días del mes
    const diasEnMes = new Date(anio, mes+1, 0).getDate();
    const diasMes = Array.from({length:diasEnMes},(_,i)=>{
      const d = String(i+1).padStart(2,"0");
      const m = String(mes+1).padStart(2,"0");
      return `${anio}-${m}-${d}`;
    });

    const nombresDias = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

    let seccionesHTML = "";
    for(const t of listaTrabajadores) {
      const regsT = registros.filter(r=>r.tId===t.id);
      let filas = "";
      let totalDias=0, totalEnt=0, totalExtra=0;
      diasMes.forEach(fecha => {
        const reg = regsT.find(r=>r.fecha===fecha);
        const diaSem = new Date(fecha+"T12:00:00").getDay();
        const esFin = diaSem===0||diaSem===6;
        const esFer = esFeriado(fecha);
        const esDom = diaSem===0;
        const h = reg&&reg.salida ? calcularHoras(reg.entrada,reg.salida,fecha) : null;
        if(reg) totalDias++;
        if(h&&h.extra>0) totalExtra+=h.extra;
        const bgRow = esDom||esFer ? "#fff3cd" : esSabado(fecha) ? "#f8f9fa" : "#fff";
        const diaLabel = nombresDias[diaSem];
        filas += `<tr style="background:${bgRow}">
          <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:center;font-weight:bold">${String(new Date(fecha+"T12:00:00").getDate()).padStart(2,"0")}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:center;color:#666">${diaLabel}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:center">${reg?reg.entrada:"—"}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:center">${reg&&reg.salida?reg.salida:"—"}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:center;color:${h&&h.extra>0?"#c0392b":"#27ae60"}">${h?`${h.normales}h`:"—"}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:center;color:${h&&h.extra>0?"#e67e22":"#aaa"};font-weight:${h&&h.extra>0?"bold":"normal"}">${h&&h.extra>0?`${h.extra}h`:"—"}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:center;font-size:10px">${esFer?"Feriado":esDom?"Domingo":""}</td>
        </tr>`;
      });

      seccionesHTML += `
        <div style="margin-bottom:${listaTrabajadores.length>1?"40px":"0"}">
          ${listaTrabajadores.length>1?`<h3 style="margin:0 0 6px;font-size:13px;color:#FF6B00;border-bottom:2px solid #FF6B00;padding-bottom:4px">${nombreCompleto(t)} — Código: ${t.codigo} — RUT: ${t.rut}</h3>`:""}
          <table style="width:100%;border-collapse:collapse;font-size:11px">
            <thead>
              <tr style="background:#2D2D2D;color:#fff">
                <th style="padding:6px 8px;text-align:center">Día</th>
                <th style="padding:6px 8px;text-align:center">Semana</th>
                <th style="padding:6px 8px;text-align:center">Entrada</th>
                <th style="padding:6px 8px;text-align:center">Salida</th>
                <th style="padding:6px 8px;text-align:center">H. Normales</th>
                <th style="padding:6px 8px;text-align:center">H. Extra</th>
                <th style="padding:6px 8px;text-align:center">Observación</th>
              </tr>
            </thead>
            <tbody>${filas}</tbody>
            <tfoot>
              <tr style="background:#f2f2f2;font-weight:bold;font-size:11px">
                <td colspan="2" style="padding:6px 8px">TOTALES</td>
                <td colspan="2" style="padding:6px 8px;text-align:center">${totalDias} días asistidos</td>
                <td style="padding:6px 8px;text-align:center">—</td>
                <td style="padding:6px 8px;text-align:center;color:#e67e22">${totalExtra>0?totalExtra.toFixed(1)+"h":"—"}</td>
                <td style="padding:6px 8px"></td>
              </tr>
            </tfoot>
          </table>
          ${listaTrabajadores.length>1?`<div style="display:flex;gap:40px;margin-top:20px">
            <div style="text-align:center;border-top:1px solid #333;padding-top:6px;width:180px;font-size:10px">Firma del Trabajador</div>
            <div style="text-align:center;border-top:1px solid #333;padding-top:6px;width:180px;font-size:10px">Firma Administración</div>
          </div>`:""}
        </div>`;
    }

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>${titulo}</title>
    <style>
      *{box-sizing:border-box;}
      body{font-family:Arial,sans-serif;font-size:11px;color:#222;margin:0;padding:20px;max-width:800px;margin:0 auto;}
      .top-bar{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;padding-bottom:8px;border-bottom:3px solid #FF6B00;}
      .logo-box img{width:110px;height:auto;}
      .empresa-info{text-align:right;font-size:11px;color:#444;}
      .empresa-info strong{font-size:13px;color:#2D2D2D;display:block;}
      h2{text-align:center;font-size:14px;margin:6px 0 2px;}
      h3{text-align:center;font-size:11px;margin:0 0 10px;color:#FF6B00;letter-spacing:1px;}
      .trab-info{background:#f2f2f2;padding:7px 12px;border-radius:4px;margin-bottom:10px;font-size:11px;display:flex;gap:20px;flex-wrap:wrap;}
      .firmas{display:flex;gap:40px;margin-top:30px;}
      .firma{text-align:center;border-top:1px solid #333;padding-top:6px;width:200px;font-size:10px;}
      @media print{body{padding:10px;}.no-print{display:none;}}
    </style></head><body>
    <div class="no-print" style="text-align:center;margin-bottom:16px;">
      <button onclick="window.print()" style="background:#FF6B00;color:#fff;border:none;padding:10px 28px;font-size:13px;border-radius:6px;cursor:pointer;font-weight:bold;">🖨 Imprimir / Guardar como PDF</button>
    </div>
    <div class="top-bar">
      <div class="logo-box"><img src="${LOGO_SRC}" alt="Paz Vial SpA" /></div>
      <div class="empresa-info"><strong>PAZ VIAL SpA</strong>RUT: 78.351.313-7<br/>Gestión de Personas</div>
    </div>
    <h2>HOJA DE ASISTENCIA MENSUAL</h2>
    <h3>${mesNombre(mes).toUpperCase()} ${anio}</h3>
    ${trab?`<div class="trab-info">
      <span><strong>Trabajador:</strong> ${nombreCompleto(trab)}</span>
      <span><strong>RUT:</strong> ${trab.rut}</span>
      <span><strong>Código:</strong> ${trab.codigo}</span>
      ${trab.ficha?.cargo?`<span><strong>Cargo:</strong> ${trab.ficha.cargo}</span>`:""}
    </div>`:""}
    ${seccionesHTML}
    ${!trab||listaTrabajadores.length===1?`<div class="firmas">
      <div class="firma">Firma del Trabajador</div>
      <div class="firma">Firma de Administración</div>
    </div>`:""}
    <p style="text-align:center;font-size:9px;color:#aaa;margin-top:16px;">Gestión de Personas Paz Vial SpA — Generado el ${new Date().toLocaleDateString("es-CL")} ${new Date().toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"})}</p>
    </body></html>`;

    const blob = new Blob([html],{type:"text/html;charset=utf-8"});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href=url; a.target="_blank"; a.rel="noopener"; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),10000);
  }

  // ── HISTORIAL REMUNERACIONES ────────────────────────
  function grabarNuevaRemuneracion(trabId) {
    setHistMsg({tipo:"",txt:""});
    const {desde,sueldo,colacion,movilizacion,gratificacion,motivo} = histNuevo;
    if(!desde)  { setHistMsg({tipo:"err",txt:"La fecha de vigencia es obligatoria."}); return; }
    if(!sueldo||isNaN(Number(sueldo))||Number(sueldo)<=0)
                { setHistMsg({tipo:"err",txt:"Ingresa un sueldo válido."}); return; }
    if(!motivo.trim()) { setHistMsg({tipo:"err",txt:"El motivo es obligatorio."}); return; }
    const ahora = new Date();
    const nuevo = {
      id: nowId(),
      desde,
      sueldo:       Number(sueldo),
      colacion:     Number(colacion)||0,
      movilizacion: Number(movilizacion)||0,
      gratificacion,
      motivo:       motivo.trim(),
      registradoPor: "Administrador",
      registradoEn: ahora.toLocaleDateString("es-CL")+" "+ahora.toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"}),
    };
    setTrabajadores(p => p.map(t => {
      if(t.id !== trabId) return t;
      const hist = [...(t.ficha?.historialRemuneraciones||[]), nuevo];
      // Actualizar también sueldo/colacion/movilizacion actuales en la ficha (registro más reciente)
      const vigente = [...hist].sort((a,b)=>b.desde.localeCompare(a.desde))[0];
      return {
        ...t,
        ficha: {
          ...t.ficha,
          sueldoPactado: String(vigente.sueldo),
          colacion:      vigente.colacion,
          movilizacion:  vigente.movilizacion,
          gratificacion: vigente.gratificacion,
          historialRemuneraciones: hist,
        }
      };
    }));
    setHistMsg({tipo:"ok",txt:`✅ Nueva remuneración registrada desde ${desde} por $${Number(sueldo).toLocaleString("es-CL")}.`});
    setHistNuevo({desde:"",sueldo:"",colacion:"",movilizacion:"",gratificacion:false,motivo:""});
  }

  // ── GRABAR NUEVA FICHA ──────────────────────────────
  function grabarNuevoTrabajador() {
    setFichaGuardMsg({tipo:"",txt:""});
    const d = fichaDraft;
    if(!d.nombre.trim())    { setFichaGuardMsg({tipo:"err",txt:"El nombre es obligatorio."}); return; }
    if(!d.apellido.trim())  { setFichaGuardMsg({tipo:"err",txt:"El apellido es obligatorio."}); return; }
    if(!d.rut.trim())       { setFichaGuardMsg({tipo:"err",txt:"El RUT es obligatorio."}); return; }
    const codigo = generarCodigo(d.apellido, trabajadores.filter(t=>t.id!==999));
    const nuevo = {
      id: nowId(),
      nombre: d.nombre.trim(),
      apellido: d.apellido.trim(),
      apellidoM: (d.apellidoM||'').trim(),
      rut: fmtRut(d.rut),
      codigo,
      activo: true,
      ficha: {
        direccion:             d.direccion,
        telefono:              d.telefono,
        correo:                d.correo,
        cargo:                 d.cargo,
        contactoEmergencia:    d.contactoEmergencia,
        telefonoEmergencia:    d.telefonoEmergencia,
        prevision:             d.prevision || "FONASA",
        afp:                   d.afp,
        sueldoPactado:         d.sueldoPactado,
        gratificacion:         d.gratificacion,
        colacion:              Number(d.colacion) || 0,
        movilizacion:          Number(d.movilizacion) || 0,
        fechaIngreso:          d.fechaIngreso,
        fechaSalida:           "",
        motivoSalida:          "",
        observaciones:         d.observaciones,
        historialRemuneraciones: d.sueldoPactado ? [{
          id: nowId(),
          desde: d.fechaIngreso || hoy(),
          sueldo: Number(d.sueldoPactado),
          colacion: Number(d.colacion)||0,
          movilizacion: Number(d.movilizacion)||0,
          gratificacion: d.gratificacion||false,
          motivo: "Sueldo inicial",
          registradoPor: "Administrador",
          registradoEn: new Date().toLocaleDateString("es-CL")+" "+new Date().toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"}),
        }] : [],
      },
    };
    setTrabajadores(p => [...p, nuevo]);
    setFichaSelId(nuevo.id);
    setFichaMode("ver");
    setFichaDraft(null);
    setFichaGuardMsg({tipo:"ok",txt:`✅ Trabajador ${nombreCompleto(nuevo)} registrado con código ${codigo}.`});
  }

  function grabarEdicionFicha() {
    setFichaGuardMsg({tipo:"",txt:""});
    const d = fichaDraft;
    if(!d.nombre.trim()||!d.apellido.trim()||!d.rut.trim()){
      setFichaGuardMsg({tipo:"err",txt:"Nombre, apellido y RUT son obligatorios."}); return;
    }
    setTrabajadores(p => p.map(t => t.id===fichaSelId ? {
      ...t,
      nombre:    d.nombre.trim(),
      apellido:  d.apellido.trim(),
      apellidoM: (d.apellidoM||'').trim(),
      rut:       fmtRut(d.rut),
      ficha: {
        ...t.ficha,
        direccion:          d.direccion,
        telefono:           d.telefono,
        correo:             d.correo,
        cargo:              d.cargo,
        contactoEmergencia: d.contactoEmergencia,
        telefonoEmergencia: d.telefonoEmergencia,
        prevision:          d.prevision || "FONASA",
        afp:                d.afp,
        sueldoPactado:      d.sueldoPactado,
        gratificacion:      d.gratificacion,
        colacion:           Number(d.colacion) || 0,
        movilizacion:       Number(d.movilizacion) || 0,
        fechaIngreso:       d.fechaIngreso,
        fechaSalida:        d.fechaSalida,
        motivoSalida:       d.motivoSalida,
        observaciones:      d.observaciones,
      },
    } : t));
    setFichaMode("ver");
    setFichaDraft(null);
    setFichaGuardMsg({tipo:"ok",txt:"✅ Ficha actualizada correctamente."});
  }

  function exportarDatos() {
    const data = { version:"1.0", exportado: new Date().toISOString(), trabajadores, registros, compensatorios, solicitudes, notificaciones, liquidaciones, anticipos };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:"application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pazvial-rrhh-backup-${hoy()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importarDatos(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.trabajadores || !data.registros) throw new Error("Formato inválido");

        // ── Fusión inteligente: no reemplaza, combina sin duplicar ──

        // TRABAJADORES: fusionar por RUT
        setTrabajadores(prev => {
          const resultado = [...prev];
          (data.trabajadores || []).forEach(tImport => {
            const existeIdx = resultado.findIndex(t =>
              t.rut.replace(/[^0-9kK]/g,"").toLowerCase() ===
              tImport.rut.replace(/[^0-9kK]/g,"").toLowerCase()
            );
            if (existeIdx >= 0) {
              // Actualizar datos pero conservar el ID local
              resultado[existeIdx] = { ...tImport, id: resultado[existeIdx].id };
            } else {
              // Agregar nuevo trabajador
              resultado.push(tImport);
            }
          });
          return resultado;
        });

        // REGISTROS: fusionar por ID — no duplicar
        setRegistros(prev => {
          const idsExistentes = new Set(prev.map(r => String(r.id)));
          const nuevos = (data.registros || []).filter(r => !idsExistentes.has(String(r.id)));
          return [...prev, ...nuevos];
        });

        // COMPENSATORIOS: fusionar por ID
        setComps(prev => {
          const idsExistentes = new Set(prev.map(c => String(c.id)));
          const nuevos = (data.compensatorios || []).filter(c => !idsExistentes.has(String(c.id)));
          return [...prev, ...nuevos];
        });

        // SOLICITUDES: fusionar por ID
        setSolicitudes(prev => {
          const idsExistentes = new Set(prev.map(s => String(s.id)));
          const nuevos = (data.solicitudes || []).filter(s => !idsExistentes.has(String(s.id)));
          return [...prev, ...nuevos];
        });

        // NOTIFICACIONES: fusionar por ID
        setNotifs(prev => {
          const idsExistentes = new Set(prev.map(n => String(n.id)));
          const nuevos = (data.notificaciones || []).filter(n => !idsExistentes.has(String(n.id)));
          return [...prev, ...nuevos];
        });

        // LIQUIDACIONES: fusionar por ID
        setLiquidaciones(prev => {
          const idsExistentes = new Set(prev.map(l => String(l.id)));
          const nuevos = (data.liquidaciones || []).filter(l => !idsExistentes.has(String(l.id)));
          return [...prev, ...nuevos];
        });

        // ANTICIPOS: fusionar por ID
        setAnticipos(prev => {
          const idsExistentes = new Set(prev.map(a => String(a.id)));
          const nuevos = (data.anticipos || []).filter(a => !idsExistentes.has(String(a.id)));
          return [...prev, ...nuevos];
        });

        setImportMsg({ tipo:"ok", txt:"✅ Datos importados y fusionados correctamente. No se duplicó ningún registro." });
      } catch {
        setImportMsg({ tipo:"err", txt:"❌ Archivo inválido. Verifica que sea un backup de Gestión de Personas Paz Vial SpA." });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  // ═══════════════════════════════════════════════════════
  // DATOS DERIVADOS
  // ═══════════════════════════════════════════════════════
  const regConExtraPendiente = registros.filter(r => {
    if (!r.salida || r.estado==="rechazado") return false;
    const h = calcularHoras(r.entrada, r.salida, r.fecha);
    return h.extra > 0 && r.estado==="pendiente";
  });

  const solPendientes = solicitudes.filter(s => s.estado==="pendiente");

  function getDashData() {
    return trabajadores.filter(t => t.activo && t.id !== 999).map(t => {
      const regs = registros.filter(r => {
        const d = new Date(r.fecha+"T12:00:00");
        return r.tId===t.id && d.getMonth()===dMes && d.getFullYear()===dAnio && r.salida;
      });
      const diasTrab = regs.filter(r => !esEspecial(r.fecha)).length;
      const diasEsp  = regs.filter(r => esEspecial(r.fecha)).length;
      let extra = 0;
      regs.forEach(r => { if (r.estado==="aprobado") extra += calcularHoras(r.entrada,r.salida,r.fecha).extra; });
      const comps = compensatorios.filter(c => c.tId===t.id);
      const habilMes = diasHabilesEnMes(dAnio, dMes);
      return {
        ...t, diasTrab, diasEsp, extra:extra.toFixed(1),
        compPend: comps.filter(c=>c.estado==="pendiente").length,
        compTom:  comps.filter(c=>c.estado==="tomado").length,
        compPag:  comps.filter(c=>c.estado==="pagado").length,
        ausencias: Math.max(0, habilMes-diasTrab), habilMes,
        pct: habilMes>0 ? Math.round(diasTrab/habilMes*100) : 0,
      };
    });
  }
  const dashData = getDashData();

  // ═══════════════════════════════════════════════════════
  // RENDER HELPERS
  // ═══════════════════════════════════════════════════════
  function Hdr({ titulo, sub, onBack, backLabel="← Salir" }) {
    return (
      <div style={S.hdr}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <Logo size={40} />
          <div>
            <div style={{ fontSize:15, fontWeight:"bold", color:"#C9A84C", letterSpacing:1.5, textTransform:"uppercase" }}>{titulo}</div>
            <div style={{ fontSize:10, color:"#9A8A6A", letterSpacing:2, textTransform:"uppercase" }}>{sub}</div>
          </div>
        </div>
        {onBack && <button onClick={onBack} style={S.btnS}>{backLabel}</button>}
      </div>
    );
  }

  function MsgBox({ m }) {
    if (!m?.txt) return null;
    return <div style={m.tipo==="err" ? S.err : S.ok}>{m.txt}</div>;
  }

  // ModalMotivo se define globalmente (ver más abajo) para evitar re-montaje en cada render

  // ═══════════════════════════════════════════════════════
  // VISTA: PORTADA
  // ═══════════════════════════════════════════════════════
  if (vista==="portada") return (
    <div style={{ minHeight:"100vh", fontFamily:"Georgia,serif", color:"#fff", position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", inset:0, backgroundImage:`url("https://images.unsplash.com/photo-1545558014-8692077e9b5c?w=1920&q=90")`, backgroundSize:"cover", backgroundPosition:"center 40%", filter:"brightness(0.25) saturate(0.8) contrast(1.1)", zIndex:0 }} />
      <div style={{ position:"absolute", inset:0, background:"linear-gradient(180deg,rgba(5,4,2,0.7) 0%,rgba(10,8,3,0.82) 50%,rgba(5,4,1,0.97) 100%)", zIndex:1 }} />
      {/* Línea dorada decorativa superior */}
      <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:`linear-gradient(90deg,transparent,#C9A84C,transparent)`, zIndex:2 }} />
      <div style={{ position:"relative", zIndex:2, display:"flex", flexDirection:"column", minHeight:"100vh" }}>
        {/* Fecha discreta arriba centrada */}
        <div style={{ textAlign:"center", padding:"16px 28px 0" }}>
          <span style={{ fontSize:11, color:"rgba(255,255,255,0.35)", letterSpacing:2, textTransform:"uppercase" }}>
            {new Date().toLocaleDateString("es-CL",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}
          </span>
        </div>
        <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"20px 20px 50px" }}>
          {/* Logo centrado con sombra */}
          <div style={{ textAlign:"center", marginBottom:44, display:"flex", flexDirection:"column", alignItems:"center" }}>
            <div style={{ display:"flex", justifyContent:"center", marginBottom:20 }}>
              <Logo size={200} />
            </div>
            <h1 style={{ margin:"0 0 4px", fontSize:"clamp(20px,4vw,36px)", fontWeight:"bold", letterSpacing:6, color:"#F5F0E8", textTransform:"uppercase", textShadow:"0 2px 30px rgba(201,168,76,0.4)", lineHeight:1.15 }}>
              Gestión de Personas
            </h1>
            <div style={{ width:80, height:1, background:"linear-gradient(90deg,transparent,#C9A84C,transparent)", margin:"14px auto 4px" }} />
            <div style={{ width:40, height:2, background:"#C9A84C", margin:"4px auto 0", borderRadius:1 }} />
            <p style={{ color:"rgba(201,168,76,0.7)", fontSize:12, marginTop:18, letterSpacing:3, textTransform:"uppercase" }}>
              Seleccione su perfil para continuar
            </p>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:18, width:"100%", maxWidth:480 }}>
            {[
              { label:"Trabajador", sub:"Registrar entrada / salida", icon:"👷", action:()=>setVista("trabLogin"), gold:false },
              { label:"Administrador", sub:"Gestión y reportes", icon:"🔐", action:()=>setVista("adminLogin"), gold:true },
            ].map(b => (
              <button key={b.label} onClick={b.action} style={{
                background: b.gold
                  ? "linear-gradient(135deg,rgba(201,168,76,0.15),rgba(139,105,20,0.1))"
                  : "rgba(20,18,10,0.7)",
                backdropFilter:"blur(20px)",
                border: b.gold ? "1px solid rgba(201,168,76,0.6)" : "1px solid rgba(201,168,76,0.2)",
                borderRadius:16, padding:"28px 16px", cursor:"pointer", textAlign:"center",
                transition:"all 0.25s",
                boxShadow: b.gold ? "0 8px 32px rgba(201,168,76,0.2)" : "0 4px 16px rgba(0,0,0,0.4)"
              }}>
                <div style={{ fontSize:42, marginBottom:10 }}>{b.icon}</div>
                <div style={{ color:"#C9A84C", fontWeight:"bold", fontSize:16, fontFamily:"Georgia,serif", letterSpacing:1 }}>{b.label}</div>
                <div style={{ color:"rgba(201,168,76,0.5)", fontSize:11, marginTop:6, letterSpacing:0.5 }}>{b.sub}</div>
              </button>
            ))}
          </div>
        </div>
        <div style={{ textAlign:"center", paddingBottom:20, color:"rgba(201,168,76,0.3)", fontSize:10, letterSpacing:3, textTransform:"uppercase" }}>
          Sistema de Gestión de Personas © Paz Vial SpA
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════
  // VISTA: LOGIN ADMIN
  // ═══════════════════════════════════════════════════════
  if (vista==="adminLogin") return (
    <div style={S.app}>
      <Hdr titulo="GESTIÓN DE PERSONAS PAZ VIAL SpA" sub="Acceso Administrador" onBack={()=>setVista("portada")} />
      <div style={{ display:"flex", justifyContent:"center", alignItems:"center", minHeight:"calc(100vh - 70px)", padding:20 }}>
        <div style={{ width:"100%", maxWidth:360 }}>
          <div style={S.card}>
            <h3 style={{ color:"#C9A84C", marginTop:0, textAlign:"center" }}>🔐 Acceso Restringido</h3>
            <label style={S.lbl}>Contraseña</label>
            <input type="password" style={S.input} value={aPass} onChange={e=>setAPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&loginAdmin()} placeholder="Contraseña de administrador" />
            <MsgBox m={{ tipo:"err", txt:aError }} />
            <button onClick={loginAdmin} style={{ ...S.btn, width:"100%", marginTop:14 }}>Ingresar</button>
          </div>
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════
  // VISTA: LOGIN TRABAJADOR
  // ═══════════════════════════════════════════════════════
  if (vista==="trabLogin") return (
    <div style={S.app}>
      <Hdr titulo="GESTIÓN DE PERSONAS PAZ VIAL SpA" sub="Acceso Trabajador" onBack={()=>setVista("portada")} />
      <div style={{ display:"flex", justifyContent:"center", alignItems:"center", minHeight:"calc(100vh - 70px)", padding:20 }}>
        <div style={{ width:"100%", maxWidth:380 }}>
          <div style={S.card}>
            <div style={{ textAlign:"center", marginBottom:18 }}><Logo size={52} /></div>
            <h3 style={{ color:"#C9A84C", marginTop:0, textAlign:"center" }}>Identificación</h3>
            <label style={S.lbl}>Código de trabajador</label>
            <input style={S.input} value={lCodigo} onChange={e=>setLCodigo(e.target.value.toUpperCase())} placeholder="Ej: PP01" onKeyDown={e=>e.key==="Enter"&&loginTrabajador()} />
            <div style={{ marginTop:12 }}>
              <label style={S.lbl}>RUT</label>
              <input style={S.input} value={lRut}
                onChange={e => handleRutInput(e.target.value, setLRut)}
                placeholder="Ej: 12345678K (sin puntos ni guión)"
                onKeyDown={e=>e.key==="Enter"&&loginTrabajador()} />
            </div>
            <MsgBox m={{ tipo:"err", txt:lError }} />
            <button onClick={loginTrabajador} style={{ ...S.btn, width:"100%", marginTop:14 }}>Ingresar</button>
          </div>
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════
  // VISTA: TRABAJADOR
  // ═══════════════════════════════════════════════════════
  if (vista==="trab" && trabActivo) {
    const misRegistros = registros.filter(r => r.tId===trabActivo.id);
    const misNotifs    = notificaciones.filter(n => n.tId===trabActivo.id);
    const misSolicitudes = solicitudes.filter(s => s.tId===trabActivo.id);
    const noLeidas     = misNotifs.filter(n=>!n.leida).length;

    // Dashboard personal
    const mesActual = new Date().getMonth();
    const anioActual = new Date().getFullYear();
    const regMes = misRegistros.filter(r => {
      const d = new Date(r.fecha+"T12:00:00");
      return d.getMonth()===mesActual && d.getFullYear()===anioActual && r.salida;
    });
    let extraAcum = 0;
    regMes.forEach(r => { if(r.estado==="aprobado") extraAcum += calcularHoras(r.entrada,r.salida,r.fecha).extra; });

    const tabsTrab = [
      { k:"marcar",    l:"🕐 Marcar Asistencia" },
      { k:"dash",      l:"📊 Mi Resumen" },
      { k:"solicitud", l:"📝 Solicitudes" },
      { k:"anticipos",  l:"🏦 Anticipo" },
      { k:"liquidacs",  l:`💰 Liquidaciones${liquidaciones.filter(l=>l.tId===trabActivo.id&&l.estado==="enviada").length>0?" ("+liquidaciones.filter(l=>l.tId===trabActivo.id&&l.estado==="enviada").length+")":""}` },
      { k:"notifs",    l:`🔔 Notificaciones${noLeidas>0?` (${noLeidas})`:""}` },
      { k:"manual",    l:"📖 Manual de Uso" },
    ];

    return (
      <div style={S.app}>
        <Hdr titulo="GESTIÓN DE PERSONAS PAZ VIAL SpA" sub={`Trabajador: ${nombreCompleto(trabActivo)}`}
          onBack={()=>{ setVista("portada"); setTrabActivo(null); setMarcaMsg({tipo:"",txt:""}); }} />

        {/* Bienvenida */}
        <div style={{ background:"rgba(255,215,0,0.1)", borderBottom:"1px solid rgba(255,215,0,0.25)", padding:"10px 20px", display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:22 }}>👋</span>
          <span style={{ color:"#C9A84C", fontWeight:"bold", fontSize:15 }}>
            Bienvenido/a, {nombreCompleto(trabActivo)}
          </span>
          <span style={{ color:"#9A8A6A", fontSize:12, marginLeft:8 }}>Código: {trabActivo.codigo}</span>
          <span style={{ color:"#9A8A6A", fontSize:12 }}> — RUT: {trabActivo.rut}</span>
          {noLeidas>0 && <span style={{ marginLeft:"auto", ...S.bdg("#e67e22") }}>🔔 {noLeidas} nuevo{noLeidas>1?"s":""}</span>}
        </div>

        {/* Tabs */}
        <div style={{ padding:"0 16px", display:"flex", gap:3, flexWrap:"wrap", marginTop:12 }}>
          {tabsTrab.map(t => <button key={t.k} onClick={()=>setTabTrab(t.k)} style={S.tab(tabTrab===t.k)}>{t.l}</button>)}
        </div>

        <div style={{ padding:"0 16px 40px" }}>

          {/* ── TAB: MARCAR ──────────────────────────────── */}
          {tabTrab==="marcar" && (
            <div style={{ maxWidth:480, margin:"0 auto" }}>

              {/* Modal de confirmación */}
              {marcaConfirm && (
                <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:999,
                  display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
                  <div style={{ background:"linear-gradient(135deg,#001a4d,#003082)",
                    border:`3px solid ${marcaConfirm.tipo==="entrada"?"#27ae60":"#e74c3c"}`,
                    borderRadius:20, padding:32, maxWidth:380, width:"100%", textAlign:"center" }}>
                    <div style={{ fontSize:56, marginBottom:16 }}>
                      {marcaConfirm.tipo==="entrada"?"🟢":"🔴"}
                    </div>
                    <div style={{ color:"#fff", fontSize:18, fontWeight:"bold", marginBottom:8 }}>
                      Confirmar {marcaConfirm.tipo==="entrada"?"Entrada":"Salida"}
                    </div>
                    <div style={{ color:"#9A8A6A", fontSize:14, marginBottom:6 }}>
                      {new Date().toLocaleDateString("es-CL",{weekday:"long",day:"numeric",month:"long"})}
                    </div>
                    <div style={{ color:"#C9A84C", fontSize:48, fontWeight:"bold",
                      letterSpacing:4, margin:"16px 0" }}>
                      {marcaConfirm.hora}
                    </div>
                    <div style={{ color:"#9A8A6A", fontSize:13, marginBottom:24 }}>
                      {marcaConfirm.tipo==="entrada"
                        ? "¿Confirmas el registro de tu entrada a esta hora?"
                        : "¿Confirmas el registro de tu salida a esta hora?"}
                    </div>
                    <div style={{ display:"flex", gap:12 }}>
                      <button onClick={()=>setMarcaConfirm(null)}
                        style={{ flex:1, background:"rgba(30,26,15,0.8)", color:"#fff",
                          border:"1px solid rgba(255,255,255,0.3)", borderRadius:10,
                          padding:"14px 0", cursor:"pointer", fontSize:15, fontFamily:"Georgia,serif" }}>
                        ✗ Cancelar
                      </button>
                      <button onClick={confirmarMarca}
                        style={{ flex:2,
                          background: marcaConfirm.tipo==="entrada"
                            ? "linear-gradient(135deg,#27ae60,#1e8449)"
                            : "linear-gradient(135deg,#e74c3c,#c0392b)",
                          color:"#fff", border:"none", borderRadius:10,
                          padding:"14px 0", cursor:"pointer", fontSize:15,
                          fontWeight:"bold", fontFamily:"Georgia,serif",
                          boxShadow:`0 4px 15px ${marcaConfirm.tipo==="entrada"?"rgba(39,174,96,0.4)":"rgba(231,76,60,0.4)"}` }}>
                        ✓ Sí, Confirmar
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Indicador de sincronización */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"flex-end",
                marginTop:12, marginBottom:4, paddingRight:4 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:11,
                  color: syncEstado==="ok"?"#27ae60":syncEstado==="guardando"?"#FFD700":"#e74c3c" }}>
                  <div style={{ width:8, height:8, borderRadius:"50%",
                    background: syncEstado==="ok"?"#27ae60":syncEstado==="guardando"?"#FFD700":"#e74c3c",
                    animation: syncEstado==="guardando"?"pulse 1s infinite":"none" }}/>
                  {syncEstado==="ok"?"✓ Sincronizado con la nube":
                   syncEstado==="guardando"?"Guardando...":
                   "⚠ Error de conexión — reintentando"}
                </div>
              </div>

              <div style={{ textAlign:"center", margin:"20px 0 16px" }}>
                <div style={{ fontSize:44, fontWeight:"bold", color:"#C9A84C", letterSpacing:3 }}>
                  {new Date().toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"})}
                </div>
                <div style={{ color:"#9A8A6A", fontSize:13 }}>
                  {new Date().toLocaleDateString("es-CL",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}
                </div>
                {esEspecial(hoy()) && (
                  <div style={{ ...S.bdg("#8e44ad"), marginTop:8, fontSize:12 }}>
                    ⚠ {esDomingo(hoy())?"Domingo":"Feriado"} — Generará día compensatorio
                  </div>
                )}
              </div>

              <div style={S.card}>
                <div style={{ display:"flex", gap:8, marginBottom:18 }}>
                  {["entrada","salida"].map(t => (
                    <button key={t} onClick={()=>setTipoMarca(t)}
                      style={{ ...S.tab(tipoMarca===t), flex:1, fontSize:14, padding:"11px 0", borderRadius:10 }}>
                      {t==="entrada"?"🟢 Entrada":"🔴 Salida"}
                    </button>
                  ))}
                </div>
                <button
                  onClick={solicitarConfirmacionMarca}
                  disabled={marcaGuardando}
                  style={{ ...S.btn, width:"100%", fontSize:15, padding:"14px 0",
                    background: marcaGuardando ? "#555" :
                      tipoMarca==="entrada"
                        ? "linear-gradient(135deg,#27ae60,#1e8449)"
                        : "linear-gradient(135deg,#e74c3c,#c0392b)",
                    color:"#fff", opacity: marcaGuardando ? 0.7 : 1,
                    boxShadow: tipoMarca==="entrada"
                      ? "0 4px 15px rgba(39,174,96,0.4)"
                      : "0 4px 15px rgba(231,76,60,0.4)" }}>
                  {marcaGuardando ? "⏳ Guardando registro..."
                    : tipoMarca==="entrada" ? "🟢 Registrar Entrada"
                    : "🔴 Registrar Salida"}
                </button>
                <MsgBox m={marcaMsg} />
              </div>

              {/* Estado del registro de hoy */}
              {(()=>{
                const regHoy = registros.find(r=>r.tId===trabActivo.id&&r.fecha===hoy());
                if(!regHoy) return (
                  <div style={{ ...S.card, background:"rgba(255,152,0,0.1)",
                    border:"1px solid rgba(255,152,0,0.3)", textAlign:"center", fontSize:13, color:"#ffddaa" }}>
                    ⏳ Aún no has registrado tu entrada hoy
                  </div>
                );
                if(regHoy && !regHoy.salida) return (
                  <div style={{ ...S.card, background:"rgba(39,174,96,0.1)",
                    border:"1px solid rgba(39,174,96,0.3)", fontSize:13 }}>
                    <div style={{ color:"#27ae60", fontWeight:"bold", marginBottom:4 }}>
                      ✅ Entrada registrada hoy
                    </div>
                    <div style={{ color:"#9A8A6A" }}>Hora de entrada: <strong style={{color:"#fff"}}>{regHoy.entrada}</strong></div>
                    <div style={{ color:"#ffddaa", marginTop:4 }}>Recuerda registrar tu salida al terminar</div>
                  </div>
                );
                if(regHoy && regHoy.salida) return (
                  <div style={{ ...S.card, background:"rgba(39,174,96,0.1)",
                    border:"1px solid rgba(39,174,96,0.3)", fontSize:13 }}>
                    <div style={{ color:"#27ae60", fontWeight:"bold", marginBottom:4 }}>
                      ✅ Jornada completada hoy
                    </div>
                    <div style={{ color:"#9A8A6A" }}>Entrada: <strong style={{color:"#fff"}}>{regHoy.entrada}</strong> — Salida: <strong style={{color:"#fff"}}>{regHoy.salida}</strong></div>
                  </div>
                );
              })()}

              <div style={{ ...S.card, fontSize:12, color:"#9A8A6A" }}>
                <div style={{ color:"#C9A84C", fontWeight:"bold", marginBottom:6 }}>📋 Jornada Laboral</div>
                <div>• Lunes a Jueves: 08:00 — 18:00</div>
                <div>• Viernes: 08:00 — 14:00</div>
                <div style={{ color:"#ffddaa", marginTop:6 }}>• Salidas posteriores = horas extraordinarias</div>
              </div>
            </div>
          )}

          {/* ── TAB: DASHBOARD PERSONAL ──────────────────── */}
          {tabTrab==="dash" && (
            <div style={{ marginTop:16 }}>
              {/* Tarjetas mes actual */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:12, marginBottom:16 }}>
                {[
                  { icon:"📆", val:regMes.filter(r=>!esEspecial(r.fecha)).length, lbl:"Días trabajados", c:"#27ae60" },
                  { icon:"⏱", val:extraAcum.toFixed(1)+"h", lbl:"H. extra aprobadas", c:"#FFD700" },
                  { icon:"📅", val:compensatorios.filter(c=>c.tId===trabActivo.id&&c.estado==="pendiente").length, lbl:"Comp. pendientes", c:"#e67e22" },
                  { icon:"📝", val:misSolicitudes.filter(s=>s.estado==="pendiente").length, lbl:"Solicitudes pendientes", c:"#3498db" },
                ].map(x => (
                  <div key={x.lbl} style={{ ...S.card, textAlign:"center", borderColor:x.c+"55", padding:"16px 10px" }}>
                    <div style={{ fontSize:28 }}>{x.icon}</div>
                    <div style={{ fontSize:26, fontWeight:"bold", color:x.c, margin:"4px 0" }}>{x.val}</div>
                    <div style={{ color:"#9A8A6A", fontSize:11 }}>{x.lbl} ({mesNombre(mesActual)})</div>
                  </div>
                ))}
              </div>

              {/* Historial de registros */}
              <div style={S.card}>
                <h4 style={{ color:"#C9A84C", marginTop:0 }}>Historial de Asistencia</h4>
                <div style={{ overflowX:"auto" }}>
                  <table style={S.tbl}>
                    <thead><tr>
                      {["Fecha","Entrada","Salida","H. Extra","Estado","Nota"].map(h=><th key={h} style={S.th}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {[...misRegistros].reverse().slice(0,30).map(r => {
                        const h = r.salida ? calcularHoras(r.entrada,r.salida,r.fecha) : null;
                        const esp = esEspecial(r.fecha);
                        return (
                          <tr key={r.id} style={{ background:esp?"rgba(142,68,173,0.1)":"transparent" }}>
                            <td style={S.td}>{r.fecha} {esp&&<span style={S.bdg("#8e44ad")}>{esDomingo(r.fecha)?"Dom":"Feriado"}</span>}</td>
                            <td style={S.td}>{r.entrada}</td>
                            <td style={S.td}>{r.salida||<span style={{color:"#aaa"}}>—</span>}</td>
                            <td style={{...S.td, color:h?.extra>0?"#FFD700":"#aaa"}}>{h?`${h.extra}h`:"—"}</td>
                            <td style={S.td}>
                              <span style={S.bdg(r.estado==="aprobado"?"#27ae60":r.estado==="rechazado"?"#c0392b":"#e67e22")}>
                                {r.estado==="aprobado"?"✓ Aprobado":r.estado==="rechazado"?"✗ Rechazado":"● Pendiente"}
                              </span>
                            </td>
                            <td style={{...S.td, color:"#ffaaaa", fontSize:11}}>{r.motivoRechazo||""}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── TAB: SOLICITUDES ─────────────────────────── */}
          {tabTrab==="solicitud" && (
            <div style={{ marginTop:16 }}>
              <div style={S.card}>
                <h4 style={{ color:"#C9A84C", marginTop:0 }}>📝 Nueva Solicitud</h4>
                <div style={{ marginBottom:12 }}>
                  <label style={S.lbl}>Tipo</label>
                  <select style={{...S.sel, width:"100%"}} value={solTipo} onChange={e=>setSolTipo(e.target.value)}>
                    <option value="permiso">🗓 Permiso (día puntual)</option>
                    <option value="vacaciones">🏖 Vacaciones (rango de fechas)</option>
                  </select>
                </div>
                <div style={{ display:"grid", gridTemplateColumns: solTipo==="vacaciones"?"1fr 1fr":"1fr", gap:12, marginBottom:12 }}>
                  <div>
                    <label style={S.lbl}>{solTipo==="vacaciones"?"Fecha inicio":"Fecha del permiso"}</label>
                    <input type="date" style={S.input} value={solFechaDesde} onChange={e=>setSolFechaDesde(e.target.value)} />
                  </div>
                  {solTipo==="vacaciones" && (
                    <div>
                      <label style={S.lbl}>Fecha término</label>
                      <input type="date" style={S.input} value={solFechaHasta} onChange={e=>setSolFechaHasta(e.target.value)} />
                    </div>
                  )}
                </div>
                <div style={{ marginBottom:14 }}>
                  <label style={S.lbl}>Motivo / Observación (opcional)</label>
                  <textarea style={{...S.input, minHeight:70, resize:"vertical"}} value={solMotivo} onChange={e=>setSolMotivo(e.target.value)} placeholder="Describe el motivo..." />
                </div>
                {solTipo==="vacaciones" && (
                  <div style={{ ...S.notif, fontSize:12, marginBottom:12 }}>
                    ℹ Las vacaciones solo pueden solicitarse de lunes a viernes (días hábiles).
                  </div>
                )}
                <button onClick={enviarSolicitud} style={S.btn}>Enviar Solicitud</button>
                <MsgBox m={solMsg} />
              </div>

              {/* Mis solicitudes */}
              <div style={S.card}>
                <h4 style={{ color:"#C9A84C", marginTop:0 }}>Mis Solicitudes</h4>
                {misSolicitudes.length===0 ? (
                  <div style={{ color:"#9A8A6A", textAlign:"center", padding:24 }}>No hay solicitudes registradas</div>
                ) : (
                  <table style={S.tbl}>
                    <thead><tr>{["Tipo","Fechas","Motivo","Estado","Respuesta"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {[...misSolicitudes].reverse().map(s => (
                        <tr key={s.id}>
                          <td style={S.td}><span style={S.bdg(s.tipo==="permiso"?"#3498db":"#27ae60")}>{s.tipo==="permiso"?"Permiso":"Vacaciones"}</span></td>
                          <td style={S.td}>{s.fechaDesde}{s.fechaHasta!==s.fechaDesde?` → ${s.fechaHasta}`:""}</td>
                          <td style={{...S.td, color:"#9A8A6A", fontSize:12}}>{s.motivo||"—"}</td>
                          <td style={S.td}><span style={S.bdg(s.estado==="aprobado"?"#27ae60":s.estado==="rechazado"?"#c0392b":"#e67e22")}>
                            {s.estado==="aprobado"?"✓ Aprobado":s.estado==="rechazado"?"✗ Rechazado":"● Pendiente"}
                          </span></td>
                          <td style={{...S.td, color:"#ffaaaa", fontSize:12}}>{s.motivoRechazo||"—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ── TAB: NOTIFICACIONES ──────────────────────── */}
          {tabTrab==="notifs" && (
            <div style={{ marginTop:16 }}>
              <div style={S.card}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                  <h4 style={{ color:"#C9A84C", margin:0 }}>🔔 Notificaciones</h4>
                  {noLeidas>0 && <button onClick={()=>marcarLeidas(trabActivo.id)} style={S.btnS}>Marcar todas como leídas</button>}
                </div>
                {misNotifs.length===0 ? (
                  <div style={{ color:"#9A8A6A", textAlign:"center", padding:30 }}>Sin notificaciones</div>
                ) : (
                  [...misNotifs].reverse().map(n => (
                    <div key={n.id} style={{ ...S.notif, opacity:n.leida?0.55:1, borderColor:n.leida?"rgba(255,255,255,0.15)":"#ff9800", background:n.leida?"rgba(255,255,255,0.04)":"rgba(255,152,0,0.18)" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                        <span style={{ fontSize:14 }}>{n.msg}</span>
                        {!n.leida && <span style={{ ...S.bdg("#ff9800"), marginLeft:8, flexShrink:0 }}>Nuevo</span>}
                      </div>
                      <div style={{ color:"#9A8A6A", fontSize:11, marginTop:4 }}>{n.fecha}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ── TAB: ANTICIPO ───────────────────────────── */}
          {tabTrab==="anticipos" && (
            <div style={{ marginTop:16, maxWidth:520, margin:"16px auto 0" }}>
              <div style={S.card}>
                <h4 style={{ color:"#C9A84C", marginTop:0 }}>🏦 Solicitar Anticipo de Remuneración</h4>
                <div style={{ marginBottom:12 }}>
                  <label style={S.lbl}>Monto solicitado ($)</label>
                  <input style={S.input} type="number" value={anticMonto}
                    onChange={e=>setAnticMonto(e.target.value)} placeholder="Ej: 100000" />
                  {anticMonto && Number(anticMonto)>0 && (
                    <div style={{ color:"#27ae60", fontSize:11, marginTop:4 }}>
                      {new Intl.NumberFormat("es-CL",{style:"currency",currency:"CLP"}).format(anticMonto)}
                    </div>
                  )}
                </div>
                <div style={{ marginBottom:14 }}>
                  <label style={S.lbl}>Motivo (opcional)</label>
                  <textarea style={{ ...S.input, minHeight:60, resize:"vertical" }}
                    value={anticMotivo} onChange={e=>setAnticMotivo(e.target.value)}
                    placeholder="Describe el motivo de la solicitud..." />
                </div>
                <div style={{ ...S.notif, fontSize:12, marginBottom:12 }}>
                  ℹ Si es aprobado, el monto se descontará automáticamente en tu liquidación del mes en curso.
                </div>
                <button onClick={solicitarAnticipo} style={S.btn}>Enviar Solicitud</button>
                {anticMsg.txt && <div style={anticMsg.tipo==="err"?S.err:S.ok}>{anticMsg.txt}</div>}
              </div>
              <div style={S.card}>
                <h4 style={{ color:"#9A8A6A", marginTop:0 }}>Mis Solicitudes de Anticipo</h4>
                {anticipos.filter(a=>a.tId===trabActivo.id).length===0
                  ? <div style={{ color:"#9A8A6A", textAlign:"center", padding:24 }}>Sin solicitudes</div>
                  : <table style={S.tbl}><thead><tr>
                      {["Mes","Monto","Motivo","Estado","Respuesta"].map(h=><th key={h} style={S.th}>{h}</th>)}
                    </tr></thead><tbody>
                    {[...anticipos.filter(a=>a.tId===trabActivo.id)].reverse().map(a=>(
                      <tr key={a.id}>
                        <td style={S.td}>{mesNombre(a.mes)} {a.anio}</td>
                        <td style={{ ...S.td, color:"#C9A84C", fontWeight:"bold" }}>
                          ${Number(a.monto).toLocaleString("es-CL")}
                        </td>
                        <td style={{ ...S.td, color:"#9A8A6A", fontSize:12 }}>{a.motivo||"—"}</td>
                        <td style={S.td}><span style={S.bdg(a.estado==="aprobado"?"#27ae60":a.estado==="rechazado"?"#c0392b":"#e67e22")}>
                          {a.estado==="aprobado"?"✓ Aprobado":a.estado==="rechazado"?"✗ Rechazado":"● Pendiente"}
                        </span></td>
                        <td style={{ ...S.td, color:"#ffaaaa", fontSize:12 }}>{a.motivoRechazo||"—"}</td>
                      </tr>
                    ))}
                  </tbody></table>
                }
              </div>
            </div>
          )}

          {/* ── TAB: LIQUIDACIONES TRABAJADOR ───────────── */}
          {tabTrab==="liquidacs" && (
            <div style={{ marginTop:16 }}>
              {firmaMsg.txt && <div style={{ ...firmaMsg.tipo==="err"?S.err:S.ok, marginBottom:12 }}>{firmaMsg.txt}</div>}
              {liquidaciones.filter(l=>l.tId===trabActivo.id).length===0
                ? <div style={{ ...S.card, textAlign:"center", color:"#9A8A6A", padding:40 }}>
                    No tienes liquidaciones disponibles aún.
                  </div>
                : [...liquidaciones.filter(l=>l.tId===trabActivo.id)].reverse().map(liq=>{
                    const d = liq.datos;
                    return (
                      <div key={liq.id} style={{ ...S.card, border: liq.estado==="firmada"?"1px solid #27ae60":"1px solid rgba(255,215,0,0.3)" }}>
                        {/* Encabezado */}
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10, marginBottom:14 }}>
                          <div>
                            <div style={{ color:"#C9A84C", fontWeight:"bold", fontSize:16 }}>
                              Liquidación {mesNombre(liq.mes)} {liq.anio}
                            </div>
                            <div style={{ color:"#9A8A6A", fontSize:12 }}>Alcance Líquido: <strong style={{color:"#27ae60",fontSize:16}}>${d.alcanceLiquido.toLocaleString("es-CL")}</strong></div>
                          </div>
                          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                            <span style={S.bdg(liq.estado==="firmada"?"#27ae60":liq.estado==="enviada"?"#e67e22":"#555")}>
                              {liq.estado==="firmada"?"✓ Firmada":liq.estado==="enviada"?"● Pendiente firma":"Borrador"}
                            </span>
                            <button onClick={()=>imprimirLiquidacion(liq)} style={S.btnB}>🖨 Ver / PDF</button>
                            {liq.estado==="enviada" && <button onClick={()=>{setFirmaLiqId(liq.id);setFirmaMsg({tipo:"",txt:""});}} style={S.btnG}>✍ Firmar</button>}
                          </div>
                        </div>
                        {/* Detalle */}
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:12 }}>
                          <div style={{ background:"rgba(15,13,8,0.7)", borderRadius:8, padding:"10px 14px" }}>
                            <div style={{ color:"#9A8A6A", marginBottom:6, fontWeight:"bold" }}>HABERES</div>
                            <div style={{ display:"flex", justifyContent:"space-between" }}><span>Sueldo Base</span><span>${d.sueldoBase.toLocaleString("es-CL")}</span></div>
                            {d.valorHHExtra>0&&<div style={{ display:"flex", justifyContent:"space-between" }}><span>HH Extra 50% ({d.horasExtra}h)</span><span>${d.valorHHExtra.toLocaleString("es-CL")}</span></div>}
                            {d.gratif>0&&<div style={{ display:"flex", justifyContent:"space-between" }}><span>Gratificación Legal</span><span>${d.gratif.toLocaleString("es-CL")}</span></div>}
                            <div style={{ display:"flex", justifyContent:"space-between", fontWeight:"bold", borderTop:"1px solid rgba(255,255,255,0.1)", marginTop:4, paddingTop:4 }}><span>Total Imponible</span><span>${d.totalImponible.toLocaleString("es-CL")}</span></div>
                            <div style={{ display:"flex", justifyContent:"space-between" }}><span>Colación</span><span>${d.colacion.toLocaleString("es-CL")}</span></div>
                            <div style={{ display:"flex", justifyContent:"space-between" }}><span>Movilización</span><span>${d.movilizacion.toLocaleString("es-CL")}</span></div>
                            <div style={{ display:"flex", justifyContent:"space-between", fontWeight:"bold", borderTop:"1px solid rgba(255,255,255,0.1)", marginTop:4, paddingTop:4, color:"#C9A84C" }}><span>TOTAL HABERES</span><span>${d.totalHaberes.toLocaleString("es-CL")}</span></div>
                          </div>
                          <div style={{ background:"rgba(15,13,8,0.7)", borderRadius:8, padding:"10px 14px" }}>
                            <div style={{ color:"#9A8A6A", marginBottom:6, fontWeight:"bold" }}>DESCUENTOS</div>
                            <div style={{ display:"flex", justifyContent:"space-between" }}><span>Previsión AFP ({d.pctAFP}%)</span><span>${d.prevision_monto.toLocaleString("es-CL")}</span></div>
                            <div style={{ display:"flex", justifyContent:"space-between" }}><span>Salud (7%)</span><span>${d.salud_monto.toLocaleString("es-CL")}</span></div>
                            <div style={{ display:"flex", justifyContent:"space-between", fontWeight:"bold", borderTop:"1px solid rgba(255,255,255,0.1)", marginTop:4, paddingTop:4 }}><span>Total Desc. Legales</span><span>${d.totalDescLegales.toLocaleString("es-CL")}</span></div>
                            {d.anticipo>0&&<div style={{ display:"flex", justifyContent:"space-between", color:"#e74c3c" }}><span>Anticipo de Remuneración</span><span>${d.anticipo.toLocaleString("es-CL")}</span></div>}
                            <div style={{ display:"flex", justifyContent:"space-between", fontWeight:"bold", borderTop:"1px solid rgba(255,255,255,0.1)", marginTop:4, paddingTop:4, color:"#e74c3c" }}><span>TOTAL DESCUENTOS</span><span>${d.totalDescuentos.toLocaleString("es-CL")}</span></div>
                          </div>
                        </div>
                        {/* Firma sello */}
                        {liq.estado==="firmada" && (
                          <div style={{ background:"rgba(39,174,96,0.15)", border:"1px solid #27ae60", borderRadius:8, padding:"10px 14px", marginTop:12, fontSize:12, color:"#aaffcc" }}>
                            ✅ Firmada electrónicamente por <strong>{liq.firmadaPor}</strong> — {liq.firmadaFecha} {liq.firmadaHora}
                          </div>
                        )}
                        {/* Modal firma */}
                        {firmaLiqId===liq.id && (
                          <div style={{ background:"rgba(0,0,0,0.5)", border:"1px solid rgba(255,215,0,0.4)", borderRadius:10, padding:16, marginTop:12 }}>
                            <div style={{ color:"#C9A84C", fontWeight:"bold", marginBottom:10 }}>✍ Firmar Liquidación Electrónicamente</div>
                            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
                              <div>
                                <label style={S.lbl}>Tu RUT</label>
                                <input style={S.input} value={firmaRut}
                                onChange={e=>handleRutInput(e.target.value, setFirmaRut)}
                                placeholder="Ingresa tu RUT (sin puntos ni guión)" />
                              </div>
                              <div>
                                <label style={S.lbl}>Tu Código</label>
                                <input style={S.input} value={firmaCodigo} onChange={e=>setFirmaCodigo(e.target.value)} placeholder="PP01" />
                              </div>
                            </div>
                            <div style={{ display:"flex", gap:8 }}>
                              <button onClick={()=>firmarLiquidacion(liq.id)} style={S.btnG}>✅ Confirmar Firma</button>
                              <button onClick={()=>{setFirmaLiqId(null);setFirmaRut("");setFirmaCodigo("");}} style={S.btnS}>Cancelar</button>
                            </div>
                            {firmaMsg.txt && <div style={firmaMsg.tipo==="err"?S.err:S.ok}>{firmaMsg.txt}</div>}
                          </div>
                        )}
                      </div>
                    );
                  })
              }
            </div>
          )}

          {/* ── TAB: MANUAL TRABAJADOR ───────────────────── */}
          {tabTrab==="manual" && (
            <div style={{ marginTop:16, maxWidth:780, margin:"16px auto 0" }}>
              <div style={{ ...S.card, border:"2px solid rgba(255,215,0,0.4)" }}>
                <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20, borderBottom:"1px solid rgba(255,215,0,0.2)", paddingBottom:16 }}>
                  <Logo size={48} />
                  <div>
                    <h2 style={{ color:"#C9A84C", margin:0, fontSize:20, letterSpacing:2 }}>MANUAL DE USO</h2>
                    <div style={{ color:"#9A8A6A", fontSize:12, letterSpacing:1, textTransform:"uppercase" }}>Perfil Trabajador — Gestión de Personas Paz Vial SpA</div>
                  </div>
                </div>

                {[
                  {
                    icon:"🔑", titulo:"1. Cómo Ingresar al Sistema",
                    items:[
                      "Desde la portada, selecciona el botón Trabajador.",
                      "Ingresa tu Código de trabajador (Ej: PP01) y tu RUT (Ej: 12.345.678-9). El sistema te saludará con tu nombre completo.",
                      "Si los datos son correctos, el sistema te dará la bienvenida con tu nombre completo.",
                      "Tu código es único y fue asignado por el administrador al momento de tu registro.",
                    ]
                  },
                  {
                    icon:"🕐", titulo:"2. Registrar Entrada y Salida",
                    items:[
                      "En la pestaña Marcar Asistencia, selecciona el tipo de marca: Entrada o Salida.",
                      "Presiona el botón correspondiente. Aparecerá una pantalla de confirmación con la hora exacta del momento.",
                      "Lee la hora que muestra el sistema y presiona '✓ Sí, Confirmar' para registrar, o '✗ Cancelar' si no es el momento correcto.",
                      "Solo puedes registrar una entrada y una salida por día.",
                      "Debajo del botón verás el estado de tu registro del día: si aún no has marcado entrada, si ya marcaste entrada y falta la salida, o si la jornada está completa.",
                      "El indicador de sincronización muestra si el registro se guardó en la nube: 🟢 Sincronizado, 🟡 Guardando o 🔴 Error de conexión (el sistema reintenta automáticamente).",
                      "Si trabajas en domingo o feriado, el sistema lo indicará y generará automáticamente un Día Compensatorio.",
                    ]
                  },
                  {
                    icon:"📅", titulo:"3. Jornada Laboral y Horas Extraordinarias",
                    items:[
                      "Lunes a Jueves: jornada normal de 08:00 a 18:00.",
                      "Viernes: jornada normal de 08:00 a 14:00.",
                      "Si tu salida es posterior al horario normal, el excedente se registra como horas extraordinarias.",
                      "Las horas extraordinarias quedan en estado Pendiente hasta que el administrador las apruebe o rechace.",
                      "Recibirás una notificación con el resultado de la revisión.",
                    ]
                  },
                  {
                    icon:"📊", titulo:"4. Mi Resumen",
                    items:[
                      "En la pestaña Mi Resumen encontrarás un resumen del mes en curso: días trabajados, horas extra aprobadas, compensatorios pendientes y solicitudes pendientes.",
                      "Más abajo verás el historial completo de tus registros de asistencia con el estado de cada uno.",
                      "Si una hora extraordinaria fue rechazada, verás el motivo indicado por el administrador.",
                    ]
                  },
                  {
                    icon:"📝", titulo:"5. Solicitar Permiso o Vacaciones",
                    items:[
                      "En la pestaña Solicitudes puedes pedir un Permiso (día puntual) o Vacaciones (rango de fechas).",
                      "Selecciona el tipo, completa las fechas y agrega un motivo si lo deseas.",
                      "Importante: las vacaciones solo pueden solicitarse con inicio en día hábil (lunes a viernes, sin feriados).",
                      "Tu solicitud quedará en estado Pendiente hasta que el administrador la revise.",
                      "Recibirás una notificación cuando sea aprobada o rechazada, incluyendo el motivo en caso de rechazo.",
                    ]
                  },
                  {
                    icon:"🔔", titulo:"6. Notificaciones",
                    items:[
                      "En la pestaña Notificaciones verás todos los mensajes del sistema relacionados con tus horas extra y solicitudes.",
                      "Las notificaciones nuevas aparecen destacadas en naranja y con un contador en la pestaña.",
                      "Puedes marcarlas como leídas con el botón Marcar todas como leídas.",
                      "Al ingresar al sistema, las notificaciones pendientes se marcan automáticamente.",
                    ]
                  },
                  {
                    icon:"💡", titulo:"7. Consejos y Buenas Prácticas",
                    items:[
                      "Marca siempre tu entrada al llegar y tu salida al retirarte para mantener un registro preciso.",
                      "Si olvidaste marcar, comunícate con el administrador para que corrija el registro.",
                      "Solicita tus vacaciones con anticipación para facilitar la aprobación.",
                      "Revisa tus notificaciones regularmente para estar al tanto de aprobaciones y rechazos.",
                    ]
                  },
                ].map(sec => (
                  <div key={sec.titulo} style={{ marginBottom:24 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                      <span style={{ fontSize:24 }}>{sec.icon}</span>
                      <h3 style={{ color:"#C9A84C", margin:0, fontSize:15, letterSpacing:0.5 }}>{sec.titulo}</h3>
                    </div>
                    <div style={{ paddingLeft:34 }}>
                      {sec.items.map((item, i) => (
                        <div key={i} style={{ display:"flex", gap:10, marginBottom:8, alignItems:"flex-start" }}>
                          <span style={{ color:"#C9A84C", fontWeight:"bold", flexShrink:0, fontSize:13 }}>→</span>
                          <span style={{ color:"#d0e0ff", fontSize:13, lineHeight:1.6 }}>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                <div style={{ background:"rgba(255,215,0,0.08)", border:"1px solid rgba(255,215,0,0.3)", borderRadius:10, padding:"14px 18px", marginTop:8 }}>
                  <div style={{ color:"#C9A84C", fontWeight:"bold", fontSize:13, marginBottom:6 }}>📞 ¿Necesitas ayuda?</div>
                  <div style={{ color:"#9A8A6A", fontSize:12, lineHeight:1.7 }}>
                    Si tienes problemas para acceder al sistema, un registro incorrecto o cualquier duda, contacta directamente al Administrador del sistema de Gestión de Personas Paz Vial SpA.
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // VISTA: ADMIN
  // ═══════════════════════════════════════════════════════
  // badges integrados en Bandeja de Pendientes

  const totalPendientes = registros.filter(r=>r.entradaAnticipada).length+regConExtraPendiente.length+solPendientes.length+anticipos.filter(a=>a.estado==="pendiente").length;
  const tabsAdmin = [
    { k:"bandeja",      l:`🔔 Pendientes${totalPendientes>0?" ("+totalPendientes+")":""}` },
    { k:"asistencia",   l:"📋 Asistencia" },
    { k:"nomina",       l:"👥 Nómina" },
    { k:"liquidaciones",l:"💰 Liquidaciones" },
    { k:"compensat",    l:"📅 Compensatorios" },
    { k:"calendario",   l:"🗓 Calendario" },
    { k:"dashboard",    l:"📊 Dashboard" },
    { k:"exportar",     l:"💾 Exportar / Importar" },
    { k:"manual",       l:"📖 Manual de Uso" },
  ];

  return (
    <div style={S.app}>
      <ModalMotivo
        motivoModal={motivoModal}
        setMotivoModal={setMotivoModal}
        onConfirmar={(mot) => {
          if (motivoModal.tipo==="extra") {
            setRegistros(p => p.map(r => r.id===motivoModal.id ? {...r, estado:"rechazado", motivoRechazo:mot} : r));
            const r = registros.find(x => x.id===motivoModal.id);
            if (r) pushNotif(r.tId, `❌ Tus horas extraordinarias del ${r.fecha} fueron rechazadas. Motivo: ${mot||"Sin motivo especificado"}`);
          } else if (motivoModal.tipo==="anticipo") {
            rechazarAnticipo(motivoModal.id, mot);
          } else {
            setSolicitudes(p => p.map(s => s.id===motivoModal.id ? {...s, estado:"rechazado", motivoRechazo:mot} : s));
            const s = solicitudes.find(x => x.id===motivoModal.id);
            if (s) {
              const tipo = s.tipo==="permiso" ? "Permiso" : "Vacaciones";
              pushNotif(s.tId, `❌ Tu solicitud de ${tipo} del ${s.fechaDesde} fue rechazada. Motivo: ${mot||"Sin motivo especificado"}`);
            }
          }
          setMotivoModal(null);
        }}
      />
      <Hdr titulo="GESTIÓN DE PERSONAS PAZ VIAL SpA" sub="Panel de Administración"
        onBack={()=>setVista("portada")} backLabel="🚪 Cerrar sesión" />

      {/* Barra de acciones admin */}
      <div style={{ background:"rgba(8,6,3,0.5)", borderBottom:"1px solid rgba(255,255,255,0.08)", padding:"6px 20px", display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
        <span style={{ color:"#9A8A6A", fontSize:11, marginRight:"auto" }}>
          {new Date().toLocaleDateString("es-CL",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
        </span>
        <button
          onClick={()=>{
            setLiqPreview(null); setLiqTrabId(""); setLiqMsg({tipo:"",txt:""});
            setNNombre(""); setNApellido(""); setNRut(""); setNFormErr("");
            setMotivoModal(null); setImportMsg({tipo:"",txt:""});
            setRegEditando(null); setRegManMsg({tipo:"",txt:""});
          }}
          style={{ ...S.btnS, fontSize:11, padding:"5px 14px" }}>
          🧹 Limpiar pantalla
        </button>
        <button
          onClick={()=>setConfirmarLimpiar(true)}
          style={{ ...S.btnD, fontSize:11, padding:"5px 14px" }}>
          🗑 Limpiar datos de prueba
        </button>
      </div>

      {/* Modal confirmación limpiar datos ficticios */}
      {confirmarLimpiar && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", zIndex:999, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div style={{ ...S.card, maxWidth:420, width:"100%", border:"2px solid #c0392b" }}>
            <h3 style={{ color:"#c0392b", marginTop:0 }}>⚠️ Confirmar Limpieza</h3>
            <p style={{ color:"#fff", fontSize:13, lineHeight:1.7 }}>
              Esta acción eliminará los <strong>3 trabajadores de ejemplo</strong> (Juan Pérez, María Pinto, Carlos Rojas) y todos sus registros asociados.<br/><br/>
              <strong style={{color:"#aaffcc"}}>✅ Los trabajadores reales que hayas ingresado NO se eliminarán.</strong><br/><br/>
              <strong style={{color:"#ffaaaa"}}>Esta acción no se puede deshacer. ¿Deseas continuar?</strong>
            </p>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={limpiarDatosFicticios} style={{ ...S.btnD, padding:"10px 20px", fontWeight:"bold" }}>
                Sí, limpiar todo
              </button>
              <button onClick={()=>setConfirmarLimpiar(false)} style={{ ...S.btn, padding:"10px 20px" }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ padding:"0 16px", display:"flex", gap:3, flexWrap:"wrap", marginTop:12 }}>
        {tabsAdmin.map(t => <button key={t.k} onClick={()=>{
          setTabAdmin(t.k);
          if(t.k==="nomina" && !fichaSelId){
            const primero = trabajadores.filter(x=>x.activo&&x.id!==999)[0];
            if(primero) setFichaSelId(primero.id);
          }
        }} style={S.tab(tabAdmin===t.k)}>{t.l}</button>)}
      </div>

      <div style={{ padding:"0 16px 48px" }}>

        {/* ── TAB: BANDEJA DE PENDIENTES ──────────────── */}
        {tabAdmin==="bandeja" && (
          <div style={{ marginTop:4 }}>

            {/* ── Entradas Anticipadas ── */}
            {registros.filter(r=>r.entradaAnticipada).length>0 && (
              <div style={S.card}>
                <h3 style={{ color:"#e67e22", marginTop:0, display:"flex", alignItems:"center", gap:10 }}>
                  <span style={S.bdg("#e67e22")}>{registros.filter(r=>r.entradaAnticipada).length}</span>
                  ⏰ Entradas Anticipadas (antes de 08:00)
                </h3>
                <table style={S.tbl}><thead><tr>
                  {["Trabajador","Código","Fecha","Hora Marcada","Acción"].map(h=><th key={h} style={S.th}>{h}</th>)}
                </tr></thead><tbody>
                {registros.filter(r=>r.entradaAnticipada).map(r=>{
                  const t=trabajadores.find(x=>x.id===r.tId);
                  return (
                    <tr key={r.id}>
                      <td style={S.td}>{t?nombreCompleto(t):"—"}</td>
                      <td style={{...S.td,color:"#C9A84C",fontWeight:"bold"}}>{t?.codigo}</td>
                      <td style={S.td}>{r.fecha}</td>
                      <td style={{...S.td,color:"#e67e22",fontWeight:"bold"}}>{r.entrada}</td>
                      <td style={S.td}>
                        <button onClick={()=>setEntradaAnticModal({id:r.id,horaCorregida:"08:00"})} style={{...S.btnB,fontSize:12}}>
                          🔍 Revisar
                        </button>
                      </td>
                    </tr>
                  );
                })}
                </tbody></table>
              </div>
            )}

            {/* ── Horas Extraordinarias ── */}
            <div style={S.card}>
              <h3 style={{ color:"#C9A84C", marginTop:0, display:"flex", alignItems:"center", gap:10 }}>
                {regConExtraPendiente.length>0 && <span style={S.bdg("#e67e22")}>{regConExtraPendiente.length}</span>}
                ⏱ Horas Extraordinarias Pendientes
              </h3>
              {regConExtraPendiente.length===0 ? (
                <div style={{color:"#9A8A6A",textAlign:"center",padding:24}}>✅ Sin horas extra pendientes</div>
              ) : (
                <table style={S.tbl}><thead><tr>
                  {["Trabajador","Código","Fecha","Entrada","Salida","H. Extra","Acciones"].map(h=><th key={h} style={S.th}>{h}</th>)}
                </tr></thead><tbody>
                {regConExtraPendiente.map(r=>{
                  const t=trabajadores.find(x=>x.id===r.tId);
                  const h=calcularHoras(r.entrada,r.salida,r.fecha);
                  return (
                    <tr key={r.id}>
                      <td style={S.td}>{t?nombreCompleto(t):"—"}</td>
                      <td style={{...S.td,color:"#C9A84C",fontWeight:"bold"}}>{t?.codigo}</td>
                      <td style={S.td}>{r.fecha}</td>
                      <td style={S.td}>{r.entrada}</td>
                      <td style={S.td}>{r.salida}</td>
                      <td style={{...S.td,color:"#C9A84C",fontWeight:"bold"}}>{h.extra}h</td>
                      <td style={S.td}>
                        <div style={{display:"flex",gap:6}}>
                          <button onClick={()=>aprobarExtra(r.id)} style={S.btnG}>✓ Aprobar</button>
                          <button onClick={()=>setMotivoModal({tipo:"extra",id:r.id,motivo:""})} style={S.btnD}>✗ Rechazar</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                </tbody></table>
              )}
            </div>

            {/* ── Solicitudes Permisos y Vacaciones ── */}
            <div style={S.card}>
              <h3 style={{ color:"#C9A84C", marginTop:0, display:"flex", alignItems:"center", gap:10 }}>
                {solPendientes.length>0 && <span style={S.bdg("#3498db")}>{solPendientes.length}</span>}
                📝 Permisos y Vacaciones Pendientes
              </h3>
              {solPendientes.length===0 ? (
                <div style={{color:"#9A8A6A",textAlign:"center",padding:24}}>✅ Sin solicitudes pendientes</div>
              ) : (
                <table style={S.tbl}><thead><tr>
                  {["Trabajador","Tipo","Desde","Hasta","Motivo","Acción"].map(h=><th key={h} style={S.th}>{h}</th>)}
                </tr></thead><tbody>
                {solPendientes.map(s=>{
                  const t=trabajadores.find(x=>x.id===s.tId);
                  return (
                    <tr key={s.id}>
                      <td style={S.td}>{t?nombreCompleto(t):"—"} <span style={{color:"#C9A84C",fontSize:11}}>({t?.codigo})</span></td>
                      <td style={S.td}><span style={S.bdg(s.tipo==="permiso"?"#3498db":"#27ae60")}>{s.tipo==="permiso"?"Permiso":"Vacaciones"}</span></td>
                      <td style={S.td}>{s.fechaDesde}</td>
                      <td style={S.td}>{s.fechaHasta!==s.fechaDesde?s.fechaHasta:"—"}</td>
                      <td style={{...S.td,color:"#9A8A6A",fontSize:12}}>{s.motivo||"—"}</td>
                      <td style={S.td}>
                        <div style={{display:"flex",gap:6}}>
                          <button onClick={()=>aprobarSolicitud(s.id)} style={S.btnG}>✓ Aprobar</button>
                          <button onClick={()=>setMotivoModal({tipo:"solicitud",id:s.id,motivo:""})} style={S.btnD}>✗ Rechazar</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                </tbody></table>
              )}
            </div>

            {/* ── Anticipos ── */}
            <div style={S.card}>
              <h3 style={{ color:"#C9A84C", marginTop:0, display:"flex", alignItems:"center", gap:10 }}>
                {anticipos.filter(a=>a.estado==="pendiente").length>0 && <span style={S.bdg("#8e44ad")}>{anticipos.filter(a=>a.estado==="pendiente").length}</span>}
                🏦 Anticipos de Remuneración Pendientes
              </h3>
              {anticipos.filter(a=>a.estado==="pendiente").length===0 ? (
                <div style={{color:"#9A8A6A",textAlign:"center",padding:24}}>✅ Sin anticipos pendientes</div>
              ) : (
                <table style={S.tbl}><thead><tr>
                  {["Trabajador","Mes","Monto","Motivo","Acción"].map(h=><th key={h} style={S.th}>{h}</th>)}
                </tr></thead><tbody>
                {anticipos.filter(a=>a.estado==="pendiente").map(a=>{
                  const t=trabajadores.find(x=>x.id===a.tId);
                  return (
                    <tr key={a.id}>
                      <td style={S.td}>{t?nombreCompleto(t):"—"} <span style={{color:"#C9A84C",fontSize:11}}>({t?.codigo})</span></td>
                      <td style={S.td}>{mesNombre(a.mes)} {a.anio}</td>
                      <td style={{...S.td,color:"#C9A84C",fontWeight:"bold"}}>${Number(a.monto).toLocaleString("es-CL")}</td>
                      <td style={{...S.td,color:"#9A8A6A",fontSize:12}}>{a.motivo||"—"}</td>
                      <td style={S.td}>
                        <div style={{display:"flex",gap:6}}>
                          <button onClick={()=>aprobarAnticipo(a.id)} style={S.btnG}>✓ Aprobar</button>
                          <button onClick={()=>setMotivoModal({tipo:"anticipo",id:a.id,motivo:""})} style={S.btnD}>✗ Rechazar</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                </tbody></table>
              )}
            </div>

            {/* ── Historial reciente resuelto ── */}
            <div style={S.card}>
              <h4 style={{color:"#9A8A6A",marginTop:0}}>📋 Historial reciente resuelto</h4>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,fontSize:12}}>
                <div>
                  <div style={{color:"#9A8A6A",marginBottom:6,fontWeight:"bold"}}>H. Extra resueltas</div>
                  {[...registros.filter(r=>r.salida&&(r.estado==="aprobado"||r.estado==="rechazado")&&calcularHoras(r.entrada,r.salida,r.fecha).extra>0)].reverse().slice(0,5).map(r=>{
                    const t=trabajadores.find(x=>x.id===r.tId);
                    const h=calcularHoras(r.entrada,r.salida,r.fecha);
                    return <div key={r.id} style={{marginBottom:4,color:"#d0e0ff"}}>{t?.apellido} {r.fecha} <span style={S.bdg(r.estado==="aprobado"?"#27ae60":"#c0392b")}>{r.estado==="aprobado"?"✓":"✗"}</span> {h.extra}h</div>;
                  })}
                </div>
                <div>
                  <div style={{color:"#9A8A6A",marginBottom:6,fontWeight:"bold"}}>Solicitudes resueltas</div>
                  {[...solicitudes.filter(s=>s.estado!=="pendiente")].reverse().slice(0,5).map(s=>{
                    const t=trabajadores.find(x=>x.id===s.tId);
                    return <div key={s.id} style={{marginBottom:4,color:"#d0e0ff"}}>{t?.apellido} {s.tipo} <span style={S.bdg(s.estado==="aprobado"?"#27ae60":"#c0392b")}>{s.estado==="aprobado"?"✓":"✗"}</span></div>;
                  })}
                </div>
                <div>
                  <div style={{color:"#9A8A6A",marginBottom:6,fontWeight:"bold"}}>Anticipos resueltos</div>
                  {[...anticipos.filter(a=>a.estado!=="pendiente")].reverse().slice(0,5).map(a=>{
                    const t=trabajadores.find(x=>x.id===a.tId);
                    return <div key={a.id} style={{marginBottom:4,color:"#d0e0ff"}}>{t?.apellido} ${Number(a.monto).toLocaleString("es-CL")} <span style={S.bdg(a.estado==="aprobado"?"#27ae60":"#c0392b")}>{a.estado==="aprobado"?"✓":"✗"}</span></div>;
                  })}
                </div>
              </div>
            </div>

            {/* Modal entradas anticipadas */}
            {entradaAnticModal && (() => {
              const reg  = registros.find(r => r.id === entradaAnticModal.id);
              const trab = reg ? trabajadores.find(t => t.id === reg.tId) : null;
              if (!reg || !trab) return null;
              return (
                <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
                  <div style={{...S.card,maxWidth:460,width:"100%",border:"2px solid #e67e22"}}>
                    <h3 style={{color:"#e67e22",marginTop:0}}>⏰ Entrada Anticipada — Validar</h3>
                    <div style={{background:"rgba(15,13,8,0.7)",borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:13}}>
                      <div><strong style={{color:"#C9A84C"}}>{nombreCompleto(trab)}</strong> <span style={{color:"#9A8A6A"}}>({trab.codigo})</span></div>
                      <div style={{marginTop:4}}>Fecha: <strong>{reg.fecha}</strong> | Hora marcada: <strong style={{color:"#e67e22"}}>{reg.entrada}</strong></div>
                    </div>
                    <div style={{marginBottom:14}}>
                      <label style={S.lbl}>Hora corregida (si rechaza)</label>
                      <input type="time" step="60" style={S.input}
                        value={entradaAnticModal.horaCorregida || "08:00"}
                        onChange={e => setEntradaAnticModal(p => ({...p, horaCorregida: e.target.value}))} />
                      <div style={{color:"#9A8A6A",fontSize:11,marginTop:4}}>
                        Si aprueba se mantiene {reg.entrada}. Si corrige se registra la hora indicada.
                      </div>
                    </div>
                    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                      <button onClick={() => aprobarEntradaAnticipada(entradaAnticModal.id)} style={S.btnG}>
                        ✓ Aprobar ({reg.entrada})
                      </button>
                      <button onClick={() => corregirEntradaAnticipada(entradaAnticModal.id, entradaAnticModal.horaCorregida || "08:00")} style={S.btnD}>
                        ✏️ Corregir a {entradaAnticModal.horaCorregida || "08:00"}
                      </button>
                      <button onClick={() => setEntradaAnticModal(null)} style={S.btnS}>Cancelar</button>
                    </div>
                  </div>
                </div>
              );
            })()}

          </div>
        )}
        {/* ── TAB: ASISTENCIA ─────────────────────────────── */}
        {tabAdmin==="asistencia" && (
          <div style={{marginTop:4}}>
            {/* Subtabs */}
            <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
              {[
                {k:"ver",    l:"📋 Ver Registros"},
                {k:"manual", l:"✏️ Ingresar / Editar"},
                {k:"hoja",   l:"📄 Hoja Mensual PDF"},
              ].map(st=>(
                <button key={st.k}
                  onClick={()=>setSubTabAsist(st.k)}
                  style={{...S.tab(subTabAsist===st.k),borderRadius:8,padding:"8px 16px"}}>
                  {st.l}
                </button>
              ))}
            </div>

            {/* ── Subtab: VER REGISTROS ── */}
            {subTabAsist==="ver" && (
              <div style={S.card}>
                <h3 style={{color:"#C9A84C",marginTop:0}}>📋 Registros de Asistencia</h3>
                {/* Filtros */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:14}}>
                  <div>
                    <label style={S.lbl}>Trabajador</label>
                    <select style={{...S.sel,width:"100%"}} value={filtroRegTrab} onChange={e=>setFiltroRegTrab(e.target.value)}>
                      <option value="">— Todos —</option>
                      {trabajadores.filter(t=>t.activo&&t.id!==999).map(t=>(
                        <option key={t.id} value={t.id}>{nombreCompleto(t)} ({t.codigo})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={S.lbl}>Mes</label>
                    <select style={{...S.sel,width:"100%"}} value={filtroRegMes} onChange={e=>setFiltroRegMes(e.target.value)}>
                      <option value="">— Todos —</option>
                      {Array.from({length:12},(_,i)=><option key={i} value={i}>{mesNombre(i)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={S.lbl}>Año</label>
                    <select style={{...S.sel,width:"100%"}} value={filtroRegAnio} onChange={e=>setFiltroRegAnio(e.target.value)}>
                      <option value="">— Todos —</option>
                      {[2024,2025,2026,2027].map(a=><option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                </div>
                {regEditMsg.txt && <div style={regEditMsg.tipo==="err"?S.err:S.ok}>{regEditMsg.txt}</div>}
                <div style={{overflowX:"auto"}}>
                  <table style={S.tbl}>
                    <thead><tr>
                      {["Trabajador","Código","Fecha","Entrada","Salida","H. Extra","Estado","Tipo","Acciones"].map(h=><th key={h} style={S.th}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {[...registros].reverse()
                        .filter(r=>{
                          if(filtroRegTrab && r.tId!==Number(filtroRegTrab)) return false;
                          if(filtroRegMes!=="" && new Date(r.fecha+"T12:00:00").getMonth()!==Number(filtroRegMes)) return false;
                          if(filtroRegAnio && new Date(r.fecha+"T12:00:00").getFullYear()!==Number(filtroRegAnio)) return false;
                          return true;
                        })
                        .map(r=>{
                          const t=trabajadores.find(x=>x.id===r.tId);
                          const h=r.salida?calcularHoras(r.entrada,r.salida,r.fecha):null;
                          const esp=esEspecial(r.fecha);
                          const editando=regEditando===r.id;
                          return (
                            <tr key={r.id} style={{background:editando?"rgba(41,128,185,0.15)":esp?"rgba(142,68,173,0.09)":"transparent"}}>
                              <td style={S.td}>{t?nombreCompleto(t):"—"}</td>
                              <td style={{...S.td,color:"#C9A84C",fontWeight:"bold"}}>{t?.codigo}</td>
                              <td style={S.td}>
                                {editando
                                  ? <input type="date" style={{...S.input,padding:"4px 8px",fontSize:12,width:130}} value={regEditFecha} onChange={e=>setRegEditFecha(e.target.value)}/>
                                  : r.fecha}
                              </td>
                              <td style={S.td}>
                                {editando
                                  ? <input type="time" step="60" style={{...S.input,padding:"4px 8px",fontSize:12,width:90}} value={regEditEnt} onChange={e=>setRegEditEnt(e.target.value)}/>
                                  : <span style={{color:r.entradaAnticipada?"#e67e22":"inherit"}}>{r.entrada}</span>}
                              </td>
                              <td style={S.td}>
                                {editando
                                  ? <input type="time" step="60" style={{...S.input,padding:"4px 8px",fontSize:12,width:90}} value={regEditSal} onChange={e=>setRegEditSal(e.target.value)}/>
                                  : r.salida||<span style={{color:"#aaa"}}>—</span>}
                              </td>
                              <td style={{...S.td,color:h?.extra>0&&r.estado==="aprobado"?"#FFD700":"#aaa"}}>
                                {h?`${h.extra}h${r.estado!=="aprobado"&&h.extra>0?" ⏳":""}` : "—"}
                              </td>
                              <td style={S.td}>
                                <span style={S.bdg(r.estado==="aprobado"?"#27ae60":r.estado==="rechazado"?"#c0392b":r.entradaAnticipada?"#e67e22":"#e67e22")}>
                                  {r.entradaAnticipada?"⏰ Ant.":r.estado==="aprobado"?"✓ Apr":r.estado==="rechazado"?"✗ Rec":"● Pend"}
                                </span>
                                {r.motivoRechazo&&<div style={{color:"#ffaaaa",fontSize:11,marginTop:2}}>{r.motivoRechazo}</div>}
                              </td>
                              <td style={S.td}>
                                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                                  {r.manual&&<span style={S.bdg("#2980b9")}>Manual</span>}
                                  {esp&&<span style={S.bdg(esDomingo(r.fecha)?"#8e44ad":"#c0392b")}>{esDomingo(r.fecha)?"Dom":"Fer"}</span>}
                                </div>
                              </td>
                              <td style={S.td}>
                                {editando ? (
                                  <div style={{display:"flex",gap:4}}>
                                    <button onClick={guardarEdicion} style={S.btnG}>✓</button>
                                    <button onClick={cancelarEdicion} style={S.btnD}>✗</button>
                                  </div>
                                ) : (
                                  <button onClick={()=>iniciarEdicion(r)} style={{...S.btnS,fontSize:11,padding:"4px 10px"}}>✏️</button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Subtab: MANUAL ── */}
            {subTabAsist==="manual" && (
              <div style={S.card}>
                <h3 style={{color:"#C9A84C",marginTop:0}}>✏️ Ingresar Registro Manual</h3>
                <p style={{color:"#9A8A6A",fontSize:12,marginTop:0,marginBottom:16}}>
                  Usa esta opción cuando un trabajador haya olvidado marcar. Los registros manuales quedan con etiqueta <span style={S.bdg("#2980b9")}>Manual</span>.
                </p>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                  <div style={{gridColumn:"1/-1"}}>
                    <label style={S.lbl}>Trabajador</label>
                    <select style={{...S.sel,width:"100%"}} value={regManTrabId} onChange={e=>setRegManTrabId(e.target.value)}>
                      <option value="">— Seleccionar trabajador —</option>
                      {trabajadores.filter(t=>t.activo&&t.id!==999).map(t=>(
                        <option key={t.id} value={t.id}>{nombreCompleto(t)} ({t.codigo})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={S.lbl}>Fecha</label>
                    <input type="date" style={S.input} value={regManFecha} onChange={e=>setRegManFecha(e.target.value)}/>
                  </div>
                  <div style={{background:"rgba(12,10,5,0.6)",borderRadius:8,padding:"10px 14px",fontSize:12,color:"#9A8A6A"}}>
                    {regManFecha&&(
                      <>
                        <div>📅 {new Date(regManFecha+"T12:00:00").toLocaleDateString("es-CL",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>
                        {esEspecial(regManFecha)&&<div style={{color:"#e67e22",marginTop:4}}>⚠️ {esDomingo(regManFecha)?"Domingo":"Feriado"} — generará día compensatorio</div>}
                        {esViernes(regManFecha)&&!esEspecial(regManFecha)&&<div style={{color:"#9A8A6A",marginTop:4}}>Viernes — jornada hasta 14:00</div>}
                      </>
                    )}
                  </div>
                  <div>
                    <label style={S.lbl}>Hora de Entrada</label>
                    <input type="time" step="60" style={S.input} value={regManEntrada} onChange={e=>setRegManEntrada(e.target.value)}/>
                  </div>
                  <div>
                    <label style={S.lbl}>Hora de Salida <span style={{color:"#aaa",fontWeight:"normal"}}>(opcional)</span></label>
                    <input type="time" step="60" style={S.input} value={regManSalida} onChange={e=>setRegManSalida(e.target.value)}/>
                  </div>
                </div>
                {regManTrabId&&regManFecha&&regManEntrada&&regManSalida&&(
                  <div style={{background:"rgba(15,13,8,0.7)",borderRadius:8,padding:"12px 16px",marginTop:14,fontSize:12}}>
                    <div style={{color:"#9A8A6A",fontWeight:"bold",marginBottom:6}}>Preview:</div>
                    {(()=>{
                      const hc=calcularHoras(regManEntrada,regManSalida,regManFecha);
                      return <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
                        <span>H. normales: <strong style={{color:"#27ae60"}}>{hc.normales}h</strong></span>
                        <span>H. extra: <strong style={{color:hc.extra>0?"#FFD700":"#aaa"}}>{hc.extra}h</strong></span>
                        {hc.extra>0&&<span style={{color:"#e67e22"}}>⚠️ Pendiente de aprobación</span>}
                      </div>;
                    })()}
                  </div>
                )}
                <div style={{marginTop:16,display:"flex",gap:10}}>
                  <button onClick={guardarRegistroManual} style={S.btn}>💾 Guardar Registro</button>
                </div>
                {regManMsg.txt&&<div style={regManMsg.tipo==="err"?S.err:S.ok}>{regManMsg.txt}</div>}

                {/* Registros recientes del trabajador seleccionado */}
                {regManTrabId&&(
                  <div style={{marginTop:20}}>
                    <h4 style={{color:"#9A8A6A",marginBottom:10}}>
                      Registros recientes — {nombreCompleto(trabajadores.find(t=>t.id===Number(regManTrabId)))}
                    </h4>
                    <div style={{overflowX:"auto"}}>
                      <table style={S.tbl}><thead><tr>
                        {["Fecha","Entrada","Salida","H. Extra","Estado","Tipo","Editar"].map(h=><th key={h} style={S.th}>{h}</th>)}
                      </tr></thead><tbody>
                      {[...registros.filter(r=>r.tId===Number(regManTrabId))].reverse().slice(0,15).map(r=>{
                        const h=r.salida?calcularHoras(r.entrada,r.salida,r.fecha):null;
                        const editando=regEditando===r.id;
                        return (
                          <tr key={r.id} style={{background:editando?"rgba(41,128,185,0.2)":"transparent"}}>
                            <td style={S.td}>{editando?<input type="date" style={{...S.input,padding:"4px 8px",fontSize:12,width:130}} value={regEditFecha} onChange={e=>setRegEditFecha(e.target.value)}/>:r.fecha}</td>
                            <td style={S.td}>{editando?<input type="time" step="60" style={{...S.input,padding:"4px 8px",fontSize:12,width:90}} value={regEditEnt} onChange={e=>setRegEditEnt(e.target.value)}/>:r.entrada}</td>
                            <td style={S.td}>{editando?<input type="time" step="60" style={{...S.input,padding:"4px 8px",fontSize:12,width:90}} value={regEditSal} onChange={e=>setRegEditSal(e.target.value)}/>:r.salida||<span style={{color:"#aaa"}}>—</span>}</td>
                            <td style={{...S.td,color:h?.extra>0?"#FFD700":"#aaa"}}>{h?`${h.extra}h`:"—"}</td>
                            <td style={S.td}><span style={S.bdg(r.estado==="aprobado"?"#27ae60":r.estado==="rechazado"?"#c0392b":"#e67e22")}>{r.estado==="aprobado"?"✓ Apr":r.estado==="rechazado"?"✗ Rec":"● Pend"}</span></td>
                            <td style={S.td}>{r.manual&&<span style={S.bdg("#2980b9")}>Manual</span>}</td>
                            <td style={S.td}>{editando?<div style={{display:"flex",gap:4}}><button onClick={guardarEdicion} style={S.btnG}>✓</button><button onClick={cancelarEdicion} style={S.btnD}>✗</button></div>:<button onClick={()=>iniciarEdicion(r)} style={{...S.btnS,fontSize:11,padding:"4px 10px"}}>✏️</button>}</td>
                          </tr>
                        );
                      })}
                      </tbody></table>
                    </div>
                    {regEditMsg.txt&&<div style={regEditMsg.tipo==="err"?S.err:S.ok}>{regEditMsg.txt}</div>}
                  </div>
                )}
              </div>
            )}

            {/* ── Subtab: HOJA MENSUAL ── */}
            {subTabAsist==="hoja" && (
              <div style={S.card}>
                <h3 style={{color:"#C9A84C",marginTop:0}}>📄 Hoja de Asistencia Mensual</h3>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr auto",gap:12,alignItems:"end",marginBottom:16}}>
                  <div>
                    <label style={S.lbl}>Trabajador</label>
                    <select style={{...S.sel,width:"100%"}} value={hojaAsistTrabId} onChange={e=>setHojaAsistTrabId(e.target.value)}>
                      <option value="">— Todos —</option>
                      {trabajadores.filter(t=>t.activo&&t.id!==999).map(t=>(
                        <option key={t.id} value={t.id}>{nombreCompleto(t)} ({t.codigo})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={S.lbl}>Mes</label>
                    <select style={{...S.sel,width:"100%"}} value={hojaAsistMes} onChange={e=>setHojaAsistMes(Number(e.target.value))}>
                      {Array.from({length:12},(_,i)=><option key={i} value={i}>{mesNombre(i)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={S.lbl}>Año</label>
                    <select style={{...S.sel,width:"100%"}} value={hojaAsistAnio} onChange={e=>setHojaAsistAnio(Number(e.target.value))}>
                      {[2024,2025,2026,2027].map(a=><option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  <button onClick={()=>generarHojaAsistenciaPDF(hojaAsistTrabId,hojaAsistMes,hojaAsistAnio)} style={{...S.btn,background:"#27ae60",color:"#fff"}}>
                    🖨 Generar PDF
                  </button>
                </div>
                <div style={{...S.notif,fontSize:12,marginBottom:16}}>
                  ℹ Sin filtro de trabajador genera una hoja por cada trabajador activo. Domingos y feriados en amarillo.
                </div>
                {/* Preview en pantalla */}
                {(()=>{
                  const tFilt=hojaAsistTrabId?trabajadores.filter(t=>t.id===Number(hojaAsistTrabId)):trabajadores.filter(t=>t.activo&&t.id!==999);
                  return tFilt.map(t=>{
                    const regsT=registros.filter(r=>r.tId===t.id);
                    const diasEnMes=new Date(hojaAsistAnio,hojaAsistMes+1,0).getDate();
                    const regsDelMes=regsT.filter(r=>{const d=new Date(r.fecha+"T12:00:00");return d.getMonth()===hojaAsistMes&&d.getFullYear()===hojaAsistAnio;});
                    let totalExt=0;
                    regsDelMes.forEach(r=>{if(r.salida){const h=calcularHoras(r.entrada,r.salida,r.fecha);totalExt+=h.extra;}});
                    return (
                      <div key={t.id} style={{...S.card,marginTop:12,padding:14}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
                          <span style={{color:"#FF6B00",fontWeight:"bold"}}>{nombreCompleto(t)} <span style={{color:"#9A8A6A",fontSize:12}}>({t.codigo})</span></span>
                          <div style={{display:"flex",gap:16,fontSize:12}}>
                            <span>📆 <strong style={{color:"#27ae60"}}>{regsDelMes.length}</strong> días</span>
                            <span>⏱ <strong style={{color:totalExt>0?"#FFD700":"#aaa"}}>{totalExt>0?totalExt.toFixed(1)+"h extra":"sin extra"}</strong></span>
                          </div>
                        </div>
                        <div style={{overflowX:"auto"}}>
                          <table style={{...S.tbl,fontSize:11}}>
                            <thead><tr>{["Día","Sem","Entrada","Salida","H. Norm","H. Extra","Obs."].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                            <tbody>
                              {Array.from({length:diasEnMes},(_,i)=>{
                                const d=String(i+1).padStart(2,"0");const m=String(hojaAsistMes+1).padStart(2,"0");
                                const fecha=`${hojaAsistAnio}-${m}-${d}`;
                                const reg=regsT.find(r=>r.fecha===fecha);
                                const diaN=new Date(fecha+"T12:00:00").getDay();
                                const h=reg&&reg.salida?calcularHoras(reg.entrada,reg.salida,fecha):null;
                                const bgC=esDomingo(fecha)||esFeriado(fecha)?"rgba(255,215,0,0.08)":diaN===6?"rgba(255,255,255,0.03)":"transparent";
                                const dias=["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
                                return (
                                  <tr key={fecha} style={{background:bgC}}>
                                    <td style={{...S.td,fontWeight:"bold",textAlign:"center"}}>{i+1}</td>
                                    <td style={{...S.td,color:"#9A8A6A",textAlign:"center"}}>{dias[diaN]}</td>
                                    <td style={{...S.td,textAlign:"center",color:reg?.entradaAnticipada?"#e67e22":"inherit"}}>{reg?reg.entrada:"—"}</td>
                                    <td style={{...S.td,textAlign:"center"}}>{reg&&reg.salida?reg.salida:"—"}</td>
                                    <td style={{...S.td,textAlign:"center",color:h?"#27ae60":"#aaa"}}>{h?`${h.normales}h`:"—"}</td>
                                    <td style={{...S.td,textAlign:"center",color:h&&h.extra>0?"#FFD700":"#aaa",fontWeight:h&&h.extra>0?"bold":"normal"}}>{h&&h.extra>0?`${h.extra}h`:"—"}</td>
                                    <td style={{...S.td,fontSize:10,color:"#9A8A6A"}}>{esFeriado(fecha)?"Feriado":esDomingo(fecha)?"Domingo":reg?.entradaAnticipada?"⏰ Ant.":""}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>
        )}
        {/* ── TAB: NÓMINA ───────────────────────────────── */}
        {tabAdmin==="nomina" && (
          <div style={{marginTop:4}}>

            {/* ── Subtabs ── */}
            <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
              {[
                {k:"lista",  l:"👥 Lista y Alta"},
                {k:"fichas", l:"🪪 Fichas de Personal"},
              ].map(st=>(
                <button key={st.k}
                  onClick={()=>{
                    setSubTabNomina(st.k);
                    setFichaMode("ver");
                    setFichaDraft(null);
                    setFichaGuardMsg({tipo:"",txt:""});
                    if(st.k==="fichas"&&!fichaSelId){
                      const p=trabajadores.filter(x=>x.activo&&x.id!==999)[0];
                      if(p) setFichaSelId(p.id);
                    }
                  }}
                  style={{...S.tab(subTabNomina===st.k),borderRadius:8,padding:"8px 16px"}}>
                  {st.l}
                </button>
              ))}
              {/* Botón Nueva Ficha visible en ambos subtabs */}
              <button
                onClick={()=>{
                  setSubTabNomina("fichas");
                  setFichaMode("nuevo");
                  setFichaSelId(null);
                  setFichaDraft(fichaBorrador());
                  setFichaGuardMsg({tipo:"",txt:""});
                }}
                style={{...S.btn, marginLeft:"auto", fontSize:13, padding:"8px 20px"}}>
                ➕ Nueva Ficha
              </button>
            </div>

            {fichaGuardMsg.txt && (
              <div style={{...fichaGuardMsg.tipo==="err"?S.err:S.ok, marginBottom:12}}>
                {fichaGuardMsg.txt}
              </div>
            )}

            {/* ════════════════════════════════════════════════
                SUBTAB: LISTA Y ALTA
                ════════════════════════════════════════════════ */}
            {subTabNomina==="lista" && (
              <div style={S.card}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:10}}>
                  <h3 style={{color:"#C9A84C",margin:0}}>👥 Nómina de Trabajadores</h3>
                  <button
                    onClick={()=>{
                      setSubTabNomina("fichas");
                      setFichaMode("nuevo");
                      setFichaSelId(null);
                      setFichaDraft(fichaBorrador());
                      setFichaGuardMsg({tipo:"",txt:""});
                    }}
                    style={{...S.btn,fontSize:13}}>
                    ➕ Nuevo Trabajador
                  </button>
                </div>
                <div style={{overflowX:"auto"}}>
                  <table style={S.tbl}>
                    <thead><tr>
                      {["Código","Nombre Completo","RUT","Cargo","AFP","Previsión","F. Ingreso","Estado","Acciones"].map(h=>(
                        <th key={h} style={S.th}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {trabajadores.filter(t=>t.id!==999).map(t=>(
                        <tr key={t.id} style={{opacity:t.activo?1:0.5}}>
                          <td style={{...S.td,color:"#C9A84C",fontWeight:"bold",fontSize:14}}>{t.codigo}</td>
                          <td style={{...S.td,fontWeight:"bold"}}>{nombreCompleto(t)}</td>
                          <td style={S.td}>{t.rut}</td>
                          <td style={{...S.td,color:"#9A8A6A",fontSize:12}}>{t.ficha?.cargo||"—"}</td>
                          <td style={S.td}>{t.ficha?.afp||"—"}</td>
                          <td style={S.td}>{t.ficha?.prevision||"—"}</td>
                          <td style={{...S.td,fontSize:12}}>{t.ficha?.fechaIngreso||"—"}</td>
                          <td style={S.td}>
                            <span style={S.bdg(t.ficha?.fechaSalida?"#c0392b":t.activo?"#27ae60":"#7f8c8d")}>
                              {t.ficha?.fechaSalida?"Desvinculado":t.activo?"Activo":"Inactivo"}
                            </span>
                          </td>
                          <td style={S.td}>
                            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                              <button
                                onClick={()=>{
                                  setSubTabNomina("fichas");
                                  setFichaSelId(t.id);
                                  setFichaMode("ver");
                                  setFichaDraft(null);
                                  setFichaGuardMsg({tipo:"",txt:""});
                                }}
                                style={S.btnB}>
                                📋 Ver Ficha
                              </button>
                              <button
                                onClick={()=>setTrabajadores(p=>p.map(x=>x.id===t.id?{...x,activo:!x.activo}:x))}
                                style={S.btnS}>
                                {t.activo?"Desactivar":"Activar"}
                              </button>
                              <button
                                onClick={()=>{if(window.confirm(`¿Eliminar a ${nombreCompleto(t)}?`)) setTrabajadores(p=>p.filter(x=>x.id!==t.id));}}
                                style={S.btnD}>
                                🗑
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {/* Fila perfil de prueba */}
                      <tr style={{opacity:0.4}}>
                        <td style={{...S.td,color:"#aaa",fontSize:12}}>Administrador</td>
                        <td style={S.td}>Administrador Pruebas</td>
                        <td style={S.td}>Pruebas</td>
                        <td colSpan={5} style={{...S.td,color:"#aaa",fontSize:11}}>Perfil de prueba del sistema — no eliminar</td>
                        <td style={S.td}></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div style={{marginTop:10,color:"#9A8A6A",fontSize:12,textAlign:"right"}}>
                  Total activos: <strong style={{color:"#C9A84C"}}>{trabajadores.filter(t=>t.activo&&t.id!==999).length}</strong> trabajadores
                </div>
              </div>
            )}

            {/* ════════════════════════════════════════════════
                SUBTAB: FICHAS DE PERSONAL
                ════════════════════════════════════════════════ */}
            {subTabNomina==="fichas" && (
              <div style={{display:"flex",gap:14,flexWrap:"wrap",marginTop:4}}>

                {/* ════ LISTA LATERAL ════ */}
                <div style={{width:200,flexShrink:0}}>
                  <div style={{background:"rgba(8,6,3,0.5)",border:"1px solid rgba(255,255,255,0.08)",
                    borderRadius:12,padding:14,position:"sticky",top:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                      <span style={{color:"#FF6B00",fontWeight:"bold",fontSize:11,textTransform:"uppercase",letterSpacing:1.5}}>Personal</span>
                      <span style={{background:"rgba(255,107,0,0.2)",color:"#FF6B00",fontSize:10,
                        fontWeight:"bold",padding:"2px 8px",borderRadius:10}}>
                        {trabajadores.filter(t=>t.activo&&t.id!==999).length}
                      </span>
                    </div>
                    <button onClick={()=>{setFichaMode("nuevo");setFichaSelId(null);setFichaDraft(fichaBorrador());setFichaGuardMsg({tipo:"",txt:""});setHistMsg({tipo:"",txt:""});}}
                      style={{display:"block",width:"100%",background:"linear-gradient(135deg,#FF6B00,#e55a00)",
                        color:"#fff",border:"none",borderRadius:8,padding:"9px 0",cursor:"pointer",
                        fontWeight:"bold",fontSize:12,fontFamily:"Georgia,serif",marginBottom:12,
                        boxShadow:"0 2px 8px rgba(255,107,0,0.3)"}}>
                      ➕ Nueva Ficha
                    </button>
                    <div style={{borderBottom:"1px solid rgba(255,255,255,0.08)",marginBottom:10}}/>
                    {trabajadores.filter(t=>t.activo&&t.id!==999).map(t=>(
                      <button key={t.id}
                        onClick={()=>{setFichaSelId(t.id);setFichaMode("ver");setFichaDraft(null);setFichaGuardMsg({tipo:"",txt:""});setHistNuevo({desde:"",sueldo:"",colacion:"",movilizacion:"",gratificacion:false,motivo:""});setHistMsg({tipo:"",txt:""});}}
                        style={{display:"block",width:"100%",textAlign:"left",
                          background:t.id===fichaSelId&&fichaMode!=="nuevo"?"rgba(255,107,0,0.2)":"rgba(255,255,255,0.03)",
                          border:t.id===fichaSelId&&fichaMode!=="nuevo"?"1px solid rgba(255,107,0,0.6)":"1px solid rgba(255,255,255,0.06)",
                          borderRadius:8,padding:"10px 12px",cursor:"pointer",marginBottom:6,fontFamily:"Georgia,serif",transition:"all 0.15s"}}>
                        <div style={{color:t.id===fichaSelId&&fichaMode!=="nuevo"?"#FF6B00":"#FFD700",fontWeight:"bold",fontSize:11,letterSpacing:1}}>{t.codigo}</div>
                        <div style={{color:"#fff",fontSize:12,marginTop:2,fontWeight:"bold"}}>{t.nombre} {t.apellido}</div>
                        {t.apellidoM&&<div style={{color:"#9A8A6A",fontSize:11}}>{t.apellidoM}</div>}
                        <div style={{color:"#7A6A4A",fontSize:10,marginTop:2}}>{t.rut}</div>
                        {t.ficha?.fechaSalida&&(
                          <div style={{background:"rgba(192,57,43,0.3)",color:"#ffaaaa",fontSize:9,
                            fontWeight:"bold",padding:"1px 6px",borderRadius:4,marginTop:3,display:"inline-block"}}>
                            DESVINCULADO
                          </div>
                        )}
                      </button>
                    ))}
                    {fichaMode==="nuevo"&&(
                      <div style={{background:"rgba(255,215,0,0.08)",border:"1px dashed rgba(255,215,0,0.4)",
                        borderRadius:8,padding:"10px 12px",fontSize:11,color:"#C9A84C",marginTop:6}}>
                        ✏️ Nueva ficha en proceso...
                      </div>
                    )}
                  </div>
                </div>

                {/* ════ PANEL FICHA ════ */}
                <div style={{flex:1,minWidth:0}}>
                  {/* Encabezado estado */}
                  <div style={{
                    background: fichaMode==="nuevo"
                      ?"linear-gradient(135deg,rgba(255,215,0,0.12),rgba(255,215,0,0.04))"
                      :fichaMode==="editar"
                        ?"linear-gradient(135deg,rgba(41,128,185,0.15),rgba(41,128,185,0.05))"
                        :"linear-gradient(135deg,rgba(255,107,0,0.12),rgba(255,107,0,0.04))",
                    border: fichaMode==="nuevo"?"1px solid rgba(255,215,0,0.4)"
                      :fichaMode==="editar"?"1px solid rgba(41,128,185,0.4)"
                      :"1px solid rgba(255,107,0,0.3)",
                    borderRadius:14,padding:"16px 20px",marginBottom:14}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
                      <div>
                        {fichaMode==="nuevo"?(
                          <>
                            <div style={{color:"#C9A84C",fontWeight:"bold",fontSize:18}}>✏️ Nueva Ficha de Trabajador</div>
                            {fichaDraft?.apellido&&(
                              <div style={{color:"#9A8A6A",fontSize:12,marginTop:3}}>
                                Código que se asignará: <strong style={{color:"#C9A84C",fontSize:14}}>
                                  {generarCodigo(fichaDraft.apellido,trabajadores.filter(t=>t.id!==999))}
                                </strong>
                              </div>
                            )}
                          </>
                        ):fichaMode==="editar"?(
                          <>
                            <div style={{color:"#3498db",fontWeight:"bold",fontSize:18}}>✏️ Editando Ficha</div>
                            <div style={{color:"#9A8A6A",fontSize:12,marginTop:3}}>
                              {[fichaDraft?.nombre,fichaDraft?.apellido,fichaDraft?.apellidoM].filter(Boolean).join(" ")}
                            </div>
                          </>
                        ):trabajadores.find(t=>t.id===fichaSelId)?(()=>{
                          const tr=trabajadores.find(t=>t.id===fichaSelId);
                          return <>
                            <div style={{color:"#FF6B00",fontWeight:"bold",fontSize:20}}>{tr.nombre} {tr.apellido} {tr.apellidoM}</div>
                            <div style={{display:"flex",gap:12,marginTop:4,flexWrap:"wrap",fontSize:12}}>
                              <span style={{color:"#9A8A6A"}}>Código: <strong style={{color:"#C9A84C"}}>{tr.codigo}</strong></span>
                              <span style={{color:"#9A8A6A"}}>RUT: <strong style={{color:"#fff"}}>{tr.rut}</strong></span>
                              {tr.ficha?.cargo&&<span style={{color:"#9A8A6A"}}>Cargo: <strong style={{color:"#fff"}}>{tr.ficha.cargo}</strong></span>}
                              {tr.ficha?.fechaIngreso&&<span style={{color:"#9A8A6A"}}>Desde: <strong style={{color:"#fff"}}>{tr.ficha.fechaIngreso}</strong></span>}
                            </div>
                          </>;
                        })():null}
                      </div>
                      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                        {fichaMode==="ver"&&trabajadores.find(t=>t.id===fichaSelId)&&(()=>{
                          const tr=trabajadores.find(t=>t.id===fichaSelId);
                          return <>
                            <span style={{background:tr.ficha?.fechaSalida?"rgba(192,57,43,0.3)":tr.activo?"rgba(39,174,96,0.25)":"rgba(127,140,141,0.3)",
                              color:tr.ficha?.fechaSalida?"#ffaaaa":tr.activo?"#aaffcc":"#ccc",
                              border:`1px solid ${tr.ficha?.fechaSalida?"#c0392b":tr.activo?"#27ae60":"#7f8c8d"}`,
                              borderRadius:20,padding:"4px 14px",fontSize:11,fontWeight:"bold"}}>
                              {tr.ficha?.fechaSalida?"⬛ Desvinculado":tr.activo?"● Activo":"○ Inactivo"}
                            </span>
                            <button onClick={()=>{setFichaMode("editar");setFichaDraft({nombre:tr.nombre,apellido:tr.apellido,apellidoM:tr.apellidoM||"",rut:tr.rut,...tr.ficha});setFichaGuardMsg({tipo:"",txt:""});}}
                              style={{background:"rgba(41,128,185,0.2)",color:"#3498db",border:"1px solid rgba(41,128,185,0.5)",
                                borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:"bold",fontSize:12,fontFamily:"Georgia,serif"}}>
                              ✏️ Editar
                            </button>
                          </>;
                        })()}
                        {(fichaMode==="nuevo"||fichaMode==="editar")&&(
                          <>
                            <button onClick={fichaMode==="nuevo"?grabarNuevoTrabajador:grabarEdicionFicha}
                              style={{background:"linear-gradient(135deg,#27ae60,#1e8449)",color:"#fff",border:"none",
                                borderRadius:8,padding:"10px 24px",cursor:"pointer",fontWeight:"bold",fontSize:14,
                                fontFamily:"Georgia,serif",boxShadow:"0 3px 10px rgba(39,174,96,0.4)"}}>
                              💾 Grabar
                            </button>
                            <button onClick={()=>{setFichaMode("ver");setFichaDraft(null);setFichaGuardMsg({tipo:"",txt:""});if(!fichaSelId){const p=trabajadores.filter(x=>x.activo&&x.id!==999)[0];if(p)setFichaSelId(p.id);}}}
                              style={{background:"rgba(22,20,12,0.8)",color:"#9A8A6A",border:"1px solid rgba(255,255,255,0.2)",
                                borderRadius:8,padding:"10px 16px",cursor:"pointer",fontSize:12,fontFamily:"Georgia,serif"}}>
                              ✗ Cancelar
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {fichaGuardMsg.txt&&(
                      <div style={{...(fichaGuardMsg.tipo==="err"
                        ?{background:"rgba(192,57,43,0.3)",border:"1px solid #c0392b",color:"#ffaaaa"}
                        :{background:"rgba(39,174,96,0.3)",border:"1px solid #27ae60",color:"#aaffcc"}),
                        borderRadius:8,padding:"9px 14px",marginTop:10,fontSize:13}}>
                        {fichaGuardMsg.txt}
                      </div>
                    )}
                  </div>

                  {/* COMPONENTE FORMULARIO — estable, sin IIFE */}
                  <FichaForm
                    fichaMode={fichaMode}
                    fichaDraft={fichaDraft}
                    trabReal={trabajadores.find(t=>t.id===fichaSelId)||null}
                    fichaSelId={fichaSelId}
                    setFichaMode={setFichaMode}
                    setFichaDraft={setFichaDraft}
                    setFichaSelId={setFichaSelId}
                    fichaGuardMsg={fichaGuardMsg}
                    setFichaGuardMsg={setFichaGuardMsg}
                    trabajadores={trabajadores}
                    setTrabajadores={setTrabajadores}
                    histNuevo={histNuevo}
                    setHistNuevo={setHistNuevo}
                    histMsg={histMsg}
                    setHistMsg={setHistMsg}
                    grabarNuevoTrabajador={grabarNuevoTrabajador}
                    grabarEdicionFicha={grabarEdicionFicha}
                    grabarNuevaRemuneracion={grabarNuevaRemuneracion}
                    generarCodigo={generarCodigo}
                    fmtRut={fmtRut}
                    nowId={nowId}
                    hoy={hoy}
                    S={S}
                  />
                </div>
              </div>
            )}
          </div>
        )}

                {/* ── TAB: LIQUIDACIONES ADMIN ────────────────── */}
        {tabAdmin==="liquidaciones" && (
          <div style={{ marginTop:4 }}>
            {/* Generador */}
            <div style={S.card}>
              <h3 style={{ color:"#C9A84C", marginTop:0 }}>💰 Generar Liquidación de Sueldo</h3>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr auto", gap:12, alignItems:"end", marginBottom:16 }}>
                <div>
                  <label style={S.lbl}>Trabajador</label>
                  <select style={{ ...S.sel, width:"100%" }} value={liqTrabId} onChange={e=>{ setLiqTrabId(e.target.value); setLiqPreview(null); }}>
                    <option value="">— Seleccionar —</option>
                    {trabajadores.filter(t=>t.activo&&t.id!==999).map(t=>(
                      <option key={t.id} value={t.id}>{nombreCompleto(t)} ({t.codigo})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={S.lbl}>Mes</label>
                  <select style={{ ...S.sel, width:"100%" }} value={liqMes} onChange={e=>{ setLiqMes(Number(e.target.value)); setLiqPreview(null); }}>
                    {Array.from({length:12},(_,i)=><option key={i} value={i}>{mesNombre(i)}</option>)}
                  </select>
                </div>
                <div>
                  <label style={S.lbl}>Año</label>
                  <select style={{ ...S.sel, width:"100%" }} value={liqAnio} onChange={e=>{ setLiqAnio(Number(e.target.value)); setLiqPreview(null); }}>
                    {[2024,2025,2026,2027].map(a=><option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <button onClick={generarPreviewLiq} style={S.btn}>Calcular</button>
              </div>
              {liqMsg.txt && <div style={liqMsg.tipo==="err"?S.err:S.ok}>{liqMsg.txt}</div>}

              {/* Preview liquidación */}
              {liqPreview && (
                <div style={{ background:"rgba(15,13,8,0.7)", borderRadius:12, padding:18, marginTop:12, border:"1px solid rgba(255,215,0,0.3)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, flexWrap:"wrap", gap:10 }}>
                    <div>
                      <div style={{ color:"#C9A84C", fontWeight:"bold", fontSize:15 }}>
                        Vista Previa — {liqPreview.nombre}
                      </div>
                      <div style={{ color:"#9A8A6A", fontSize:12 }}>
                        {mesNombre(liqPreview.mes)} {liqPreview.anio} · {liqPreview.diasTrab} días trabajados · {liqPreview.horasExtra}h extra
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:8 }}>
                      <button onClick={()=>imprimirLiquidacion({datos:liqPreview,estado:"borrador",firmadaPor:"",firmadaFecha:"",firmadaHora:""})} style={S.btnS}>🖨 Vista PDF</button>
                      <button onClick={enviarLiquidacion} style={{ ...S.btn, background:"#27ae60", color:"#fff" }}>📤 Enviar al Trabajador</button>
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, fontSize:12 }}>
                    <div style={{ background:"rgba(15,13,8,0.7)", borderRadius:8, padding:"10px 14px" }}>
                      <div style={{ color:"#9A8A6A", fontWeight:"bold", marginBottom:8 }}>HABERES</div>
                      {[
                        ["Sueldo Base", liqPreview.sueldoBase],
                        ...(liqPreview.valorHHExtra>0?[["Horas Extra 50% ("+liqPreview.horasExtra+"h)", liqPreview.valorHHExtra]]:[]),
                        ...(liqPreview.gratif>0?[["Gratificación Legal", liqPreview.gratif]]:[]),
                        ["Total Imponible", liqPreview.totalImponible, true],
                        ["Asig. Colación", liqPreview.colacion],
                        ["Asig. Movilización", liqPreview.movilizacion],
                        ["Total No Imponible", liqPreview.totalNoImponible, true],
                        ["TOTAL HABERES", liqPreview.totalHaberes, true, "#FFD700"],
                      ].map(([l,v,b,c])=>(
                        <div key={l} style={{ display:"flex", justifyContent:"space-between", fontWeight:b?"bold":"normal", color:c||"#fff", borderTop:b?"1px solid rgba(255,255,255,0.1)":"none", paddingTop:b?4:0, marginTop:b?4:2 }}>
                          <span>{l}</span><span>${(v||0).toLocaleString("es-CL")}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ background:"rgba(15,13,8,0.7)", borderRadius:8, padding:"10px 14px" }}>
                      <div style={{ color:"#9A8A6A", fontWeight:"bold", marginBottom:8 }}>DESCUENTOS</div>
                      {[
                        [`Previsión AFP (${liqPreview.pctAFP}%)`, liqPreview.prevision_monto],
                        ["Salud (7%)", liqPreview.salud_monto],
                        ["Seguro Cesantía", liqPreview.segCesantia],
                        ["Total Desc. Legales", liqPreview.totalDescLegales, true],
                        ...(liqPreview.anticipo>0?[["Anticipo", liqPreview.anticipo, false, "#e74c3c"]]:[]),
                        ["Total Otros Desc.", liqPreview.totalOtrosDesc, true],
                        ["TOTAL DESCUENTOS", liqPreview.totalDescuentos, true, "#e74c3c"],
                      ].map(([l,v,b,c])=>(
                        <div key={l} style={{ display:"flex", justifyContent:"space-between", fontWeight:b?"bold":"normal", color:c||"#fff", borderTop:b?"1px solid rgba(255,255,255,0.1)":"none", paddingTop:b?4:0, marginTop:b?4:2 }}>
                          <span>{l}</span><span>${(v||0).toLocaleString("es-CL")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ background:"rgba(30,107,46,0.4)", border:"1px solid #27ae60", borderRadius:8, padding:"12px 18px", marginTop:12, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span style={{ color:"#aaffcc", fontWeight:"bold", fontSize:14 }}>ALCANCE LÍQUIDO</span>
                    <span style={{ color:"#27ae60", fontWeight:"bold", fontSize:22 }}>${liqPreview.alcanceLiquido.toLocaleString("es-CL")}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Historial liquidaciones */}
            <div style={S.card}>
              <h3 style={{ color:"#9A8A6A", marginTop:0 }}>Historial de Liquidaciones Enviadas</h3>
              {liquidaciones.length===0
                ? <div style={{ color:"#9A8A6A", textAlign:"center", padding:30 }}>Sin liquidaciones generadas</div>
                : <div style={{ overflowX:"auto" }}>
                    <table style={S.tbl}>
                      <thead><tr>{["Trabajador","Período","Total Haberes","Descuentos","Alcance Líquido","Estado","Acciones"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                      <tbody>
                        {[...liquidaciones].reverse().map(liq=>{
                          const d=liq.datos;
                          const t=trabajadores.find(x=>x.id===liq.tId);
                          return(
                            <tr key={liq.id}>
                              <td style={S.td}>{t?nombreCompleto(t):"—"} <span style={{color:"#C9A84C",fontSize:11}}>({t?.codigo})</span></td>
                              <td style={S.td}>{mesNombre(liq.mes)} {liq.anio}</td>
                              <td style={{ ...S.td, color:"#C9A84C" }}>${d.totalHaberes.toLocaleString("es-CL")}</td>
                              <td style={{ ...S.td, color:"#e74c3c" }}>${d.totalDescuentos.toLocaleString("es-CL")}</td>
                              <td style={{ ...S.td, color:"#27ae60", fontWeight:"bold" }}>${d.alcanceLiquido.toLocaleString("es-CL")}</td>
                              <td style={S.td}>
                                <span style={S.bdg(liq.estado==="firmada"?"#27ae60":liq.estado==="enviada"?"#e67e22":"#555")}>
                                  {liq.estado==="firmada"?"✓ Firmada":liq.estado==="enviada"?"● Enviada":"Borrador"}
                                </span>
                                {liq.estado==="firmada"&&<div style={{fontSize:10,color:"#aaffcc",marginTop:2}}>{liq.firmadaPor}<br/>{liq.firmadaFecha} {liq.firmadaHora}</div>}
                              </td>
                              <td style={S.td}><button onClick={()=>imprimirLiquidacion(liq)} style={S.btnB}>🖨 PDF</button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
              }
            </div>
          </div>
        )}

        {/* ── TAB: COMPENSATORIOS ────────────────────────── */}
        {tabAdmin==="compensat" && (
          <div>
            <div style={S.card}>
              <h3 style={{ color:"#C9A84C", marginTop:0 }}>📅 Días Compensatorios</h3>
              {compensatorios.length===0 ? (
                <div style={{ color:"#9A8A6A", textAlign:"center", padding:36 }}>No hay días compensatorios</div>
              ) : (
                <div style={{ overflowX:"auto" }}>
                  <table style={S.tbl}>
                    <thead><tr>{["Trabajador","Fecha","Tipo","Estado","Fecha Tomado","Acción"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {compensatorios.map(c => {
                        const t=trabajadores.find(x=>x.id===c.tId);
                        return (
                          <tr key={c.id}>
                            <td style={S.td}>{t?nombreCompleto(t):"—"} <span style={{color:"#C9A84C",fontSize:11}}>({t?.codigo})</span></td>
                            <td style={S.td}>{c.fecha}</td>
                            <td style={S.td}><span style={S.bdg(esDomingo(c.fecha)?"#8e44ad":"#c0392b")}>{esDomingo(c.fecha)?"Dom":"Feriado"}</span></td>
                            <td style={S.td}>
                              <select style={{...S.sel,fontSize:12,padding:"4px 8px"}} value={c.estado} onChange={e=>setComps(p=>p.map(x=>x.id===c.id?{...x,estado:e.target.value}:x))}>
                                <option value="pendiente">⏳ Pendiente</option>
                                <option value="tomado">✅ Tomado</option>
                                <option value="pagado">💰 Pagado</option>
                              </select>
                            </td>
                            <td style={S.td}>
                              {c.estado==="tomado"
                                ? <input type="date" style={{...S.input,width:140,padding:"4px 8px",fontSize:12}} value={c.fechaTomado} onChange={e=>setComps(p=>p.map(x=>x.id===c.id?{...x,fechaTomado:e.target.value}:x))} />
                                : <span style={{color:"#aaa"}}>—</span>}
                            </td>
                            <td style={S.td}><span style={S.bdg(c.estado==="tomado"?"#27ae60":c.estado==="pagado"?"#3498db":"#e67e22")}>{c.estado==="tomado"?"✓ Descontado":c.estado==="pagado"?"💰 Pagado":"● Pendiente"}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {/* Resumen */}
            <div style={S.card}>
              <h4 style={{ color:"#9A8A6A", marginTop:0 }}>Resumen por Trabajador</h4>
              <table style={S.tbl}>
                <thead><tr>{["Trabajador","Total","Tomados","Pagados","Pendientes"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {trabajadores.filter(t=>t.activo&&t.id!==999).map(t=>{
                    const cs=compensatorios.filter(c=>c.tId===t.id);
                    return(
                      <tr key={t.id}>
                        <td style={S.td}>{nombreCompleto(t)} <span style={{color:"#C9A84C"}}>({t.codigo})</span></td>
                        <td style={S.td}>{cs.length}</td>
                        <td style={{...S.td,color:"#27ae60"}}>{cs.filter(c=>c.estado==="tomado").length}</td>
                        <td style={{...S.td,color:"#3498db"}}>{cs.filter(c=>c.estado==="pagado").length}</td>
                        <td style={{...S.td,color:"#e67e22",fontWeight:"bold"}}>{cs.filter(c=>c.estado==="pendiente").length}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB: CALENDARIO ────────────────────────────── */}
        {tabAdmin==="calendario" && (
          <div style={{marginTop:4}}>
            <div style={{...S.card, marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
                <h3 style={{color:"#C9A84C",margin:0}}>🗓 Calendario de Vacaciones y Permisos</h3>
                <div style={{display:"flex",gap:10,alignItems:"center"}}>
                  <button onClick={()=>{
                    const d = new Date(calAnio, calMes-1, 1);
                    setCalMes(d.getMonth()); setCalAnio(d.getFullYear());
                  }} style={{...S.btnS, padding:"6px 14px", fontSize:16}}>‹</button>
                  <span style={{color:"#C9A84C",fontWeight:"bold",fontSize:16,minWidth:160,textAlign:"center"}}>
                    {mesNombre(calMes)} {calAnio}
                  </span>
                  <button onClick={()=>{
                    const d = new Date(calAnio, calMes+1, 1);
                    setCalMes(d.getMonth()); setCalAnio(d.getFullYear());
                  }} style={{...S.btnS, padding:"6px 14px", fontSize:16}}>›</button>
                  <button onClick={()=>{setCalMes(new Date().getMonth());setCalAnio(new Date().getFullYear());}}
                    style={{...S.btn, padding:"6px 14px", fontSize:12}}>Hoy</button>
                </div>
              </div>
            </div>

            {/* Leyenda de colores por trabajador */}
            {(()=>{
              const trabActivos = trabajadores.filter(t=>t.activo&&t.id!==999);
              const COLORES = ["#C9A84C","#3498db","#27ae60","#9b59b6","#e67e22","#e74c3c","#1abc9c","#f39c12","#2ecc71","#e91e63"];

              // Obtener solicitudes aprobadas del mes
              const diasEnMes = new Date(calAnio, calMes+1, 0).getDate();
              const primerDia = new Date(calAnio, calMes, 1).getDay(); // 0=Dom

              // Para cada trabajador, qué días tiene vacaciones/permiso aprobados
              const getEventosTrab = (tId) => {
                const sols = solicitudes.filter(s =>
                  s.tId === tId && s.estado === "aprobado"
                );
                const diasMarcados = new Set();
                sols.forEach(s => {
                  const desde = new Date(s.fechaDesde+"T12:00:00");
                  const hasta = new Date(s.fechaHasta+"T12:00:00");
                  for(let d = new Date(desde); d <= hasta; d.setDate(d.getDate()+1)) {
                    if(d.getMonth()===calMes && d.getFullYear()===calAnio) {
                      diasMarcados.add(d.getDate());
                    }
                  }
                });
                return diasMarcados;
              };

              const eventosPorTrab = {};
              trabActivos.forEach((t,i) => {
                eventosPorTrab[t.id] = {
                  dias: getEventosTrab(t.id),
                  color: COLORES[i % COLORES.length],
                  nombre: `${t.nombre} ${t.apellido}`,
                  codigo: t.codigo,
                };
              });

              return (
                <div>
                  {/* Leyenda */}
                  <div style={{...S.card, display:"flex", flexWrap:"wrap", gap:10, padding:"12px 16px", marginBottom:14}}>
                    {trabActivos.map((t,i) => (
                      <div key={t.id} style={{display:"flex",alignItems:"center",gap:6}}>
                        <div style={{width:12,height:12,borderRadius:3,background:COLORES[i%COLORES.length],flexShrink:0}}/>
                        <span style={{color:"#9A8A6A",fontSize:12}}>{t.nombre} {t.apellido}</span>
                        <span style={{color:"rgba(201,168,76,0.5)",fontSize:11}}>({t.codigo})</span>
                      </div>
                    ))}
                    <div style={{display:"flex",alignItems:"center",gap:6,marginLeft:"auto"}}>
                      <div style={{width:12,height:12,borderRadius:3,background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,100,100,0.4)",flexShrink:0}}/>
                      <span style={{color:"#9A8A6A",fontSize:12}}>Feriado</span>
                      <div style={{width:12,height:12,borderRadius:3,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",flexShrink:0,marginLeft:8}}/>
                      <span style={{color:"#9A8A6A",fontSize:12}}>Fin de semana</span>
                    </div>
                  </div>

                  {/* Grilla del calendario */}
                  <div style={S.card}>
                    {/* Cabeceras días semana */}
                    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:3}}>
                      {["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"].map(d=>(
                        <div key={d} style={{textAlign:"center",fontSize:11,fontWeight:"bold",
                          color:"#C9A84C",padding:"6px 0",letterSpacing:1,textTransform:"uppercase"}}>
                          {d}
                        </div>
                      ))}
                    </div>

                    {/* Días */}
                    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
                      {/* Celdas vacías al inicio */}
                      {Array.from({length:primerDia},(_,i)=>(
                        <div key={`v${i}`} style={{minHeight:80,borderRadius:6,background:"rgba(5,4,2,0.3)"}}/>
                      ))}

                      {/* Días del mes */}
                      {Array.from({length:diasEnMes},(_,i)=>{
                        const dia = i+1;
                        const fechaStr = `${calAnio}-${String(calMes+1).padStart(2,"0")}-${String(dia).padStart(2,"0")}`;
                        const diaSem = new Date(fechaStr+"T12:00:00").getDay();
                        const esFinSem = diaSem===0||diaSem===6;
                        const esFer = esFeriado(fechaStr);
                        const esHoy = fechaStr===hoy();

                        // Quién tiene eventos este día
                        const eventosHoy = trabActivos
                          .filter(t => eventosPorTrab[t.id]?.dias.has(dia))
                          .map((t,idx) => ({
                            nombre: t.nombre+" "+t.apellido,
                            codigo: t.codigo,
                            color: eventosPorTrab[t.id].color,
                          }));

                        return (
                          <div key={dia} style={{
                            minHeight:80, borderRadius:6, padding:"6px 4px",
                            background: esHoy
                              ? "rgba(201,168,76,0.12)"
                              : esFer
                                ? "rgba(180,30,30,0.08)"
                                : esFinSem
                                  ? "rgba(5,4,2,0.5)"
                                  : "rgba(12,10,6,0.6)",
                            border: esHoy
                              ? "1.5px solid rgba(201,168,76,0.5)"
                              : esFer
                                ? "1px solid rgba(180,30,30,0.2)"
                                : "1px solid rgba(201,168,76,0.06)",
                            position:"relative",
                          }}>
                            {/* Número del día */}
                            <div style={{
                              fontSize:13, fontWeight: esHoy?"bold":"normal",
                              color: esHoy?"#C9A84C":esFer?"#e74c3c":esFinSem?"rgba(154,138,106,0.5)":"#9A8A6A",
                              marginBottom:4, textAlign:"right", paddingRight:2,
                            }}>
                              {dia}
                              {esFer&&<span style={{fontSize:9,display:"block",color:"rgba(231,76,60,0.7)"}}>Fer.</span>}
                            </div>

                            {/* Eventos del día */}
                            <div style={{display:"flex",flexDirection:"column",gap:2}}>
                              {eventosHoy.map((ev,idx)=>(
                                <div key={idx} title={`${ev.nombre} (${ev.codigo})`}
                                  style={{
                                    background:ev.color,
                                    borderRadius:3, padding:"2px 4px",
                                    fontSize:9, color:"#000",
                                    fontWeight:"bold", overflow:"hidden",
                                    whiteSpace:"nowrap", textOverflow:"ellipsis",
                                    boxShadow:`0 1px 4px ${ev.color}44`,
                                  }}>
                                  {ev.codigo}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Resumen del mes */}
                  {trabActivos.some(t=>eventosPorTrab[t.id]?.dias.size>0) && (
                    <div style={S.card}>
                      <div style={{color:"#C9A84C",fontWeight:"bold",marginBottom:12,fontSize:13,textTransform:"uppercase",letterSpacing:1}}>
                        Resumen — {mesNombre(calMes)} {calAnio}
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:8}}>
                        {trabActivos.filter(t=>eventosPorTrab[t.id]?.dias.size>0).map((t,i)=>(
                          <div key={t.id} style={{
                            background:"rgba(12,10,6,0.6)",
                            border:`1px solid ${COLORES[i%COLORES.length]}33`,
                            borderLeft:`3px solid ${COLORES[i%COLORES.length]}`,
                            borderRadius:8, padding:"10px 14px",
                          }}>
                            <div style={{fontWeight:"bold",fontSize:13,color:COLORES[i%COLORES.length]}}>{t.nombre} {t.apellido}</div>
                            <div style={{color:"#9A8A6A",fontSize:12,marginTop:4}}>
                              {eventosPorTrab[t.id].dias.size} día(s) de ausencia aprobada
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {!trabActivos.some(t=>eventosPorTrab[t.id]?.dias.size>0) && (
                    <div style={{...S.card,textAlign:"center",color:"#9A8A6A",padding:32}}>
                      ✅ Sin vacaciones ni permisos aprobados para {mesNombre(calMes)} {calAnio}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ── TAB: DASHBOARD ─────────────────────────────── */}
        {tabAdmin==="dashboard" && (
          <div style={{ marginTop:4 }}>
            {/* Filtros */}
            <div style={{ ...S.card, display:"flex", gap:14, alignItems:"center", flexWrap:"wrap" }}>
              <div>
                <label style={S.lbl}>Mes</label>
                <select style={S.sel} value={dMes} onChange={e=>setDMes(Number(e.target.value))}>
                  {Array.from({length:12},(_,i)=><option key={i} value={i}>{mesNombre(i)}</option>)}
                </select>
              </div>
              <div>
                <label style={S.lbl}>Año</label>
                <select style={S.sel} value={dAnio} onChange={e=>setDAnio(Number(e.target.value))}>
                  {[2024,2025,2026].map(a=><option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div style={{ marginLeft:"auto", color:"#C9A84C", fontWeight:"bold", fontSize:17 }}>{mesNombre(dMes)} {dAnio}</div>
            </div>

            {/* KPIs */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))", gap:12, marginBottom:16 }}>
              {[
                { icon:"👥", val:trabajadores.filter(t=>t.activo&&t.id!==999).length, lbl:"Trabajadores Activos", sub:"en nómina", c:"#3498db" },
                { icon:"📆", val:dashData.reduce((a,d)=>a+d.diasTrab,0), lbl:"Días Trabajados", sub:"mes seleccionado", c:"#27ae60" },
                { icon:"⏱", val:dashData.reduce((a,d)=>a+parseFloat(d.extra),0).toFixed(1)+"h", lbl:"H. Extra Aprobadas", sub:"autorizadas", c:"#FFD700" },
                { icon:"🗓", val:dashData.reduce((a,d)=>a+d.diasEsp,0), lbl:"Días Dom/Feriado", c:"#8e44ad", sub:"generan comp." },
                { icon:"📅", val:compensatorios.filter(c=>c.estado==="pendiente").length, lbl:"Comp. Pendientes", c:"#e67e22", sub:"por resolver" },
              ].map(x=>(
                <div key={x.lbl} style={{ ...S.card, textAlign:"center", borderColor:x.c+"55", padding:"16px 10px" }}>
                  <div style={{ fontSize:28 }}>{x.icon}</div>
                  <div style={{ fontSize:28, fontWeight:"bold", color:x.c, margin:"4px 0" }}>{x.val}</div>
                  <div style={{ color:"#fff", fontSize:12, fontWeight:"bold" }}>{x.lbl}</div>
                  <div style={{ color:"#7A6A4A", fontSize:11, marginTop:2 }}>{x.sub}</div>
                </div>
              ))}
            </div>

            {/* Tabla detalle */}
            <div style={S.card}>
              <h3 style={{ color:"#C9A84C", marginTop:0 }}>Detalle por Trabajador — {mesNombre(dMes)} {dAnio}</h3>
              <div style={{ overflowX:"auto" }}>
                <table style={S.tbl}>
                  <thead><tr>{["Trabajador","Cód","Días Háb","Días Trab","Asistencia","Ausencias","Dom/Fer","H. Extra","C. Pend","C. Tom","C. Pag"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {dashData.map(d=>(
                      <tr key={d.id}>
                        <td style={S.td}>{d.nombre}</td>
                        <td style={{...S.td,color:"#C9A84C",fontWeight:"bold"}}>{d.codigo}</td>
                        <td style={{...S.td,color:"#9A8A6A"}}>{d.habilMes}</td>
                        <td style={{...S.td,color:"#27ae60",fontWeight:"bold"}}>{d.diasTrab}</td>
                        <td style={S.td}>
                          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                            <div style={{ flex:1, background:"rgba(30,26,15,0.8)", borderRadius:4, height:6, minWidth:50 }}>
                              <div style={{ width:`${d.pct}%`, background:d.pct>=90?"#27ae60":d.pct>=70?"#f39c12":"#c0392b", height:"100%", borderRadius:4 }} />
                            </div>
                            <span style={{ fontSize:11, color:"#9A8A6A" }}>{d.pct}%</span>
                          </div>
                        </td>
                        <td style={{...S.td,color:d.ausencias>0?"#e74c3c":"#27ae60",fontWeight:d.ausencias>0?"bold":"normal"}}>{d.ausencias>0?`⚠ ${d.ausencias}`:"✓ 0"}</td>
                        <td style={{...S.td,color:d.diasEsp>0?"#8e44ad":"#aaa"}}>{d.diasEsp>0?`★ ${d.diasEsp}`:"—"}</td>
                        <td style={{...S.td,color:parseFloat(d.extra)>0?"#FFD700":"#aaa",fontWeight:"bold"}}>{parseFloat(d.extra)>0?`${d.extra}h`:"—"}</td>
                        <td style={{...S.td,color:d.compPend>0?"#e67e22":"#aaa"}}>{d.compPend>0?<span style={S.bdg("#e67e22")}>{d.compPend}</span>:"—"}</td>
                        <td style={{...S.td,color:"#27ae60"}}>{d.compTom>0?<span style={S.bdg("#27ae60")}>{d.compTom}</span>:"—"}</td>
                        <td style={{...S.td,color:"#3498db"}}>{d.compPag>0?<span style={S.bdg("#3498db")}>{d.compPag}</span>:"—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  {dashData.length>0&&(
                    <tfoot>
                      <tr style={{ background:"rgba(255,215,0,0.08)", borderTop:"2px solid rgba(255,215,0,0.3)" }}>
                        <td style={{...S.td,color:"#C9A84C",fontWeight:"bold"}} colSpan={3}>TOTALES</td>
                        <td style={{...S.td,color:"#27ae60",fontWeight:"bold"}}>{dashData.reduce((a,d)=>a+d.diasTrab,0)}</td>
                        <td style={S.td}>—</td>
                        <td style={{...S.td,color:"#e74c3c",fontWeight:"bold"}}>{dashData.reduce((a,d)=>a+d.ausencias,0)}</td>
                        <td style={{...S.td,color:"#8e44ad",fontWeight:"bold"}}>{dashData.reduce((a,d)=>a+d.diasEsp,0)}</td>
                        <td style={{...S.td,color:"#C9A84C",fontWeight:"bold"}}>{dashData.reduce((a,d)=>a+parseFloat(d.extra),0).toFixed(1)}h</td>
                        <td style={{...S.td,color:"#e67e22",fontWeight:"bold"}}>{dashData.reduce((a,d)=>a+d.compPend,0)}</td>
                        <td style={{...S.td,color:"#27ae60",fontWeight:"bold"}}>{dashData.reduce((a,d)=>a+d.compTom,0)}</td>
                        <td style={{...S.td,color:"#3498db",fontWeight:"bold"}}>{dashData.reduce((a,d)=>a+d.compPag,0)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: EXPORTAR / IMPORTAR ───────────────────── */}
        {tabAdmin==="exportar" && (
          <div style={{ marginTop:4 }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              {/* EXPORTAR */}
              <div style={S.card}>
                <h3 style={{ color:"#C9A84C", marginTop:0 }}>💾 Exportar Datos</h3>
                <p style={{ color:"#9A8A6A", fontSize:13, lineHeight:1.6 }}>
                  Descarga un archivo <strong style={{color:"#C9A84C"}}>JSON</strong> con toda la información del sistema:
                  trabajadores, registros de asistencia, compensatorios, solicitudes y notificaciones.
                </p>
                <p style={{ color:"#9A8A6A", fontSize:13, lineHeight:1.6 }}>
                  Guarda este archivo en un lugar seguro. Úsalo para restaurar los datos en caso de falla.
                </p>
                <div style={{ background:"rgba(255,215,0,0.08)", borderRadius:10, padding:"12px 14px", marginBottom:16, fontSize:12, color:"#9A8A6A" }}>
                  <div>📋 Trabajadores: <strong style={{color:"#fff"}}>{trabajadores.filter(t=>t.id!==999).length}</strong></div>
                  <div>📆 Registros: <strong style={{color:"#fff"}}>{registros.length}</strong></div>
                  <div>📅 Compensatorios: <strong style={{color:"#fff"}}>{compensatorios.length}</strong></div>
                  <div>📝 Solicitudes: <strong style={{color:"#fff"}}>{solicitudes.length}</strong></div>
                  <div>🔔 Notificaciones: <strong style={{color:"#fff"}}>{notificaciones.length}</strong></div>
                </div>
                <button onClick={exportarDatos} style={{ ...S.btn, width:"100%", fontSize:14, padding:"13px 0" }}>
                  ⬇ Descargar Backup JSON
                </button>
                <div style={{ color:"#9A8A6A", fontSize:11, marginTop:10, textAlign:"center" }}>
                  Archivo: pazvial-rrhh-backup-{hoy()}.json
                </div>
              </div>

              {/* IMPORTAR */}
              <div style={S.card}>
                <h3 style={{ color:"#C9A84C", marginTop:0 }}>📂 Importar Datos</h3>
                <p style={{ color:"#9A8A6A", fontSize:13, lineHeight:1.6 }}>
                  Restaura el sistema desde un archivo de backup previamente exportado.
                </p>
                <div style={{ background:"rgba(39,174,96,0.15)", border:"1px solid rgba(39,174,96,0.4)", borderRadius:10, padding:"12px 14px", marginBottom:16, fontSize:12, color:"#aaffcc" }}>
                  ✅ <strong>Importación inteligente:</strong> Los datos del backup se fusionan con los datos actuales. No se duplican registros existentes. Si un trabajador ya existe (mismo RUT), sus datos se actualizan con los del backup.</div>
                <input ref={importRef} type="file" accept=".json" onChange={importarDatos} style={{ display:"none" }} />
                <button onClick={()=>importRef.current?.click()} style={{ ...S.btn, width:"100%", fontSize:14, padding:"13px 0", background:"#2980b9", color:"#fff" }}>
                  ⬆ Seleccionar archivo de Backup
                </button>
                <MsgBox m={importMsg} />
                <div style={{ color:"#9A8A6A", fontSize:11, marginTop:10, textAlign:"center" }}>
                  Solo archivos .json exportados desde este sistema
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: MANUAL ADMINISTRADOR ──────────────────── */}
        {tabAdmin==="manual" && (
          <div style={{ marginTop:4, maxWidth:820, margin:"4px auto 0" }}>
            <div style={{ ...S.card, border:"2px solid rgba(255,215,0,0.4)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20, borderBottom:"1px solid rgba(255,215,0,0.2)", paddingBottom:16 }}>
                <Logo size={48} />
                <div>
                  <h2 style={{ color:"#C9A84C", margin:0, fontSize:20, letterSpacing:2 }}>MANUAL DE USO</h2>
                  <div style={{ color:"#9A8A6A", fontSize:12, letterSpacing:1, textTransform:"uppercase" }}>Perfil Administrador — Gestión de Personas Paz Vial SpA</div>
                </div>
              </div>

              {[
                {
                  icon:"🔑", titulo:"1. Acceso al Panel de Administración",
                  items:[
                    "Desde la portada, selecciona el botón Administrador.",
                    "Ingresa la contraseña de administrador: Negra2026.",
                    "Al ingresar tendrás acceso a 8 módulos principales en la barra de tabs.",
                    "La barra superior muestra la fecha actual, el botón Limpiar pantalla y el botón Limpiar datos de prueba.",
                    "Para salir usa el botón Cerrar sesión en la parte superior derecha.",
                  ]
                },
                {
                  icon:"🔔", titulo:"2. Módulo: Bandeja de Pendientes",
                  items:[
                    "Punto de control central. El contador en el tab muestra el total de ítems pendientes de revisión.",
                    "Agrupa en una sola pantalla: entradas anticipadas (antes de 08:00), horas extraordinarias, permisos/vacaciones y anticipos de remuneración.",
                    "Cada sección muestra solo los ítems pendientes con sus botones de Aprobar o Rechazar.",
                    "Al pie se muestra un historial resumido de los últimos ítems resueltos en cada categoría.",
                    "Las entradas anticipadas tienen un modal especial: puedes aprobar la hora original o corregirla.",
                  ]
                },
                {
                  icon:"📋", titulo:"3. Módulo: Asistencia",
                  items:[
                    "Tiene tres subtabs: Ver Registros, Ingresar / Editar, y Hoja Mensual PDF.",
                    "Ver Registros: muestra el historial filtrable por trabajador, mes y año. Las horas extra pendientes de aprobación aparecen con ⏳. Cada fila tiene botón ✏️ para editar fecha, entrada y salida directamente.",
                    "Ingresar / Editar: permite crear registros cuando el trabajador olvidó marcar. Los registros manuales quedan con etiqueta azul 'Manual'.",
                    "Hoja Mensual PDF: genera una hoja de asistencia con logo, por trabajador o para todos. Incluye vista previa en pantalla antes de imprimir.",
                  ]
                },
                {
                  icon:"👥", titulo:"4. Módulo: Nómina",
                  items:[
                    "Tiene dos subtabs: Lista y Alta, y Fichas de Personal. Ambas están conectadas — la ficha alimenta la lista automáticamente.",
                    "Lista y Alta: tabla completa de todos los trabajadores con código, nombre, RUT, cargo, AFP, previsión, fecha de ingreso y estado. Botón 'Ver Ficha' lleva directamente a la ficha del trabajador.",
                    "Fichas de Personal: es donde se crean y editan los registros. Tiene tres modos: Ver (solo lectura), Editar y Nueva Ficha.",
                    "Para crear un trabajador: presiona '➕ Nueva Ficha' (disponible en ambos subtabs y en la lista lateral). Se abre el formulario en blanco. Completa los datos y presiona '💾 Grabar' para registrar al trabajador en el sistema.",
                    "Para editar: selecciona un trabajador de la lista lateral y presiona '✏️ Editar'. Modifica los campos necesarios y presiona '💾 Grabar'. Presiona '✗ Cancelar' para descartar cambios.",
                    "El código se genera automáticamente al grabar, siguiendo el formato P + inicial apellido + número correlativo (Ej: PP01).",
                    "En modo Ver, todos los campos aparecen en gris (solo lectura). Solo se pueden editar en modo Editar.",
                    "La ficha incluye: nombres, apellido paterno, apellido materno, RUT, cargo, dirección, teléfono, correo, contacto de emergencia, previsión de salud, AFP, sueldo pactado, colación, movilización, gratificación legal, fecha de ingreso, fecha de salida, motivo de salida, antigüedad calculada automáticamente y observaciones.",
                    "Al crear un trabajador con sueldo pactado, se genera automáticamente el primer registro del Historial de Remuneraciones.",
                    "Para registrar un aumento o ajuste de renta: ve a la ficha del trabajador (modo Ver), baja hasta la sección 💰 Historial de Remuneraciones, completa la fecha de vigencia, nuevo sueldo, colación, movilización, motivo y presiona 'Registrar Cambio de Remuneración'. El registro antiguo queda en el historial y no se elimina.",
                    "El registro marcado como VIGENTE es el que se usa automáticamente para calcular la liquidación del mes correspondiente. Si una liquidación es de enero y el aumento es de marzo, la liquidación de enero usa el sueldo anterior.",
                    "Los motivos disponibles son: Sueldo inicial, Ajuste anual, Incremento por mérito, Promoción, Cambio de cargo, Negociación colectiva, Corrección, Otro.",
                  ]
                },

                {
                  icon:"💰", titulo:"5. Módulo: Liquidaciones de Sueldo",
                  items:[
                    "Genera las liquidaciones mensuales de cada trabajador tomando datos automáticamente de la ficha: sueldo, AFP, previsión, colación, movilización y gratificación.",
                    "También considera los días trabajados, horas extra aprobadas y anticipos aprobados del mes.",
                    "El resultado muestra la vista previa completa antes de enviar. Puedes ver el PDF antes de enviarlo.",
                    "Al presionar Enviar al Trabajador, la liquidación llega al perfil del trabajador con notificación.",
                    "La liquidación queda firmada por el empleador con fecha y hora de envío automáticas.",
                    "El historial muestra el estado de cada liquidación: Enviada o Firmada (por el trabajador).",
                  ]
                },
                {
                  icon:"⏰", titulo:"3b. Módulo: Entradas Anticipadas",
                  items:[
                    "Si un trabajador marca su entrada antes de las 08:00, el registro queda automáticamente en estado 'Pendiente de validación' y aparece en este módulo.",
                    "El contador en el tab muestra cuántas entradas anticipadas están pendientes de revisión.",
                    "Al hacer clic en 'Revisar', se abre un panel con la hora marcada por el trabajador.",
                    "Opción 1 — Aprobar: se mantiene la hora original marcada por el trabajador.",
                    "Opción 2 — Corregir: ingresa la hora correcta (por defecto 08:00) y el sistema registrará esa hora. El trabajador recibe notificación de la corrección.",
                  ]
                },
                {
                  icon:"✏️", titulo:"3c. Módulo: Asistencia Manual",
                  items:[
                    "Permite ingresar registros de asistencia cuando un trabajador olvidó marcar su entrada o salida.",
                    "Selecciona el trabajador, la fecha, la hora de entrada y salida. El sistema calcula automáticamente horas normales y extra.",
                    "Los registros ingresados manualmente quedan identificados con la etiqueta azul 'Manual'.",
                    "También puedes editar registros existentes directamente desde la tabla, haciendo clic en el botón ✏️ Editar de cada fila.",
                    "Al editar, los campos fecha, entrada y salida se vuelven editables. Usa ✓ para guardar y ✗ para cancelar.",
                  ]
                },
                {
                  icon:"📝", titulo:"4. Módulo: Solicitudes (Permisos y Vacaciones)",
                  items:[
                    "Aquí aparecen todas las solicitudes de permiso y vacaciones enviadas por los trabajadores.",
                    "El número en el tab indica cuántas solicitudes están pendientes de revisión.",
                    "Para Aprobar: haz clic en ✓ Aprobar. El trabajador recibirá notificación inmediata.",
                    "Para Rechazar: haz clic en ✗ Rechazar e ingresa el motivo en el formulario que se abre. Es obligatorio.",
                    "Las vacaciones solo pueden solicitarse con inicio en día hábil; el sistema ya lo valida en el perfil del trabajador.",
                    "El historial de solicitudes ya resueltas se muestra en la parte inferior del módulo.",
                  ]
                },
                {
                  icon:"👥", titulo:"5. Módulo: Trabajadores",
                  items:[
                    "Permite agregar nuevos trabajadores ingresando Nombre, Apellido Paterno y RUT.",
                    "El sistema genera automáticamente un código único con el formato: P + inicial del apellido + número correlativo (Ej: PP01, PR02).",
                    "Antes de confirmar, se muestra una vista previa del código que se asignará.",
                    "Puedes Desactivar un trabajador (sin eliminarlo) para que no pueda iniciar sesión, o Activarlo nuevamente.",
                    "El botón 🗑 elimina al trabajador definitivamente de la nómina.",
                    "El Perfil de Prueba (Administrador / RUT: Pruebas) no debe eliminarse, sirve para testear el sistema.",
                  ]
                },
                {
                  icon:"📅", titulo:"6. Módulo: Compensatorios",
                  items:[
                    "Se generan automáticamente cuando un trabajador registra asistencia en domingo o feriado.",
                    "Cada compensatorio puede estar en estado: Pendiente, Tomado (con fecha en que se tomó) o Pagado.",
                    "Al marcar como Tomado, debes ingresar la fecha en que el trabajador usó su día libre; esto lo descuenta del total pendiente.",
                    "El resumen al pie del módulo muestra el total de compensatorios por trabajador, separados por estado.",
                  ]
                },
                {
                  icon:"📊", titulo:"7. Módulo: Dashboard",
                  items:[
                    "Panel de control mensual. Usa los selectores de Mes y Año para filtrar el período.",
                    "Las tarjetas superiores muestran KPIs globales: trabajadores activos, días trabajados, horas extra aprobadas, días especiales y compensatorios pendientes.",
                    "La tabla detalla por cada trabajador: días hábiles del mes, días trabajados, barra de asistencia (% en color), ausencias, horas extra y compensatorios.",
                    "La fila de Totales al pie suma todas las columnas del período seleccionado.",
                    "Verde ≥ 90% asistencia, Amarillo ≥ 70%, Rojo < 70%.",
                  ]
                },
                {
                  icon:"🗓", titulo:"8. Módulo: Calendario",
                  items:[
                    "Vista mensual que muestra visualmente quién tiene vacaciones o permisos aprobados en cada día del mes.",
                    "Navega entre meses con las flechas ‹ › o vuelve al mes actual con el botón 'Hoy'.",
                    "Cada trabajador tiene un color único asignado automáticamente. Los días con ausencias muestran el código del trabajador en su color.",
                    "El día de hoy aparece resaltado en dorado. Los feriados en rojo y los fines de semana en gris oscuro.",
                    "La leyenda superior muestra el color y nombre de cada trabajador para identificarlos fácilmente.",
                    "Al pie del calendario aparece un resumen con los trabajadores que tienen días aprobados en el mes y cuántos días.",
                    "Solo muestra vacaciones y permisos en estado Aprobado — las solicitudes pendientes no aparecen en el calendario.",
                  ]
                },
                {
                  icon:"📄", titulo:"9. Módulo: Hoja de Asistencia Mensual",
                  items:[
                    "Genera un documento PDF con el registro diario de asistencia de uno o todos los trabajadores activos.",
                    "Selecciona trabajador (opcional), mes y año, luego haz clic en 'Generar PDF'.",
                    "Si no seleccionas trabajador, el PDF incluirá una sección por cada trabajador activo.",
                    "El documento incluye: logo de la empresa, nombre del trabajador, RUT, código, y una tabla con todos los días del mes.",
                    "Cada fila muestra: día, día de la semana, hora de entrada, hora de salida, horas normales, horas extra y observaciones.",
                    "Los domingos y feriados aparecen en amarillo. Los sábados en gris claro.",
                    "Al pie del documento aparecen líneas de firma del trabajador y de administración.",
                    "La vista previa en pantalla permite revisar la información antes de generar el PDF.",
                  ]
                },
                {
                  icon:"💾", titulo:"10. Módulo: Exportar / Importar",
                  items:[
                    "Exportar: descarga un archivo JSON con todos los datos del sistema (trabajadores, registros, compensatorios, solicitudes y notificaciones). Guárdalo en un lugar seguro.",
                    "El nombre del archivo incluye la fecha del día: pazvial-rrhh-backup-AAAA-MM-DD.json.",
                    "Importar: permite restaurar todos los datos desde un backup previo. Esta acción reemplaza todos los datos actuales.",
                    "Solo se aceptan archivos .json exportados desde este mismo sistema.",
                    "Se recomienda exportar un backup al menos una vez por semana o antes de cualquier cambio importante en la nómina.",
                  ]
                },
                {
                  icon:"💡", titulo:"11. Buenas Prácticas de Administración",
                  items:[
                    "Revisa diariamente las horas extraordinarias y solicitudes pendientes para dar respuesta oportuna a los trabajadores.",
                    "Siempre indica un motivo claro y constructivo al rechazar una solicitud o horas extra, ya que el trabajador lo leerá.",
                    "Mantén la nómina actualizada: desactiva a trabajadores que salieron de la empresa en lugar de eliminarlos, para conservar el historial.",
                    "Realiza backups frecuentes usando el módulo Exportar / Importar.",
                    "El perfil de prueba (Administrador / Pruebas) permite simular el flujo completo sin afectar datos reales de trabajadores.",
                  ]
                },
              ].map(sec => (
                <div key={sec.titulo} style={{ marginBottom:24 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                    <span style={{ fontSize:24 }}>{sec.icon}</span>
                    <h3 style={{ color:"#C9A84C", margin:0, fontSize:15, letterSpacing:0.5 }}>{sec.titulo}</h3>
                  </div>
                  <div style={{ paddingLeft:34 }}>
                    {sec.items.map((item, i) => (
                      <div key={i} style={{ display:"flex", gap:10, marginBottom:8, alignItems:"flex-start" }}>
                        <span style={{ color:"#C9A84C", fontWeight:"bold", flexShrink:0, fontSize:13 }}>→</span>
                        <span style={{ color:"#d0e0ff", fontSize:13, lineHeight:1.6 }}>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <div style={{ background:"rgba(255,215,0,0.08)", border:"1px solid rgba(255,215,0,0.3)", borderRadius:10, padding:"14px 18px", marginTop:8 }}>
                <div style={{ color:"#C9A84C", fontWeight:"bold", fontSize:13, marginBottom:6 }}>🔐 Credenciales del Sistema</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  <div style={{ background:"rgba(8,6,3,0.5)", borderRadius:8, padding:"10px 14px" }}>
                    <div style={{ color:"#9A8A6A", fontSize:11, textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>Acceso Administrador</div>
                    <div style={{ color:"#fff", fontSize:13 }}>Contraseña: <strong style={{color:"#C9A84C"}}>Negra2026</strong></div>
                  </div>
                  <div style={{ background:"rgba(8,6,3,0.5)", borderRadius:8, padding:"10px 14px" }}>
                    <div style={{ color:"#9A8A6A", fontSize:11, textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>Perfil de Prueba (Trabajador)</div>
                    <div style={{ color:"#fff", fontSize:13 }}>Código: <strong style={{color:"#C9A84C"}}>Administrador</strong> · RUT: <strong style={{color:"#C9A84C"}}>Pruebas</strong></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}


      </div>
    </div>
  );
}
