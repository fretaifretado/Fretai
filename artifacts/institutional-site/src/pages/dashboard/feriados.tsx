import { useState, useEffect } from "react";
import DashboardLayout from "./layout";
import { CalendarDays, X, Info, ChevronLeft, ChevronRight } from "lucide-react";

const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const DAYS = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

function generateDays(year: number, month: number) {
  const first = new Date(year, month, 1).getDay();
  const total = new Date(year, month + 1, 0).getDate();
  return { first, total };
}

interface Feriado { date: string; label: string; nacional?: boolean; id?: number }

/** Feriados nacionais fixos do Brasil — ano é substituído dinamicamente */
const FERIADOS_NACIONAIS_BASE: { month: number; day: number; label: string }[] = [
  { month: 1,  day: 1,  label: "Confraternização Universal" },
  { month: 4,  day: 21, label: "Tiradentes" },
  { month: 5,  day: 1,  label: "Dia do Trabalho" },
  { month: 9,  day: 7,  label: "Independência do Brasil" },
  { month: 10, day: 12, label: "Nossa Senhora Aparecida" },
  { month: 11, day: 2,  label: "Finados" },
  { month: 11, day: 15, label: "Proclamação da República" },
  { month: 11, day: 20, label: "Consciência Negra" },
  { month: 12, day: 25, label: "Natal" },
];

/** Calcula Páscoa pelo algoritmo de Meeus/Jones/Butcher */
function easterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Gera todos os feriados nacionais para um dado ano */
function getFeriadosNacionais(year: number): Feriado[] {
  const result: Feriado[] = FERIADOS_NACIONAIS_BASE.map(f => ({
    date: `${year}-${String(f.month).padStart(2, "0")}-${String(f.day).padStart(2, "0")}`,
    label: f.label,
    nacional: true,
  }));

  // Feriados móveis baseados na Páscoa
  const pascoa = easterDate(year);
  result.push({ date: dateStr(addDays(pascoa, -48)), label: "Carnaval (2ª)", nacional: true });
  result.push({ date: dateStr(addDays(pascoa, -47)), label: "Carnaval (3ª)", nacional: true });
  result.push({ date: dateStr(addDays(pascoa, -2)),  label: "Sexta-feira Santa", nacional: true });
  result.push({ date: dateStr(pascoa),               label: "Páscoa", nacional: true });
  result.push({ date: dateStr(addDays(pascoa, 60)),  label: "Corpus Christi", nacional: true });

  return result;
}

export default function FeriadosPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  // Feriados personalizados — carregados da API
  const [customFeriados, setCustomFeriados] = useState<Feriado[]>([]);
  const [loadingHolidays, setLoadingHolidays] = useState(true);

  const API_URL = import.meta.env.VITE_API_URL ?? "";
  function getHeaders(): HeadersInit {
    const token = localStorage.getItem("jwt_token") ?? "";
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  }

  // Carrega feriados personalizados da API ao montar
  useEffect(() => {
    fetch(`${API_URL}/api/me/holidays`, { headers: getHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then((data: { id: number; date: string; label: string }[]) => {
        setCustomFeriados(data.map(h => ({ date: h.date, label: h.label, nacional: false, id: h.id })));
      })
      .catch(() => {})
      .finally(() => setLoadingHolidays(false));
  }, []);

  // Modal de nome ao clicar numa data
  const [clickedDate, setClickedDate] = useState<string | null>(null);
  const [labelInput, setLabelInput] = useState("");

  const nacionais = [
    ...getFeriadosNacionais(year),
    ...getFeriadosNacionais(year + 1),
    ...getFeriadosNacionais(year - 1),
  ];

  const allFeriados: Feriado[] = [...nacionais, ...customFeriados];

  const { first, total } = generateDays(year, month);
  const blanks = Array(first).fill(null);
  const days = Array.from({ length: total }, (_, i) => i + 1);

  function fmtDate(d: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  function getFeriado(d: number): Feriado | undefined {
    return allFeriados.find(f => f.date === fmtDate(d));
  }

  function handleDayClick(d: number) {
    const date = fmtDate(d);
    const existing = allFeriados.find(f => f.date === date);
    if (existing?.nacional) return;
    if (existing) {
      // Remove feriado customizado — otimista, confirma na API
      setCustomFeriados(prev => prev.filter(f => f.date !== date));
      if (existing.id) {
        fetch(`${API_URL}/api/me/holidays/${existing.id}`, { method: "DELETE", headers: getHeaders() })
          .catch(() => {
            // Rollback se API falhar
            setCustomFeriados(prev => [...prev, existing]);
          });
      }
    } else {
      setClickedDate(date);
      setLabelInput("");
    }
  }

  function confirmAdd() {
    if (!clickedDate || !labelInput.trim()) return;
    const newFeriado: Feriado = { date: clickedDate, label: labelInput.trim(), nacional: false };
    setCustomFeriados(prev => [...prev, newFeriado]); // otimista
    setClickedDate(null);
    setLabelInput("");
    // Persiste na API
    fetch(`${API_URL}/api/me/holidays`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ date: newFeriado.date, label: newFeriado.label }),
    })
      .then(r => r.ok ? r.json() : null)
      .then((saved: { id: number; date: string; label: string } | null) => {
        if (saved) {
          // Atualiza com o id real do banco
          setCustomFeriados(prev => prev.map(f =>
            f.date === saved.date && !f.id ? { ...f, id: saved.id } : f
          ));
        }
      })
      .catch(() => {
        // Rollback se API falhar
        setCustomFeriados(prev => prev.filter(f => f.date !== newFeriado.date));
      });
  }

  function removeCustom(date: string) {
    const existing = customFeriados.find(f => f.date === date);
    setCustomFeriados(prev => prev.filter(f => f.date !== date));
    if (existing?.id) {
      fetch(`${API_URL}/api/me/holidays/${existing.id}`, { method: "DELETE", headers: getHeaders() })
        .catch(() => {
          if (existing) setCustomFeriados(prev => [...prev, existing]);
        });
    }
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthFeriados = allFeriados
    .filter(f => f.date.startsWith(monthKey))
    .sort((a, b) => a.date.localeCompare(b.date));

  // All feriados for the year for the side list
  const yearKey = String(year);
  const yearFeriados = allFeriados
    .filter(f => f.date.startsWith(yearKey))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Day label for modal
  const clickedDay = clickedDate
    ? `${clickedDate.split("-")[2]}/${clickedDate.split("-")[1]}/${clickedDate.split("-")[0]}`
    : "";

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 lg:px-8 py-8 max-w-5xl">

        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <CalendarDays size={18} className="text-accent" />
            <h1 className="text-xl font-bold text-foreground">Feriados</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Feriados nacionais já estão marcados. Clique em qualquer data para adicionar um feriado personalizado.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* ── Calendar ── */}
          <div className="lg:col-span-2 bg-card border rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <button onClick={prevMonth} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors">
                <ChevronLeft size={16} />
              </button>
              <h3 className="font-semibold text-foreground">{MONTHS[month]} {year}</h3>
              <button onClick={nextMonth} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors">
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="p-4">
              <div className="grid grid-cols-7 mb-2">
                {DAYS.map(d => (
                  <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-2">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {blanks.map((_, i) => <div key={`b${i}`} />)}
                {days.map(d => {
                  const feriado = getFeriado(d);
                  const isToday = d === now.getDate() && month === now.getMonth() && year === now.getFullYear();
                  const isNacional = feriado?.nacional;
                  const isCustom = feriado && !feriado.nacional;

                  return (
                    <button
                      key={d}
                      onClick={() => handleDayClick(d)}
                      title={feriado ? feriado.label : `Clique para adicionar feriado em ${d}/${month + 1}`}
                      className={`
                        relative aspect-square flex flex-col items-center justify-center rounded-lg text-sm font-medium transition-all
                        ${isNacional
                          ? "bg-foreground text-background shadow-sm cursor-default"
                          : isCustom
                            ? "bg-accent text-white shadow-sm"
                            : isToday
                              ? "ring-2 ring-accent text-accent font-bold bg-accent/5"
                              : "hover:bg-muted text-foreground"
                        }
                      `}
                    >
                      {d}
                      {feriado && <div className="absolute bottom-1 w-1 h-1 rounded-full bg-white/60" />}
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 mt-4 pt-3 border-t">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-foreground" />
                  <span className="text-xs text-muted-foreground">Feriado nacional</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-accent" />
                  <span className="text-xs text-muted-foreground">Feriado personalizado</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Side panel ── */}
          <div className="space-y-4">
            {/* This month */}
            <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b">
                <p className="text-sm font-semibold text-foreground">Feriados — {MONTHS[month]}</p>
              </div>
              {monthFeriados.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Nenhum feriado neste mês.
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {monthFeriados.map(f => {
                    const d = parseInt(f.date.split("-")[2]!);
                    return (
                      <li key={f.date} className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${f.nacional ? "bg-foreground" : "bg-accent"}`} />
                          <div className="min-w-0">
                            <p className="font-medium text-sm text-foreground truncate">{f.label}</p>
                            <p className="text-xs text-muted-foreground">
                              {String(d).padStart(2, "0")}/{String(month + 1).padStart(2, "0")}/{year}
                              {f.nacional && <span className="ml-1 text-[10px] bg-muted px-1 rounded">Nacional</span>}
                            </p>
                          </div>
                        </div>
                        {!f.nacional && (
                          <button
                            onClick={() => removeCustom(f.date)}
                            className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                          >
                            <X size={13} />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Full year list */}
            <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b">
                <p className="text-sm font-semibold text-foreground">Todos os feriados — {year}</p>
              </div>
              <ul className="divide-y divide-border max-h-64 overflow-y-auto">
                {yearFeriados.map(f => {
                  const parts = f.date.split("-");
                  const label = `${parts[2]}/${parts[1]}`;
                  return (
                    <li key={f.date} className="flex items-center gap-2 px-4 py-2.5">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${f.nacional ? "bg-foreground" : "bg-accent"}`} />
                      <span className="text-xs font-mono text-muted-foreground w-12 shrink-0">{label}</span>
                      <span className="text-xs text-foreground truncate">{f.label}</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-start gap-2">
                <Info size={14} className="text-blue-500 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-700">
                  Feriados são ignorados nas compras automáticas de vale-transporte — nesses dias a empresa não funciona e nenhum vale é gerado.
                  Compras manuais são processadas normalmente em qualquer data.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Modal: nomear feriado personalizado ── */}
        {clickedDate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-sm p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="font-bold text-lg text-foreground">Adicionar feriado</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{clickedDay}</p>
                </div>
                <button
                  onClick={() => setClickedDate(null)}
                  className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
                >
                  <X size={15} />
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Nome do feriado</label>
                <input
                  type="text"
                  autoFocus
                  placeholder="Ex: Aniversário da cidade"
                  value={labelInput}
                  onChange={e => setLabelInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") confirmAdd(); }}
                  className="w-full border rounded-lg px-3 py-2.5 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setClickedDate(null)}
                  className="flex-1 border rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
                >
                  Cancelar
                </button>
                <button
                  disabled={!labelInput.trim()}
                  onClick={confirmAdd}
                  className="flex-1 bg-accent hover:bg-accent/90 text-white font-semibold rounded-lg px-4 py-2.5 text-sm disabled:opacity-50 transition-colors"
                >
                  Adicionar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}