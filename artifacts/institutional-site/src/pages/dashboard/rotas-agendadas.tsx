import DashboardLayout from "./layout";
import { Calendar, MapPin } from "lucide-react";

const STATUS_STYLE: Record<string, string> = {
  Confirmada: "bg-green-100 text-green-700 border-green-200",
  Pendente:   "bg-amber-100 text-amber-700 border-amber-200",
  Cancelada:  "bg-red-100 text-red-700 border-red-200",
};

export default function RotasAgendadasPage() {
  const rotas: never[] = [];

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 lg:px-8 py-8 max-w-5xl">
        <div className="flex items-center gap-2 mb-8">
          <Calendar size={18} className="text-accent" />
          <h1 className="text-xl font-bold text-foreground">Rotas Agendadas</h1>
        </div>

        <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
          {rotas.length === 0 ? (
            <div className="py-16 text-center">
              <MapPin size={32} className="text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nenhuma rota agendada.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 border-b">
                    {["Rota", "Data", "Horário", "Passageiros", "Status"].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rotas.map((r: never) => (
                    <tr key={(r as any).id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <MapPin size={13} className="text-accent shrink-0" />
                          <span className="font-medium text-foreground">{(r as any).nome}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground">{(r as any).data}</td>
                      <td className="px-5 py-3.5 font-mono text-muted-foreground text-xs">{(r as any).horario}</td>
                      <td className="px-5 py-3.5 font-medium text-foreground">{(r as any).passageiros}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${STATUS_STYLE[(r as any).status]}`}>
                          {(r as any).status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}