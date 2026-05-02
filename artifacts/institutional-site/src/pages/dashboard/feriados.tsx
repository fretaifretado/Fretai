import { useState } from "react";
import DashboardLayout from "./layout";
import { CalendarDays, Plus, X, Info, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const DAYS = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

function generateDays(year: number, month: number) {
  const first = new Date(year, month, 1).getDay();
  const total = new Date(year, month + 1, 0).getDate();
  return { first, total };
}

interface Feriado { date: string; label: string }

const INITIAL_FERIADOS: Feriado[] = [
  { date: "2026-04-21", label: "Tiradentes" },
  { date: "2026-05-01", label: "Dia do Trabalho" },
];

export default function FeriadosPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [feriados, setFeriados] = useState<Feriado[]>(INITIAL_FERIADOS);
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newDay, setNewDay] = useState("");

  const { first, total } = generateDays(year, month);
  const blanks = Array(first).fill(null);
  const days = Array.from({ length: total }, (_, i) => i + 1);

  function fmtDate(d: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  function isFeriado(d: number) {
    return feriados.find(f => f.date === fmtDate(d));
  }

  function toggleFeriado(d: number) {
    const date = fmtDate(d);
    const existing = feriados.find(f => f.date === date);
    if (existing) {
      setFeriados(prev => prev.filter(f => f.date !== date));
    } else {
      setFeriados(prev => [...prev, { date, label: "Feriado" }]);
    }
  }

  function addFeriado() {
    if (!newDay || !newLabel) return;
    const date = fmtDate(parseInt(newDay));
    setFeriados(prev => [...prev.filter(f => f.date !== date), { date, label: newLabel }]);
    setShowAdd(false);
    setNewLabel("");
    setNewDay("");
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  const monthFeriados = feriados.filter(f => f.date.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`));

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 lg:px-8 py-8 max-w-5xl">

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <CalendarDays size={18} className="text-accent" />
              <h1 className="text-xl font-bold text-foreground">Feriados</h1>
            </div>
            <p className="text-muted-foreground text-sm">Gerencie os feriados e datas especiais da empresa.</p>
          </div>
          <Button onClick={() => setShowAdd(true)} className="bg-accent hover:bg-accent/90 text-white font-semibold shrink-0">
            <Plus size={16} className="mr-1.5" />Adicionar feriado
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Calendar */}
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
                  const feriado = isFeriado(d);
                  const isToday = d === now.getDate() && month === now.getMonth() && year === now.getFullYear();
                  return (
                    <button
                      key={d}
                      onClick={() => toggleFeriado(d)}
                      className={`
                        relative aspect-square flex flex-col items-center justify-center rounded-lg text-sm font-medium transition-all
                        ${feriado
                          ? "bg-accent text-white shadow-sm"
                          : isToday
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted text-foreground"
                        }
                      `}
                      title={feriado ? feriado.label : `${d}/${month + 1}`}
                    >
                      {d}
                      {feriado && <div className="absolute bottom-1 w-1 h-1 rounded-full bg-white/70" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Side panel */}
          <div className="space-y-4">
            {/* This month */}
            <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b">
                <p className="text-sm font-semibold text-foreground">Feriados — {MONTHS[month]}</p>
              </div>
              {monthFeriados.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum feriado neste mês.</div>
              ) : (
                <ul className="divide-y divide-border">
                  {monthFeriados.map(f => {
                    const d = parseInt(f.date.split("-")[2]);
                    return (
                      <li key={f.date} className="flex items-center justify-between px-4 py-3">
                        <div>
                          <p className="font-medium text-sm text-foreground">{f.label}</p>
                          <p className="text-xs text-muted-foreground">{String(d).padStart(2, "0")}/{String(month + 1).padStart(2, "0")}/{year}</p>
                        </div>
                        <button
                          onClick={() => setFeriados(prev => prev.filter(x => x.date !== f.date))}
                          className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <X size={13} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-start gap-2">
                <Info size={14} className="text-blue-500 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-700">
                  Os feriados cadastrados são ignorados apenas nas compras automáticas de vale-transporte.
                  Compras manuais são processadas normalmente em qualquer data.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Add modal */}
        {showAdd && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-sm p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-bold text-lg text-foreground">Adicionar feriado</h2>
                <button onClick={() => setShowAdd(false)} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors">
                  <X size={15} />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Dia ({MONTHS[month]} {year})</label>
                  <input
                    type="number"
                    min={1}
                    max={total}
                    placeholder="Ex: 21"
                    value={newDay}
                    onChange={e => setNewDay(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2.5 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Nome do feriado</label>
                  <input
                    type="text"
                    placeholder="Ex: Tiradentes"
                    value={newLabel}
                    onChange={e => setNewLabel(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2.5 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <Button variant="outline" className="flex-1" onClick={() => setShowAdd(false)}>Cancelar</Button>
                <Button
                  className="flex-1 bg-accent hover:bg-accent/90 text-white font-semibold"
                  disabled={!newDay || !newLabel}
                  onClick={addFeriado}
                >
                  Adicionar
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
